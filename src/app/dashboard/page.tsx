"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Cpu,
  Hash,
  ListChecks,
  MessageSquare,
  Plug,
  RefreshCcw,
  XCircle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { cn, formatLatency, timeAgo } from "@/lib/utils";
import type { HealthStatus } from "@/lib/types";
import {
  UptimeTrendChart,
  TokenBurnChart,
  TaskThroughputChart,
  AgentDistributionChart,
} from "@/components/analytics";
import {
  transformUptimeData,
  transformTokenUsageData,
  transformTaskThroughputData,
  transformAgentDistData,
} from "@/lib/analytics/transforms";

/**
 * Dashboard — analytics overview of the agent stack.
 *
 * Live data comes from `/api/dashboard`, which itself reads from
 * `status_history`, `tasks`, `conversations` and the runner snapshot. No
 * hardcoded numbers; everything reflects the last sweep or compute run.
 */

type StatusDist = Record<string, number>;

type DashboardTool = {
  id: string;
  name: string;
  category: string;
  status: HealthStatus;
  latencyMs: number | null;
  uptimePct: number | null;
  avgLatencyMs: number | null;
  p95LatencyMs: number | null;
  checks: number;
};

type TaskStatusBucket = {
  count: number;
  avgLatencyMs: number | null;
  tokens: { prompt: number; completion: number };
};

type DashboardData = {
  generatedAt: string;
  gateway: { configured: boolean };
  lastSweep: string | null;
  tools: DashboardTool[];
  statusDistribution: StatusDist;
  tasks: {
    total: number;
    byStatus: Record<string, TaskStatusBucket>;
    totalTokens: number;
    recent: {
      id: string;
      title: string;
      status: string;
      intent: string | null;
      assignedAgent: string | null;
      createdAt: string;
      completedAt: string | null;
      latencyMs: number | null;
    }[];
  };
  conversations: {
    total: number;
    messages: number;
    lastActivityAt: string | null;
    recent: {
      id: string;
      title: string;
      agentId: string;
      updatedAt: string;
    }[];
  };
};

