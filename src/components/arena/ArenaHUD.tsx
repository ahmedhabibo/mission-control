"use client";

import {
  ACTIVITY_DOT_CLASS,
  STATUS_DOT_CLASS,
  ZONES,
  STATUS_ZONE,
} from "./roster";
import type { ArenaAgent, AgentActivity, AgentStatus, ZoneId } from "./roster";

interface ArenaHUDProps {
  agents: ArenaAgent[];
  liveStatus?: Record<string, AgentStatus>;
  liveActivity?: Record<string, AgentActivity>;
  uptime?: string;
  taskCount?: number;
}

/**
 * ArenaHUD — props-only overlay painted on top of the 3D canvas.
 *
 * Phase 2+: now shows zone legend (which status maps to which zone)
 * so users understand why avatars are moving.
 */
export function ArenaHUD({
  agents,
  liveStatus,
  liveActivity,
  uptime = "—",
  taskCount = 0,
}: ArenaHUDProps) {
  // Count agents per zone
  const zoneCounts: Record<ZoneId, number> = {
    lobby: 0,
    workstations: 0,
    cafe: 0,
    playroom: 0,
  };
  for (const agent of agents) {
    const status = liveStatus?.[agent.id] ?? agent.statusOverride ?? "online";
    const zoneId = STATUS_ZONE[status];
    zoneCounts[zoneId]++;
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      {/* Top-left brand */}
      <div className="absolute left-4 top-4 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded bg-[#6366f1] text-[10px] font-bold text-white">
          MC
        </span>
        <span className="text-sm font-semibold text-white/90">ARENA</span>
      </div>

      {/* Top-right stats */}
      <div className="absolute right-4 top-4 flex items-center gap-3">
        <div className="flex items-center gap-1.5 rounded-md border border-white/10 bg-black/40 px-2.5 py-1 text-[11px] text-white/70 backdrop-blur">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#22c55e]" />
          {uptime}
        </div>
        <div className="rounded-md border border-white/10 bg-black/40 px-2.5 py-1 text-[11px] text-white/70 backdrop-blur">
          {taskCount.toLocaleString()} tasks
        </div>
      </div>

      {/* Top-center: Zone legend */}
      <div className="absolute left-1/2 top-4 -translate-x-1/2">
        <div className="flex items-center gap-3 rounded-md border border-white/10 bg-black/40 px-3 py-1.5 backdrop-blur">
          {(Object.keys(ZONES) as ZoneId[]).map((zoneId) => {
            const zone = ZONES[zoneId];
            return (
              <div key={zoneId} className="flex items-center gap-1.5 text-[11px]">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: zone.accentColor }}
                />
                <span className="text-white/60">{zone.name}</span>
                <span className="text-white/30">{zoneCounts[zoneId]}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom status bar — one pill per agent */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
        <div className="flex items-center gap-3 rounded-md border border-white/10 bg-black/50 px-3 py-1.5 backdrop-blur">
          {agents.map((agent) => {
            const status = liveStatus?.[agent.id] ?? agent.statusOverride ?? "online";
            const activity = liveActivity?.[agent.id] ?? agent.activity ?? "idle";
            return (
              <div key={agent.id} className="flex items-center gap-1.5 text-[11px]">
                <span className={`inline-block h-2 w-2 rounded-full ${STATUS_DOT_CLASS[status]}`} />
                <span className="text-white/70">{agent.name}</span>
                {activity === "busy" && (
                  <span
                    className={`inline-block h-1.5 w-1.5 rounded-full ${ACTIVITY_DOT_CLASS.busy}`}
                    title="busy"
                  />
                )}
              </div>
            );
          })}
          <span className="text-white/20">|</span>
          <span className="text-[10px] text-white/30">
            drag to orbit · scroll to zoom · click an agent
          </span>
        </div>
      </div>
    </div>
  );
}
