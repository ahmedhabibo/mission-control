/**
 * Runs once when the Next.js server boots (dev or production).
 * Used to start the background probe scheduler and ensure the DB schema.
 *
 * Edge runtime can't use better-sqlite3 or child_process, so we pin this to
 * the Node runtime explicitly.
 */
export async function register() {
  // Only run on the server, never during the edge/client build.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("@/lib/runner");
    startScheduler();
    console.log("[mission-control] probe scheduler started");
  }
}
