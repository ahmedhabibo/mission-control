-- 006_task_retry.sql — Add retry fields to tasks table
-- Applied after 005_activity.sql

ALTER TABLE tasks ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN max_retries INTEGER NOT NULL DEFAULT 3;

CREATE INDEX IF NOT EXISTS idx_tasks_retry ON tasks (retry_count);