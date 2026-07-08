"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { BoardSummary, ProbeResult, ToolStatus } from "@/lib/types";

/**
 * Board state store.
 *
 * The board reads its initial snapshot via fetch on mount, then subscribes to
 * the SSE stream for live updates. State lives in a module-level store so all
 * components share one subscription regardless of how many read it.
 *
 * `useSyncExternalStore` is the React 18+ primitive for external stores — it
 * avoids tearing and lets server/client render consistently.
 */

type State = {
  tools: ToolStatus[];
  summary: BoardSummary | null;
  lastSweep: string | null;
  connected: boolean;
};

let state: State = { tools: [], summary: null, lastSweep: null, connected: false };
const listeners = new Set<() => void>();

function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  // Recompute summary whenever tools change.
  if (patch.tools) {
    const tools = patch.tools;
    state.summary = {
      total: tools.length,
      online: count(tools, "online"),
      degraded: count(tools, "degraded"),
      offline: count(tools, "offline"),
      unknown: count(tools, "unknown"),
      lastSweep: state.lastSweep,
    };
  }
  listeners.forEach((l) => l());
}

function count(tools: ToolStatus[], status: ProbeResult["status"]) {
  return tools.filter((t) => t.result.status === status).length;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  ensureConnection();
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot() {
  return state;
}

let es: EventSource | null = null;
let fetchedInitial = false;

function ensureConnection() {
  if (es || typeof window === "undefined") return;

  // Fetch the initial snapshot once, then rely on SSE.
  if (!fetchedInitial) {
    fetchedInitial = true;
    fetch("/api/status")
      .then((r) => r.json())
      .then((data) =>
        set({
          tools: data.tools,
          lastSweep: data.summary?.lastSweep ?? null,
        }),
      )
      .catch((err) => console.error("[use-status] initial fetch failed:", err));
  }

  es = new EventSource("/api/status/stream");
  es.onopen = () => set({ connected: true });
  es.onerror = () => set({ connected: false });
  es.onmessage = (msg) => {
    try {
      const event = JSON.parse(msg.data);
      if (event.type === "snapshot") {
        set({ tools: event.snapshot as ToolStatus[] });
      } else if (event.type === "sweep") {
        state.lastSweep = event.lastSweep;
        if (state.summary) state.summary.lastSweep = event.lastSweep;
        set({});
      } else if (event.type === "update") {
        const { toolId, result } = event;
        const tools = state.tools.map((t) =>
          t.tool.id === toolId ? { ...t, result: result as ProbeResult } : t,
        );
        set({ tools });
      }
    } catch (err) {
      console.error("[use-status] bad SSE message:", err);
    }
  };
}

/** React hook: live board state. */
export function useStatus() {
  useEffect(() => {
    ensureConnection();
  }, []);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
