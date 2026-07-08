import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Storage model for Mission Control.
 *
 * - `tool_overrides`: per-tool settings (enabled flag, overridden endpoint)
 *   keyed by tool id. The tool definitions live in code; this table holds
 *   only the bits the user changes via the Settings page.
 * - `status_history`: append-only log of every probe result, for the
 *   detail-page history graph. TTL'd by keeping a rolling window per tool.
 * - `conversations` / `messages`: v0.2 unified chat. A conversation is a
 *   thread bound to one agent adapter; messages are user/assistant turns.
 *
 * The current "live" status is NOT persisted here — it lives in the in-memory
 * probe cache (see runner.ts) and is broadcast over SSE. SQLite is for
 * history + settings + chat only, which keeps the board fast.
 */
export const toolOverrides = sqliteTable("tool_overrides", {
  toolId: text("tool_id").primaryKey(),
  enabled: integer("enabled", { mode: "boolean" }).notNull(),
  // Optional string overrides; NULL means "use the registry default".
  endpointOverride: text("endpoint_override"),
  updatedAt: text("updated_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
});

export const statusHistory = sqliteTable("status_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  toolId: text("tool_id").notNull(),
  // Denormalized probe label so history survives even if the config changes.
  label: text("label").notNull(),
  status: text("status").notNull(), // online | degraded | offline | unknown
  latencyMs: integer("latency_ms"),
  version: text("version"),
  detail: text("detail").notNull(),
  // JSON string of component results for composite probes. NULL otherwise.
  components: text("components"),
  checkedAt: text("checked_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
});

/** A chat thread, bound to one agent adapter. */
export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(), // ULID-ish client-generated id
  title: text("title").notNull(),
  // Agent id from the chat registry (e.g. "hermes", "opencode").
  agentId: text("agent_id").notNull(),
  // Optional system prompt; NULL = agent default.
  systemPrompt: text("system_prompt"),
  // Optional model override; NULL = agent default.
  model: text("model"),
  createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text("updated_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
});

/** A single message in a conversation (user or assistant turn). */
export const messages = sqliteTable("messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // user | assistant | system
  content: text("content").notNull(),
  // Token accounting, when available from the provider.
  promptTokens: integer("prompt_tokens"),
  completionTokens: integer("completion_tokens"),
  // ms the agent took to produce the full response.
  latencyMs: integer("latency_ms"),
  createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
});

export type ToolOverride = typeof toolOverrides.$inferSelect;
export type StatusHistoryRow = typeof statusHistory.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;

/**
 * Tasks (v0.3). A task is a unit of work submitted to Mission Control that
 * gets classified (intent), routed to an agent, executed, and stored with its
 * result. Unlike chat (interactive, streaming), a task is fire-and-track:
 * submit it, watch it move through the queue, read the result when done.
 */
export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(), // client-friendly sortable id
  title: text("title").notNull(),
  prompt: text("prompt").notNull(),
  // Classified intent: code | design | research | knowledge | chat
  intent: text("intent"),
  // Manual hint from the UI ("auto" lets the classifier decide).
  intentHint: text("intent_hint").notNull().default("auto"),
  // Agent ids in priority order (the routing engine's pick). The first
  // available one is the one actually used.
  routedAgents: text("routed_agents"), // JSON array of strings
  // The agent that ultimately ran the task.
  assignedAgent: text("assigned_agent"),
  // queued | running | done | failed | cancelled
  status: text("status").notNull().default("queued"),
  priority: integer("priority").notNull().default(0), // higher = sooner
  result: text("result"),
  // ms the agent took (start → first token or completion).
  latencyMs: integer("latency_ms"),
  promptTokens: integer("prompt_tokens"),
  completionTokens: integer("completion_tokens"),
  // Free-text error message on failure.
  error: text("error"),
  createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
});

export type Task = typeof tasks.$inferSelect;
