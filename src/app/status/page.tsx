"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getIcon } from "@/lib/icons";
import { cn, timeAgo } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  RefreshCw,
  X,
  Save,
  Power,
  Pencil,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

/* ── Types (mirror /api/chat/agents + /api/agent-settings shapes) ──── */

type HealthStatus = "online" | "degraded" | "offline" | "unknown";
type AgentKind = "chat" | "profile" | "cli" | "gateway" | "mcp";

interface AgentRow {
  id: string;
  name: string;
  description: string;
  icon: string;
  kind: AgentKind;
  defaultModel?: string | null;
  enabled: boolean;
  healthy: boolean;
  healthLatencyMs?: number | null;
  healthStatus: HealthStatus;
  healthDetail?: string | null;
  customLabel?: string | null;
  notes?: string | null;
}

type Filter = "all" | HealthStatus;

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "online", label: "Online" },
  { key: "degraded", label: "Degraded" },
  { key: "offline", label: "Offline" },
  { key: "unknown", label: "Needs setup" },
];

const KIND_LABEL: Record<AgentKind, string> = {
  profile: "profile",
  cli: "CLI",
  gateway: "gateway",
  chat: "chat",
  mcp: "MCP",
};

/* ── Page ────────────────────────────────────────────────────────── */

export default function StatusBoard() {
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [meta, setMeta] = useState<{ scannedAt?: string; liveCount?: number }>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [sortKey, setSortKey] = useState<"order" | "name" | "status">("status");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  /* ── Poll agents + settings every 10s ──────────────────────── */
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      try {
        const [logRes, setRes] = await Promise.all([
          fetch("/api/chat/agents", { cache: "no-store" }),
          fetch("/api/agent-settings", { cache: "no-store" }),
        ]);
        if (cancelled) return;
        const logData = await logRes.json();
        const setData = await setRes.json();
        if (cancelled) return;

        // Merge settings into agent rows
        const settingsById = new Map<string, { enabled: boolean; customLabel?: string; defaultModel?: string; notes?: string }>(
          (setData.settings ?? []).map((s: { agentId: string; enabled?: boolean; customLabel?: string; defaultModel?: string; notes?: string }) => [s.agentId, s]),
        );
        const merged = (logData.agents ?? []).map((a: AgentRow & { chatCapable?: boolean }) => {
          const ov = settingsById.get(a.id);
          return {
            ...a,
            enabled: ov?.enabled ?? true,
            customLabel: ov?.customLabel ?? null,
            defaultModel: ov?.defaultModel ?? a.defaultModel,
            notes: ov?.notes ?? null,
          };
        });

        setAgents(
          sortAgents(
            merged,
            setData.settings ? "order" : "name",
          ),
        );
        setMeta(logData.meta ?? {});
        setLoading(false);
      } catch {
        /* offline */
      } finally {
        if (!cancelled) timer = setTimeout(poll, 10_000);
      }
    }
    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  const total = agents.length;
  const enabled = agents.filter((a) => a.enabled).length;
  const online = agents.filter((a) => a.healthStatus === "online" && a.enabled).length;
  const degraded = agents.filter((a) => a.healthStatus === "degraded").length;
  const offline = agents.filter((a) => a.healthStatus === "offline").length;
  const unknown = agents.filter((a) => a.healthStatus === "unknown").length;

  let visible = filter === "all" ? agents : agents.filter((a) => a.healthStatus === filter);
  if (sortKey !== "order") {
    visible = sortAgents(visible, sortKey);
  }

  /* ── Persist config edit ───────────────────────────────────── */
  async function updateAgent(id: string, patch: {
    enabled?: boolean;
    customLabel?: string | null;
    defaultModel?: string | null;
    notes?: string | null;
  }) {
    setAgents((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
    try {
      await fetch("/api/agent-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: id, ...patch }),
      });
    } catch {
      /* offline — optimistic update will revert on next poll */
    }
  }

  async function moveAgent(id: string, direction: "up" | "down") {
    const orderedAgents = [...agents];
    const idx = orderedAgents.findIndex((a) => a.id === id);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= orderedAgents.length) return;
    [orderedAgents[idx], orderedAgents[swapIdx]] = [orderedAgents[swapIdx], orderedAgents[idx]];
    setAgents(orderedAgents);
    try {
      await fetch("/api/agent-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentIds: orderedAgents.map((a) => a.id) }),
      });
    } catch {
      /* optimistic */
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      {/* Header */}
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Status Board</h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Live health + per-agent config ·{" "}
            <span className="text-[var(--status-online)]">{online} live</span>{" "}
            <span className="opacity-70">· {enabled} enabled</span>
            {meta.scannedAt && (
              <span className="ml-2 opacity-70">· last scan {timeAgo(meta.scannedAt)}</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as "order" | "name" | "status")}
            className="h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-xs focus:border-[var(--ring)] focus:outline-none"
          >
            <option value="status">Sort: status</option>
            <option value="order">Sort: manual</option>
            <option value="name">Sort: name</option>
          </select>
          <button
            onClick={() => {
              setLoading(true);
              fetch("/api/chat/agents", { cache: "no-store" })
                .then((r) => r.json())
                .then((d) => {
                  fetch("/api/agent-settings", { cache: "no-store" })
                    .then((r) => r.json())
                    .then((s) => {
                      mapSettings(d, s);
                      setMeta(d.meta ?? {});
                      setLoading(false);
                    });
                });
            }}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs font-medium text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>
      </div>

      {/* Summary tiles */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <SummaryTile label="Total" value={total} />
        <SummaryTile label="Online" value={online} tone="online" />
        <SummaryTile label="Degraded" value={degraded} tone="degraded" />
        <SummaryTile label="Offline" value={offline} tone="offline" />
        <SummaryTile label="Needs setup" value={unknown} tone="unknown" />
      </div>

      {/* Filter chips */}
      <div className="mb-5 flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const count =
            f.key === "all"
              ? total
              : agents.filter((a) => a.healthStatus === f.key).length;
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

      {/* Agent cards */}
      {loading ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] p-12 text-center text-sm text-[var(--muted-foreground)]">
          Scanning for agents…
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] p-12 text-center text-sm text-[var(--muted-foreground)]">
          No agents match this filter.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((agent, idx) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              isExpanded={expandedId === agent.id}
              isFirst={idx === 0}
              isLast={idx === visible.length - 1}
              onExpand={() => setExpandedId(expandedId === agent.id ? null : agent.id)}
              onUpdate={(patch) => updateAgent(agent.id, patch)}
              onMove={(dir) => moveAgent(agent.id, dir)}
            />
          ))}
        </div>
      )}
    </div>
  );

  function mapSettings(d: { agents: AgentRow[] }, s: { settings: Array<{ agentId: string; enabled?: boolean; customLabel?: string | null; defaultModel?: string; notes?: string }> }) {
    const byId = new Map(s.settings.map((x) => [x.agentId, x]));
    setAgents(
      d.agents.map((a) => {
        const ov = byId.get(a.id);
        return {
          ...a,
          enabled: ov?.enabled ?? true,
          customLabel: ov?.customLabel ?? null,
          defaultModel: ov?.defaultModel ?? a.defaultModel,
          notes: ov?.notes ?? null,
        };
      }),
    );
  }
}

