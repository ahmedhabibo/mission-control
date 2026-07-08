"use client";

import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { useState } from "react";
import type { CompositeProbeResult, ToolStatus } from "@/lib/types";
import { getIcon } from "@/lib/icons";
import { cn, formatLatency, timeAgo } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function ToolCard({ status }: { status: ToolStatus }) {
  const { tool, result } = status;
  const Icon = getIcon(tool.icon);
  const [pinging, setPinging] = useState(false);

  async function ping() {
    setPinging(true);
    try {
      await fetch("/api/probe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolId: tool.id }),
      });
    } finally {
      // Brief cooldown so the spinner is visible even on instant probes.
      setTimeout(() => setPinging(false), 400);
    }
  }

  const components = (result as CompositeProbeResult).components;

  return (
    <Card className="group relative flex flex-col gap-3 p-4 transition-colors hover:border-[var(--ring)]">
      {/* Header row: icon + name + ping */}
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--muted)]">
          <Icon className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-semibold">{tool.name}</h3>
            <Badge className="shrink-0 capitalize text-[var(--muted-foreground)]">
              {tool.category}
            </Badge>
          </div>
          <p className="truncate text-xs text-[var(--muted-foreground)]">
            {tool.description}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 opacity-0 transition-opacity group-hover:opacity-100"
          onClick={ping}
          disabled={pinging}
          aria-label={`Ping ${tool.name}`}
          title="Ping now"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", pinging && "animate-spin")} />
        </Button>
      </div>

      {/* Status row */}
      <div className="flex items-center gap-2">
        <StatusBadge status={result.status} />
        {result.version && (
          <Badge className="font-mono text-[var(--muted-foreground)]">
            {result.version}
          </Badge>
        )}
        {result.latencyMs !== null && (
          <span className="ml-auto font-mono text-xs text-[var(--muted-foreground)]">
            {formatLatency(result.latencyMs)}
          </span>
        )}
      </div>

      {/* Detail line */}
      <p className="line-clamp-1 min-h-[1rem] text-xs text-[var(--muted-foreground)]">
        {result.detail}
      </p>

      {/* Composite sub-components (Hermes) */}
      {components && components.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t border-[var(--border)] pt-3">
          {components.map((c) => (
            <span
              key={c.label}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--muted)] px-2 py-1 text-xs"
              title={c.result.detail}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  c.result.status === "online" && "bg-[var(--status-online)]",
                  c.result.status === "degraded" && "bg-[var(--status-degraded)]",
                  c.result.status === "offline" && "bg-[var(--status-offline)]",
                  c.result.status === "unknown" && "bg-[var(--status-unknown)]",
                )}
              />
              {c.label}
            </span>
          ))}
        </div>
      )}

      {/* Footer: last checked + detail link */}
      <div className="mt-auto flex items-center justify-between pt-1 text-xs text-[var(--muted-foreground)]">
        <span>updated {timeAgo(result.checkedAt)}</span>
        <Link
          href={`/tools/${tool.id}`}
          className="font-medium text-[var(--accent)] hover:underline"
        >
          Details →
        </Link>
      </div>
    </Card>
  );
}
