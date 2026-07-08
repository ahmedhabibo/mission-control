"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { TaskDTO, TaskEvent } from "@/lib/tasks/types";

/**
 * Live task store, same pattern as the status board's use-status hook.
 *
 * Loads an initial snapshot via fetch, then subscribes to the task SSE stream
 * so the dashboard updates in real time as tasks are created, run, stream, and
 * complete. State is module-level so every reader shares one subscription.
 */

type State = { tasks: TaskDTO[]; connected: boolean };
let state: State = { tasks: [], connected: false };
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  emit();
}

function applyEvent(event: TaskEvent) {
  switch (event.type) {
    case "status":
      set({
        tasks: state.tasks.map((t) =>
          t.id === event.taskId
            ? { ...t, status: event.status, assignedAgent: event.assignedAgent ?? t.assignedAgent }
            : t,
        ),
      });
      break;
    case "delta":
      // Accumulate streaming content into the task's result (live preview).
      set({
        tasks: state.tasks.map((t) =>
          t.id === event.taskId
            ? { ...t, status: "running", result: (t.result ?? "") + event.content }
            : t,
        ),
      });
      break;
    case "done":
      set({
        tasks: state.tasks.map((t) =>
          t.id === event.taskId
            ? { ...t, status: "done", result: event.result, completedAt: new Date().toISOString() }
            : t,
        ),
      });
      break;
    case "error":
      set({
        tasks: state.tasks.map((t) =>
          t.id === event.taskId
            ? { ...t, status: "failed", error: event.message, completedAt: new Date().toISOString() }
            : t,
        ),
      });
      break;
  }
}

let es: EventSource | null = null;
let fetchedInitial = false;

function ensureConnection() {
  if (es || typeof window === "undefined") return;

  if (!fetchedInitial) {
    fetchedInitial = true;
    fetch("/api/tasks")
      .then((r) => r.json())
      .then((d) => set({ tasks: d.tasks }))
      .catch((err) => console.error("[use-tasks] initial fetch failed:", err));
  }

  es = new EventSource("/api/tasks/stream");
  es.onopen = () => set({ connected: true });
  es.onerror = () => set({ connected: false });
  es.onmessage = (msg) => {
    try {
      const event = JSON.parse(msg.data);
      if (event.type === "snapshot") {
        set({ tasks: event.tasks as TaskDTO[] });
      } else {
        applyEvent(event as TaskEvent);
      }
    } catch (err) {
      console.error("[use-tasks] bad SSE message:", err);
    }
  };
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  ensureConnection();
  return () => listeners.delete(cb);
}

/** React hook: live task list. */
export function useTasks() {
  useEffect(() => {
    ensureConnection();
  }, []);
  return useSyncExternalStore(subscribe, () => state, () => state);
}
