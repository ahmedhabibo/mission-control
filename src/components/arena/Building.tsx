"use client";

import { Text } from "@react-three/drei";

import { ZONES } from "./roster";
import type { Zone } from "./roster";

/**
 * Building — multi-section 3D environment (Phase 3).
 *
 * Four zones arranged in quadrants around a central doorway:
 *
 *   workstations (NW)  |  cafe (NE)
 *   ───────────────────┼──────────
 *   playroom (SW)      |  lobby (SE)
 *
 * Each zone has its own raised floor platform, accent walls,
 * furniture, and a floating name label. The center has a
 * pedestal with an orb — the "command center" where the camera
 * initially focuses.
 */
export function Building() {
  return (
    <group>
      {/* ── Base floor (entire building) ────────────────────────── */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[36, 28]} />
        <meshStandardMaterial color="#080812" />
      </mesh>
      <gridHelper args={[36, 36, "#1a1a2e", "#12121f"]} position={[0, 0, 0]} />

      {/* ── Zone platforms + furniture ──────────────────────────── */}
      {(Object.values(ZONES) as Zone[]).map((zone) => (
        <ZonePlatform key={zone.id} zone={zone} />
      ))}

      {/* ── Central divider walls (with doorway gap) ────────────── */}
      {/* Horizontal divider along X axis */}
      <mesh position={[0, 1.5, 0]}>
        <boxGeometry args={[36, 3, 0.15]} />
        <meshStandardMaterial color="#1e1e3a" transparent opacity={0.5} />
      </mesh>
      {/* Vertical divider along Z axis (with gap for doorway) */}
      <mesh position={[-9, 1.5, 0]}>
        <boxGeometry args={[0.15, 3, 18]} />
        <meshStandardMaterial color="#1e1e3a" transparent opacity={0.5} />
      </mesh>
      <mesh position={[9, 1.5, 0]}>
        <boxGeometry args={[0.15, 3, 18]} />
        <meshStandardMaterial color="#1e1e3a" transparent opacity={0.5} />
      </mesh>

      {/* ── Central command pedestal ────────────────────────────── */}
      <mesh position={[0, 0.4, 0]}>
        <cylinderGeometry args={[1.2, 1.4, 0.8, 16]} />
        <meshStandardMaterial color="#6366f1" metalness={0.7} roughness={0.2} />
      </mesh>
      <mesh position={[0, 1.4, 0]}>
        <icosahedronGeometry args={[0.5, 0]} />
        <meshStandardMaterial
          color="#818cf8"
          emissive="#6366f1"
          emissiveIntensity={0.6}
          metalness={0.5}
          roughness={0.1}
        />
      </mesh>

      {/* ── Outer walls ─────────────────────────────────────────── */}
      <mesh position={[0, 2, -14]}>
        <boxGeometry args={[36, 4, 0.2]} />
        <meshStandardMaterial color="#1a1a2e" transparent opacity={0.4} />
      </mesh>
      <mesh position={[0, 2, 14]}>
        <boxGeometry args={[36, 4, 0.2]} />
        <meshStandardMaterial color="#1a1a2e" transparent opacity={0.4} />
      </mesh>
      <mesh position={[-18, 2, 0]}>
        <boxGeometry args={[0.2, 4, 28]} />
        <meshStandardMaterial color="#1a1a2e" transparent opacity={0.4} />
      </mesh>
      <mesh position={[18, 2, 0]}>
        <boxGeometry args={[0.2, 4, 28]} />
        <meshStandardMaterial color="#1a1a2e" transparent opacity={0.4} />
      </mesh>

      {/* ── Zone labels (floating text) ────────────────────────── */}
      {(Object.values(ZONES) as Zone[]).map((zone) => (
        <Text
          key={`label-${zone.id}`}
          position={[zone.cx, 3.5, zone.cz]}
          fontSize={0.6}
          color={zone.accentColor}
          anchorX="center"
          anchorY="middle"
          fontWeight={700}
        >
          {zone.name}
        </Text>
      ))}
    </group>
  );
}

/**
 * ZonePlatform — a single quadrant with raised floor, accent border,
 * and zone-specific furniture.
 */
function ZonePlatform({ zone }: { zone: Zone }) {
  const half = zone.span / 2;
  const isWorkstations = zone.id === "workstations";
  const isCafe = zone.id === "cafe";
  const isPlayroom = zone.id === "playroom";
  const isLobby = zone.id === "lobby";

  return (
    <group>
      {/* Raised floor platform (slightly above base) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[zone.cx, 0.01, zone.cz]}>
        <planeGeometry args={[zone.span, zone.span]} />
        <meshStandardMaterial color={zone.floorColor} />
      </mesh>

      {/* Accent border (thin frame around the platform) */}
      <mesh position={[zone.cx, 0.03, zone.cz - half]}>
        <boxGeometry args={[zone.span, 0.06, 0.1]} />
        <meshStandardMaterial color={zone.accentColor} emissive={zone.accentColor} emissiveIntensity={0.3} />
      </mesh>
      <mesh position={[zone.cx, 0.03, zone.cz + half]}>
        <boxGeometry args={[zone.span, 0.06, 0.1]} />
        <meshStandardMaterial color={zone.accentColor} emissive={zone.accentColor} emissiveIntensity={0.3} />
      </mesh>
      <mesh position={[zone.cx - half, 0.03, zone.cz]}>
        <boxGeometry args={[0.1, 0.06, zone.span]} />
        <meshStandardMaterial color={zone.accentColor} emissive={zone.accentColor} emissiveIntensity={0.3} />
      </mesh>
      <mesh position={[zone.cx + half, 0.03, zone.cz]}>
        <boxGeometry args={[0.1, 0.06, zone.span]} />
        <meshStandardMaterial color={zone.accentColor} emissive={zone.accentColor} emissiveIntensity={0.3} />
      </mesh>

      {/* Zone-specific furniture */}
      {isWorkstations && <WorkstationsFurniture zone={zone} />}
      {isCafe && <CafeFurniture zone={zone} />}
      {isPlayroom && <PlayroomFurniture zone={zone} />}
      {isLobby && <LobbyFurniture zone={zone} />}
    </group>
  );
}

