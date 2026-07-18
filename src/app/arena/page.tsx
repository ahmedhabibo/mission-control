"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";

import type { ArenaAgent, AgentActivity, AgentStatus } from "@/components/arena/roster";

/** Three.js + R3F are client-only — disable SSR. */
const ArenaScene = dynamic(
  () => import("@/components/arena/ArenaScene").then((m) => m.ArenaScene),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center bg-[#0a0a1a]">
        <div className="flex items-center gap-2 text-sm text-white/50">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#6366f1]" />
          Loading 3D arena…
        </div>
      </div>
    ),
  },
);

interface ChatAgentApiShape {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  kind: "profile" | "cli" | "gateway" | "mcp" | "chat";
  defaultModel?: string;
  profile?: string;
  available: boolean;
  healthy?: boolean;
  healthLatencyMs?: number | null;
  healthStatus: "online" | "degraded" | "offline" | "unknown";
  chatCapable?: boolean;
}

const DEFAULT_COLORS = [
  "#22c55e", "#f59e0b", "#a855f7", "#3b82f6",
  "#10b981", "#ec4899", "#8b5cf6", "#06b6d4",
  "#f97316", "#84cc16", "#ef4444", "#14b8a6",
];

const DEFAULT_ICONS = [
  "TerminalSquare", "Code2", "Sparkles", "CircuitBoard",
  "Server", "Cpu", "Gem", "Sigma", "Cloud", "BrainCircuit",
];

/**
 * Arena page — loads ALL discovered agents from /api/chat/agents
 * (not just 4 hardcoded ones) and lets the 3D scene handle automatic
 * zone-based placement. Status + activity come from the live API.
 */
export default function ArenaPage() {
  const [apiAgents, setApiAgents] = useState<ChatAgentApiShape[]>([]);
  const [liveStatus, setLiveStatus] = useState<Record<string, AgentStatus>>({});
  const [liveActivity, setLiveActivity] = useState<Record<string, AgentActivity>>({});
  const [uptime, setUptime] = useState<string>("—");
  const [taskCount, setTaskCount] = useState<number>(0);

  // Poll the agent catalogue + tasks every 5s.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      try {
        const [agentsRes, tasksRes] = await Promise.all([
          fetch("/api/chat/agents", { cache: "no-store" }),
          fetch("/api/tasks", { cache: "no-store" }),
        ]);
        if (!agentsRes.ok || cancelled) return;
        const agentsData = (await agentsRes.json()) as {
          agents: ChatAgentApiShape[];
          meta?: { liveCount?: number; chatAgentCount?: number };
        };
        const tasksData = tasksRes.ok ? await tasksRes.json() : { tasks: [] };

        if (cancelled) return;

        const statusMap: Record<string, AgentStatus> = {};
        const activityMap: Record<string, AgentActivity> = {};
        for (const a of agentsData.agents) {
          if (a.healthStatus) statusMap[a.id] = a.healthStatus as AgentStatus;
          activityMap[a.id] = a.healthStatus === "degraded" ? "busy" : "idle";
        }
        setApiAgents(agentsData.agents);
        setLiveStatus(statusMap);
        setLiveActivity(activityMap);
        setUptime(`${agentsData.meta?.chatAgentCount ?? agentsData.meta?.liveCount ?? 0} live`);
        setTaskCount(Array.isArray(tasksData.tasks) ? tasksData.tasks.length : 0);
      } catch {
        /* offline */
      } finally {
        if (!cancelled) timer = setTimeout(poll, 5_000);
      }
    }
    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  // Convert API agents → 3D roster entries. Geometry is auto-computed by the
  // scene's `zoneTarget()` — we only need to provide metadata.
  const arenaAgents = useMemo<ArenaAgent[]>(() => {
    return apiAgents.map((a, idx) => ({
      id: a.id,
      name: a.name,
      icon: a.icon ?? DEFAULT_ICONS[idx % DEFAULT_ICONS.length],
      color: pickColor(a.kind, idx, a.id),
      kind: a.kind === "chat" ? "cli" : (a.kind as ArenaAgent["kind"]),
      // x/z are placeholders; the scene overrides these based on zone.
      x: 0,
      z: 0,
      profile: a.profile,
    }));
  }, [apiAgents]);

  return (
    <div className="h-[calc(100vh-3.5rem)] w-full bg-[#0a0a1a]">
      <ArenaScene
        agents={arenaAgents}
        liveStatus={liveStatus}
        liveActivity={liveActivity}
        uptime={uptime}
        taskCount={taskCount}
      />
    </div>
  );
}

function pickColor(kind: string, idx: number, id: string): string {
  if (id.startsWith("hermes") || id.includes("hermes")) return "#6366f1"; // indigo (brand)
  if (id.startsWith("nim") || id.includes("nvidia")) return "#3b82f6";     // blue
  if (id.includes("mistral")) return "#f59e0b";                              // amber
  if (id.includes("claude")) return "#a855f7";                               // purple
  if (id.includes("kilo")) return "#ec4899";                                 // pink
  if (id.includes("grok")) return "#10b981";                                 // green
  if (kind === "cli") return "#06b6d4";                                      // cyan for CLIs
  if (kind === "chat") return "#22c55e";                                     // green for chat
  return DEFAULT_COLORS[idx % DEFAULT_COLORS.length];
}
