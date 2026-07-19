"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera, ContactShadows, Html } from "@react-three/drei";
import * as THREE from "three";

import { World } from "./World";
import { AgentBuilding } from "./AgentBuilding";
import { ZONES } from "./roster";

import type { ArenaAgent, AgentStatus, AgentActivity, ZoneId } from "./roster";
import { STATUS_HEX, ACTIVITY_HEX, STATUS_ZONE, ZONES as ZONES_ROSTER } from "./roster";

interface ArenaSceneProps {
  agents: (ArenaAgent & { zoneId: ZoneId; zoneIndex: number })[];
  liveStatus: Record<string, AgentStatus>;
  liveActivity: Record<string, AgentActivity>;
  agentPositions: Record<string, { x: number; z: number }>;
  uptime: string;
  taskCount: number;
  onAgentClick: (agent: ArenaAgent) => void;
}

interface AgentState {
  currentPos: [number, number, number];
  targetPos: [number, number, number];
}

/* ── Fountain ── */
function Fountain({ timeOfDay, isDay }: { timeOfDay: number; isDay: boolean }) {
  const [t, setT] = useState(0);
  useFrame((_, delta) => setT((t) => t + delta * 2));

  return (
    <group position={[0, 0, 0]}>
      <mesh position={[0, 0.15, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[4, 32]} />
        <meshStandardMaterial color="#0f1f2e" metalness={0.2} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.3, 0]}>
        <cylinderGeometry args={[2.5, 2.5, 0.1, 24]} />
        <meshStandardMaterial color="#2a4a6a" transparent opacity={0.7} metalness={0.1} roughness={0.1} />
      </mesh>
      <mesh position={[0, 2.5, 0]}>
        <cylinderGeometry args={[0.2, 0.05, 5, 8]} />
        <meshStandardMaterial color="#8ab4f8" transparent opacity={0.8} emissive="#4285f4" emissiveIntensity={0.4} />
      </mesh>
      {[0, Math.PI / 2, Math.PI, Math.PI * 1.5].map((angle) => (
        <mesh key={angle} position={[Math.sin(angle) * 1.2, 1.5, Math.cos(angle) * 1.2]} rotation={[0, angle, 0]}>
          <cylinderGeometry args={[0.1, 0.05, 3, 6]} />
          <meshStandardMaterial color="#8ab4f8" transparent opacity={0.6} emissive="#4285f4" emissiveIntensity={0.3} />
        </mesh>
      ))}
      <mesh position={[0, 0.16, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[4, 4.1, 32]} />
        <meshStandardMaterial color="#60a5fa" emissive="#60a5fa" emissiveIntensity={0.3} />
      </mesh>
    </group>
  );
}

