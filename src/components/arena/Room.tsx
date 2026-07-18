"use client";

import { useMemo } from "react";

import {
  ARENA_AGENTS,
  STATUS_HEX,
} from "./roster";
import type { ArenaAgent, AgentStatus } from "./roster";

interface RoomProps {
  /** Optional server-discovered agents; falls back to ARENA_AGENTS for /arena's demo mode. */
  agents?: ArenaAgent[];
}

function statusFallback(status?: AgentStatus): string {
  return (status && STATUS_HEX[status]) ?? STATUS_HEX.unknown;
}

/**
 * Room — the physical environment (floor, walls, spawn pads, center pedestal).
 * Pulls positions from the single roster. No parallel pad list lives here.
 */
export function Room({ agents = ARENA_AGENTS }: RoomProps) {
  // Memoised because each agent may come from a different Object.
  const pads = useMemo(
    () =>
      agents.map((a) => ({
        x: a.x,
        z: a.z,
        color: statusFallback(a.statusOverride),
        label: a.name,
      })),
    [agents],
  );

  return (
    <group>
      {/* Dark grid floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[24, 16]} />
        <meshStandardMaterial color="#1a1a2e" />
      </mesh>
      <gridHelper args={[24, 24, "#2a2a4e", "#1e1e3a"]} position={[0, 0, 0]} />

      {/* Glass-like walls — kindly ignore the dead `castShadow` props;
          set `Canvas shadows={true}` later if you want them. */}
      {(
        [
          { pos: [0, 2, -8] as const, rot: [0, 0, 0] as const },
          { pos: [0, 2, 8] as const, rot: [0, 0, 0] as const },
          { pos: [-12, 2, 0] as const, rot: [0, Math.PI / 2, 0] as const },
          { pos: [12, 2, 0] as const, rot: [0, Math.PI / 2, 0] as const },
        ]
      ).map((wall, i) => (
        <mesh
          key={i}
          position={wall.pos}
          rotation={wall.rot}
        >
          <planeGeometry args={[24, 4]} />
          <meshStandardMaterial color="#2a2a4e" transparent opacity={0.3} />
        </mesh>
      ))}

      {/* Spawn pads — one per roster row */}
      {pads.map((pad) => (
        <group key={pad.label + pad.x + pad.z} position={[pad.x, 0, pad.z]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
            <ringGeometry args={[1.2, 1.5, 32]} />
            <meshStandardMaterial color={pad.color} transparent opacity={0.3} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
            <circleGeometry args={[1.2, 32]} />
            <meshStandardMaterial color={pad.color} transparent opacity={0.15} />
          </mesh>
        </group>
      ))}

      {/* Logo pedestal + orb */}
      <mesh position={[0, 0.5, 2]}>
        <boxGeometry args={[1.2, 0.3, 1.2]} />
        <meshStandardMaterial color="#6366f1" metalness={0.6} roughness={0.3} />
      </mesh>
      <mesh position={[0, 1.2, 2]}>
        <sphereGeometry args={[0.4, 16, 16]} />
        <meshStandardMaterial color="#818cf8" emissive="#6366f1" emissiveIntensity={0.5} />
      </mesh>

      {/* Section bars (cosmetic). Uses agent.colorScheme via pad.color. */}
      {pads.map((pad) => (
        <mesh
          key={"label-" + pad.label}
          position={[pad.x, 0.01, pad.z - 2]}
        >
          <planeGeometry args={[3, 0.3]} />
          <meshStandardMaterial color={pad.color} transparent opacity={0.4} />
        </mesh>
      ))}
    </group>
  );
}
