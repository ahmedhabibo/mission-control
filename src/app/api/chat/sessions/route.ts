/**
 * Session auto-pull — returns past conversations for a discovered agent.
 *
 * Each agent kind maps to a different on-disk location:
 *   - "profile" → `~/.hermes/profiles/<name>/sessions/sessions.db` (SQLite, schema v1)
 *   - "cli"     → no on-disk store; return []
 *   - "gateway" → forwards to `GET {gatewayUrl}/v1/agents/<id>/sessions`
 *   - "provider" → no on-disk store; returns []
 *
 * Mission Control's own SQLite acts as the unified inbox — if a Hermes
 * profile has been integrated before, its conversations are already there
 * in `data/mission-control.db`. We always merge.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import Database from "better-sqlite3";
import { NextResponse } from "next/server";


import { discoverAgents } from "@/lib/discovery/agents";

export const dynamic = "force-dynamic";

interface SessionRow {
  id: string;
  title: string;
  agentId: string;
  agentName: string;
  agentKind: string;
  agentProfile?: string;
  source: "local" | "missionctl" | "gateway";
  messageCount: number;
  lastActivityAt: string | null;
  url?: string;
}

const HERMES_ROOT = join(homedir(), ".hermes");
const MISSIO_DB = join(process.cwd(), "data", "mission-control.db");

/* ────────────────────────────────────────────────────────────────
 * Hermes profile sessions stored in ~/.hermes/profiles/<name>/sessions/
 * Schema (v1):
 *   sessions(id TEXT PK, title TEXT, created_at INT, updated_at INT)
 *   messages(id INT PK, session_id TEXT, role TEXT, content TEXT,
 *             ts INT, prompt_tokens INT, completion_tokens INT)
 * ──────────────────────────────────────────────────────────────── */

interface HermesSessionRow {
  id: string;
  title: string;
  updated_at: number;
}

function pullHermesProfileSessions(profileName: string, agentId: string, agentName: string): SessionRow[] {
  // Try a few common locations
  const candidates = [
    join(HERMES_ROOT, "profiles", profileName, "sessions", "sessions.db"),
    join(HERMES_ROOT, "profiles", profileName, "state.db"),
    join(HERMES_ROOT, "profiles", profileName, "sessions.db"),
  ];

  let rows: SessionRow[] = [];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    try {
      const db = new Database(path, { readonly: true, fileMustExist: true });
      const sessions = db
        .prepare(
          `SELECT id, title, updated_at FROM sessions ORDER BY updated_at DESC LIMIT 50`,
        )
        .all() as HermesSessionRow[];
      const counts = db
        .prepare(
          `SELECT session_id, COUNT(*) AS n FROM messages GROUP BY session_id`,
        )
        .all() as { session_id: string; n: number }[];
      const countMap = new Map(counts.map((c) => [c.session_id, c.n]));
      rows = sessions.map((s) => ({
        id: `${agentId}:${s.id}`,
        title: s.title || "Untitled chat",
        agentId,
        agentName,
        agentKind: "profile",
        agentProfile: profileName,
        source: "local",
        messageCount: countMap.get(s.id) ?? 0,
        lastActivityAt: new Date(s.updated_at * 1000).toISOString(),
        url: `/chat?agentId=${encodeURIComponent(agentId)}&resumeSession=${encodeURIComponent(s.id)}`,
      }));
      db.close();
      break;
    } catch {
      continue;
    }
  }
  return rows;
}

/* ────────────────────────────────────────────────────────────────
 * Mission Control's own conversation store — the unified inbox.
 * ──────────────────────────────────────────────────────────────── */

interface MissionRow {
  id: string;
  title: string;
  agentId: string;
  updatedAt: string;
  messages: number;
}

