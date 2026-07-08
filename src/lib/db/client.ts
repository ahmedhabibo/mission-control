import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as schema from "./schema";

/**
 * Singleton DB connection.
 *
 * Next dev mode reloads modules on file changes; without memoization we'd
 * open (and leak) a new SQLite handle per request. We cache on globalThis so
 * the handle survives HMR within a single dev server process.
 */
const DB_PATH = resolve(process.cwd(), "data", "mission-control.db");

type DB = BetterSQLite3Database<typeof schema>;

declare global {
  // eslint-disable-next-line no-var
  var __mcDb: { db: DB; raw: Database.Database } | undefined;
}

function createDb() {
  // Ensure the data directory exists (e.g. ./data/).
  mkdirSync(dirname(DB_PATH), { recursive: true });
  const raw = new Database(DB_PATH);
  raw.pragma("journal_mode = WAL");
  raw.pragma("foreign_keys = ON");
  const db = drizzle(raw, { schema });
  return { db, raw };
}

export const { db, raw } = globalThis.__mcDb ?? createDb();
if (process.env.NODE_ENV !== "production") globalThis.__mcDb = { db, raw };

/** Run on server boot to ensure tables exist. */
export function ensureSchema() {
  raw.exec(`
    CREATE TABLE IF NOT EXISTS tool_overrides (
      tool_id TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL,
      endpoint_override TEXT,
      updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );
    CREATE TABLE IF NOT EXISTS status_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tool_id TEXT NOT NULL,
      label TEXT NOT NULL,
      status TEXT NOT NULL,
      latency_ms INTEGER,
      version TEXT,
      detail TEXT NOT NULL,
      components TEXT,
      checked_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );
    CREATE INDEX IF NOT EXISTS idx_status_history_tool_time
      ON status_history (tool_id, checked_at DESC);

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      system_prompt TEXT,
      model TEXT,
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
      updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      prompt_tokens INTEGER,
      completion_tokens INTEGER,
      latency_ms INTEGER,
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );
    CREATE INDEX IF NOT EXISTS idx_messages_conversation
      ON messages (conversation_id, id);

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      prompt TEXT NOT NULL,
      intent TEXT,
      intent_hint TEXT NOT NULL DEFAULT 'auto',
      routed_agents TEXT,
      assigned_agent TEXT,
      status TEXT NOT NULL DEFAULT 'queued',
      priority INTEGER NOT NULL DEFAULT 0,
      result TEXT,
      latency_ms INTEGER,
      prompt_tokens INTEGER,
      completion_tokens INTEGER,
      error TEXT,
      created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
      started_at TEXT,
      completed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_status_created
      ON tasks (status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_tasks_created
      ON tasks (created_at DESC);
  `);
}
