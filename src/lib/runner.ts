import { TOOLS, getTool } from "@/config/tools.config";
import type {
  CompositeProbeResult,
  HealthStatus,
  ProbeResult,
  ToolStatus,
} from "@/lib/types";
import { ensureSchema } from "@/lib/db/client";
import { statusHistory, toolOverrides } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { runCompositeProbe, runProbe } from "@/lib/probes/composite";
import { broadcast } from "@/lib/sse";

/**
 * The probe runner.
 *
 * Responsibilities:
 * 1. Hold the in-memory cache of the latest result per tool (the live board).
 * 2. Run a sweep: probe every enabled tool, cache results, persist to history,
 *    and broadcast deltas over SSE.
 * 3. Expose a single probe (manual "Ping now") and the current snapshot.
 *
 * Cache + subscriber list live on globalThis so they survive HMR in dev.
 */

type Cache = Map<string, ProbeResult>;

declare global {
   
  var __mcCache: Cache | undefined;
   
  var __mcLastSweep: string | null | undefined;
   
  var __mcSweepTimer: NodeJS.Timeout | undefined;
}

const cache: Cache = globalThis.__mcCache ?? new Map();
globalThis.__mcCache = cache;

function setLastSweep(iso: string | null) {
  globalThis.__mcLastSweep = iso;
}
function getLastSweep(): string | null {
  return globalThis.__mcLastSweep ?? null;
}

// ── Effective config (registry + DB overrides) ───────────────────────

async function isToolEnabled(toolId: string, defaultEnabled: boolean): Promise<boolean> {
  // Default to the registry's `enabled` (which itself defaults to true).
  const row = await dbSelectOverride(toolId);
  return row ? row.enabled : defaultEnabled;
}

// Thin async wrappers so the runner stays framework-agnostic. The db module
// is imported lazily-safe (it's a singleton), but we keep lookups here to
// centralize the override logic.
import { db, raw } from "@/lib/db/client";
async function dbSelectOverride(toolId: string) {
  const rows = db.select().from(toolOverrides).where(eq(toolOverrides.toolId, toolId)).all();
  return rows[0];
}

// ── Probing ──────────────────────────────────────────────────────────

async function probeTool(
  toolId: string,
): Promise<ProbeResult | CompositeProbeResult> {
  const tool = getTool(toolId);
  if (!tool) {
    return {
      status: "unknown",
      latencyMs: null,
      version: null,
      detail: "Tool not found in registry",
      checkedAt: new Date().toISOString(),
    };
  }
  return tool.probe.type === "composite"
    ? runCompositeProbe(tool.probe)
    : runProbe(tool.probe);
}

/** Persist a result to the rolling history log. */
function logHistory(
  toolId: string,
  label: string,
  result: CompositeProbeResult,
) {
  db.insert(statusHistory)
    .values({
      toolId,
      label,
      status: result.status,
      latencyMs: result.latencyMs,
      version: result.version,
      detail: result.detail,
      components: result.components ? JSON.stringify(result.components) : null,
    })
    .run();

  // Keep a rolling window: latest 200 rows per tool.
  raw
    .prepare(
      `DELETE FROM status_history
       WHERE tool_id = ?
         AND id NOT IN (
           SELECT id FROM status_history WHERE tool_id = ? ORDER BY checked_at DESC LIMIT 200
         )`,
    )
    .run(toolId, toolId);
}

// ── Public API ───────────────────────────────────────────────────────

/** Probe a single tool, cache + persist + broadcast it. */
export async function probeOne(toolId: string): Promise<ProbeResult> {
  const tool = getTool(toolId);
  const result = await probeTool(toolId);
  cache.set(toolId, result);
  if (tool) logHistory(toolId, tool.probe.label, result);
  broadcast({ type: "update", toolId, result });
  return result;
}

/** Probe every enabled tool. Returns the full snapshot. */
export async function sweepAll(): Promise<ToolStatus[]> {
  const enabled: string[] = [];
  for (const tool of TOOLS) {
    if (await isToolEnabled(tool.id, tool.enabled ?? true)) enabled.push(tool.id);
  }

  const results = await Promise.all(
    enabled.map(async (id) => [id, await probeTool(id)] as const),
  );

  for (const [id, result] of results) {
    cache.set(id, result);
    const tool = getTool(id);
    if (tool) logHistory(id, tool.probe.label, result);
  }

  const now = new Date().toISOString();
  setLastSweep(now);
  broadcast({ type: "sweep", lastSweep: now });
  broadcast({ type: "snapshot", snapshot: getSnapshot() });

  return getSnapshot();
}

/** Current cached snapshot for every tool (enabled or not). */
export function getSnapshot(): ToolStatus[] {
  return TOOLS.map((tool) => {
    const result =
      cache.get(tool.id) ??
      ({
        status: "unknown" as HealthStatus,
        latencyMs: null,
        version: null,
        detail: "Not probed yet",
        checkedAt: null as unknown as string,
      });
    return { tool, result };
  });
}

export function getLastSweepAt() {
  return getLastSweep();
}

// ── Scheduler ────────────────────────────────────────────────────────

const SWEEP_INTERVAL_MS = 30_000; // 30s default cadence

/** Start the background sweep loop. Idempotent — safe to call on every boot. */
export function startScheduler() {
  ensureSchema();
  if (globalThis.__mcSweepTimer) return;
  // Kick off the first sweep immediately, then on an interval.
  void sweepAll().catch((err) => console.error("[runner] initial sweep failed:", err));
  globalThis.__mcSweepTimer = setInterval(() => {
    void sweepAll().catch((err) => console.error("[runner] sweep failed:", err));
  }, SWEEP_INTERVAL_MS);
}

export function stopScheduler() {
  if (globalThis.__mcSweepTimer) {
    clearInterval(globalThis.__mcSweepTimer);
    globalThis.__mcSweepTimer = undefined;
  }
}
