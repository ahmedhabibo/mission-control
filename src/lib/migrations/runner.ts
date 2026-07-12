/**
 * Migration runner for Mission Control.
 *
 * Adapted from builderz-labs/mission-control's migration pattern.
 * Reads numbered .sql files from src/lib/migrations/, applies them in order,
 * and tracks which ones have been applied in the `_migrations` table.
 *
 * Usage:
 *   import { runMigrations } from "@/lib/migrations/runner";
 *   runMigrations();  // call on server boot before ensureSchema()
 *
 * Or via CLI:
 *   pnpm migrate  (calls src/lib/migrations/run.ts)
 */

import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { raw } from "@/lib/db/client";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname);

/** Ensure the _migrations tracking table exists. */
function ensureMigrationsTable() {
  raw.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );
  `);
}

/** Get the list of already-applied migration filenames. */
function getAppliedMigrations(): Set<string> {
  const rows = raw.prepare("SELECT filename FROM _migrations").all() as { filename: string }[];
  return new Set(rows.map((r) => r.filename));
}

/** Get all .sql files in the migrations directory, sorted by filename. */
function getMigrationFiles(): string[] {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  return files;
}

/**
 * Run all pending migrations in order.
 * Safe to call on every server boot — already-applied migrations are skipped.
 *
 * @returns Array of newly applied migration filenames (empty if all up to date)
 */
export function runMigrations(): string[] {
  ensureMigrationsTable();
  const applied = getAppliedMigrations();
  const allFiles = getMigrationFiles();
  const newlyApplied: string[] = [];

  for (const filename of allFiles) {
    if (applied.has(filename)) continue;

    const filepath = join(MIGRATIONS_DIR, filename);
    const sql = readFileSync(filepath, "utf-8");

    // Execute the entire migration in one transaction.
    const tx = raw.transaction(() => {
      raw.exec(sql);
      raw.prepare("INSERT INTO _migrations (filename) VALUES (?)").run(filename);
    });

    try {
      tx();
      newlyApplied.push(filename);
      console.log(`[migrations] applied: ${filename}`);
    } catch (err) {
      console.error(`[migrations] FAILED: ${filename}`, err);
      throw err;
    }
  }

  if (newlyApplied.length === 0) {
    console.log("[migrations] all up to date");
  }

  return newlyApplied;
}
