"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import * as THREE from "three";

/**
 * World — the terrain, roads, sidewalks, districts, and parks.
 *
 * Layout (units = metres):
 *
 *   Z = -50 (north) ──────────────────────────────
 *   ┌─────────────────────────────────────────────┐
 *   │ HERMES MOUNTAIN PARK (trees, paths)         │
 *   ├─ Crescent Road (4 lanes)                   ─┤
 *   │  ▢ OpenCode  ▢ Kilo  ▢ Hermes  ▢ NIM        │  ← agent plots
 *   ├═════════════════════════════════════════════┤
 *   │ Plaza (fountain, central)                  │
 *   ├─ Central Avenue                          ───┤
 *   │  ▢ Mistral  ▢ CLI-Staff (Claude, Codex)    │
 *   ├─────────────────────────────────────────────┤
 *   │ Delivery Loop (vehicles circulate)         │
 *   Z = +50 (south) ──────────────────────────────
 *
 * Everything is procedurally generated via instanced meshes where possible
 * to keep the draw call count down.
 */

interface WorldProps {
  /** Real-time clock factor 0–1 over 24h day. */
  timeOfDay?: number;
}

export function World({ timeOfDay = 0.5 }: WorldProps) {
  // Procedural positions for trees, lamps, vehicles
  const treePositions = useMemo(() => {
    const rng = mulberry32(20240718);
    return Array.from({ length: 80 }, () => ({
      x: -45 + rng() * 90,
      z: -50 + rng() * 22,
      scale: 0.8 + rng() * 0.6,
      rot: rng() * Math.PI * 2,
    }));
  }, []);

  return (
    <group>
      {/* ── Base ground (grass tone) ───────────────────────────── */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color="#3a5a3a" roughness={0.95} />
      </mesh>

      {/* ── North park ─────────────────────────────────────────── */}
      <ParkTrees positions={treePositions} />

      {/* ── Crescent Road (asphalt) ───────────────────────────── */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, -28]} receiveShadow>
        <planeGeometry args={[120, 8]} />
        <meshStandardMaterial color="#2a2a2a" roughness={0.7} />
      </mesh>
      {/* Road markings */}
      {Array.from({ length: 12 }).map((_, i) => (
        <mesh
          key={i}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[-55 + i * 10, 0.04, -28]}
        >
          <planeGeometry args={[2, 0.2]} />
          <meshStandardMaterial color="#fcd34d" emissive="#fcd34d" emissiveIntensity={0.4} />
        </mesh>
      ))}
      <RoadSigns />

      {/* ── Agent plot strip (between boulevard and plaza) ────── */}
      <DistrictRow z={-12} agentsPerSide={3} />

      {/* ── Plaza (hermes center, fountain) ───────────────────── */}
      <Plaza />

      {/* ── Central Avenue ────────────────────────────────────── */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 4]} receiveShadow>
        <planeGeometry args={[20, 18]} />
        <meshStandardMaterial color="#2a2a2a" roughness={0.7} />
      </mesh>

      {/* ── South delivery loop ────────────────────────────────── */}
      <DeliveryLoop />

      {/* ── Park band (south) ──────────────────────────────────── */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 38]}>
        <planeGeometry args={[200, 12]} />
        <meshStandardMaterial color="#4a6a3a" />
      </mesh>
      {/* Benches + tables down the path */}
      {Array.from({ length: 8 }).map((_, i) => (
        <Bench key={i} position={[-30 + i * 8, 0, 38]} />
      ))}
    </group>
  );
}

/* ── Pieces ─────────────────────────────────────────────────── */

/** Procedurally placed trees + a cluster of lamp posts. */
function ParkTrees({ positions }: { positions: Array<{ x: number; z: number; scale: number; rot: number }> }) {
  // Use a single point mesh + child position offsets via instancing would be ideal,
  // but for first pass simulate with a small group of <mesh> children.
  return (
    <group>
      {/* Park band */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, -40]}>
        <planeGeometry args={[200, 12]} />
        <meshStandardMaterial color="#4a6a3a" />
      </mesh>
      {/* Trees */}
      {positions.map((t, i) => (
        <group key={i} position={[t.x, 0, t.z]} scale={t.scale} rotation={[0, t.rot, 0]}>
          {/* Trunk */}
          <mesh position={[0, 1, 0]} castShadow>
            <cylinderGeometry args={[0.18, 0.25, 2, 8]} />
            <meshStandardMaterial color="#3a261a" roughness={0.95} />
          </mesh>
          {/* Foliage */}
          <mesh position={[0, 3, 0]} castShadow>
            <sphereGeometry args={[1.6, 12, 8]} />
            <meshStandardMaterial color="#1f4a2b" roughness={0.85} />
          </mesh>
        </group>
      ))}
      {/* Lampposts (south edge of park) */}
      {Array.from({ length: 8 }).map((_, i) => (
        <Lamppost key={i} position={[-56 + i * 14, 0, -34]} />
      ))}
    </group>
  );
}

function Lamppost({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 2, 0]}>
        <cylinderGeometry args={[0.06, 0.08, 4, 8]} />
        <meshStandardMaterial color="#1a1a1a" metalness={0.7} />
      </mesh>
      <mesh position={[0, 4, 0]}>
        <sphereGeometry args={[0.25, 12, 8]} />
        <meshStandardMaterial color="#fde68a" emissive="#fde68a" emissiveIntensity={1.5} />
      </mesh>
    </group>
  );
}

