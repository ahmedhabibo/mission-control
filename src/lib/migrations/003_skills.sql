-- 003_skills.sql — Skills Hub registry
-- Mirrors ~/.hermes/skills/ and external registries

CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY,              -- slug (e.g. "malta-income-tax")
  name TEXT NOT NULL,               -- display name
  category TEXT,                    -- e.g. "devops", "career", "odoo"
  description TEXT,
  path TEXT NOT NULL,               -- filesystem path
  source TEXT NOT NULL DEFAULT 'local',  -- local | clawdhub | skills.sh
  installed INTEGER NOT NULL DEFAULT 1,
  security_status TEXT NOT NULL DEFAULT 'pending',  -- pending | clean | warning | blocked
  security_findings TEXT,            -- JSON array of findings from security scan
  version TEXT,                      -- skill version if available
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
CREATE INDEX IF NOT EXISTS idx_skills_category
  ON skills (category);
CREATE INDEX IF NOT EXISTS idx_skills_installed
  ON skills (installed);
