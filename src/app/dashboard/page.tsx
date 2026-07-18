"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Cpu, MessageSquare, ListChecks, Zap, Activity } from "lucide-react";

import { cn, timeAgo } from "@/lib/utils";

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

interface AnalyticsData {
  agents: Array<{
    id: string;
    name: string;
    taskCount: number;
    doneCount: number;
    failedCount: number;
    successRate: number;
    totalTokens: number;
    avgLatencyMs: number | null;
    lastUsedAt: string | null;
  }>;
  tokenUsageByDay: Array<{ date: string; promptTokens: number; completionTokens: number }>;
  tasksByDay: Array<{ date: string; count: number }>;
  intentDistribution: Array<{ intent: string; count: number }>;
  statusDistribution: Array<{ status: string; count: number }>;
  totals: {
    tasks: number;
    agents: number;
    sessions: number;
    messages: number;
    totalTokens: number;
  };
  recentActivity: Array<{
    agentId: string;
    taskId: string;
    title: string;
    status: string;
    intent: string | null;
    createdAt: string;
    promptTokens: number;
    completionTokens: number;
  }>;
  available: boolean;
}

const INTENT_COLORS: Record<string, string> = {
  code: "#3b82f6",
  design: "#ec4899",
  research: "#10b981",
  knowledge: "#a855f7",
  chat: "#f59e0b",
};

const STATUS_COLORS: Record<string, string> = {
  queued: "#a3a3a3",
  running: "#6366f1",
  done: "#22c55e",
  failed: "#ef4444",
  cancelled: "#6b7280",
};