/* ── Info Board ── */
function InfoBoard({
  agents,
  uptime,
  taskCount,
  timeOfDay,
  weather,
}: {
  agents: number;
  uptime: string;
  taskCount: number;
  timeOfDay: number;
  weather: "clear" | "rain" | "fog";
}) {
  const hours = Math.floor(timeOfDay * 24);
  const mins = Math.floor((timeOfDay * 24 - hours) * 60);
  const timeStr = `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;

  return (
    <group position={[0, 4, -12]}>
      <mesh position={[0, 0, -0.1]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[6, 3.5]} />
        <meshStandardMaterial color="#0f0f1a" transparent opacity={0.95} />
      </mesh>
      <mesh position={[0, 0, 0.05]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[5.5, 3]} />
        <meshStandardMaterial color="#00101a" transparent opacity={0.2} />
      </mesh>
      <Html position={[0, 0.5, 0.3]} transform>
        <div className="p-3 font-mono text-[10px] text-white/90 bg-transparent" style={{ pointerEvents: "none" }}>
          <div className="flex justify-between border-b border-white/10 pb-2 mb-2">
            <span className="text-emerald-400">MC ARENA</span>
            <span className="text-white/50">{timeStr}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs text-white/70">
            <div>Agents: <span className="text-white font-bold">{agents}</span></div>
            <div>Live: <span className="text-emerald-400 font-bold">{uptime}</span></div>
            <div>Tasks: <span className="text-amber-400 font-bold">{taskCount}</span></div>
            <div>Weather: <span className="capitalize text-blue-400">{weather}</span></div>
          </div>
        </div>
      </Html>
    </group>
  );
}

/* ── HUD ── */
function HUD({
  agents,
  liveStatus,
  liveActivity,
  uptime,
  taskCount,
  timeOfDay,
  weather,
}: {
  agents: any[];
  liveStatus: Record<string, any>;
  liveActivity: Record<string, any>;
  uptime: string;
  taskCount: number;
  timeOfDay: number;
  weather: "clear" | "rain" | "fog";
}) {
  const statusColors = { online: "#22c55e", degraded: "#f59e0b", offline: "#6b7280", unknown: "#a3a3a0" };

  return (
    <div className="pointer-events-none absolute inset-0 z-10 p-4">
      <div className="absolute left-4 top-4 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded bg-[#6366f1] text-[10px] font-bold text-white">MC</span>
        <span className="text-sm font-semibold text-white/90">ARENA</span>
      </div>

      <div className="absolute left-1/2 top-4 -translate-x-1/2 flex items-center gap-3">
        <div className="flex items-center gap-1.5 rounded-md border border-white/10 bg-black/40 px-2.5 py-1 text-[11px] text-white/70 backdrop-blur">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#22c55e]" />
          <span>{uptime}</span>
        </div>
        <div className="rounded-md border border-white/10 bg-black/40 px-2.5 py-1 text-[11px] text-white/70 backdrop-blur">
          {taskCount.toLocaleString()} tasks
        </div>
        <div className="flex items-center gap-1.5 rounded-md border border-white/10 bg-black/40 px-2.5 py-1 text-[11px] text-white/70 backdrop-blur">
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${weather === "clear" ? "bg-yellow-400" : weather === "rain" ? "bg-blue-400" : "bg-gray-400"}`} />
          <span className="capitalize">{weather}</span>
        </div>
      </div>

      <div className="absolute right-4 top-4 flex items-center gap-3">
        <div className="flex items-center gap-1.5 rounded-md border border-white/10 bg-black/40 px-2.5 py-1 text-[11px] text-white/70 backdrop-blur">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#22c55e]" />
          {uptime}
        </div>
        <div className="rounded-md border border-white/10 bg-black/40 px-2.5 py-1 text-[11px] text-white/70 backdrop-blur">
          {taskCount.toLocaleString()} tasks
        </div>
      </div>

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
        <div className="flex items-center gap-3 rounded-md border border-white/10 bg-black/50 px-3 py-1.5 backdrop-blur">
        </div>
      </div>
    </div>
  );
}

