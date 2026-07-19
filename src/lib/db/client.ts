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
  // Run numbered migrations first (creates new tables from migrations/*.sql).
  // Falls back to ensureSchema() for backward compat — existing DBs that
  // were created before the migration system continue to work.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { runMigrations } = require("@/lib/migrations/runner");
    runMigrations();
  } catch (err) {
    console.warn("[db] migration runner not available, falling back to ensureSchema() only:", err);
  }

  // Idempotent ALTERs — only adds columns if missing. Safe to call repeatedly.
  // SQLite supports at most one ALTER TABLE per statement; each error is
  // suppressed because "duplicate column name" is an expected first-run skip.
  try { raw.exec(`ALTER TABLE tasks ADD COLUMN chain_id TEXT`); } catch { /* already exists */ }
  try { raw.exec(`ALTER TABLE tasks ADD COLUMN parent_ids TEXT`); } catch { /* already exists */ }
  try { raw.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_chain ON tasks (chain_id)`); } catch { /* already exists */ }
  // Retry columns (migration 006) — ensure fresh DBs created by ensureSchema() get them
  try { raw.exec(`ALTER TABLE tasks ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0`); } catch { /* already exists */ }
  try { raw.exec(`ALTER TABLE tasks ADD COLUMN max_retries INTEGER NOT NULL DEFAULT 3`); } catch { /* already exists */ }
}
