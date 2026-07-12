-- 005_activity.sql — Durable audit trail / activity feed
-- Replaces the transient pub/sub in tasks/runner.ts with persistent events

CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL,              -- agent id or "system" or user id
  action TEXT NOT NULL,             -- e.g. "task.created", "agent.registered", "skill.installed"
  entity_type TEXT NOT NULL,        -- task | agent | skill | conversation | routine
  entity_id TEXT,                   -- id of the affected entity
  metadata TEXT,                    -- JSON with contextual data
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
CREATE INDEX IF NOT EXISTS idx_activity_created
  ON activity (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_entity
  ON activity (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_actor
  ON activity (actor);
