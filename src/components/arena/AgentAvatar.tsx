"use client";

import { useRef, useState, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Text, Html } from "@react-three/drei";
import type { Mesh, Group, MeshBasicMaterial } from "three";
import { Vector3 } from "three";

import {
  ACTIVITY_HEX,
  STATUS_HEX,
  STATUS_ZONE,
  ZONES,
  zoneTarget,
} from "./roster";
import type { ArenaAgent, AgentStatus, AgentActivity, ZoneId } from "./roster";

interface AgentAvatarProps {
  agent: ArenaAgent;
  /** Live status from /api/chat/agents — drives zone movement. */
  liveStatus?: AgentStatus;
  liveActivity?: AgentActivity;
  /** Index within the agent's current zone (for grid placement). */
  zoneIndex?: number;
  zoneTotal?: number;
  /** Called when the avatar is clicked (Phase 4 — history panel). */
  onClick?: (agent: ArenaAgent) => void;
  /** Whether this avatar is currently selected (shows ring highlight). */
  selected?: boolean;
}

/**
 * AgentAvatar — presentational + movement.
 *
 * Phase 2: The avatar lerps from its current position to the target
 * position in its status-assigned zone. When status changes, the
 * target updates and the avatar walks over a few seconds.
 *
 * Phase 4: The avatar is clickable — an invisible hit-cylinder
 * captures pointer events and calls onClick.
 */
export function AgentAvatar({
  agent,
  liveStatus,
  liveActivity,
  zoneIndex = 0,
  zoneTotal = 1,
  onClick,
  selected = false,
}: AgentAvatarProps) {
  const groupRef = useRef<Group>(null);
  const bodyRef = useRef<Mesh>(null);
  const haloRef = useRef<Mesh>(null);
  const [hovered, setHovered] = useState(false);

  const status = liveStatus ?? agent.statusOverride ?? "online";
  const activity = liveActivity ?? agent.activity ?? "idle";
  const statusColor = STATUS_HEX[status];
  const activityColor = ACTIVITY_HEX[activity];

  // Compute target position from zone + index
  const target = useMemo(() => {
    const zoneId: ZoneId = STATUS_ZONE[status];
    const zone = ZONES[zoneId];
    return zoneTarget(zone, zoneIndex, Math.max(zoneTotal, 1));
  }, [status, zoneIndex, zoneTotal]);

  // Track current position for lerp
  const currentPos = useRef(new Vector3(agent.x, 0, agent.z));

  useFrame((state) => {
    if (groupRef.current) {
      // Lerp position toward target (Phase 2 movement)
      const tx = target.x;
      const tz = target.z;
      const cp = currentPos.current;
      const speed = 0.02; // lerp factor — controls walk speed
      cp.x += (tx - cp.x) * speed;
      cp.z += (tz - cp.z) * speed;
      groupRef.current.position.x = cp.x;
      groupRef.current.position.z = cp.z;

      // Bob — phase by position so agents desync
      const phase = (Math.abs(cp.x) + Math.abs(cp.z)) * 0.3;
      if (bodyRef.current) {
        bodyRef.current.position.y =
          0.6 + Math.sin(state.clock.elapsedTime * 0.8 + phase) * 0.06;
      }
      // Halo pulse
      if (haloRef.current) {
        const mat = haloRef.current.material as MeshBasicMaterial;
        const pulse = activity === "busy" ? 0.3 : 0.15;
        mat.opacity = pulse + Math.sin(state.clock.elapsedTime * 2 + phase) * 0.1;
      }
    }
  });

  return (
    <group ref={groupRef}>
      {/* Activity glow ring — pulses when busy */}
      <mesh
        ref={haloRef}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.02, 0]}
      >
        <ringGeometry args={[0.6, 0.8, 24]} />
        <meshBasicMaterial color={activityColor} transparent opacity={0.2} />
      </mesh>

      {/* Body — capsule tinted by agent.color */}
      <mesh ref={bodyRef} position={[0, 0.6, 0]}>
        <capsuleGeometry args={[0.3, 0.4, 8, 16]} />
        <meshStandardMaterial
          color={agent.color}
          metalness={0.3}
          roughness={0.6}
          emissive={selected ? agent.color : undefined}
          emissiveIntensity={selected ? 0.2 : 0}
        />
      </mesh>

      {/* Head — sphere with status glow */}
      <mesh position={[0, 1.15, 0]}>
        <sphereGeometry args={[0.22, 16, 16]} />
        <meshStandardMaterial
          color={status === "offline" ? "#4a4a5a" : agent.color}
          emissive={status === "degraded" ? statusColor : undefined}
          emissiveIntensity={status === "degraded" ? 0.3 : 0}
          metalness={0.4}
          roughness={0.3}
        />
      </mesh>

      {/* Gateway status dot above head */}
      <mesh position={[0, 1.45, 0]}>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshBasicMaterial color={statusColor} />
      </mesh>

      {/* Name label */}
      <Text
        position={[0, 0.05, 0.7]}
        fontSize={0.15}
        color={status === "offline" ? "#6b7280" : hovered ? "#ffffff" : "#e2e8f0"}
        anchorX="center"
        anchorY="middle"
        fontWeight={500}
      >
        {agent.name}
      </Text>

      {/* Selected ring — visible when this avatar is the active selection */}
      {selected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
          <ringGeometry args={[0.9, 1.1, 32]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.6} />
        </mesh>
      )}

      {/* Invisible click target — Phase 4 (wider radius for easy clicking) */}
      <mesh
        onClick={(e) => {
          e.stopPropagation();
          onClick?.(agent);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = "default";
        }}
        position={[0, 0.8, 0]}
      >
        <cylinderGeometry args={[0.8, 0.8, 2, 8]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
    </group>
  );
}
