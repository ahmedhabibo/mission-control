import type { ProbeResult, ToolStatus } from "@/lib/types";

/**
 * Server-Sent Events pub/sub.
 *
 * The runner publishes probe results here; any open `/api/status/stream`
 * connection receives them. We keep the subscriber set on globalThis so it
 * survives dev-mode HMR. Events are JSON-encoded on a single line.
 */

export type SseEvent =
  | { type: "update"; toolId: string; result: ProbeResult }
  | { type: "sweep"; lastSweep: string }
  | { type: "snapshot"; snapshot: ToolStatus[] };

type Listener = (event: SseEvent) => void;

declare global {
   
  var __mcListeners: Set<Listener> | undefined;
}

const listeners: Set<Listener> = globalThis.__mcListeners ?? new Set();
globalThis.__mcListeners = listeners;

/** Subscribe to SSE events. Returns an unsubscribe function. */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Publish an event to every connected client. */
export function broadcast(event: SseEvent) {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch (err) {
      // A dead listener shouldn't break the broadcast.
      console.error("[sse] listener threw:", err);
    }
  }
}

/** How many browser tabs are currently connected. */
export function subscriberCount(): number {
  return listeners.size;
}
