/**
 * CLI entry point: run migrations from the command line.
 * Usage: pnpm migrate
 */
import { runMigrations } from "./runner";

console.log("[migrate] running pending migrations...");
const applied = runMigrations();
console.log(`[migrate] done. ${applied.length} migrations applied.`);
process.exit(0);
