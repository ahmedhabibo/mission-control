-- 001_initial.sql — Base schema for Mission Control
-- Captured 2026-07-12 from existing Drizzle schema (src/lib/db/schema.ts)
-- All tables use IF NOT EXISTS so this is safe on databases already created by ensureSchema().

-- ── tool_overrides ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tool_overrides (
  tool_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL,
  endpoint_override TEXT,
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

-- ── status_history ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tool_id TEXT NOT NULL,
  label TEXT NOT NULL,
  status TEXT NOT NULL,          -- online | degraded | offline | unknown
  latency_ms INTEGER,
  version TEXT,
  detail TEXT NOT NULL,
  components TEXT,               -- JSON string for composite probes
  checked_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
CREATE INDEX IF NOT EXISTS idx_status_history_tool_time
  ON status_history (tool_id, checked_at DESC);

-- ── conversations ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,           -- ULID-ish client-generated id
  title TEXT NOT NULL,
  agent_id TEXT NOT NULL,        -- chat registry agent id (e.g. "hermes")
  system_prompt TEXT,            -- NULL = agent default
  model TEXT,                    -- NULL = agent default
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

-- ── messages ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,             -- user | assistant | system
  content TEXT NOT NULL,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  latency_ms INTEGER,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation
  ON messages (conversation_id, id);

-- ── tasks ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,            -- client-friendly sortable id
  title TEXT NOT NULL,
  prompt TEXT NOT NULL,
  intent TEXT,                    -- classified: code | design | research | knowledge | chat
  intent_hint TEXT NOT NULL DEFAULT 'auto',
  routed_agents TEXT,             -- JSON array of agent ids in priority order
  assigned_agent TEXT,            -- the agent that ultimately ran the task
  status TEXT NOT NULL DEFAULT 'queued',  -- queued | running | done | failed | cancelled
  priority INTEGER NOT NULL DEFAULT 0,    -- higher = sooner
  result TEXT,
  latency_ms INTEGER,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  error TEXT,
  chain_id TEXT,                  -- orchestration chain grouping
  parent_ids TEXT,                -- JSON array of parent task ids (blocker deps)
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  started_at TEXT,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_tasks_status_created
  ON tasks (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_created
  ON tasks (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_chain
  ON tasks (chain_id);
