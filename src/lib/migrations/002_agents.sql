-- 002_agents.sql — Agent registry + heartbeat + per-agent budget
-- Adds the "fleet" layer from upstream builderz-labs/mission-control

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,              -- agent id (e.g. "hermes", "scout", "researcher-1")
  name TEXT NOT NULL,               -- display name
  role TEXT NOT NULL DEFAULT 'agent',  -- agent | researcher | coder | reviewer | ceo | cto
  status TEXT NOT NULL DEFAULT 'offline',  -- online | offline | degraded | terminated
  soul_config TEXT,                 -- JSON: system prompt, personality, permissions
  default_model TEXT,               -- preferred model id
  budget_monthly INTEGER,           -- token cap per month (NULL = unlimited)
  tokens_used_this_month INTEGER NOT NULL DEFAULT 0,
  last_heartbeat TEXT,              -- ISO timestamp of last heartbeat
  last_heartbeat_status TEXT,       -- ok | error | timeout
  workspace_path TEXT,              -- agent working directory
  capabilities TEXT,                -- JSON array: ["chat", "completion", "tools", "vision"]
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
CREATE INDEX IF NOT EXISTS idx_agents_status
  ON agents (status);

-- ── agent_heartbeats ──────────────────────────────────────────
-- Append-only log of heartbeats for audit + trend analysis.
CREATE TABLE IF NOT EXISTS agent_heartbeats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  status TEXT NOT NULL,             -- ok | error | timeout
  latency_ms INTEGER,
  detail TEXT,                      -- JSON: model, tokens, uptime, etc.
  checked_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
CREATE INDEX IF NOT EXISTS idx_agent_heartbeats_agent_time
  ON agent_heartbeats (agent_id, checked_at DESC);
