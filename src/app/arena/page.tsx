"use client";

/**
 * Arena — pure SVG isometric city ("Hermes Agora" style).
 * No WebGL, no Three.js. Just SVG polygons drawn at projected
 * screen coordinates.
 *
 * Auto-discovers ALL agents from /api/chat/agents and places each
 * in a zone based on its live health status:
 *   online → Workstations, degraded → Café,
 *   offline → Play Room, unknown → Lobby
 */

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";

import type { ArenaAgent, AgentStatus } from "./roster";
import {
  ARENA_AGENTS,
  STATUS_HEX,
  STATUS_ZONE,
  zoneTarget,
  ZONES,
} from "./roster";

const AgentHistoryPanelClient = dynamic(
  () =>
    import("@/components/arena/AgentHistoryPanel").then(
      (m) => m.AgentHistoryPanel,
    ),
  { ssr: false, loading: () => null },
);

interface ApiAgent {
  id: string;
  name: string;
  kind: "profile" | "cli" | "gateway" | "chat" | "mcp";
  healthStatus?: AgentStatus;
}

type Weather = "clear" | "rain" | "fog";

const TILE_W = 32;
const TILE_H = 16;

/* Distinct colour per kind so the city looks varied, not all-green. */
const KIND_COLOR: Record<ApiAgent["kind"], string> = {
  chat: "#3b82f6",
  gateway: "#a855f7",
  profile: "#ec4899",
  cli: "#22c55e",
  mcp: "#f59e0b",
};

/* Roster agents keep their explicit colour; API-discovered extras get kind colour. */
const ROSTER_COLORByID: Record<string, string> = Object.fromEntries(
  ARENA_AGENTS.map((a) => [a.id, a.color]),
);

function iso(x: number, z: number, y = 0) {
  return {
    x: (x - z) * (TILE_W / 2),
    y: (x + z) * (TILE_H / 2) - y * (TILE_H / 2),
  };
}

