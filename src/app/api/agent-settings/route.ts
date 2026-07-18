/**
 * Agent settings API — per-user configuration for each discovered agent.
 *
 * Separate from `/api/settings` (which manages tool-level endpoints) because
 * agents have different config concerns: enable/disable, custom label,
 * default model, sort order.
 *
 * Storage: SQLite in `data/mission-control.db` → table `agent_settings`
 * keyed by agent id. Persists across restarts.
 */
import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { discoverAgents } from "@/lib/discovery/agents";

export const dynamic = "force-dynamic";

const MC_DB = join(process.cwd(), "data", "mission-control.db");

interface AgentSettingRow {
  agentId: string;
  enabled: boolean;
  customLabel: string | null;
  defaultModel: string | null;
  sortOrder: number;
  notes: string | null;
}

function ensureAgentSettingsTable(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_settings (
      agent_id TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 1,
      custom_label TEXT,
      default_model TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );
  `);
}

/** GET /api/agent-settings — returns merged config (discovered + DB overrides). */
export async function GET() {
  const discovered = await discoverAgents();

  if (!existsSync(MC_DB)) {
    return NextResponse.json({
      settings: discovered.map((a) => ({
        agentId: a.id,
        name: a.name,
        kind: a.kind,
        enabled: true,
        customLabel: null,
        defaultModel: a.defaultModel ?? null,
        sortOrder: 0,
        notes: null,
        available: a.live,
      })),
    });
  }

  const db = new Database(MC_DB);
  ensureAgentSettingsTable(db);
  const rows = db
    .prepare(`SELECT * FROM agent_settings`)
    .all() as Array<{
      agent_id: string;
      enabled: number;
      custom_label: string | null;
      default_model: string | null;
      sort_order: number;
      notes: string | null;
    }>;
  db.close();

  const overrides = new Map(
    rows.map((r) => [
      r.agent_id,
      {
        agentId: r.agent_id,
        enabled: !!r.enabled,
        customLabel: r.custom_label,
        defaultModel: r.default_model,
        sortOrder: r.sort_order ?? 0,
        notes: r.notes,
      },
    ]),
  );

  const settings = discovered
    .map((a) => {
      const ov = overrides.get(a.id);
      return {
        agentId: a.id,
        name: ov?.customLabel ?? a.name,
        kind: a.kind,
        enabled: ov?.enabled ?? true,
        customLabel: ov?.customLabel ?? null,
        defaultModel: ov?.defaultModel ?? a.defaultModel ?? null,
        sortOrder: ov?.sortOrder ?? 0,
        notes: ov?.notes ?? null,
        available: a.live,
        description: a.description,
      };
    })
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return NextResponse.json({ settings });
}

/** PUT /api/agent-settings — upsert config for an agent. */
export async function PUT(request: Request) {
  const body = (await request.json()) as {
    agentId?: string;
    enabled?: boolean;
    customLabel?: string | null;
    defaultModel?: string | null;
    sortOrder?: number;
    notes?: string | null;
    agentIds?: string[]; // for bulk reorder
  };

  if (!existsSync(MC_DB)) {
    return NextResponse.json({ error: "Database not initialized" }, { status: 503 });
  }
  const db = new Database(MC_DB);
  ensureAgentSettingsTable(db);

  // Bulk reorder
  if (Array.isArray(body.agentIds)) {
    const stmt = db.prepare(
      `UPDATE agent_settings SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE agent_id = ?`,
    );
    body.agentIds.forEach((id, idx) => stmt.run(idx, id));
    db.close();
    return NextResponse.json({ ok: true });
  }

  if (!body.agentId) {
    db.close();
    return NextResponse.json({ error: "agentId required" }, { status: 400 });
  }

  db.prepare(
    `INSERT INTO agent_settings (agent_id, enabled, custom_label, default_model, sort_order, notes, updated_at)
     VALUES (?, ?, ?, ?, COALESCE((SELECT sort_order FROM agent_settings WHERE agent_id = ?), 0), ?, CURRENT_TIMESTAMP)
     ON CONFLICT(agent_id) DO UPDATE SET
       enabled = excluded.enabled,
       custom_label = excluded.custom_label,
       default_model = excluded.default_model,
       notes = excluded.notes,
       updated_at = CURRENT_TIMESTAMP`,
  ).run(
    body.agentId,
    body.enabled === undefined ? 1 : body.enabled ? 1 : 0,
    body.customLabel ?? null,
    body.defaultModel ?? null,
    body.agentId,
    body.notes ?? null,
  );

  db.close();
  return NextResponse.json({ ok: true });
}

/** DELETE /api/agent-settings?agentId=&resetToDefaults=1 — clear override. */
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const agentId = searchParams.get("agentId");
  if (!agentId || !existsSync(MC_DB)) {
    return NextResponse.json({ error: "agentId required" }, { status: 400 });
  }
  const db = new Database(MC_DB);
  ensureAgentSettingsTable(db);
  db.prepare(`DELETE FROM agent_settings WHERE agent_id = ?`).run(agentId);
  db.close();
  return NextResponse.json({ ok: true });
}