/* ── Helpers ─────────────────────────────────────────────────────── */

function sortAgents(agents: AgentRow[], by: "order" | "name" | "status"): AgentRow[] {
  const next = [...agents];
  if (by === "name") return next.sort((a, b) => a.name.localeCompare(b.name));
  if (by === "status") {
    return next.sort((a, b) => {
      const rank = (s: HealthStatus) =>
        s === "online" ? 0 : s === "degraded" ? 1 : s === "offline" ? 2 : 3;
      return rank(a.healthStatus) - rank(b.healthStatus);
    });
  }
  return next;
}

/* ── Sub-components ──────────────────────────────────────────── */

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
        {tone && <StatusDot status={tone} />}
      </div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

function AgentCard({
  agent,
  isExpanded,
  isFirst,
  isLast,
  onExpand,
  onUpdate,
  onMove,
}: {
  agent: AgentRow;
  isExpanded: boolean;
  isFirst: boolean;
  isLast: boolean;
  onExpand: () => void;
  onUpdate: (patch: {
    enabled?: boolean;
    customLabel?: string | null;
    defaultModel?: string | null;
    notes?: string | null;
  }) => void;
  onMove: (direction: "up" | "down") => void;
}) {
  const Icon = getIcon(agent.icon);
  const disabled = !agent.enabled;

  return (
    <div
      className={cn(
        "group relative flex flex-col gap-3 rounded-xl border bg-[var(--card)] p-4 transition-colors hover:border-[var(--ring)]",
        disabled ? "border-dashed opacity-60" : "border-[var(--border)]",
      )}
    >
      {/* Header row */}
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--muted)]">
          {Icon ? <Icon className="h-4.5 w-4.5" /> : <span className="h-4 w-4 text-[var(--muted-foreground)]">•</span>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-semibold">{agent.name}</h3>
            <Badge className="shrink-0 text-[var(--muted-foreground)]">
              {KIND_LABEL[agent.kind] ?? agent.kind}
            </Badge>
            <button
              onClick={onExpand}
              className="ml-auto rounded-md p-1 text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
              title={isExpanded ? "Hide settings" : "Edit settings"}
            >
              <Pencil className="h-3 w-3" />
            </button>
          </div>
          <p className="truncate text-xs text-[var(--muted-foreground)]">
            {agent.description}
          </p>
        </div>
      </div>

      {/* Status + model + latency */}
      <div className="flex items-center gap-2">
        <StatusDot status={agent.healthStatus} />
        <span className="text-xs font-medium">{agent.healthStatus}</span>
        {agent.healthLatencyMs !== null && agent.healthLatencyMs !== undefined && (
          <span className="ml-auto font-mono text-xs text-[var(--muted-foreground)]">
            {agent.healthLatencyMs < 1000
              ? `${agent.healthLatencyMs}ms`
              : `${(agent.healthLatencyMs / 1000).toFixed(1)}s`}
          </span>
        )}
        {agent.defaultModel && (
          <span className="truncate font-mono text-[10px] text-[var(--muted-foreground)]">
            {agent.defaultModel.split("/").pop()}
          </span>
        )}
      </div>

      {/* Health detail */}
      {agent.healthDetail && (
        <p className="line-clamp-1 min-h-[1rem] text-xs text-[var(--muted-foreground)]">
          {agent.healthDetail}
        </p>
      )}

      {/* Inline config panel */}
      {isExpanded && (
        <AgentConfigPanel agent={agent} onUpdate={onUpdate} />
      )}

      {/* Footer — reorder + enable toggle */}
      <div className="mt-auto flex items-center justify-between border-t border-[var(--border)]/40 pt-2 text-xs text-[var(--muted-foreground)]">
        <span className="font-mono text-[10px]">{agent.id}</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onMove("up")}
            disabled={isFirst}
            className="rounded p-1 hover:bg-[var(--muted)] disabled:opacity-30 disabled:hover:bg-transparent"
            title="Move up"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onMove("down")}
            disabled={isLast}
            className="rounded p-1 hover:bg-[var(--muted)] disabled:opacity-30 disabled:hover:bg-transparent"
            title="Move down"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onUpdate({ enabled: !agent.enabled })}
            className={cn(
              "rounded p-1 hover:bg-[var(--muted)]",
              disabled ? "text-[var(--status-offline)]" : "text-[var(--status-online)]",
            )}
            title={disabled ? "Enable agent" : "Disable agent"}
          >
            <Power className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function AgentConfigPanel({
  agent,
  onUpdate,
}: {
  agent: AgentRow;
  onUpdate: (patch: {
    enabled?: boolean;
    customLabel?: string | null;
    defaultModel?: string | null;
    notes?: string | null;
  }) => void;
}) {
  const [label, setLabel] = useState(agent.customLabel ?? "");
  const [model, setModel] = useState(agent.defaultModel ?? "");
  const [notes, setNotes] = useState(agent.notes ?? "");

  useEffect(() => {
    setLabel(agent.customLabel ?? "");
    setModel(agent.defaultModel ?? "");
    setNotes(agent.notes ?? "");
  }, [agent.id]);

  function save() {
    onUpdate({
      customLabel: label.trim() || null,
      defaultModel: model.trim() || null,
      notes: notes.trim() || null,
    });
  }

  return (
    <div className="space-y-2 rounded-lg border border-[var(--border)]/60 bg-[var(--background)]/60 p-3">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">
        <span>Edit config</span>
        <span>{agent.kind}</span>
      </div>
      <label className="block text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">
        Custom label
      </label>
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder={agent.name}
        className="w-full rounded-md border border-[var(--border)] bg-[var(--input)] px-2 py-1 text-xs focus:border-[var(--ring)] focus:outline-none"
      />
      <label className="block text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">
        Default model
      </label>
      <input
        value={model}
        onChange={(e) => setModel(e.target.value)}
        placeholder={agent.defaultModel ?? "provider/model-id"}
        className="w-full font-mono rounded-md border border-[var(--border)] bg-[var(--input)] px-2 py-1 text-xs focus:border-[var(--ring)] focus:outline-none"
      />
      <label className="block text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">
        Notes
      </label>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        placeholder="Free-text notes about this agent…"
        className="w-full rounded-md border border-[var(--border)] bg-[var(--input)] px-2 py-1 text-xs focus:border-[var(--ring)] focus:outline-none"
      />
      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          onClick={save}
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--accent)] bg-[var(--accent)]/10 px-3 py-1 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--accent)]/20"
        >
          <Save className="h-3 w-3" /> Save changes
        </button>
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: HealthStatus }) {
  return (
    <span
      className={cn(
        "h-2 w-2 rounded-full",
        status === "online" && "bg-[var(--status-online)]",
        status === "degraded" && "bg-[var(--status-degraded)]",
        status === "offline" && "bg-[var(--status-offline)]",
        status === "unknown" && "bg-[var(--status-unknown)]",
      )}
    />
  );
}
