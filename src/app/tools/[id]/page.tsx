"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { useStatus } from "@/components/use-status";
import { getIcon } from "@/lib/icons";
import { formatLatency, timeAgo, cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { HealthStatus } from "@/lib/types";

type HistoryRow = {
  id: number;
  toolId: string;
  label: string;
  status: string;
  latencyMs: number | null;
  version: string | null;
  detail: string;
  components: string | null;
  checkedAt: string;
};

export default function ToolDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const toolId = params.id;
  const { tools } = useStatus();
  const toolStatus = tools.find((t) => t.tool.id === toolId);

  const { data, isLoading } = useQuery<{ history: HistoryRow[] }>({
    queryKey: ["history", toolId],
    queryFn: () => fetch(`/api/history/${toolId}?limit=100`).then((r) => r.json()),
    refetchInterval: 30_000,
  });

  // Tool not found in registry.
  if (!toolStatus) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-8">
        <Link
          href="/status"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to status board
        </Link>
        <p className="text-sm text-[var(--muted-foreground)]">Tool &ldquo;{toolId}&rdquo; not found.</p>
      </div>
    );
  }

  const { tool, result } = toolStatus;
  const Icon = getIcon(tool.icon);
  const history = data?.history ?? [];

  // Summary stats from history.
  const totalChecks = history.length;
  const onlineCount = history.filter((h) => h.status === "online").length;
  const avgLatency =
    history.length > 0
      ? Math.round(
          history.filter((h) => h.latencyMs != null).reduce((s, h) => s + h.latencyMs!, 0) /
            (history.filter((h) => h.latencyMs != null).length || 1),
        )
      : null;

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      {/* Back link */}
      <Link
        href="/status"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to status board
      </Link>

      {/* Tool header */}
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--muted)]">
          <Icon className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{tool.name}</h1>
            <StatusBadge status={result.status} />
          </div>
          <p className="mt-0.5 text-sm text-[var(--muted-foreground)]">{tool.description}</p>
        </div>
      </div>

      {/* Links */}
      {tool.links && tool.links.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {tool.links.map((link) => (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-[var(--accent)] hover:underline"
            >
              {link.label}
              <ExternalLink className="h-3 w-3" />
            </a>
          ))}
        </div>
      )}

      {/* Current status detail */}
      <Card className="mt-6 p-4">
        <h2 className="mb-3 text-sm font-semibold">Current Status</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Status" value={<StatusBadge status={result.status} pulse={false} />} />
          <Stat label="Latency" value={formatLatency(result.latencyMs)} mono />
          <Stat label="Version" value={result.version ?? "—"} mono />
          <Stat label="Last checked" value={timeAgo(result.checkedAt)} mono />
        </div>
        {result.detail && (
          <p className="mt-3 truncate rounded bg-[var(--muted)] px-3 py-2 font-mono text-xs">
            {result.detail}
          </p>
        )}
      </Card>

      {/* History stats */}
      <Card className="mt-4 p-4">
        <h2 className="mb-3 text-sm font-semibold">History Summary</h2>
        <div className="grid grid-cols-3 gap-4">
          <Stat label="Total probes" value={totalChecks} mono />
          <Stat label="Uptime" value={totalChecks ? `${Math.round((onlineCount / totalChecks) * 100)}%` : "—"} mono />
          <Stat label="Avg latency" value={avgLatency !== null ? formatLatency(avgLatency) : "—"} mono />
        </div>
      </Card>

      {/* Mini history graph (pure CSS — no chart lib needed for v0.1) */}
      <Card className="mt-4 p-4">
        <h2 className="mb-3 text-sm font-semibold">Probe Timeline</h2>
        {history.length === 0 ? (
          <p className="text-xs text-[var(--muted-foreground)]">No history yet — probes will accumulate as the scheduler runs.</p>
        ) : (
          <div className="flex items-end gap-px overflow-hidden rounded-md bg-[var(--muted)] p-2" style={{ height: 64 }}>
            {history.map((row) => (
              <div
                key={row.id}
                title={`${row.checkedAt}\n${row.status} · ${row.latencyMs != null ? row.latencyMs + " ms" : "—"}\n${row.detail}`}
                className={cn(
                  "min-w-[2px] flex-1 rounded-sm transition-all",
                  row.status === "online" && "bg-[var(--status-online)]",
                  row.status === "degraded" && "bg-[var(--status-degraded)]",
                  row.status === "offline" && "bg-[var(--status-offline)]",
                  row.status === "unknown" && "bg-[var(--status-unknown)]",
                )}
                style={{
                  // Scale bar height by latency (capped). Low/unknown → short.
                  height:
                    row.latencyMs != null
                      ? `${Math.max(8, Math.min(100, (row.latencyMs / 2000) * 100))}%`
                      : "8%",
                }}
              />
            ))}
          </div>
        )}
      </Card>

      {/* Probe log table */}
      <Card className="mt-4 overflow-hidden">
        <div className="border-b border-[var(--border)] px-4 py-3">
          <h2 className="text-sm font-semibold">Recent Probes</h2>
        </div>
        {isLoading ? (
          <div className="p-4 text-center text-xs text-[var(--muted-foreground)]">Loading history…</div>
        ) : history.length === 0 ? (
          <div className="p-4 text-center text-xs text-[var(--muted-foreground)]">No probes recorded yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-[var(--muted-foreground)]">
                  <th className="px-4 py-2 font-medium">Time</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Latency</th>
                  <th className="px-4 py-2 font-medium">Version</th>
                  <th className="px-4 py-2 font-medium">Detail</th>
                </tr>
              </thead>
              <tbody>
                {[...history].reverse().map((row) => (
                  <tr key={row.id} className="border-b border-[var(--border)] last:border-0">
                    <td className="px-4 py-2 font-mono whitespace-nowrap text-[var(--muted-foreground)]">
                      {new Date(row.checkedAt).toLocaleTimeString()}
                    </td>
                    <td className="px-4 py-2">
                      <StatusBadge status={row.status as HealthStatus} pulse={false} />
                    </td>
                    <td className="px-4 py-2 font-mono text-[var(--muted-foreground)]">
                      {row.latencyMs != null ? `${row.latencyMs} ms` : "—"}
                    </td>
                    <td className="px-4 py-2 font-mono text-[var(--muted-foreground)]">
                      {row.version ?? "—"}
                    </td>
                    <td className="max-w-[200px] truncate px-4 py-2 font-mono text-[var(--muted-foreground)]" title={row.detail}>
                      {row.detail}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs text-[var(--muted-foreground)]">{label}</div>
      <div className={cn("mt-0.5 text-sm", mono && "font-mono tabular-nums")}>{value}</div>
    </div>
  );
}