/* ── ArenaScene ── */
export function ArenaScene({
  agents,
  liveStatus,
  liveActivity,
  agentPositions,
  uptime,
  taskCount,
  onAgentClick,
}: ArenaSceneProps) {
  const [timeOfDay, setTimeOfDay] = useState(0.25);
  const [weather] = useState<"clear" | "rain" | "fog">("clear");
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Agent position state for lerp
  const agentStates = useMemo<Record<string, { currentPos: [number, number, number]; targetPos: [number, number, number] }>>(
    () =>
      Object.fromEntries(
        agents.map((a) => [
          a.id,
          {
            currentPos: [agentPositions[a.id]?.x ?? a.x, 0, agentPositions[a.id]?.z ?? a.z] as [number, number, number],
            targetPos: [agentPositions[a.id]?.x ?? a.x, 0, agentPositions[a.id]?.z ?? a.z] as [number, number, number],
          },
        ]),
      ),
    [agents, agentPositions],
  );

  // Day/night cycle: 0–1 over 10 minutes real-time
  useFrame((_, delta) => {
    setTimeOfDay((t) => (t + delta / 600) % 1);
  });

  // Lerp agent positions toward their targets
  useFrame((_, delta) => {
    Object.values(agentStates).forEach((s) => {
      const speed = 3;
      s.currentPos[0] += (s.targetPos[0] - s.currentPos[0]) * speed * delta;
      s.currentPos[2] += (s.targetPos[2] - s.currentPos[2]) * speed * delta;
    });
  });

  // Update targets when agentPositions change
  useEffect(() => {
    Object.entries(agentPositions).forEach(([id, pos]) => {
      if (agentStates[id]) {
        agentStates[id].targetPos = [pos.x, 0, pos.z];
      }
    });
  }, [agentPositions]);

  // Sun position + sky color from timeOfDay
  const sunHeight = Math.sin(timeOfDay * Math.PI * 2) * 50 + 20;
  const sunAngle = timeOfDay * Math.PI * 2 - Math.PI / 2;
  const sunX = Math.cos(sunAngle) * 80;
  const sunZ = Math.sin(sunAngle) * 80;

  const skyColor = {
    r: timeOfDay < 0.5 ? 0.1 + 0.6 * (timeOfDay * 2) : 0.7 - 0.6 * ((timeOfDay - 0.5) * 2),
    g: timeOfDay < 0.5 ? 0.15 + 0.7 * (timeOfDay * 2) : 0.85 - 0.6 * ((timeOfDay - 0.5) * 2),
    b: timeOfDay < 0.5 ? 0.25 + 0.7 * (timeOfDay * 2) : 0.95 - 0.7 * ((timeOfDay - 0.5) * 2),
  };

  const isDay = timeOfDay > 0.2 && timeOfDay < 0.8;

  return (
    <div className="relative h-full w-full bg-[#0a0a1a]">
      <Canvas
        dpr={[1, 1.5]}
        frameloop="always"
        camera={{ position: [0, 60, 50], fov: 50 }}
        shadows
        gl={{ antialias: true, preserveDrawingBuffer: false }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x0a0a1a, 1);
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = isDay ? 1.2 : 0.8;
        }}
      >
        <color attach="background" args={[skyColor.r, skyColor.g, skyColor.b]} />

        {/* Lighting */}
        <ambientLight intensity={isDay ? 0.6 : 0.3} color={isDay ? "#ffffff" : "#4a5568"} />
        <directionalLight
          position={[sunX, sunHeight, sunZ]}
          intensity={isDay ? 1.5 : 0}
          color={isDay ? "#fff8e7" : "#4a5568"}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-left={-100}
          shadow-camera-right={100}
          shadow-camera-top={100}
          shadow-camera-bottom={-100}
          shadow-camera-near={0.1}
          shadow-camera-far={200}
          shadow-bias={-0.0001}
        />
        <pointLight position={[0, 15, 0]} intensity={isDay ? 0 : 0.8} color="#60a5fa" distance={40} decay={2} />

        {/* Zone accent lights */}
        <pointLight position={[-30, 10, -10]} intensity={0.3} color={ZONES.workstations.accentColor} distance={30} decay={2} />
        <pointLight position={[30, 10, -10]} intensity={0.3} color={ZONES.cafe.accentColor} distance={30} decay={2} />
        <pointLight position={[-30, 10, 20]} intensity={0.3} color={ZONES.playroom.accentColor} distance={30} decay={2} />
        <pointLight position={[30, 10, 20]} intensity={0.3} color={ZONES.lobby.accentColor} distance={30} decay={2} />

        {/* World terrain */}
        <World timeOfDay={timeOfDay} />

        {/* Central plaza fountain */}
        <Fountain timeOfDay={timeOfDay} isDay={isDay} />

        {agents.map((agent) => {
                  const status = liveStatus[agent.id] ?? agent.statusOverride ?? "online";
                  const activity = liveActivity[agent.id] ?? agent.activity ?? "idle";
                  const state = agentStates[agent.id];
                  const pos = state?.currentPos ?? [agent.x, 0, agent.z];

                  return (
                    <AgentBuilding
                      key={agent.id}
                      agentId={agent.id}
                      name={agent.name}
                      color={agent.color}
                      kind={agent.kind}
                      position={pos}
                      status={status}
                      activity={activity}
                      onClick={() => onAgentClick(agent)}
                    />
                  );
                })}

        {/* Info board */}
        <InfoBoard agents={agents.length} uptime={uptime} taskCount={taskCount} timeOfDay={timeOfDay} weather="clear" />

        {/* Camera controls */}
        <PerspectiveCamera makeDefault position={[0, 60, 50]} fov={50} />
        <OrbitControls
          enablePan={true}
          enableRotate={true}
          enableZoom={true}
          minDistance={20}
          maxDistance={120}
          maxPolarAngle={Math.PI / 2.5}
          autoRotate={false}
          target={[0, 0, 0]}
        />
        <ContactShadows position={[0, 0.05, 0]} opacity={0.2} scale={150} blur={10} />
      </Canvas>

      <HUD agents={agents} liveStatus={liveStatus} liveActivity={liveActivity} uptime={uptime} taskCount={taskCount} timeOfDay={timeOfDay} weather="clear" />
    </div>
  );
}