export default function DashboardPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);

  async function load() {
    try {
      const res = await fetch(`/api/dashboard/analytics?days=${days}`, { cache: "no-store" });
      if (!res.ok) return;
      const d = (await res.json()) as AnalyticsData;
      setData(d);
      setLoading(false);
    } catch {
      /* offline */
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [days]);

  const totals = data?.totals;
  const agentsCount = totals?.agents ?? 0;
  const tasksCount = totals?.tasks ?? 0;
  const tokensCount = totals?.totalTokens ?? 0;
  const sessionsCount = totals?.sessions ?? 0;
  const messagesCount = totals?.messages ?? 0;
  const agents = data?.agents ?? [];
  const recent = data?.recentActivity ?? [];

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Agent analytics · {totals ? `${tasksCount} tasks · ${formatNumber(tokensCount)} tokens` : "loading…"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm focus:border-[var(--ring)] focus:outline-none"
          >
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
          </select>
          <button
            onClick={load}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs font-medium text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
          >
            <Zap className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>
      </header>

      {loading || !data ? (
        <Skeleton />
      ) : !data.available ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] p-12 text-center text-sm text-[var(--muted-foreground)]">
          No analytics data available yet. Submit tasks to populate the dashboard.
        </div>
      ) : (
        <div className="space-y-6">
          {/* ── KPI tiles ────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Kpi label="Tasks" value={tasksCount} icon={<ListChecks className="h-4 w-4 text-[var(--accent)]" />} />
            <Kpi label="Sessions" value={sessionsCount} icon={<MessageSquare className="h-4 w-4 text-[var(--accent)]" />} />
            <Kpi label="Messages" value={messagesCount} icon={<MessageSquare className="h-4 w-4 text-pink-500" />} />
            <Kpi label="Tokens" value={formatNumber(tokensCount)} icon={<Cpu className="h-4 w-4 text-amber-500" />} />
            <Kpi label="Agents used" value={`${agentsCount}`} icon={<Activity className="h-4 w-4 text-emerald-500" />} />
          </div>

          {/* ── Tasks + tokens over time ─────────────────────────── */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card title="Tasks per day" subtitle="Last 14 days">
              <SparkChart data={data.tasksByDay.map((p) => p.count)} color="#6366f1" />
              <div className="mt-2 flex items-center justify-between text-[10px] text-[var(--muted-foreground)]">
                <span>{data.tasksByDay[0]?.date}</span>
                <span>{data.tasksByDay.at(-1)?.date}</span>
              </div>
            </Card>

            <Card title="Token usage" subtitle="Prompt + completion daily">
              <StackedBarChart
                data={data.tokenUsageByDay.map((d) => ({
                  label: d.date.slice(5),
                  a: d.promptTokens,
                  b: d.completionTokens,
                }))}
                colorA="#6366f1"
                colorB="#22c55e"
              />
            </Card>
          </div>

          {/* ── Per-agent breakdown + intents ────────────────────── */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <Card title="Agent performance" subtitle="Task volume & success rate">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[var(--border)] text-left text-[var(--muted-foreground)]">
                        <th className="py-2.5 pl-3 pr-2 font-medium">Agent</th>
                        <th className="px-2 font-medium">Tasks</th>
                        <th className="px-2 font-medium">Success</th>
                        <th className="px-2 font-medium">Tokens</th>
                        <th className="px-2 text-right font-medium">Avg latency</th>
                        <th className="pr-3 pl-2 text-right font-medium">Last used</th>
                      </tr>
                    </thead>
                    <tbody>
                      {agents.map((a) => (
                        <tr key={a.id} className="border-b border-[var(--border)]/60 last:border-0">
                          <td className="py-2.5 pl-3 pr-2 font-medium text-foreground">{a.name}</td>
                          <td className="px-2 tabular-nums">{a.taskCount}</td>
                          <td className="px-2">
                            <span
                              className={cn(
                                "rounded-full border px-1.5 py-0.5 text-[10px]",
                                a.successRate >= 90
                                  ? "border-emerald-500/30 text-emerald-500"
                                  : a.successRate >= 60
                                    ? "border-amber-500/30 text-amber-500"
                                    : "border-red-500/30 text-red-500",
                              )}
                            >
                              {a.successRate}%
                            </span>
                          </td>
                          <td className="px-2 tabular-nums">{formatNumber(a.totalTokens)}</td>
                          <td className="px-2 text-right tabular-nums">
                            {a.avgLatencyMs ? `${formatNumber(a.avgLatencyMs)}ms` : "—"}
                          </td>
                          <td className="pr-3 pl-2 text-right text-[10px] text-[var(--muted-foreground)]">
                            {a.lastUsedAt ? timeAgo(a.lastUsedAt) : "never"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>

            <Card title="Intents" subtitle="Task classification breakdown">
              <Donut
                slices={data.intentDistribution.map((d) => ({
                  label: d.intent,
                  value: d.count,
                  color: INTENT_COLORS[d.intent] ?? "#6366f1",
                }))}
              />
              <div className="mt-3 space-y-1">
                {data.intentDistribution.map((d) => (
                  <div key={d.intent} className="flex items-center gap-2 text-xs">
                    <span
                      className="h-2.5 w-2.5 rounded-sm"
                      style={{ backgroundColor: INTENT_COLORS[d.intent] ?? "#6366f1" }}
                    />
                    <span className="capitalize text-[var(--muted-foreground)]">{d.intent}</span>
                    <span className="ml-auto tabular-nums">{d.count}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* ── Status distribution ─────────────────────────────── */}
          <Card title="Task status" subtitle="Queued / running / done / failed / cancelled">
            <div className="flex flex-wrap gap-3">
              {data.statusDistribution.map((s) => (
                <div key={s.status} className="flex items-center gap-2 text-xs">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: STATUS_COLORS[s.status] ?? "#a3a3a3" }}
                  />
                  <span className="capitalize text-[var(--muted-foreground)]">{s.status}</span>
                  <span className="ml-1 tabular-nums text-foreground font-medium">{s.count}</span>
                </div>
              ))}
              {data.statusDistribution.length === 0 && (
                <div className="text-xs text-[var(--muted-foreground)]">No tasks yet.</div>
              )}
            </div>
          </Card>

          {/* ── Recent activity ─────────────────────────────────── */}
          <Card title="Recent activity" subtitle="Latest 10 tasks">
            <ul className="divide-y divide-[var(--border)]/60">
              {recent.length === 0 ? (
                <li className="py-6 text-center text-sm text-[var(--muted-foreground)]">
                  No activity yet. Submit a task below to populate the log.
                </li>
              ) : (
                recent.map((r) => (
                  <li key={r.taskId} className="flex items-center gap-3 py-2.5">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: STATUS_COLORS[r.status] ?? "#a3a3a3" }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium">{r.title}</div>
                      <div className="flex flex-wrap items-center gap-2 text-[10px] text-[var(--muted-foreground)]">
                        <span className="font-medium text-foreground">{r.agentId}</span>
                        {r.intent && <span className="capitalize">· {r.intent}</span>}
                        <span>· {timeAgo(r.createdAt)}</span>
                        {(r.promptTokens + r.completionTokens) > 0 && (
                          <span>· {formatNumber(r.promptTokens + r.completionTokens)} tokens</span>
                        )}
                      </div>
                    </div>
                    <span
                      className={cn(
                        "rounded-full border px-1.5 py-0.5 text-[10px] capitalize",
                        r.status === "done" && "border-emerald-500/30 text-emerald-500",
                        r.status === "failed" && "border-red-500/30 text-red-500",
                        r.status === "running" && "border-indigo-500/30 text-indigo-500",
                        r.status === "queued" && "border-zinc-400/30 text-zinc-400",
                        r.status === "cancelled" && "border-zinc-500/30 text-zinc-500",
                      )}
                    >
                      {r.status}
                    </span>
                  </li>
                ))
              )}
            </ul>
            <Link
              href="/tasks"
              className="mt-3 inline-flex items-center gap-1 text-xs text-[var(--accent)] hover:underline"
            >
              View all tasks <ArrowUpRight className="h-3 w-3" />
            </Link>
          </Card>
        </div>
      )}
    </div>
  );
}

/* ── Building blocks ─────────────────────────────────────────── */

function Kpi({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-[var(--muted-foreground)]">{label}</span>
        {icon}
      </div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        {subtitle && <span className="text-[10px] text-[var(--muted-foreground)]">{subtitle}</span>}
      </div>
      {children}
    </div>
  );
}

/** Lightweight line-style spark chart (no Recharts dependency). */
function SparkChart({ data, color }: { data: number[]; color: string }) {
  if (data.length === 0) return null;
  const max = Math.max(...data, 1);
  const w = 100;
  const h = 40;
  const stepX = data.length > 1 ? w / (data.length - 1) : 0;

  const pts = data.map((v, i) => `${i * stepX},${h - (v / max) * h}`).join(" ");

  return (
    <div className="space-y-1">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-20 w-full" preserveAspectRatio="none">
        <polyline
          points={`0,${h} ${pts} ${w},${h}`}
          fill={color}
          fillOpacity="0.12"
          stroke="none"
        />
        <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" />
        {data.map((v, i) =>
          v > 0 ? (
            <circle
              key={i}
              cx={i * stepX}
              cy={h - (v / max) * h}
              r="1.5"
              fill={color}
            />
          ) : null,
        )}
      </svg>
      <div className="flex h-4 items-end justify-between gap-1">
        {data.map((v, i) => (
          <div
            key={i}
            className="flex-1 rounded-sm"
            style={{ height: `${(v / max) * 100}%`, minHeight: v > 0 ? "2px" : "1px", backgroundColor: `${color}40` }}
            title={`${v} tasks`}
          />
        ))}
      </div>
    </div>
  );
}

/** Lightweight stacked bar chart. */
function StackedBarChart({
  data,
  colorA,
  colorB,
}: {
  data: Array<{ label: string; a: number; b: number }>;
  colorA: string;
  colorB: string;
}) {
  if (data.length === 0) return null;
  const max = Math.max(...data.map((d) => d.a + d.b), 1);

  return (
    <div className="flex h-32 items-end gap-1">
      {data.map((d, i) => {
        const total = d.a + d.b;
        const ratio = (total / max) * 100;
        return (
          <div key={i} className="group relative flex h-full flex-1 flex-col justify-end rounded-sm overflow-hidden">
            <div
              className="w-full"
              style={{ height: `${ratio}%`, backgroundColor: `${colorA}`, minHeight: total > 0 ? "2px" : "1px" }}
              title={`${d.label}: ${d.a} prompt + ${d.b} completion tokens`}
            />
            <div className="absolute inset-0 flex items-end">
              <div
                className="w-full"
                style={{ height: `${(d.a / Math.max(total, 1)) * 100}%`, backgroundColor: `${colorB}` }}
              />
            </div>
            <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[8px] text-[var(--muted-foreground)]">
              {d.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Donut chart via SVG. */
function Donut({ slices }: { slices: Array<{ label: string; value: number; color: string }> }) {
  const total = slices.reduce((acc, s) => acc + s.value, 0);
  if (total === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-xs text-[var(--muted-foreground)]">
        No intents classified yet.
      </div>
    );
  }

  const r = 24;
  const cx = 36;
  const cy = 36;
  const C = 2 * Math.PI * r;

  let offset = 0;
  return (
    <svg viewBox="0 0 72 72" className="h-32 w-full">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border)" strokeWidth="10" />
      {slices.map((s, i) => {
        const len = (s.value / total) * C;
        const segment = (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={s.color}
            strokeWidth="10"
            strokeDasharray={`${len} ${C - len}`}
            strokeDashoffset={-offset}
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        );
        offset += len;
        return segment;
      })}
      <text x={cx} y={cy - 2} textAnchor="middle" className="fill-foreground text-sm font-bold">
        {total}
      </text>
      <text x={cx} y={cy + 8} textAnchor="middle" className="fill-muted-foreground text-[8px]">
        total
      </text>
    </svg>
  );
}

function Skeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-[var(--card)]" />
        ))}
      </div>
      <div className="h-40 animate-pulse rounded-xl bg-[var(--card)]" />
      <div className="h-32 animate-pulse rounded-xl bg-[var(--card)]" />
    </div>
  );
}