function hexA(hex: string, a: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

export default function ArenaPage() {
  const [liveStatus, setLiveStatus] = useState<Record<string, AgentStatus>>({});
  const [apiAgents, setApiAgents] = useState<ApiAgent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<ArenaAgent | null>(null);
  const [weather, setWeather] = useState<Weather>("clear");
  const [now, setNow] = useState<Date | null>(null);
  const [taskCount, setTaskCount] = useState(0);
  const [liveCount, setLiveCount] = useState(0);

  /* Poll every 5s — agents + tasks */
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      try {
        const [a, t] = await Promise.all([
          fetch("/api/chat/agents", { cache: "no-store" }),
          fetch("/api/tasks", { cache: "no-store" }),
        ]);
        if (cancelled) return;
        if (a.ok) {
          const d = (await a.json()) as { agents: ApiAgent[] };
          const m: Record<string, AgentStatus> = {};
          let lc = 0;
          for (const ag of d.agents) {
            if (ag.healthStatus) m[ag.id] = ag.healthStatus;
            if (ag.healthStatus === "online") lc++;
          }
          setApiAgents(d.agents);
          setLiveStatus(m);
          setLiveCount(lc);
        }
        if (t.ok) {
          const d = (await t.json()) as { tasks: unknown[] };
          setTaskCount(d.tasks?.length ?? 0);
        }
      } catch {
        /* network blip */
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

  /* Clock for HUD */
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  /* Merge roster + discovered agents. Roster ids win (preserve custom colours).
     Any discovered agent not in roster becomes a placeholder ArenaAgent. */
  const allAgents = useMemo<ArenaAgent[]>(() => {
    const seen = new Set<string>();
    const merged: ArenaAgent[] = [];

    // 1. Known roster agents first
    for (const r of ARENA_AGENTS) {
      const api = apiAgents.find((a) => a.id === r.id);
      merged.push({
        ...r,
        name: api?.name ?? r.name,
      });
      seen.add(r.id);
    }

    // 2. Placeholder agents for every discovered id not in roster
    for (const a of apiAgents) {
      if (seen.has(a.id)) continue;
      merged.push({
        id: a.id,
        name: a.name,
        icon: "Bot",
        color: KIND_COLOR[a.kind] ?? "#a3a3a3",
        kind: (a.kind === "chat" ? "gateway" : a.kind) as unknown as ArenaAgent["kind"],
        x: 0,
        z: 0,
      });
      seen.add(a.id);
    }

    return merged;
  }, [apiAgents]);

  /* Place each agent into its status zone. ZONE_TARGETS gives stable
     per-zone grid positions; we just assign agents to those slots. */
  const placed = useMemo(() => {
    const counts: Record<string, number> = {
      workstations: 0,
      cafe: 0,
      playroom: 0,
      lobby: 0,
    };

    return allAgents.map((agent) => {
      const status = liveStatus[agent.id] ?? "unknown";
      const zoneId = STATUS_ZONE[status];
      const i = counts[zoneId];
      counts[zoneId]++;
      // Pass the total (with padding) so grid stays steady as agents shift zones
      const target = zoneTarget(
        ZONES[zoneId],
        i,
        Math.max(counts[zoneId] + 2, 6),
      );
      return { agent, status, zoneId, target };
    });
  }, [allAgents, liveStatus]);

  /* Sort by depth so SVG paints back-to-front (cleaner overlaps) */
  const placedSorted = useMemo(() => {
    return [...placed].sort((a, b) => {
      const da = a.target.x + a.target.z;
      const db = b.target.x + b.target.z;
      return da - db;
    });
  }, [placed]);

  /* Compute SVG viewBox to fit geometry */
  const viewBox = useMemo(() => {
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    const scan = (x: number, z: number, y = 0) => {
      const p = iso(x, z, y);
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    };
    for (let x = -22; x <= 22; x++)
      for (let z = -22; z <= 22; z++) scan(x, z);
    placed.forEach((p) => scan(p.target.x, p.target.z, 4));
    return {
      x: minX - 50,
      y: minY - 50,
      w: maxX - minX + 100,
      h: maxY - minY + 100,
    };
  }, [placed]);

  const timeStr = now
    ? now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "—";

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#0a0a1a]">
      <SkyLayer />
      {weather === "rain" && <RainLayer />}
      {weather === "fog" && <FogLayer />}

      <div className="absolute inset-0 pt-14">
        <svg
          viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
          className="h-full w-full"
          preserveAspectRatio="xMidYMid meet"
          style={{ filter: "drop-shadow(0 4px 6px rgba(0,0,0,0.4))" }}
        >
          <GroundGrid />
          <Roads />
          {(["workstations", "cafe", "playroom", "lobby"] as const).map((z) => (
            <ZoneSlab key={z} zoneId={z} />
          ))}
          <Fountain />
          {placedSorted.map((p) => (
            <Building
              key={p.agent.id}
              agent={p.agent}
              status={p.status}
              target={p.target}
              onClick={() => setSelectedAgent(p.agent)}
            />
          ))}
        </svg>
      </div>

      <HUD
        uptime={`${liveCount} live`}
        taskCount={taskCount}
        agentCount={allAgents.length}
        now={timeStr}
        weather={weather}
        onWeatherChange={setWeather}
      />

      {selectedAgent && (
        <div className="absolute right-4 top-20 z-30 w-80 max-w-[90vw]">
          <AgentHistoryPanelClient
            agent={selectedAgent}
            liveStatus={liveStatus[selectedAgent.id]}
            onClose={() => setSelectedAgent(null)}
          />
        </div>
      )}
    </div>
  );
}

/* ── Ground grid ── */
function GroundGrid() {
  const cells = [];
  for (let x = -20; x <= 20; x += 2) {
    for (let z = -20; z <= 20; z += 2) {
      const a = iso(x, z);
      const b = iso(x + 2, z);
      const c = iso(x + 2, z + 2);
      const d = iso(x, z + 2);
      const parity = ((x + z) / 2) % 2;
      cells.push(
        <polygon
          key={`${x}-${z}`}
          points={`${a.x},${a.y} ${b.x},${b.y} ${c.x},${c.y} ${d.x},${d.y}`}
          fill={parity === 0 ? "#142b22" : "#16352a"}
          stroke="rgba(255,255,255,0.025)"
          strokeWidth={0.5}
        />,
      );
    }
  }
  return <g opacity={0.95}>{cells}</g>;
}

/* ── Roads — cross shape ── */
function Roads() {
  const r1 = [iso(-20, -1), iso(20, -1), iso(20, 1), iso(-20, 1)];
  const r2 = [iso(-1, -20), iso(1, -20), iso(1, 20), iso(-1, 20)];
  return (
    <g>
      <polygon
        points={r1.map((p) => `${p.x},${p.y}`).join(" ")}
        fill="#2a2a30"
        stroke="#3a3a40"
        strokeWidth={0.5}
      />
      <polygon
        points={r2.map((p) => `${p.x},${p.y}`).join(" ")}
        fill="#2a2a30"
        stroke="#3a3a40"
        strokeWidth={0.5}
      />
      <line
        x1={iso(-18, 0).x}
        y1={iso(-18, 0).y}
        x2={iso(18, 0).x}
        y2={iso(18, 0).y}
        stroke="#fde68a"
        strokeWidth={0.4}
        strokeDasharray="3 2"
      />
      <line
        x1={iso(0, -18).x}
        y1={iso(0, -18).y}
        x2={iso(0, 18).x}
        y2={iso(0, 18).y}
        stroke="#fde68a"
        strokeWidth={0.4}
        strokeDasharray="3 2"
      />
    </g>
  );
}

/* ── Zone slab (raised platform) ── */
function ZoneSlab({
  zoneId,
}: {
  zoneId: "workstations" | "cafe" | "playroom" | "lobby";
}) {
  const z = ZONES[zoneId];
  const x0 = z.cx - 7;
  const x1 = z.cx + 7;
  const z0 = z.cz - 7;
  const z1 = z.cz + 7;
  const h = 0.5;
  const top = [
    iso(x0, z0, h),
    iso(x1, z0, h),
    iso(x1, z1, h),
    iso(x0, z1, h),
  ];
  const left = [
    iso(x0, z0, h),
    iso(x0, z1, h),
    iso(x0, z1, 0),
    iso(x0, z0, 0),
  ];
  const right = [
    iso(x0, z1, h),
    iso(x1, z1, h),
    iso(x1, z1, 0),
    iso(x0, z1, 0),
  ];
  const labelPos = iso(z.cx, z.cz - 6.5, h + 1.5);

  return (
    <g>
      <polygon
        points={right.map((p) => `${p.x},${p.y}`).join(" ")}
        fill={hexA(z.accentColor, 0.25)}
      />
      <polygon
        points={left.map((p) => `${p.x},${p.y}`).join(" ")}
        fill={hexA(z.accentColor, 0.4)}
      />
      <polygon
        points={top.map((p) => `${p.x},${p.y}`).join(" ")}
        fill={hexA(z.accentColor, 0.18)}
        stroke={hexA(z.accentColor, 0.7)}
        strokeWidth={0.8}
      />
      <text
        x={labelPos.x}
        y={labelPos.y}
        fontSize={6}
        fontFamily="monospace"
        fontWeight="bold"
        textAnchor="middle"
        fill={z.accentColor}
        style={{ letterSpacing: "0.1em" }}
      >
        {z.name.toUpperCase()}
      </text>
    </g>
  );
}

/* ── Central fountain ── */
function Fountain() {
  const r = 2.5;
  const a = iso(-r, 0, 0.3);
  const b = iso(0, -r, 0.3);
  const c = iso(r, 0, 0.3);
  const d = iso(0, r, 0.3);
  const spray = (y: number, radius: number, color: string) => {
    const p = [
      iso(0, -radius, y),
      iso(radius, 0, y),
      iso(0, radius, y),
      iso(-radius, 0, y),
    ];
    return (
      <polygon
        key={y}
        points={p.map((p) => `${p.x},${p.y}`).join(" ")}
        fill={color}
      />
    );
  };
  return (
    <g>
      <polygon
        points={`${a.x},${a.y} ${b.x},${b.y} ${c.x},${c.y} ${d.x},${d.y}`}
        fill="#1e3a8a"
        stroke="#3b82f6"
        strokeWidth={0.6}
      />
      {spray(0.7, 1.9, "rgba(147,197,253,0.55)")}
      {spray(1.1, 1.4, "rgba(147,197,253,0.45)")}
      {spray(1.5, 1.0, "rgba(191,219,254,0.35)")}
    </g>
  );
}

/* ── Building with windows, sign, beacon, click handler ── */
function Building({
  agent,
  status,
  target,
  onClick,
}: {
  agent: ArenaAgent;
  status: AgentStatus;
  target: { x: number; z: number };
  onClick: () => void;
}) {
  const fx = target.x;
  const fz = target.z;
  const size = 1.4;
  const storeys =
    status === "online" ? 3 : status === "degraded" ? 2 : status === "offline" ? 1 : 2;
  const storyH = 1.0;
  const color = ROSTER_COLORByID[agent.id] ?? agent.color ?? STATUS_HEX[status];

  const x0 = fx - size;
  const x1 = fx + size;
  const z0 = fz - size;
  const z1 = fz + size;
  const yTop = storeys * storyH;

  const top = [
    iso(x0, fz, yTop),
    iso(fx, z0, yTop),
    iso(x1, fz, yTop),
    iso(fx, z1, yTop),
  ];
  const left = [
    iso(x0, fz, yTop),
    iso(fx, z1, yTop),
    iso(fx, z1, 0),
    iso(x0, fz, 0),
  ];
  const right = [
    iso(fx, z1, yTop),
    iso(x1, fz, yTop),
    iso(x1, fz, 0),
    iso(fx, z1, 0),
  ];

  const signPos = iso(fx, fz - size - 0.3, yTop + 1.2);
  const beaconPos = iso(fx, fz - 0.5, yTop + 0.8);
  const pulse = status === "degraded";

  return (
    <g
      className="cursor-pointer transition-opacity hover:opacity-100"
      style={{ opacity: 0.96 }}
      onClick={onClick}
    >
      <polygon
        points={right.map((p) => `${p.x},${p.y}`).join(" ")}
        fill={hexA(color, 0.85)}
        stroke={hexA(color, 1)}
        strokeWidth={0.5}
      />
      <polygon
        points={left.map((p) => `${p.x},${p.y}`).join(" ")}
        fill={hexA(color, 0.55)}
        stroke={hexA(color, 0.9)}
        strokeWidth={0.5}
      />
      {/* Right-wall windows — 2 per storey */}
      {Array.from({ length: storeys }).map((_, s) => {
        const wy = s * storyH + storyH * 0.5;
        const wArr = [];
        for (let i = 0; i < 2; i++) {
          const wx = fx - size * 0.5 + i * size;
          const wz = z1 - 0.2;
          const winW = 0.3;
          const winH = 0.4;
          const wTopL = iso(wx - winW / 2, wz, wy + winH / 2);
          const wTopR = iso(wx + winW / 2, wz, wy + winH / 2);
          const wBotR = iso(wx + winW / 2, wz, wy - winH / 2);
          const wBotL = iso(wx - winW / 2, wz, wy - winH / 2);
          const lit =
            status === "online" ? i % 2 === 0 || (s + i) % 3 === 0 : false;
          wArr.push(
            <polygon
              key={`${s}-${i}`}
              points={`${wTopL.x},${wTopL.y} ${wTopR.x},${wTopR.y} ${wBotR.x},${wBotR.y} ${wBotL.x},${wBotL.y}`}
              fill={lit ? "#fde68a" : "rgba(15,23,42,0.85)"}
            />,
          );
        }
        return <g key={s}>{wArr}</g>;
      })}
      {/* Left-wall windows */}
      {Array.from({ length: storeys }).map((_, s) => {
        const wy = s * storyH + storyH * 0.5;
        const wArr = [];
        for (let i = 0; i < 2; i++) {
          const wx = x0 + 0.2;
          const wz = fz - size * 0.5 + i * size;
          const winW = 0.3;
          const winH = 0.4;
          const wTopL = iso(wx, wz - winW / 2, wy + winH / 2);
          const wTopR = iso(wx, wz + winW / 2, wy + winH / 2);
          const wBotR = iso(wx, wz + winW / 2, wy - winH / 2);
          const wBotL = iso(wx, wz - winW / 2, wy - winH / 2);
          const lit = status === "online" && (i + s) % 2 === 0;
          wArr.push(
            <polygon
              key={`${s}-${i}`}
              points={`${wTopL.x},${wTopL.y} ${wTopR.x},${wTopR.y} ${wBotR.x},${wBotR.y} ${wBotL.x},${wBotL.y}`}
              fill={lit ? "#fde68a" : "rgba(15,23,42,0.75)"}
            />,
          );
        }
        return <g key={s}>{wArr}</g>;
      })}
      <polygon
        points={top.map((p) => `${p.x},${p.y}`).join(" ")}
        fill={hexA(color, 0.4)}
        stroke={hexA(color, 0.8)}
        strokeWidth={0.6}
      />
      {/* Sign */}
      <rect
        x={signPos.x - 22}
        y={signPos.y - 5}
        width={44}
        height={10}
        rx={2}
        fill="rgba(15,23,42,0.95)"
        stroke={hexA(color, 0.7)}
        strokeWidth={0.5}
      />
      <text
        x={signPos.x}
        y={signPos.y + 2.5}
        fontSize={5}
        fontFamily="monospace"
        fontWeight="bold"
        textAnchor="middle"
        fill={color}
        style={{ letterSpacing: "0.05em" }}
      >
        {agent.name.length > 12 ? agent.name.slice(0, 12) + "…" : agent.name}
      </text>
      {/* Beacon */}
      <circle
        cx={beaconPos.x}
        cy={beaconPos.y}
        r={3.5}
        fill={STATUS_HEX[status]}
        style={
          pulse
            ? {
                animation: "beaconPulse 1s infinite",
                transformOrigin: `${beaconPos.x}px ${beaconPos.y}px`,
              }
            : undefined
        }
      />
      <circle
        cx={beaconPos.x}
        cy={beaconPos.y}
        r={1.6}
        fill="rgba(255,255,255,0.85)"
      />
      <style>{`
        @keyframes beaconPulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50%      { transform: scale(1.7); opacity: 0.6; }
        }
      `}</style>
    </g>
  );
}

/* ── HUD ── */
function HUD({
  uptime,
  taskCount,
  agentCount,
  now,
  weather,
  onWeatherChange,
}: {
  uptime: string;
  taskCount: number;
  agentCount: number;
  now: string;
  weather: Weather;
  onWeatherChange: (w: Weather) => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex items-end justify-between px-4">
      <div className="pointer-events-auto rounded-md border border-white/10 bg-black/65 px-3 py-1.5 backdrop-blur">
        <span className="inline-block h-2 w-2 rounded-full bg-[#22c55e]" />{" "}
        <span className="ml-1 text-xs text-white/80">{uptime}</span>
        <span className="ml-3 text-xs text-white/60">{agentCount} agents</span>
        <span className="ml-3 text-xs text-white/60">{taskCount} tasks</span>
        <span className="ml-3 font-mono text-xs text-white/70">{now}</span>
      </div>
      <div className="pointer-events-auto flex items-center gap-1 rounded-md border border-white/10 bg-black/65 p-1 backdrop-blur">
        {(["clear", "rain", "fog"] as const).map((w) => (
          <button
            key={w}
            type="button"
            onClick={() => onWeatherChange(w)}
            className={`rounded px-2 py-1 text-[10px] uppercase tracking-widest transition-colors ${
              weather === w
                ? "bg-[#6366f1] text-white"
                : "text-white/60 hover:text-white"
            }`}
          >
            {w}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Sky ── */
function SkyLayer() {
  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{
        background:
          "linear-gradient(180deg, #0a0a1a 0%, #0f172a 30%, #1e293b 55%, #312e81 78%, #6366f1 92%, #fde68a 100%)",
      }}
    />
  );
}

/* ── Rain ── */
function RainLayer() {
  const drops = useMemo(
    () =>
      Array.from({ length: 60 }, (_, i) => ({
        x: (i * 13) % 100,
        delay: ((i % 11) * 0.15).toFixed(2),
        h: 12 + (i % 5) * 4,
      })),
    [],
  );
  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{ background: "rgba(30,41,59,0.35)", zIndex: 25 }}
    >
      {drops.map((d, i) => (
        <div
          key={i}
          className="absolute"
          style={{
            left: `${d.x}%`,
            top: "-5%",
            width: 1,
            height: d.h,
            background:
              "linear-gradient(180deg, transparent, rgba(180,200,255,0.6))",
            animation: `rainFall 1.0s linear ${d.delay}s infinite`,
          }}
        />
      ))}
      <style>{`
        @keyframes rainFall {
          0%   { transform: translateY(0vh); opacity: 0; }
          10%  { opacity: 1; }
          100% { transform: translateY(110vh); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

/* ── Fog ── */
function FogLayer() {
  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{
        background:
          "radial-gradient(ellipse at center 60%, rgba(255,255,255,0.45), rgba(220,220,230,0.35))",
        animation: "fogDrift 30s ease-in-out infinite",
        zIndex: 25,
      }}
    >
      <style>{`
        @keyframes fogDrift {
          0%, 100% { transform: translateX(-2%); }
          50%      { transform: translateX(2%); }
        }
      `}</style>
    </div>
  );
}