function pullMissionControlSessions(agentIdFilter?: string): SessionRow[] {
  if (!existsSync(MISSIO_DB)) return [];
  try {
    const db = new Database(MISSIO_DB, { readonly: true, fileMustExist: true });
    // Filter by agent_id when the caller asked for a specific agent.
    const whereClause = agentIdFilter
      ? `WHERE title IS NOT NULL AND title <> '' AND (agent_id = ? OR agent_id = ?)`
      : `WHERE title IS NOT NULL AND title <> ''`;
    const params: unknown[] = agentIdFilter
      ? [agentIdFilter, agentIdFilter.replace(/^cli-/, "")]
      : [];
    const conversations = db
      .prepare(
        `SELECT id, title, agent_id, updated_at, (SELECT COUNT(*) FROM messages WHERE conversation_id = conversations.id) AS messages
         FROM conversations ${whereClause}
         ORDER BY updated_at DESC LIMIT 80`,
      )
      .all(...params) as MissionRow[];
    db.close();

    return conversations.map((c) => ({
      id: `mc:${c.id}`,
      title: c.title,
      agentId: c.agentId,
      agentName: c.agentId,
      agentKind: "missionctl",
      source: "missionctl",
      messageCount: c.messages,
      lastActivityAt: c.updatedAt,
      url: `/chat/${encodeURIComponent(c.id)}`,
    }));
  } catch {
    return [];
  }
}

/* ────────────────────────────────────────────────────────────────
 * Gateway-supplied sessions (if MC_GATEWAY_URL is set).
 * ──────────────────────────────────────────────────────────────── */

async function pullGatewaySessions(agentId: string, agentName: string): Promise<SessionRow[]> {
  const url = process.env.MC_GATEWAY_URL;
  const token = process.env.MC_GATEWAY_TOKEN;
  if (!url || !token) return [];
  try {
    const res = await fetch(
      `${url.replace(/\/$/, "")}/v1/agents/${encodeURIComponent(agentId)}/sessions`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(3000),
        cache: "no-store",
      },
    );
    if (!res.ok) return [];
    const json = (await res.json()) as { sessions?: { id: string; title: string; updatedAt?: string; messages?: number }[] };
    return (json.sessions ?? []).map((s) => ({
      id: `gw:${agentId}:${s.id}`,
      title: s.title || "Untitled chat",
      agentId,
      agentName,
      agentKind: "gateway",
      source: "gateway",
      messageCount: s.messages ?? 0,
      lastActivityAt: s.updatedAt ?? null,
      url: `/chat?agentId=${encodeURIComponent(agentId)}&gatewaySession=${encodeURIComponent(s.id)}`,
    }));
  } catch {
    return [];
  }
}

/* ────────────────────────────────────────────────────────────────
 * GET /api/chat/sessions?agentId=<id>
 *   Optional: ?include=all returns sessions for every agent.
 * ──────────────────────────────────────────────────────────────── */

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const agentIdParam = searchParams.get("agentId");
  const includeAll = searchParams.get("include") === "all";

  const allAgents = await discoverAgents();
  const agents = agentIdParam
    ? allAgents.filter((a) => a.id === agentIdParam)
    : includeAll
      ? allAgents
      : allAgents.slice(0, 1); // current default agent

  const sessions: SessionRow[] = [];
  // Only include missionctl conversations scoped to the queried agent when
  // filtering is requested; include them all when `?include=all`.
  if (!agentIdParam) {
    sessions.push(...pullMissionControlSessions());
  } else {
    sessions.push(...pullMissionControlSessions(agentIdParam));
  }

  for (const agent of agents) {
    if (agent.kind === "profile" && agent.profile) {
      sessions.push(
        ...pullHermesProfileSessions(agent.profile, agent.id, agent.name),
      );
    } else if (agent.kind === "gateway") {
      const gatewayAgentId = agent.id.replace(/^gw-/, "");
      const gw = await pullGatewaySessions(gatewayAgentId, agent.name);
      sessions.push(...gw);
    }
    // cli + provider kinds have no on-disk store.
  }

  sessions.sort((a, b) => {
    const ta = a.lastActivityAt ? Date.parse(a.lastActivityAt) : 0;
    const tb = b.lastActivityAt ? Date.parse(b.lastActivityAt) : 0;
    return tb - ta;
  });

  return NextResponse.json(
    {
      sessions,
      agents: agents.map((a) => ({ id: a.id, name: a.name, kind: a.kind })),
      meta: {
        returnedSessions: sessions.length,
        agentsScanned: agents.length,
        scannedAt: new Date().toISOString(),
      },
    },
    { headers: { "Cache-Control": "no-store, must-revalidate" } },
  );
}
