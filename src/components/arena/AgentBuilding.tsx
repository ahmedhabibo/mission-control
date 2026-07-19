"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import * as THREE from "three";
import { useMemo, useState } from "react";

/**
 * AgentBuilding — a modular office building for an agent.
 *
 * Features:
 *   - Window grid (3x2 lit panels, color from agent.status)
 *   - Rooftop name sign (agent color, text via canvas texture)
 *   - Status beacon (LED on roof, pulses when busy)
 *   - Door that opens when character approaches (handled by Scene)
 *   - Brand accent stripe along the facade
 */

interface AgentBuildingProps {
  /** Agent id for theming. */
  agentId: string;
  /** Agent display name (shown on sign). */
  name: string;
  /** Agent color (hex). */
  color: string;
  /** Agent kind — "chat" | "cli" | "gateway" | "mcp" | "profile". */
  kind: "chat" | "cli" | "gateway" | "mcp" | "profile";
  /** Live status from /api/chat/agents. */
  status: "online" | "degraded" | "offline" | "unknown";
  /** Live activity from /api/chat/agents. */
  activity?: "idle" | "busy";
  /** Position in world space (x, z). */
  x?: number;
  z?: number;
  /** Position in world space as [x, y, z] — alternative to x/z. */
  position?: [number, number, number];
  /** Plot width/depth (plot = 10x10). */
  plotSize?: number;
  /** Unique key for this building instance. */
  plotIndex?: number;
  /** Click handler for agent selection. */
  onClick?: () => void;
}

const STATUS_COLOR: Record<string, THREE.ColorRepresentation> = {
  online: 0x22c55e,
  degraded: 0xf59e0b,
  offline: 0x6b7280,
  unknown: 0xa3a3a3,
};

const STATUS_EMISSIVE: Record<string, THREE.ColorRepresentation> = {
  online: 0x22c55e,
  degraded: 0xf59e0b,
  offline: 0x000000,
  unknown: 0x000000,
};

