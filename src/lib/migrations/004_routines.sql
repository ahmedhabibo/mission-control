-- 004_routines.sql — Natural-language recurring tasks scheduler
-- Stores cron expressions parsed from NL ("every morning at 6am")

CREATE TABLE IF NOT EXISTS routines (
  id TEXT PRIMARY KEY,              -- routine id
  title TEXT NOT NULL,
  schedule_cron TEXT NOT NULL,     -- standard cron expression
  schedule_nl TEXT,                 -- original natural language input
  agent_id TEXT,                    -- which agent to run this routine with
  task_template TEXT NOT NULL,      -- JSON: { title, prompt, intent_hint, priority }
  enabled INTEGER NOT NULL DEFAULT 1,
  last_run TEXT,                    -- ISO timestamp of last execution
  next_run TEXT,                    -- ISO timestamp of next scheduled run
  run_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
CREATE INDEX IF NOT EXISTS idx_routines_enabled_next
  ON routines (enabled, next_run);