function RoadSigns() {
  return (
    <group>
      {/* Stop sign on a pole at the boulevard + plaza corner */}
      {(
        [
          { pos: [-50, 0, -22] as [number, number, number], rot: 0 },
          { pos: [50, 0, -22] as [number, number, number], rot: Math.PI },
        ]
      ).map((s, i) => (
        <group key={i} position={s.pos} rotation={[0, s.rot, 0]}>
          <mesh position={[0, 1.5, 0]}>
            <cylinderGeometry args={[0.05, 0.07, 3, 6]} />
            <meshStandardMaterial color="#3a3a3a" />
          </mesh>
          <mesh position={[0, 3, 0]}>
            <octahedronGeometry args={[0.3, 0]} />
            <meshStandardMaterial color="#dc2626" emissive="#dc2626" emissiveIntensity={0.3} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Bench({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Bench seat */}
      <mesh position={[0, 0.4, 0]}>
        <boxGeometry args={[2, 0.1, 0.6]} />
        <meshStandardMaterial color="#7a4a2a" roughness={0.8} />
      </mesh>
      {/* Legs */}
      <mesh position={[-0.8, 0.2, 0]}>
        <boxGeometry args={[0.1, 0.4, 0.5]} />
        <meshStandardMaterial color="#3a261a" />
      </mesh>
      <mesh position={[0.8, 0.2, 0]}>
        <boxGeometry args={[0.1, 0.4, 0.5]} />
        <meshStandardMaterial color="#3a261a" />
      </mesh>
      {/* Trash can next to bench */}
      <mesh position={[1.4, 0.5, 0]}>
        <cylinderGeometry args={[0.2, 0.2, 1, 8]} />
        <meshStandardMaterial color="#4a4a4a" metalness={0.5} />
      </mesh>
    </group>
  );
}

/**
 * DistrictRow — a strip of building plots along z=-12, facing the boulevard.
 * Each agent gets one plot. Buildings are drawn in the parent (Scene).
 */
function DistrictRow({ z, agentsPerSide = 3 }: { z: number; agentsPerSide?: number }) {
  return (
    <group>
      {/* Sidewalk + flower beds */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, -22]}>
        <planeGeometry args={[120, 6]} />
        <meshStandardMaterial color="#d4c7a8" />
      </mesh>
      {/* Hedge rows */}
      {Array.from({ length: 16 }).map((_, i) => (
        <mesh
          key={i}
          position={[-60 + i * 8, 0.6, -25]}
        >
          <boxGeometry args={[6, 1.2, 0.6]} />
          <meshStandardMaterial color="#2f5a2c" />
        </mesh>
      ))}
    </group>
  );
}

function Plaza() {
  const ref = useRef<THREE.Group>(null);

  // Slow rotation of the centerpiece sphere
  useFrame((state) => {
    if (ref.current) {
      ref.current.rotation.y = state.clock.elapsedTime * 0.15;
    }
  });

  return (
    <group>
      {/* Plaza floor (light granite tile) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 4]}>
        <planeGeometry args={[42, 14]} />
        <meshStandardMaterial color="#c9c2b6" />
      </mesh>
      {/* Concentric circle inlay */}
      {Array.from({ length: 3 }).map((_, i) => (
        <mesh
          key={i}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.02, 4]}
        >
          <ringGeometry args={[3 + i * 1.5, 3.05 + i * 1.5, 32]} />
          <meshStandardMaterial color="#a38570" />
        </mesh>
      ))}
      {/* Fountain pedestal + spinning diamond */}
      <group ref={ref}>
        <mesh position={[0, 0.5, 4]}>
          <cylinderGeometry args={[1.5, 1.7, 1, 16]} />
          <meshStandardMaterial color="#6366f1" metalness={0.6} roughness={0.2} />
        </mesh>
        <mesh position={[0, 1.6, 4]}>
          <icosahedronGeometry args={[0.7, 0]} />
          <meshStandardMaterial
            color="#a5b4fc"
            emissive="#6366f1"
            emissiveIntensity={0.7}
            metalness={0.7}
            roughness={0.05}
          />
        </mesh>
      </group>
      {/* Plaza label */}
      <Text
        position={[0, 4, 4]}
        fontSize={1.2}
        color="#3a3a4a"
        anchorX="center"
        anchorY="middle"
        letterSpacing={0.2}
        fontWeight={600}
      >
        HERMES PLAZA
      </Text>
    </group>
  );
}

function DeliveryLoop() {
  // Road loop on the south side of the city
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 28]}>
        <planeGeometry args={[60, 8]} />
        <meshStandardMaterial color="#2a2a2a" roughness={0.7} />
      </mesh>
      {/* Courier garage on the east end */}
      <mesh position={[28, 1.5, 28]}>
        <boxGeometry args={[8, 3, 8]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
      <mesh position={[28, 2.8, 28]}>
        <boxGeometry args={[6, 0.4, 4]} />
        <meshStandardMaterial color="#dc2626" emissive="#dc2626" emissiveIntensity={0.2} />
      </mesh>
      <Text
        position={[28, 4.5, 28]}
        fontSize={0.7}
        color="#fbbf24"
        anchorX="center"
        anchorY="middle"
        letterSpacing={0.1}
        fontWeight={600}
      >
        COURIER HQ
      </Text>
    </group>
  );
}

/* ── Utils ──────────────────────────────────────────────────── */

/** Seeded RNG for deterministic tree positions. */
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
