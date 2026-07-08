import { db, raw } from "@/lib/db/client";
import { tasks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { CHAT_AGENTS, getChatAdapter } from "@/lib/chat/registry";
import type { ChatRequest } from "@/lib/chat/types";
import { classifyIntent } from "./classifier";
import { route, pickAgent } from "./router";
import { newTaskId } from "./id";
import type { CreateTaskInput, Intent, RoutingDecision, TaskDTO, TaskEvent } from "./types";

/**
 * Task runner — the orchestration core (v0.3).
 *
 * Responsibilities:
 * 1. Create a task (classify → route → enqueue).
 * 2. Execute the queue serially: a worker loop picks the highest-priority
 *    queued task, runs it via its assigned agent's ChatAdapter, streams the
 *    result back, and persists it.
 * 3. Publish TaskEvents so the UI (and later, bots) can watch progress live.
 *
 * Execution is single-worker for v0.3 (simpler, avoids concurrent agent
 * rate-limits); the queue design lets us add concurrency later without API
 * changes.
 */

// ── pub/sub for live task events ────────────────────────────────
type Listener = (event: TaskEvent) => void;
declare global {
  // eslint-disable-next-line no-var
  var __mcTaskListeners: Set<Listener> | undefined;
}
const listeners: Set<Listener> = globalThis.__mcTaskListeners ?? new Set();
globalThis.__mcTaskListeners = listeners;

export function subscribeTasks(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function emit(event: TaskEvent) {
  for (const l of listeners) {
    try {
      l(event);
    } catch (err) {
      console.error("[tasks] listener threw:", err);
    }
  }
}

// ── worker state ────────────────────────────────────────────────
declare global {
  // eslint-disable-next-line no-var
  var __mcTaskWorkerRunning: boolean | undefined;
}
const workerRunning = globalThis.__mcTaskWorkerRunning ?? false;
globalThis.__mcTaskWorkerRunning = workerRunning;

/** Ensure exactly one worker loop is alive across HMR. */
function ensureWorker() {
  if (globalThis.__mcTaskWorkerRunning) return;
  globalThis.__mcTaskWorkerRunning = true;
  void runWorkerLoop();
}

/** Create + enqueue a task. Returns the persisted task. */
export async function createTask(input: CreateTaskInput): Promise<TaskDTO> {
  const id = newTaskId();
  const now = new Date().toISOString();
  const intentHint = input.intentHint ?? "auto";
  const title = input.title?.trim() || truncate(input.prompt, 60);

  // Classify unless the user pinned an intent.
  let intent: Intent;
  let reasoning: string;
  if (intentHint !== "auto") {
    intent = intentHint;
    reasoning = "Intent set manually.";
  } else {
    const classification = await classifyIntent(input.prompt);
    intent = classification.intent;
    reasoning = classification.reasoning;
  }

  const decision: RoutingDecision = route(intent);
  const assignedAgent = pickAgent(decision);

  // Initial status: `queued` if no parents, otherwise `waiting` would be
  // nicer but we keep the 5-state enum intact. Parents gate the worker; the
  // status stays `queued` and the worker treats it as not-ready until the
  // gate flips.
  db.insert(tasks)
    .values({
      id,
      title,
      prompt: input.prompt,
      intent,
      intentHint,
      routedAgents: JSON.stringify(decision.routedAgents),
      assignedAgent,
      status: assignedAgent ? "queued" : "queued",
      priority: input.priority ?? 0,
      chainId: input.chainId ?? null,
      parentIds: input.parentIds && input.parentIds.length > 0
        ? JSON.stringify(input.parentIds)
        : null,
      createdAt: now,
    })
    .run();
  void reasoning;

  // Kick the worker so it processes the new task promptly.
  ensureWorker();
  return getTask(id)!;
}

/** Fetch a single task as a DTO. */
export function getTask(id: string): TaskDTO | undefined {
  const row = db.select().from(tasks).where(eq(tasks.id, id)).all()[0];
  return row ? toDTO(row) : undefined;
}

/** List tasks, newest first. */
export function listTasks(limit = 100): TaskDTO[] {
  return db
    .select()
    .from(tasks)
    .orderBy(tasks.createdAt)
    .all()
    .reverse()
    .slice(0, limit)
    .map(toDTO);
}

/** Delete a task. */
export function deleteTask(id: string) {
  raw.prepare(`DELETE FROM tasks WHERE id = ?`).run(id);
}

/** Cancel a queued or running task. */
export function cancelTask(id: string) {
  const task = getTask(id);
  if (!task) return;
  if (task.status === "done" || task.status === "failed" || task.status === "cancelled") return;
  // For running tasks, the worker checks the cancellation flag each iteration.
  cancelledIds.add(id);
  updateStatus(id, "cancelled");
  emit({ type: "status", taskId: id, status: "cancelled" });
}

const cancelledIds = new Set<string>();

// ── worker loop ─────────────────────────────────────────────────

async function runWorkerLoop() {
  while (true) {
    // Pick the highest-priority queued task whose parents are all `done`.
    const queued = db
      .select()
      .from(tasks)
      .where(eq(tasks.status, "queued"))
      .all();

    const ready = queued.filter((t) => parentsSatisfied(t));
    ready.sort(
      (a, b) =>
        b.priority - a.priority || a.createdAt.localeCompare(b.createdAt),
    );

    if (ready.length === 0) {
      await sleep(1000);
      continue;
    }
    await executeTask(toDTO(ready[0])).catch((err) =>
      console.error("[tasks] executeTask crashed:", err),
    );
  }
}

/** Check that every parent of `t` is `done`, or that the parent no longer
 *  exists (treat missing parents as satisfied — old chains referencing a
 *  deleted task shouldn't deadlock new ones). */
function parentsSatisfied(t: typeof tasks.$inferSelect): boolean {
  if (!t.parentIds) return true;
  let ids: string[];
  try {
    ids = JSON.parse(t.parentIds) as string[];
  } catch {
    return true;
  }
  if (!Array.isArray(ids) || ids.length === 0) return true;
  for (const parentId of ids) {
    const row = db
      .select()
      .from(tasks)
      .where(eq(tasks.id, parentId))
      .all()[0];
    if (!row) continue; // missing parent → not blocking
    if (row.status !== "done") return false;
  }
  return true;
}

/** Execute a single task end-to-end. */
async function executeTask(task: TaskDTO) {
  if (cancelledIds.has(task.id)) {
    cancelledIds.delete(task.id);
    return;
  }

  const assignedAgent = task.assignedAgent ?? pickFirstAvailable(task.routedAgents);
  if (!assignedAgent) {
    failTask(task.id, "No available agent for this task's intent.");
    return;
  }

  const adapter = getChatAdapter(assignedAgent);
  if (!adapter || !adapter.available) {
    failTask(task.id, `Agent "${assignedAgent}" is not available.`);
    return;
  }

  // Mark running.
  updateStatus(task.id, "running", { assignedAgent, startedAt: new Date().toISOString() });
  emit({ type: "status", taskId: task.id, status: "running", assignedAgent });

  const chatRequest: ChatRequest = {
    systemPrompt: intentSystemPrompt(task.intent),
    history: [{ role: "user", content: task.prompt }],
    signal: AbortSignal.timeout(120_000),
  };

  const started = Date.now();
  let full = "";
  let promptTokens: number | undefined;
  let completionTokens: number | undefined;

  try {
    for await (const chunk of adapter.stream(chatRequest)) {
      if (cancelledIds.has(task.id)) {
        cancelledIds.delete(task.id);
        updateStatus(task.id, "cancelled", { completedAt: new Date().toISOString() });
        emit({ type: "status", taskId: task.id, status: "cancelled" });
        return;
      }
      if (chunk.type === "delta") {
        full += chunk.content;
        emit({ type: "delta", taskId: task.id, content: chunk.content });
      } else if (chunk.type === "done") {
        promptTokens = chunk.promptTokens;
        completionTokens = chunk.completionTokens;
      } else if (chunk.type === "error") {
        full += `\n\n_[error: ${chunk.message}]_`;
      }
    }

    const latencyMs = Date.now() - started;
    const result = full || "(no response)";
    db.update(tasks)
      .set({
        status: "done",
        result,
        latencyMs,
        promptTokens: promptTokens ?? null,
        completionTokens: completionTokens ?? null,
        completedAt: new Date().toISOString(),
      })
      .where(eq(tasks.id, task.id))
      .run();
    emit({ type: "done", taskId: task.id, result });
  } catch (err) {
    failTask(task.id, err instanceof Error ? err.message : String(err));
  }
}

// ── helpers ─────────────────────────────────────────────────────

function failTask(id: string, message: string) {
  db.update(tasks)
    .set({ status: "failed", error: message, completedAt: new Date().toISOString() })
    .where(eq(tasks.id, id))
    .run();
  emit({ type: "error", taskId: id, message });
}

function updateStatus(
  id: string,
  status: TaskDTO["status"],
  extra: Partial<{ assignedAgent: string; startedAt: string; completedAt: string }> = {},
) {
  db.update(tasks).set({ status, ...extra }).where(eq(tasks.id, id)).run();
}

function pickFirstAvailable(routedAgents: string[]): string | null {
  const avail = new Set(CHAT_AGENTS.filter((a) => a.available).map((a) => a.id));
  return routedAgents.find((id) => avail.has(id)) ?? null;
}

/** A system prompt tuned to the task's intent. */
function intentSystemPrompt(intent: Intent | null): string {
  switch (intent) {
    case "code":
      return "You are a precise coding assistant. Produce clean, working code with brief explanations. Prefer concrete solutions over lengthy preamble.";
    case "design":
      return "You are a design assistant. Give concrete, actionable design guidance — layouts, palettes, typography, component structure.";
    case "research":
      return "You are a research assistant. Provide well-structured, factual summaries with clear reasoning. Note uncertainty where it exists.";
    case "knowledge":
      return "You are a knowledge-management assistant. Help organize, summarize, and connect information.";
    default:
      return "You are a helpful, concise assistant.";
  }
}

function toDTO(row: typeof tasks.$inferSelect): TaskDTO {
  let parents: string[] = [];
  if (row.parentIds) {
    try {
      const parsed = JSON.parse(row.parentIds);
      if (Array.isArray(parsed)) parents = parsed.filter((s): s is string => typeof s === "string");
    } catch {
      /* corrupt JSON — treat as no parents */
    }
  }
  return {
    id: row.id,
    title: row.title,
    prompt: row.prompt,
    intent: row.intent as Intent | null,
    intentHint: row.intentHint as Intent | "auto",
    routedAgents: row.routedAgents ? JSON.parse(row.routedAgents) : [],
    assignedAgent: row.assignedAgent,
    status: row.status as TaskDTO["status"],
    priority: row.priority,
    result: row.result,
    latencyMs: row.latencyMs,
    promptTokens: row.promptTokens,
    completionTokens: row.completionTokens,
    error: row.error,
    chainId: row.chainId ?? null,
    parentIds: parents,
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
  };
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
