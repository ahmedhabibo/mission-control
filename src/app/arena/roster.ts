/**
 * Single source of truth for the agent roster used by the 3D Arena scene.
 * Mirrors the shape returned by `/api/chat/agents` (see `lib/discovery/agents.ts`)
 * so the Arena view and the Chat picker show the same rows.
 *
 * Phase 2+: zones define target positions per status. An agent's static
 * (x, z) is only the initial spawn — the avatar lerps to its zone target
 * based on live status.
 */

import type { AgentKind } from "@/lib/discovery/agents";

/** Re-export so arena components don't need a second import. */
export type { AgentKind };

export type AgentStatus = "online" | "degraded" | "offline" | "unknown";

/** Activity is orthogonal to gateway status — busy/idle describes the agent's current task load. */
export type AgentActivity = "idle" | "busy";

/** Zone identifiers — each maps to a physical room in the Building. */
export type ZoneId = "lobby" | "workstations" | "cafe" | "playroom";

export interface ArenaAgent {
  id: string;
  name: string;
  /** lucide-react icon name (matches getIcon() registry). */
  icon: string;
  /** Hex colour for the avatar capsule + spawn pad. */
  color: string;
  /** Origin tag — profile | cli | gateway | provider. */
  kind: AgentKind;
  /** X / Z placement in the room (units = metres) — initial spawn only. */
  x: number;
  z: number;
  /** Override the live gateway status (UI otherwise derives from /api/chat/agents). */
  statusOverride?: AgentStatus;
  /** Activity indicator — independent of status, drives spawn-pad glow / HUD busy dot. */
  activity?: AgentActivity;
  /** Profile name when kind === "profile". */
  profile?: string;
}

/**
 * Zone layout — each zone occupies a quadrant of the building.
 * The building is 32×24 (X×Z). Center doorway at (0, 0).
 *
 *   workstations  |  cafe
 *   ──────────────┼─────────
 *   playroom      |  lobby
 *
 * Agents walk to their zone based on status:
 *   online    → workstations
 *   degraded  → cafe
 *   offline   → playroom (or lobby for unknown)
 *   unknown   → lobby
 */
export interface Zone {
  id: ZoneId;
  name: string;
  /** Center of the zone in world space. */
  cx: number;
  cz: number;
  /** Zone span (for placing multiple agents in a grid). */
  span: number;
  /** Floor color for the zone. */
  floorColor: string;
  /** Accent color for walls / labels. */
  accentColor: string;
}

export const ZONES: Record<ZoneId, Zone> = {
  workstations: {
    id: "workstations",
    name: "Workstations",
    cx: -8,
    cz: -6,
    span: 8,
    floorColor: "#0f1f2e",
    accentColor: "#3b82f6",
  },
  cafe: {
    id: "cafe",
    name: "Café",
    cx: 8,
    cz: -6,
    span: 8,
    floorColor: "#1f1a0f",
    accentColor: "#f59e0b",
  },
  playroom: {
    id: "playroom",
    name: "Play Room",
    cx: -8,
    cz: 6,
    span: 8,
    floorColor: "#1a0f1f",
    accentColor: "#a855f7",
  },
  lobby: {
    id: "lobby",
    name: "Lobby",
    cx: 8,
    cz: 6,
    span: 8,
    floorColor: "#0f1a1f",
    accentColor: "#22c55e",
  },
};

/** Status → zone mapping (the rule that drives avatar movement). */
export const STATUS_ZONE: Record<AgentStatus, ZoneId> = {
  online: "workstations",
  degraded: "cafe",
  offline: "playroom",
  unknown: "lobby",
};

/** Default roster — populated from discovery in production builds via Scene. */
export const ARENA_AGENTS: ArenaAgent[] = [
  {
    id: "cli-hermes",
    name: "Hermes CLI",
    icon: "TerminalSquare",
    color: "#22c55e",
    kind: "cli",
    x: -6,
    z: -3,
  },
  {
    id: "cli-opencode",
    name: "Opencode",
    icon: "Code2",
    color: "#f59e0b",
    kind: "cli",
    x: -2,
    z: -3,
  },
  {
    id: "cli-claude",
    name: "Claude Code",
    icon: "Sparkles",
    color: "#a855f7",
    kind: "cli",
    x: 2,
    z: -3,
  },
  {
    id: "nim",
    name: "NVIDIA NIM",
    icon: "CircuitBoard",
    color: "#3b82f6",
    kind: "cli" as const,
    x: 6,
    z: -3,
  },
];

/**
 * Status → CSS variable-friendly tone bucket (gateway vocabulary).
 * Centralised so spawn-pad glow / HUD / avatar head-dot all render the same colour.
 */
export const STATUS_DOT_CLASS: Record<AgentStatus, string> = {
  online: "bg-[#22c55e]",
  degraded: "bg-[#f59e0b]",
  offline: "bg-[#6b7280]",
  unknown: "bg-[#a3a3a3]",
};

/** Hex variant — used by Three.js shaders. */
export const STATUS_HEX: Record<AgentStatus, string> = {
  online: "#22c55e",
  degraded: "#f59e0b",
  offline: "#6b7280",
  unknown: "#a3a3a3",
};

/**
 * Activity is orthogonal to gateway status: an online agent can be busy.
 * Used by the spawn-pad pulse and HUD badge.
 */
export const ACTIVITY_DOT_CLASS: Record<AgentActivity, string> = {
  idle: "bg-[#22c55e]",
  busy: "bg-[#f59e0b]",
};

export const ACTIVITY_HEX: Record<AgentActivity, string> = {
  idle: "#22c55e",
  busy: "#f59e0b",
};

/**
 * Compute an agent's target position within its zone.
 * Arranges agents in a grid pattern inside the zone's span.
 */
export function zoneTarget(
  zone: Zone,
  index: number,
  totalInZone: number,
): { x: number; z: number } {
  // Grid: 2 rows × N columns inside the zone span.
  const cols = Math.max(1, Math.ceil(Math.sqrt(totalInZone)));
  const rows = Math.ceil(totalInZone / cols);
  const col = index % cols;
  const row = Math.floor(index / cols);
  const spacingX = zone.span / Math.max(cols + 1, 2);
  const spacingZ = zone.span / Math.max(rows + 1, 2);
  return {
    x: zone.cx - (cols - 1) * spacingX * 0.5 + col * spacingX,
    z: zone.cz - (rows - 1) * spacingZ * 0.5 + row * spacingZ,
  };
}