export default function DashboardPage() {
  const { data, isLoading, dataUpdatedAt, refetch, isFetching } = useQuery<DashboardData>({
    queryKey: ["dashboard"],
    queryFn: () => fetch("/api/dashboard").then((r) => r.json()),
    refetchInterval: 15_000,
  });

  const stats = data?.statusDistribution ?? {};
  const totalTools = (data?.tools.length ?? 0) || 0;
  const onlineTools = stats.online ?? 0;
  const offlineTools = stats.offline ?? 0;
  const degradedTools = stats.degraded ?? 0;
  const avgUptime = average(data?.tools.map((t) => t.uptimePct) ?? []);

  // Chart data transforms
  const uptimeChartData = data ? transformUptimeData(data.tools) : [];
  const tokenChartData = data ? transformTokenUsageData(data.tasks.byStatus) : [];
  const throughputChartData = data ? transformTaskThroughputData(data.tasks.byStatus) : [];
  const agentDistChartData = data ? transformAgentDistData(data.statusDistribution) : [];

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      {/* Header */}
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Live analytics across your agent stack ·{" "}
            <span
              className={cn(
                "font-medium",
                data?.gateway.configured
                  ? "text-[var(--status-online)]"
                  : "text-[var(--status-unknown)]",
              )}
            >
              gateway {data?.gateway.configured ? "online" : "offline"}
            </span>
            {data?.lastSweep ? (
              <>
                {" · "}
                <span>last sweep {timeAgo(data.lastSweep)}</span>
              </>
            ) : null}
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs font-medium text-[var(--muted-foreground)] hover:bg-[var(--muted)] disabled:opacity-60"
        >
          <RefreshCcw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
          Refresh
        </button>
      </div>

      {/* Top KPI tiles */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile
          label="Tools online"
          value={`${onlineTools}/${totalTools}`}
          hint={`${offlineTools} offline · ${degradedTools} degraded`}
          icon={<CheckCircle2 className="h-4 w-4 text-[var(--status-online)]" />}
        />
        <KpiTile
          label="Avg uptime"
          value={avgUptime !== null ? `${avgUptime.toFixed(1)}%` : "—"}
          hint="across enabled tools"
          icon={<Activity className="h-4 w-4 text-[var(--accent)]" />}
        />
        <KpiTile
          label="Tasks total"
          value={data?.tasks.total ?? 0}
          hint={
            data
              ? `${data.tasks.byStatus.running?.count ?? 0} running · ${
                  data.tasks.byStatus.queued?.count ?? 0
                } queued`
              : undefined
          }
          icon={<ListChecks className="h-4 w-4 text-[var(--accent)]" />}
        />
        <KpiTile
          label="Tokens used"
          value={formatTokens(data?.tasks.totalTokens)}
          hint="across completed tasks"
          icon={<Cpu className="h-4 w-4 text-[var(--accent)]" />}
        />
      </div>

      {/* Gateway banner */}
      {data && !data.gateway.configured ? (
        <Card className="mb-6 flex items-start gap-3 border-[var(--status-unknown)]/30 bg-[var(--status-unknown)]/5 p-4">
          <Plug className="mt-0.5 h-4 w-4 text-[var(--status-unknown)]" />
          <div className="text-sm">
            <div className="font-semibold text-[var(--foreground)]">
              Gateway not configured
            </div>
            <div className="mt-0.5 text-[var(--muted-foreground)]">
              Set <code className="rounded bg-[var(--muted)] px-1 font-mono">MC_GATEWAY_URL</code>{" "}
              and{" "}
              <code className="rounded bg-[var(--muted)] px-1 font-mono">MC_GATEWAY_TOKEN</code>{" "}
              in <code className="rounded bg-[var(--muted)] px-1 font-mono">.env.local</code> to
              light up the rest of the board.
            </div>
          </div>
        </Card>
      ) : null}

      {/* Analytics charts grid */}
      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Uptime trend</h2>
            <span className="text-xs text-[var(--muted-foreground)]">
              per tool · last sweep
            </span>
          </div>
          {isLoading || !data ? (
            <Skeleton rows={4} />
          ) : (
            <UptimeTrendChart data={uptimeChartData} />
          )}
        </Card>

        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Token burn</h2>
            <span className="text-xs text-[var(--muted-foreground)]">
              prompt vs completion
            </span>
          </div>
          {isLoading || !data ? (
            <Skeleton rows={4} />
          ) : (
            <TokenBurnChart data={tokenChartData} />
          )}
        </Card>

        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Task throughput</h2>
            <span className="text-xs text-[var(--muted-foreground)]">
              count by status
            </span>
          </div>
          {isLoading || !data ? (
            <Skeleton rows={4} />
          ) : (
            <TaskThroughputChart data={throughputChartData} />
          )}
        </Card>

        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Agent distribution</h2>
            <span className="text-xs text-[var(--muted-foreground)]">
              tools by health
            </span>
          </div>
          {isLoading || !data ? (
            <Skeleton rows={4} />
          ) : (
            <AgentDistributionChart data={agentDistChartData} />
          )}
        </Card>
      </div>

      {/* Two columns: tool health table + task distribution */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Tool health */}
        <Card className="lg:col-span-2 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Tool health</h2>
            <Link
              href="/status"
              className="inline-flex items-center gap-1 text-xs font-medium text-[var(--accent)] hover:underline"
            >
              All tools <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          {isLoading || !data ? (
            <Skeleton rows={5} />
          ) : data.tools.length === 0 ? (
            <Empty />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-[var(--muted-foreground)]">
                    <th className="py-2 font-medium">Tool</th>
                    <th className="py-2 font-medium">Status</th>
                    <th className="py-2 text-right font-medium">Uptime</th>
                    <th className="py-2 text-right font-medium">Avg latency</th>
                    <th className="py-2 text-right font-medium">p95</th>
                    <th className="py-2 text-right font-medium">Checks</th>
                  </tr>
                </thead>
                <tbody>
                  {data.tools.map((t) => (
                    <tr
                      key={t.id}
                      className="border-b border-[var(--border)]/60 last:border-0"
                    >
                      <td className="py-2">
                        <div className="font-medium text-[var(--foreground)]">{t.name}</div>
                        <div className="font-mono text-[10px] text-[var(--muted-foreground)]">
                          {t.id} · {t.category}
                        </div>
                      </td>
                      <td className="py-2">
                        <StatusBadge status={t.status} pulse={false} />
                      </td>
                      <td className="py-2 text-right font-mono tabular-nums text-[var(--muted-foreground)]">
                        {t.uptimePct === null ? "—" : `${t.uptimePct.toFixed(1)}%`}
                      </td>
                      <td className="py-2 text-right font-mono tabular-nums text-[var(--muted-foreground)]">
                        {formatLatency(t.avgLatencyMs)}
                      </td>
                      <td className="py-2 text-right font-mono tabular-nums text-[var(--muted-foreground)]">
                        {formatLatency(t.p95LatencyMs)}
                      </td>
                      <td className="py-2 text-right font-mono tabular-nums text-[var(--muted-foreground)]">
                        {t.checks || 0}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Task distribution */}
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Tasks by status</h2>
            <Link
              href="/tasks"
              className="inline-flex items-center gap-1 text-xs font-medium text-[var(--accent)] hover:underline"
            >
              Queue <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          {!data ? (
            <Skeleton rows={4} />
          ) : data.tasks.total === 0 ? (
            <Empty hint="No tasks submitted yet." />
          ) : (
            <div className="space-y-3">
              {([
                ["done", "Done"],
                ["running", "Running"],
                ["queued", "Queued"],
                ["failed", "Failed"],
                ["cancelled", "Cancelled"],
              ] as const).map(([key, label]) => {
                const bucket = data.tasks.byStatus[key];
                const count = bucket?.count ?? 0;
                const pct =
                  data.tasks.total > 0
                    ? Math.round((count / data.tasks.total) * 100)
                    : 0;
                const tone =
                  key === "done"
                    ? "var(--status-online)"
                    : key === "failed"
                      ? "var(--status-offline)"
                      : key === "running"
                        ? "var(--accent)"
                        : key === "queued"
                          ? "var(--status-unknown)"
                          : "var(--muted-foreground)";
                return (
                  <div key={key}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-[var(--muted-foreground)]">{label}</span>
                      <span className="font-mono tabular-nums">
                        {count}
                        <span className="ml-1 text-[var(--muted-foreground)]">({pct}%)</span>
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--muted)]">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, backgroundColor: tone }}
                      />
                    </div>
                  </div>
                );
              })}
              {data.tasks.byStatus.done ? (
                <div className="mt-3 flex items-center justify-between border-t border-[var(--border)]/60 pt-2 text-xs">
                  <span className="text-[var(--muted-foreground)]">Avg latency</span>
                  <span className="font-mono tabular-nums">
                    {formatLatency(data.tasks.byStatus.done.avgLatencyMs)}
                  </span>
                </div>
              ) : null}
            </div>
          )}
        </Card>
      </div>

      {/* Recent activity */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Recent tasks */}
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Recent tasks</h2>
            <Link
              href="/tasks"
              className="inline-flex items-center gap-1 text-xs font-medium text-[var(--accent)] hover:underline"
            >
              View queue <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          {!data || data.tasks.recent.length === 0 ? (
            <Empty hint="No tasks have been submitted yet." />
          ) : (
            <ul className="space-y-2">
              {data.tasks.recent.map((t) => (
                <li
                  key={t.id}
                  className="flex items-start gap-3 rounded-md border border-[var(--border)]/60 px-3 py-2 text-xs"
                >
                  <TaskStatusIcon status={t.status} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-[var(--foreground)]">{t.title}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[var(--muted-foreground)]">
                      <Badge className="font-mono">{t.assignedAgent ?? "auto"}</Badge>
                      {t.intent && <Badge className="font-mono">{t.intent}</Badge>}
                      <span>{timeAgo(t.createdAt)}</span>
                      {t.latencyMs !== null && t.latencyMs > 0 ? (
                        <span className="font-mono">· {formatLatency(t.latencyMs)}</span>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Recent conversations */}
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Recent chats</h2>
            <Link
              href="/chat"
              className="inline-flex items-center gap-1 text-xs font-medium text-[var(--accent)] hover:underline"
            >
              Open chat <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          {!data || data.conversations.total === 0 ? (
            <Empty hint="No conversations yet — open Chat to start one." />
          ) : (
            <>
              <div className="mb-3 grid grid-cols-3 gap-2 text-xs">
                <SmallStat
                  icon={<MessageSquare className="h-3.5 w-3.5" />}
                  label="Threads"
                  value={data.conversations.total}
                />
                <SmallStat
                  icon={<Hash className="h-3.5 w-3.5" />}
                  label="Messages"
                  value={data.conversations.messages}
                />
                <SmallStat
                  icon={<Clock className="h-3.5 w-3.5" />}
                  label="Last activity"
                  value={timeAgo(data.conversations.lastActivityAt)}
                />
              </div>
              <ul className="space-y-2">
                {data.conversations.recent.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center gap-3 rounded-md border border-[var(--border)]/60 px-3 py-2 text-xs"
                  >
                    <MessageSquare className="h-3.5 w-3.5 shrink-0 text-[var(--muted-foreground)]" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-[var(--foreground)]">{c.title}</div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[var(--muted-foreground)]">
                        <Badge className="font-mono">{c.agentId}</Badge>
                        <span>{timeAgo(c.updatedAt)}</span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </div>

      {/* Footer note: data freshness */}
      {data ? (
        <p className="mt-6 text-center text-[11px] text-[var(--muted-foreground)]">
          Computed at {new Date(data.generatedAt).toLocaleTimeString()} · last updated{" "}
          {timeAgo(new Date(dataUpdatedAt).toISOString())}
        </p>
      ) : null}
    </div>
  );
}

function KpiTile({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-[var(--muted-foreground)]">{label}</span>
        {icon}
      </div>
      <div className="mt-1 text-2xl font-bold tabular-nums text-[var(--foreground)]">{value}</div>
      {hint ? (
        <div className="mt-0.5 text-[11px] text-[var(--muted-foreground)]">{hint}</div>
      ) : null}
    </div>
  );
}

function SmallStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-[var(--border)]/60 px-2 py-1.5">
      <div className="flex items-center gap-1 text-[10px] uppercase text-[var(--muted-foreground)]">
        {icon}
        {label}
      </div>
      <div className="mt-0.5 font-mono tabular-nums">{value}</div>
    </div>
  );
}

function TaskStatusIcon({ status }: { status: string }) {
  const cls = "mt-0.5 h-4 w-4 shrink-0";
  if (status === "done") return <CheckCircle2 className={cn(cls, "text-[var(--status-online)]")} />;
  if (status === "failed") return <XCircle className={cn(cls, "text-[var(--status-offline)]")} />;
  if (status === "cancelled")
    return <XCircle className={cn(cls, "text-[var(--muted-foreground)]")} />;
  if (status === "running")
    return (
      <RefreshCcw className={cn(cls, "animate-spin text-[var(--accent)]")} />
    );
  return <Clock className={cn(cls, "text-[var(--status-unknown)]")} />;
}

function Skeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-2">
      {[...Array(rows)].map((_, i) => (
        <div key={i} className="h-3 animate-pulse rounded bg-[var(--muted)]" />
      ))}
    </div>
  );
}

function Empty({ hint }: { hint?: string }) {
  return (
    <div className="rounded-md border border-dashed border-[var(--border)] px-3 py-6 text-center text-xs text-[var(--muted-foreground)]">
      {hint ?? "Nothing here yet."}
    </div>
  );
}

function average(values: (number | null | undefined)[]): number | null {
  const nums = values.filter((v): v is number => typeof v === "number");
  if (nums.length === 0) return null;
  return nums.reduce((acc, n) => acc + n, 0) / nums.length;
}

/** Compact "1.2k", "3.4m" rendering for big numerics like tokens. */
function formatTokens(n: number | undefined): string {
  if (!n || n <= 0) return "0";
  if (n < 1_000) return String(n);
  if (n < 1_000_000) return `${(n / 1_000).toFixed(1)}k`;
  if (n < 1_000_000_000) return `${(n / 1_000_000).toFixed(1)}m`;
  return `${(n / 1_000_000_000).toFixed(1)}b`;
}
