import { subscribe } from "@/lib/sse";
import { getSnapshot, getLastSweepAt } from "@/lib/runner";

export const dynamic = "force-dynamic";

/**
 * GET /api/status/stream — Server-Sent Events.
 *
 * On connect we immediately send a `snapshot` event so the client has data
 * before the next sweep, then forward every broadcast thereafter. The route
 * uses a ReadableStream so it works in the Next.js App Router runtime.
 */
export async function GET() {
  const encoder = new TextEncoder();

  // Cleanup handles live outside start() so cancel() can reach them.
  let unsubscribe: (() => void) | undefined;
  let heartbeat: NodeJS.Timeout | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          /* controller closed — teardown will follow */
        }
      };

      // 1. Immediately push current state.
      send({ type: "snapshot", snapshot: getSnapshot() });
      send({ type: "sweep", lastSweep: getLastSweepAt() });

      // 2. Forward all future events.
      unsubscribe = subscribe((event) => send(event));

      // Heartbeat every 25s keeps proxies from closing idle connections.
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        } catch {
          /* client gone */
        }
      }, 25_000);
    },
    cancel() {
      // Client disconnected — release the subscription + interval.
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