/* ── Zone furniture ──────────────────────────────────────────── */

function WorkstationsFurniture({ zone }: { zone: Zone }) {
  // Desks with monitor glow
  const desks = [
    [-2, -1], [0, -1], [2, -1],
    [-2, 1], [0, 1], [2, 1],
  ];
  return (
    <group>
      {desks.map(([dx, dz], i) => (
        <group key={i} position={[zone.cx + dx, 0, zone.cz + dz]}>
          {/* Desk surface */}
          <mesh position={[0, 0.4, 0]}>
            <boxGeometry args={[1.8, 0.05, 1]} />
            <meshStandardMaterial color="#2a2a3e" />
          </mesh>
          {/* Monitor */}
          <mesh position={[0, 0.7, -0.3]}>
            <boxGeometry args={[1.2, 0.5, 0.05]} />
            <meshStandardMaterial
              color="#1a1a2e"
              emissive="#3b82f6"
              emissiveIntensity={0.15}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function CafeFurniture({ zone }: { zone: Zone }) {
  // Round tables with stools
  const tables = [
    [-2, -1], [2, -1], [-2, 1], [2, 1],
  ];
  return (
    <group>
      {tables.map(([tx, tz], i) => (
        <group key={i} position={[zone.cx + tx, 0, zone.cz + tz]}>
          {/* Table top */}
          <mesh position={[0, 0.5, 0]}>
            <cylinderGeometry args={[0.6, 0.6, 0.05, 16]} />
            <meshStandardMaterial color="#4a3a1e" />
          </mesh>
          {/* Table leg */}
          <mesh position={[0, 0.25, 0]}>
            <cylinderGeometry args={[0.08, 0.08, 0.5, 8]} />
            <meshStandardMaterial color="#3a2a1a" />
          </mesh>
          {/* Stool */}
          <mesh position={[0.8, 0.25, 0]}>
            <cylinderGeometry args={[0.2, 0.2, 0.05, 8]} />
            <meshStandardMaterial color="#5a4a2e" />
          </mesh>
        </group>
      ))}
      {/* Pendant lights */}
      <mesh position={[zone.cx - 2, 2.5, zone.cz]}>
        <sphereGeometry args={[0.15, 8, 8]} />
        <meshStandardMaterial color="#f59e0b" emissive="#f59e0b" emissiveIntensity={0.8} />
      </mesh>
    </group>
  );
}

function PlayroomFurniture({ zone }: { zone: Zone }) {
  // Bean bags and a game console
  return (
    <group>
      {/* Bean bag chairs */}
      <mesh position={[zone.cx - 2, 0.3, zone.cz - 1]}>
        <sphereGeometry args={[0.5, 8, 8]} />
        <meshStandardMaterial color="#a855f7" roughness={0.9} />
      </mesh>
      <mesh position={[zone.cx + 2, 0.3, zone.cz + 1]}>
        <sphereGeometry args={[0.5, 8, 8]} />
        <meshStandardMaterial color="#c084fc" roughness={0.9} />
      </mesh>
      {/* Game console (arcade cabinet) */}
      <mesh position={[zone.cx, 0.8, zone.cz]}>
        <boxGeometry args={[0.8, 1.6, 0.6]} />
        <meshStandardMaterial color="#2a1a3e" />
      </mesh>
      <mesh position={[zone.cx, 1.2, zone.cz + 0.31]}>
        <planeGeometry args={[0.5, 0.4]} />
        <meshStandardMaterial color="#a855f7" emissive="#a855f7" emissiveIntensity={0.4} />
      </mesh>
    </group>
  );
}

function LobbyFurniture({ zone }: { zone: Zone }) {
  // Reception desk + plant
  return (
    <group>
      {/* Reception desk */}
      <mesh position={[zone.cx, 0.5, zone.cz - 2]}>
        <boxGeometry args={[3, 1, 0.8]} />
        <meshStandardMaterial color="#1a2a1e" />
      </mesh>
      <mesh position={[zone.cx, 0.9, zone.cz - 2]}>
        <boxGeometry args={[3.2, 0.05, 0.9]} />
        <meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={0.15} />
      </mesh>
      {/* Plant */}
      <mesh position={[zone.cx + 2.5, 0.3, zone.cz + 2]}>
        <cylinderGeometry args={[0.2, 0.15, 0.6, 8]} />
        <meshStandardMaterial color="#3a2a1a" />
      </mesh>
      <mesh position={[zone.cx + 2.5, 0.8, zone.cz + 2]}>
        <sphereGeometry args={[0.4, 8, 8]} />
        <meshStandardMaterial color="#22c55e" roughness={0.8} />
      </mesh>
    </group>
  );
}
