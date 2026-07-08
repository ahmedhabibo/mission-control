import { NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db/client";
import { toolOverrides } from "@/lib/db/schema";
import { TOOLS } from "@/config/tools.config";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * Settings API — manage per-tool overrides.
 *
 * GET  /api/settings        → effective config for every tool (registry + DB)
 * PUT  /api/settings        → { toolId, enabled?, endpointOverride? }
 *
 * Note: secrets (API keys, bot tokens) are NEVER stored here — they live in
 * .env.local and are referenced by name in the tool config. The endpoint
 * override here is only for non-secret base URLs/containers the user wants
 * to tweak without editing code.
 */

export async function GET() {
  ensureSchema();
  const rows = db.select().from(toolOverrides).all();
  const byId = new Map(rows.map((r) => [r.toolId, r]));

  const tools = TOOLS.map((t) => {
    const ov = byId.get(t.id);
    return {
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.category,
      deployment: t.deployment,
      enabled: ov ? ov.enabled : (t.enabled ?? true),
      // Which env vars this tool reads (for the "needs setup" hints in the UI).
      requiredEnv: collectRequiredEnv(t),
      hasEndpointOverride: Boolean(ov?.endpointOverride),
      endpointOverride: ov?.endpointOverride ?? null,
    };
  });

  return NextResponse.json({ tools });
}

export async function PUT(request: Request) {
  const body = (await request.json()) as {
    toolId: string;
    enabled?: boolean;
    endpointOverride?: string | null;
  };

  if (!TOOLS.some((t) => t.id === body.toolId)) {
    return NextResponse.json({ error: "Unknown tool" }, { status: 400 });
  }

  const existing = db
    .select()
    .from(toolOverrides)
    .where(eq(toolOverrides.toolId, body.toolId))
    .all()[0];

  const enabled = body.enabled ?? existing?.enabled ?? true;
  const endpointOverride =
    body.endpointOverride === null ? null : (body.endpointOverride ?? existing?.endpointOverride ?? null);

  db.insert(toolOverrides)
    .values({ toolId: body.toolId, enabled, endpointOverride })
    .onConflictDoUpdate({
      target: toolOverrides.toolId,
      set: { enabled, endpointOverride, updatedAt: new Date().toISOString() },
    })
    .run();

  return NextResponse.json({ ok: true, toolId: body.toolId, enabled, endpointOverride });
}

/** Walk a tool's probe(s) to list every env var it references. */
function collectRequiredEnv(tool: (typeof TOOLS)[number]): string[] {
  const probe = tool.probe;
  const collect = (p: typeof probe): string[] => {
    switch (p.type) {
      case "http":
        return p.requiresEnv ?? [];
      case "gateway":
        // Gateway probes need MC_GATEWAY_URL + MC_GATEWAY_TOKEN, which are
        // description-level rather than per-tool, so they don't show up here
        // for any individual tool. Surface them once globally in EnvHint.
        return [];
      case "cli":
      case "composite":
        return collectHttpEnv(p);
    }
  };
  return [...new Set(collect(probe))];
}

/** Helper for probe trees that may contain http children. */
function collectHttpEnv(probe: unknown): string[] {
  if (typeof probe !== "object" || probe === null) return [];
  const rec = probe as { components?: unknown[] };
  if (!Array.isArray(rec.components)) return [];
  const out: string[] = [];
  for (const c of rec.components) {
    if (c && typeof c === "object" && "type" in c) {
      const child = c as { type: string; requiresEnv?: string[] };
      if (child.type === "http") out.push(...(child.requiresEnv ?? []));
    }
  }
  return out;
}
