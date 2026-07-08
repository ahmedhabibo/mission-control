import { ensureSchema } from "@/lib/db/client";
import { listTasks, subscribeTasks } from "@/lib/tasks/runner";

export const dynamic = "force-dynamic";

/**
 * GET /api/tasks/stream — Server-Sent Events for live task progress.
 *
 * On connect we send a snapshot of current tasks, then forward every task
 * event (status changes, deltas, done, error) as it happens.
 */
export async function GET() {
  ensureSchema();
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | undefined;
  let heartbeat: NodeJS.Timeout | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          /* controller closed */
        }
      };

      // 1. Initial snapshot of all tasks.
      send({ type: "snapshot", tasks: listTasks() });

      // 2. Forward all future task events.
      unsubscribe = subscribeTasks((event) => send(event));

      // Heartbeat keeps proxies from closing the connection.
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        } catch {
          /* gone */
        }
      }, 25_000);
    },
    cancel() {
      unsubscribe?.();
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