export function AgentBuilding({
  agentId,
  name,
  color,
  kind,
  status,
  activity = "idle",
  x = 0,
  z = 0,
  position,
  plotSize = 10,
  plotIndex,
}: AgentBuildingProps) {
  // Use position if provided, otherwise use x/z
  const posX = position ? position[0] : x ?? 0;
  const posZ = position ? position[2] : z ?? 0;
  const { camera } = useThree();

  // Create sign texture once per building
  const signTexture = useMemo(() => {
    const size = 1024;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = 300;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#0d0d1a";
    ctx.fillRect(0, 0, size, 300);
    // Agent color stripe
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, size, 80);
    // Agent name
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 96px Inter, system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(name, size / 2, 190);
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }, [name, color]);

  // Window state: online = bright, degraded = amber, offline = dim
  const windowColor = STATUS_COLOR[status];
  const windowEmissive = STATUS_EMISSIVE[status];
  const windowOpacity = status === "online" ? 1 : status === "degraded" ? 0.8 : 0.3;

  // Beacon pulse
  const [pulse, setPulse] = useState(1);
  useFrame((state) => {
    if (activity === "busy") {
      setPulse(0.5 + Math.sin(state.clock.elapsedTime * 4) * 0.5);
    } else {
      setPulse(1);
    }
  });

  return (
    <group position={[posX, 0, posZ]}>
      {/* ── Building base (foundation) ───────────────────────── */}
      <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[plotSize - 0.5, 1, plotSize - 0.5]} />
        <meshStandardMaterial color="#1a1a2e" metalness={0.2} roughness={0.7} />
      </mesh>

      {/* ── Facade (front face, faces -Z) ────────────────────── */}
      <mesh position={[0, 6, plotSize / 2 - 0.1]} castShadow>
        <planeGeometry args={[plotSize - 1, 12]} />
        <meshStandardMaterial
          color="#141424"
          transparent={true}
          opacity={0.95}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* ── Window grid (3 cols x 2 rows) ────────────────────── */}
      <group position={[0, 5.5, plotSize / 2 - 0.05]}>
        {[
          [0, 1],
          [-3, 1],
          [3, 1],
          [0, -3],
          [-3, -3],
          [3, -3],
        ].map(([wx, wy], i) => (
          <mesh key={i} position={[wx, wy, 0]}>
            <planeGeometry args={[2, 2.5]} />
            <meshBasicMaterial
              color={windowColor}
              transparent
              opacity={windowOpacity}
              side={THREE.DoubleSide}
            />
          </mesh>
        ))}
      </group>

      {/* ── Accent stripe (agent color) along the base ───────── */}
      <mesh position={[0, 0.8, plotSize / 2 - 0.15]}>
        <planeGeometry args={[plotSize - 1, 0.4]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.2}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* ── Roof ─────────────────────────────────────────────── */}
      <mesh position={[0, 12.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[plotSize + 0.2, 1, plotSize + 0.2]} />
        <meshStandardMaterial color="#0d0d1a" metalness={0.3} roughness={0.6} />
      </mesh>

      {/* ── Status beacon (top center of roof) ───────────────── */}
      <group position={[0, 14, 0]}>
        <mesh position={[0, 0.15, 0]} scale={activity === "busy" ? pulse : 1}>
          <sphereGeometry args={[0.5, 16, 16]} />
          <meshStandardMaterial
            color={STATUS_COLOR[status]}
            emissive={STATUS_EMISSIVE[status]}
            emissiveIntensity={activity === "busy" ? 1.5 : 0.8}
          />
        </mesh>
        {/* Beacon column */}
        <mesh position={[0, -1.5, 0]} castShadow>
          <cylinderGeometry args={[0.15, 0.2, 3, 8]} />
          <meshStandardMaterial color="#1a1a2e" metalness={0.5} roughness={0.3} />
        </mesh>
      </group>

      {/* ── Rooftop sign (agent name + color) ────────────────── */}
      <mesh position={[0, 14.5, plotSize / 2 - 0.5]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[8, 2.5]} />
        <meshStandardMaterial
          map={signTexture}
          transparent
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* ── Door (center, ground level) ──────────────────────── */}
      <mesh position={[0, 1, plotSize / 2 - 0.25]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[1.5, 2.5]} />
        <meshStandardMaterial
          color="#0d0d1a"
          side={THREE.DoubleSide}
        />
      </mesh>

      <mesh position={[-1.2, 2.2, plotSize / 2 - 0.3]}>
        <sphereGeometry args={[0.15, 12, 12]} />
        <meshBasicMaterial color="#fde68a" />
      </mesh>
      <mesh position={[1.2, 2.2, plotSize / 2 - 0.3]}>
        <sphereGeometry args={[0.15, 12, 12]} />
        <meshBasicMaterial color="#fde68a" />
      </mesh>

      {/* ── Name label (floating above roof) ─────────────────── */}
      <Text
        position={[0, 15, 0]}
        fontSize={0.6}
        color={color}
        anchorX="center"
        anchorY="middle"
        fontWeight={600}
      >
        {name}
      </Text>
    </group>
  );
}

/* ── Mini icons for kind badges on the facade ────────────── */

interface KindBadgeProps {
  kind: "chat" | "cli" | "gateway" | "mcp";
  position: [number, number, number];
}

function KindBadge({ kind, position }: KindBadgeProps) {
  const iconShape = {
    chat: "sphere",
    cli: "cube",
    gateway: "octahedron",
    mcp: "tetrahedron",
  }[kind];

  return (
    <mesh position={position} scale={0.4}>
      {iconShape === "sphere" && <sphereGeometry args={[1, 12, 12]} />}
      {iconShape === "cube" && <boxGeometry args={[1, 1, 1]} />}
      {iconShape === "octahedron" && <octahedronGeometry args={[1, 0]} />}
      {iconShape === "tetrahedron" && <tetrahedronGeometry args={[1, 0]} />}
      <meshStandardMaterial color="#fcd34d" />
    </mesh>
  );
}