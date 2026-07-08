"use client";

import { useStatus } from "@/components/use-status";
import { ToolCard } from "@/components/tool-card";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { useState } from "react";
import type { HealthStatus } from "@/lib/types";
import { cn, timeAgo } from "@/lib/utils";

type Filter = "all" | HealthStatus;

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "online", label: "Online" },
  { key: "degraded", label: "Degraded" },
  { key: "offline", label: "Offline" },
  { key: "unknown", label: "Needs setup" },
];

export default function StatusBoard() {
  const { tools, summary, connected, lastSweep } = useStatus();
  const [filter, setFilter] = useState<Filter>("all");
  const [sweeping, setSweeping] = useState(false);

  async function sweep() {
    setSweeping(true);
    try {
      await fetch("/api/probe", { method: "POST" });
    } finally {
      setTimeout(() => setSweeping(false), 400);
    }
  }

  const visible = tools.filter(
    (t) => filter === "all" || t.result.status === filter,
  );

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      {/* Header / summary bar */}
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Status Board</h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Live health across your agent stack ·{" "}
            <span
              className={cn(
                "inline-flex items-center gap-1.5",
                connected ? "text-[var(--status-online)]" : "text-[var(--status-unknown)]",
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  connected ? "bg-[var(--status-online)]" : "bg-[var(--status-unknown)]",
                )}
              />
              {connected ? "connected" : "reconnecting…"}
            </span>
            {lastSweep && (
              <span className="ml-2">· last sweep {timeAgo(lastSweep)}</span>
            )}
          </p>
        </div>
        <Button onClick={sweep} disabled={sweeping} variant="outline">
          <RefreshCw className={cn("h-3.5 w-3.5", sweeping && "animate-spin")} />
          Sweep all
        </Button>
      </div>

      {/* Summary tiles */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <SummaryTile label="Total" value={summary?.total ?? 0} />
        <SummaryTile label="Online" value={summary?.online ?? 0} tone="online" />
        <SummaryTile label="Degraded" value={summary?.degraded ?? 0} tone="degraded" />
        <SummaryTile label="Offline" value={summary?.offline ?? 0} tone="offline" />
        <SummaryTile label="Needs setup" value={summary?.unknown ?? 0} tone="unknown" />
      </div>

      {/* Filter chips */}
      <div className="mb-5 flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const count =
            f.key === "all"
              ? tools.length
              : tools.filter((t) => t.result.status === f.key).length;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                filter === f.key
                  ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--foreground)]"
                  : "border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--muted)]",
              )}
            >
              {f.label}
              <span className="ml-1.5 opacity-60">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Tool grid */}
      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] p-12 text-center text-sm text-[var(--muted-foreground)]">
          {tools.length === 0
            ? "Loading tools…"
            : "No tools match this filter."}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((status) => (
            <ToolCard key={status.tool.id} status={status} />
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: HealthStatus;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-[var(--muted-foreground)]">{label}</span>
        {tone && (
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              tone === "online" && "bg-[var(--status-online)]",
              tone === "degraded" && "bg-[var(--status-degraded)]",
              tone === "offline" && "bg-[var(--status-offline)]",
              tone === "unknown" && "bg-[var(--status-unknown)]",
            )}
          />
        )}
      </div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
    </div>
  );
}
