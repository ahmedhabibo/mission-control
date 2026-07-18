"use client";

import { useState, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera } from "@react-three/drei";

import { Building } from "./Building";
import { AgentAvatar } from "./AgentAvatar";
import { ArenaHUD } from "./ArenaHUD";
import { AgentHistoryPanel } from "./AgentHistoryPanel";
import {
  ARENA_AGENTS,
  STATUS_ZONE,
} from "./roster";
import type { ArenaAgent, AgentActivity, AgentStatus, ZoneId } from "./roster";

/**
 * ArenaScene — orchestrator for Building, AgentAvatars, OrbitControls,
 * HUD, and the click-to-history panel (Phase 4).
 *
 * Phase 2: avatars are grouped by their live status → assigned to a zone.
 *          Each avatar lerps to its zone target position.
 * Phase 3: the Building renders 4 zones (lobby, workstations, café, playroom).
 * Phase 4: clicking an avatar opens the AgentHistoryPanel overlay.
 */
interface ArenaSceneProps {
  agents?: ArenaAgent[];
  liveStatus?: Record<string, AgentStatus>;
  liveActivity?: Record<string, AgentActivity>;
  uptime?: string;
  taskCount?: number;
}

export function ArenaScene({
  agents = ARENA_AGENTS,
  liveStatus,
  liveActivity,
  uptime,
  taskCount,
}: ArenaSceneProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Group agents by their live status → zone, and compute index within each zone.
  const agentZoneInfo = useMemo(() => {
    const zoneCounts: Record<ZoneId, number> = {
      lobby: 0,
      workstations: 0,
      cafe: 0,
      playroom: 0,
    };
    const info = agents.map((agent) => {
      const status = liveStatus?.[agent.id] ?? agent.statusOverride ?? "online";
      const zoneId: ZoneId = STATUS_ZONE[status];
      const index = zoneCounts[zoneId];
      zoneCounts[zoneId]++;
      return { agent, status, zoneId, index };
    });
    // Second pass: fill in the total count per zone
    const totals = { ...zoneCounts };
    info.forEach((entry) => {
      entry.zoneId;
    });
    // Recompute with correct totals
    zoneCounts.lobby = 0;
    zoneCounts.workstations = 0;
    zoneCounts.cafe = 0;
    zoneCounts.playroom = 0;
    const finalInfo = agents.map((agent) => {
      const status = liveStatus?.[agent.id] ?? agent.statusOverride ?? "online";
      const zoneId: ZoneId = STATUS_ZONE[status];
      const index = zoneCounts[zoneId];
      zoneCounts[zoneId]++;
      return {
        agent,
        status,
        zoneId,
        index,
        total: totals[zoneId],
      };
    });
    return { info: finalInfo, zoneTotals: totals };
  }, [agents, liveStatus]);

  const selectedAgent = selectedId
    ? agents.find((a) => a.id === selectedId) ?? null
    : null;

  return (
    <div className="relative h-full w-full bg-[#0a0a1a]">
      <Canvas dpr={[1, 1.5]} frameloop="always">
        <PerspectiveCamera makeDefault position={[0, 14, 18]} fov={50} />
        <OrbitControls
          enablePan={false}
          minDistance={8}
          maxDistance={32}
          maxPolarAngle={Math.PI / 3}
          autoRotate
          autoRotateSpeed={0.2}
          target={[0, 0, 0]}
        />

        {/* Lighting */}
        <ambientLight intensity={0.4} />
        <directionalLight position={[8, 14, 6]} intensity={0.7} />
        <pointLight position={[0, 6, 0]} intensity={0.5} color="#6366f1" />
        {/* Zone accent lights */}
        <pointLight position={[-8, 4, -6]} intensity={0.3} color="#3b82f6" />
        <pointLight position={[8, 4, -6]} intensity={0.3} color="#f59e0b" />
        <pointLight position={[-8, 4, 6]} intensity={0.3} color="#a855f7" />
        <pointLight position={[8, 4, 6]} intensity={0.3} color="#22c55e" />

        {/* Phase 3: Multi-section building */}
        <Building />

        {/* Phase 2: Avatars with zone-based movement */}
        {agentZoneInfo.info.map(({ agent, status, index, total }) => (
          <AgentAvatar
            key={agent.id}
            agent={agent}
            liveStatus={status}
            liveActivity={liveActivity?.[agent.id]}
            zoneIndex={index}
            zoneTotal={total}
            onClick={(a) => setSelectedId(a.id)}
            selected={selectedId === agent.id}
          />
        ))}
      </Canvas>

      <ArenaHUD
        agents={agents}
        liveStatus={liveStatus}
        liveActivity={liveActivity}
        uptime={uptime}
        taskCount={taskCount}
      />

      {/* Phase 4: Click avatar → session history panel */}
      {selectedAgent && (
        <AgentHistoryPanel
          agent={selectedAgent}
          liveStatus={liveStatus?.[selectedAgent.id]}
          liveActivity={liveActivity?.[selectedAgent.id]}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
