"use client";

import { useState, useEffect, useRef, type FormEvent, type ChangeEvent } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export type Intent = "code" | "design" | "research" | "knowledge" | "chat";
export type TaskStatus =
  | "queued"
  | "running"
  | "done"
  | "failed"
  | "cancelled";

export interface Task {
  id: string;
  title: string;
  prompt: string;
  intent: Intent | null;
  intentHint: Intent | "auto";
  routedAgents: string[];
  assignedAgent: string | null;
  status: TaskStatus;
  priority: number;
  result: string | null;
  latencyMs: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

const INTENTS: Array<Intent | "auto"> = [
  "auto",
  "code",
  "design",
  "research",
  "knowledge",
  "chat",
];

export default function OrchestrationPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [form, setForm] = useState({
    title: "",
    prompt: "",
    intentHint: "auto" as Intent | "auto",
    priority: 0,
  });
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const refetchInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetchTasks();
    refetchInterval.current = setInterval(fetchTasks, 5000);
    return () => {
      if (refetchInterval.current) clearInterval(refetchInterval.current);
    };
  }, []);

  async function fetchTasks(): Promise<void> {
    try {
      const res = await fetch("/api/tasks");
      if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
      const data = await res.json();
      setTasks(data.tasks || []);
      setStatus("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setStatus("error");
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error || `Failed to create task: ${res.status}`);
      }
      const data = await res.json();
      setTasks((prev) => [data.task, ...prev]);
      setForm({
        title: "",
        prompt: "",
        intentHint: "auto",
        priority: 0,
      });
      setStatus("success");
      setTimeout(() => setStatus("idle"), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setStatus("error");
    }
  }

  const statusGroups: Record<TaskStatus, Task[]> = {
    queued: tasks
      .filter((t) => t.status === "queued")
      .sort((a, b) => b.priority - a.priority),
    running: tasks.filter((t) => t.status === "running"),
    done: tasks.filter((t) => t.status === "done"),
    failed: tasks.filter((t) => t.status === "failed"),
    cancelled: tasks.filter((t) => t.status === "cancelled"),
  };

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <h1 className="mb-6 text-2xl font-bold tracking-tight">
        Agent Task Orchestration
      </h1>

      {/* Task Submission Form */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Submit New Task</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="title"
                  className="mb-1.5 block text-sm font-medium"
                >
                  Title (optional)
                </label>
                <input
                  id="title"
                  className="flex h-10 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                  value={form.title}
                  onChange={(e) =>
                    setForm({ ...form, title: e.target.value })
                  }
                  placeholder="Leave empty to auto-generate from prompt"
                />
              </div>
              <div>
                <label
                  htmlFor="priority"
                  className="mb-1.5 block text-sm font-medium"
                >
                  Priority
                </label>
                <input
                  id="priority"
                  type="number"
                  className="flex h-10 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                  value={form.priority}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      priority: Number(e.target.value) || 0,
                    })
                  }
                  min={-10}
                  max={10}
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="prompt"
                className="mb-1.5 block text-sm font-medium"
              >
                Prompt *
              </label>
              <textarea
                id="prompt"
                className="flex w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                value={form.prompt}
                onChange={(e) =>
                  setForm({ ...form, prompt: e.target.value })
                }
                placeholder="Describe the task you want the agent to perform"
                rows={3}
              />
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="intentHint"
                  className="mb-1.5 block text-sm font-medium"
                >
                  Intent Hint
                </label>
                <select
                  id="intentHint"
                  className="flex h-10 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                  value={form.intentHint}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      intentHint: e.target.value as Intent | "auto",
                    })
                  }
                >
                  {INTENTS.map((intent) => (
                    <option key={intent} value={intent}>
                      {intent === "auto"
                        ? "Auto-detect"
                        : intent.charAt(0).toUpperCase() + intent.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              disabled={status === "loading"}
              className="w-full"
            >
              {status === "loading" ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                "Submit Task"
              )}
            </Button>

            {status === "error" && error && (
              <div className="mt-2 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}
            {status === "success" && (
              <div className="mt-2 rounded border border-green-200 bg-green-50 p-3 text-sm text-green-700">
                Task submitted successfully!
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      {/* Task Queue + Dependency Graph */}
      <div className="grid gap-6 md:grid-cols-12">
        <section className="md:col-span-8">
          <div className="space-y-6">
            {(
              [
                { label: "Queued", status: "queued" as const },
                { label: "Running", status: "running" as const },
                { label: "Completed", status: "done" as const },
                { label: "Failed", status: "failed" as const },
                { label: "Cancelled", status: "cancelled" as const },
              ]
            ).map(({ label, status: statusKey }) => {
              const tasksInStatus = statusGroups[statusKey];
              return (
                <Card key={statusKey}>
                  <CardHeader className="flex items-center justify-between">
                    <CardTitle>{label}</CardTitle>
                    <span className="text-xs text-[var(--muted-foreground)]">
                      {tasksInStatus.length}
                    </span>
                  </CardHeader>
                  <CardContent>
                    {tasksInStatus.length === 0 ? (
                      <p className="text-sm text-[var(--muted-foreground)]">
                        No tasks
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {tasksInStatus.map((task) => (
                          <TaskCard key={task.id} task={task} />
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        <aside className="md:col-span-4">
          <Card>
            <CardHeader>
              <CardTitle>Task Dependency Graph</CardTitle>
            </CardHeader>
            <CardContent>
              {tasks.length === 0 ? (
                <p className="py-8 text-center text-sm text-[var(--muted-foreground)]">
                  No tasks to display
                </p>
              ) : (
                <DependencyGraph tasks={tasks} />
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function TaskCard({ task }: { task: Task }) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-[var(--border)]/60 px-3 py-2">
      <div className="h-3 w-3 flex-shrink-0 rounded-full bg-[var(--muted)]" />
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className="max-w-[200px] truncate font-medium text-[var(--foreground)]">
            {task.title || "(no title)"}
          </span>
          <Badge>{task.assignedAgent ?? "auto"}</Badge>
          {task.intent && <Badge>{task.intent}</Badge>}
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-[var(--muted-foreground)]">
          {task.status === "queued" && <span>Priority: {task.priority}</span>}
          {task.status === "done" && task.latencyMs !== null && (
            <span>⏱ {task.latencyMs}ms</span>
          )}
          {task.status === "done" && task.promptTokens !== null && (
            <span>🔤 {task.promptTokens} tok</span>
          )}
        </div>
      </div>
    </div>
  );
}

function DependencyGraph({ tasks }: { tasks: Task[] }): React.ReactNode {
  const containerRef = useRef<SVGSVGElement | null>(null);
  const [nodes, setNodes] = useState<Array<{ id: string; x: number; y: number }>>(
    [],
  );

  useEffect(() => {
    if (!containerRef.current) return;
    const svg = containerRef.current;
    const width = svg.clientWidth || 400;
    const height = svg.clientHeight || 300;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * 0.4;
    const positioned = tasks.map((task, index) => {
      const angle = (index / tasks.length) * Math.PI * 2;
      return {
        id: task.id,
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
      };
    });
    setNodes(positioned);
  }, [tasks]);

  if (nodes.length === 0) return null;

  const STATUS_COLORS: Record<TaskStatus, string> = {
    queued: "var(--muted)",
    running: "var(--accent)",
    done: "var(--status-online)",
    failed: "var(--status-offline)",
    cancelled: "var(--muted)",
  };

  return (
    <div className="relative h-[300px]">
      <svg
        ref={containerRef}
        className="absolute inset-0"
        viewBox="0 0 400 300"
        preserveAspectRatio="xMidYMid meet"
        aria-label="Task dependency graph"
      >
        {nodes.slice(1).map((node, index) => (
          <line
            key={node.id}
            x1={nodes[index].x}
            y1={nodes[index].y}
            x2={node.x}
            y2={node.y}
            stroke="var(--muted)"
            strokeWidth={1}
            strokeDasharray="4 2"
          />
        ))}
        {nodes.map((node) => {
          const task = tasks.find((t) => t.id === node.id);
          if (!task) return null;
          return (
            <g key={node.id}>
              <circle
                cx={node.x}
                cy={node.y}
                r={16}
                fill={STATUS_COLORS[task.status]}
                stroke="var(--border)"
                strokeWidth={1}
              />
              <text
                x={node.x}
                y={node.y + 4}
                textAnchor="middle"
                fill="var(--foreground)"
                fontSize={10}
              >
                {task.id.slice(0, 4)}
              </text>
              <title>
                {task.title} — {task.status}
                {task.assignedAgent ? ` (${task.assignedAgent})` : ""}
              </title>
            </g>
          );
        })}
      </svg>
      <div className="absolute bottom-2 left-2 right-2 text-center text-xs text-[var(--muted-foreground)]">
        Tasks as nodes (first 4 chars of ID).
      </div>
    </div>
  );
}
