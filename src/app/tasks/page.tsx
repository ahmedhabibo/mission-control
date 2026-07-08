"use client";

import { useState } from "react";
import { useTasks } from "@/components/use-tasks";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getIcon } from "@/lib/icons";
import { cn, timeAgo } from "@/lib/utils";
import {
  SendHorizonal,
  RefreshCw,
  Trash2,
  Square,
  ChevronDown,
  Loader2,
  ListChecks,
} from "lucide-react";
import type { Intent, TaskStatus } from "@/lib/tasks/types";

const INTENT_OPTIONS: { value: Intent | "auto"; label: string }[] = [
  { value: "auto", label: "Auto-classify" },
  { value: "code", label: "Code" },
  { value: "design", label: "Design" },
  { value: "research", label: "Research" },
  { value: "knowledge", label: "Knowledge" },
  { value: "chat", label: "Chat" },
];

const STATUS_STYLE: Record<TaskStatus, string> = {
  queued: "bg-[var(--status-unknown)]/15 text-[var(--status-unknown)] border-[var(--status-unknown)]/30",
  running: "bg-[var(--accent)]/15 text-[var(--accent)] border-[var(--accent)]/30",
  done: "bg-[var(--status-online)]/15 text-[var(--status-online)] border-[var(--status-online)]/30",
  failed: "bg-[var(--status-offline)]/15 text-[var(--status-offline)] border-[var(--status-offline)]/30",
  cancelled: "bg-[var(--muted)] text-[var(--muted-foreground)] border-[var(--border)]",
};

export default function TasksPage() {
  const { tasks, connected } = useTasks();
  const [prompt, setPrompt] = useState("");
  const [intentHint, setIntentHint] = useState<Intent | "auto">("auto");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    const content = prompt.trim();
    if (!content || submitting) return;
    setSubmitting(true);
    try {
      await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: content, intentHint }),
      });
      setPrompt("");
    } finally {
      setSubmitting(false);
    }
  }

  async function action(id: string, act: "cancel" | "re-run" | "delete") {
    if (act === "delete") {
      await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    } else {
      await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: act }),
      });
    }
  }

  const counts = {
    queued: tasks.filter((t) => t.status === "queued").length,
    running: tasks.filter((t) => t.status === "running").length,
    done: tasks.filter((t) => t.status === "done").length,
    failed: tasks.filter((t) => t.status === "failed").length,
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      {/* Header */}
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <ListChecks className="h-6 w-6 text-[var(--accent)]" />
            Tasks
          </h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Submit work and Mission Control routes it to the best agent.
            {!connected && <span className="text-[var(--status-unknown)]"> · reconnecting…</span>}
          </p>
        </div>
      </div>

      {/* Submit form */}
      <div className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Describe the task… e.g. 'Write a Python function to parse CSV files'"
          rows={3}
          className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--input)] px-3.5 py-2.5 text-sm placeholder:text-[var(--muted-foreground)] focus:border-[var(--ring)] focus:outline-none focus:ring-1 focus:ring-[var(--ring)]"
        />
        <div className="mt-3 flex items-center gap-3">
          <select
            value={intentHint}
            onChange={(e) => setIntentHint(e.target.value as Intent | "auto")}
            className="h-9 rounded-md border border-[var(--border)] bg-[var(--input)] px-3 text-sm focus:border-[var(--ring)] focus:outline-none"
          >
            {INTENT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <Button
            variant="primary"
            onClick={submit}
            disabled={!prompt.trim() || submitting}
            className="ml-auto"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <SendHorizonal className="h-4 w-4" />
            )}
            Submit task
          </Button>
        </div>
      </div>

      {/* Summary tiles */}
      <div className="mb-5 grid grid-cols-4 gap-3">
        {(["queued", "running", "done", "failed"] as TaskStatus[]).map((s) => (
          <div key={s} className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
            <div className="text-xs capitalize text-[var(--muted-foreground)]">{s}</div>
            <div className="mt-0.5 text-2xl font-bold tabular-nums">{counts[s as keyof typeof counts]}</div>
          </div>
        ))}
      </div>

      {/* Task list */}
      {tasks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] p-12 text-center text-sm text-[var(--muted-foreground)]">
          No tasks yet. Submit one above and watch Mission Control route it.
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => (
            <TaskRow key={task.id} task={task} onAction={action} />
          ))}
        </div>
      )}
    </div>
  );
}

function TaskRow({
  task,
  onAction,
}: {
  task: import("@/lib/tasks/types").TaskDTO;
  onAction: (id: string, act: "cancel" | "re-run" | "delete") => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isActive = task.status === "running" || task.status === "queued";

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3.5 transition-colors hover:border-[var(--ring)]">
      <div className="flex items-start gap-3">
        {/* Status chip */}
        <span
          className={cn(
            "mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium capitalize",
            STATUS_STYLE[task.status],
          )}
        >
          {task.status === "running" && <Loader2 className="h-3 w-3 animate-spin" />}
          {task.status}
        </span>

        <div className="min-w-0 flex-1">
          {/* Title + intent + agent */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-medium">{task.title}</span>
            {task.intent && (
              <Badge className="capitalize text-[var(--muted-foreground)]">{task.intent}</Badge>
            )}
            {task.assignedAgent && (
              <Badge className="text-[var(--muted-foreground)]">→ {task.assignedAgent}</Badge>
            )}
          </div>

          {/* Prompt preview */}
          <p className="mt-0.5 truncate text-xs text-[var(--muted-foreground)]">{task.prompt}</p>

          {/* Meta line */}
          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-[var(--muted-foreground)]">
            <span>{timeAgo(task.createdAt)}</span>
            {task.latencyMs != null && <span>{formatLatency(task.latencyMs)}</span>}
            {task.promptTokens != null && (
              <span>{task.promptTokens + (task.completionTokens ?? 0)} tokens</span>
            )}
            {task.routedAgents.length > 1 && (
              <span title="Routing preference order">route: {task.routedAgents.join(" → ")}</span>
            )}
            {task.error && <span className="text-[var(--status-offline)]">{task.error}</span>}
          </div>

          {/* Streaming / result preview */}
          {task.result && (expanded || isActive) && (
            <div className="mt-2 rounded-lg border border-[var(--border)] bg-[var(--background)] p-3">
              {task.status === "running" ? (
                <pre className="whitespace-pre-wrap break-words font-mono text-xs">{task.result}</pre>
              ) : (
                <Markdown content={task.result} />
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-1">
          {isActive && (
            <button
              onClick={() => onAction(task.id, "cancel")}
              className="rounded-md p-1.5 text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--status-offline)]"
              title="Cancel"
            >
              <Square className="h-3.5 w-3.5" />
            </button>
          )}
          {(task.status === "done" || task.status === "failed") && (
            <button
              onClick={() => onAction(task.id, "re-run")}
              className="rounded-md p-1.5 text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
              title="Re-run"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={() => onAction(task.id, "delete")}
            className="rounded-md p-1.5 text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--status-offline)]"
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          {task.result && !isActive && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="rounded-md p-1.5 text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
              title={expanded ? "Collapse" : "Expand"}
            >
              <ChevronDown
                className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")}
              />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function formatLatency(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
