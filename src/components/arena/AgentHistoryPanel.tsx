"use client";

import { useEffect, useState } from "react";
import { X, MessageSquare, Clock, Loader2 } from "lucide-react";

import type { ArenaAgent } from "./roster";
import { STATUS_DOT_CLASS, ACTIVITY_DOT_CLASS } from "./roster";

interface SessionRow {
  id: string;
  title: string;
  agentId: string;
  agentName: string;
  agentKind: string;
  source: string;
  messageCount: number;
  lastActivityAt: string | null;
  url?: string;
}

interface AgentHistoryPanelProps {
  agent: ArenaAgent;
  liveStatus?: import("./roster").AgentStatus;
  liveActivity?: import("./roster").AgentActivity;
  onClose: () => void;
}

/**
 * AgentHistoryPanel — Phase 4 overlay.
 *
 * Slides in from the right when an avatar is clicked.
 * Polls `/api/chat/sessions?agentId=<id>` for the agent's
 * recent conversations and shows them in a scrollable list.
 */
export function AgentHistoryPanel({
  agent,
  liveStatus,
  liveActivity,
  onClose,
}: AgentHistoryPanelProps) {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const status = liveStatus ?? agent.statusOverride ?? "online";
  const activity = liveActivity ?? agent.activity ?? "idle";

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/chat/sessions?agentId=${encodeURIComponent(agent.id)}`,
          { cache: "no-store" },
        );
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled) return;
        setSessions(data.sessions ?? []);
      } catch {
        if (!cancelled) setError("Failed to load sessions");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [agent.id]);

  return (
    <div className="pointer-events-auto absolute right-0 top-0 z-20 h-full w-80 max-w-[85%] border-l border-white/10 bg-[#0a0a1a]/95 backdrop-blur-md">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex items-start justify-between border-b border-white/10 p-4">
        <div className="flex items-center gap-3">
          <span
            className={`inline-block h-2.5 w-2.5 rounded-full ${STATUS_DOT_CLASS[status]}`}
          />
          <div>
            <h3 className="text-sm font-semibold text-white">{agent.name}</h3>
            <div className="flex items-center gap-1.5 text-[10px] text-white/40">
              <span className="uppercase tracking-wide">{agent.kind}</span>
              <span>·</span>
              {activity === "busy" ? (
                <span className="flex items-center gap-1">
                  <span className={`h-1.5 w-1.5 rounded-full ${ACTIVITY_DOT_CLASS.busy}`} />
                  busy
                </span>
              ) : (
                <span>idle</span>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* ── Session list ───────────────────────────────────── */}
      <div className="h-[calc(100%-5rem)] overflow-y-auto p-3">
        <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-white/40">
          <MessageSquare className="h-3 w-3" />
          Recent Sessions
          {sessions.length > 0 && (
            <span className="ml-auto rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/60">
              {sessions.length}
            </span>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-white/40">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : error ? (
          <div className="py-8 text-center text-sm text-red-400/70">{error}</div>
        ) : sessions.length === 0 ? (
          <div className="py-8 text-center text-sm text-white/30">
            No sessions found for this agent.
          </div>
        ) : (
          <ul className="space-y-1.5">
            {sessions.map((s) => (
              <li key={s.id}>
                <a
                  href={s.url ?? "#"}
                  className="group block rounded-lg border border-white/5 bg-white/5 p-2.5 transition-colors hover:border-white/20 hover:bg-white/10"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-medium text-white/90">
                      {s.title}
                    </span>
                    <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[9px] uppercase text-white/40">
                      {s.source}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[10px] text-white/40">
                    <span className="flex items-center gap-1">
                      <MessageSquare className="h-2.5 w-2.5" />
                      {s.messageCount} msgs
                    </span>
                    {s.lastActivityAt && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-2.5 w-2.5" />
                        {timeAgo(s.lastActivityAt)}
                      </span>
                    )}
                  </div>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function timeAgo(iso: string): string {
  const d = Date.parse(iso);
  if (isNaN(d)) return "—";
  const diff = Date.now() - d;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(d).toLocaleDateString();
}
