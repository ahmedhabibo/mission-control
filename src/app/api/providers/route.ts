/**
 * /api/providers — CRUD for the Paseo-style provider config in
 * `data/providers.json`. Used by the Settings → Providers tab.
 *
 *   GET    /api/providers              → list all entries (builtins + user)
 *   POST   /api/providers              → create or update an entry by id
 *   PATCH  /api/providers?id=<id>      → partial update of one entry
 *   DELETE /api/providers?id=<id>      → remove a user-defined entry
 *                                        (builtins can only be disabled, not deleted)
 */

import { NextResponse } from "next/server";
import {
  readUserConfig,
  writeUserConfig,
  resolveProviders,
} from "@/lib/providers/config";
import { PROVIDER_ID_RE } from "@/lib/providers/schema";

export const dynamic = "force-dynamic";

const BUILTIN_IDS = new Set(["openai-compat", "nim", "mistral-direct", "hermes"]);

/** GET /api/providers — builtins + user overrides resolved together. */
export async function GET() {
  const providers = resolveProviders().map((p) => ({
    id: p.id,
    extends: p.extends,
    label: p.label,
    icon: p.icon ?? "Plug",
    description: p.description ?? "",
    endpoint: p.endpoint ?? "",
    env: p.env ?? "",
    defaultModel: p.defaultModel ?? "",
    enabled: p.enabled ?? true,
    order: p.order ?? 100,
    notes: p.notes ?? "",
    systemPromptFile: p.systemPromptFile ?? "",
    isBuiltin: BUILTIN_IDS.has(p.id),
  }));

  return NextResponse.json(
    { providers, meta: { count: providers.length } },
    { headers: { "Cache-Control": "no-store, must-revalidate" } },
  );
}

/** POST — create or replace a provider entry by id. */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const id = String(body.id ?? "").trim();
  if (!PROVIDER_ID_RE.test(id)) {
    return NextResponse.json(
      { error: "id must be lowercase alphanumeric + hyphens (e.g. 'zcode')" },
      { status: 400 },
    );
  }

  const override = sanitize(body);
  if (!override.extends) {
    return NextResponse.json(
      { error: "extends is required (use 'openai-compat' for a new provider)" },
      { status: 400 },
    );
  }

  const cfg = readUserConfig();
  cfg[id] = override;
  writeUserConfig(cfg);

  return NextResponse.json(
    { ok: true, id, provider: override },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** PATCH — partial update of one provider entry. */
export async function PATCH(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = (searchParams.get("id") ?? "").trim();
  if (!PROVIDER_ID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const cfg = readUserConfig();
  const existing = cfg[id] ?? {};
  // For builtins, we may have no user override yet — start from an empty
  // override and only set the fields the user sent.
  cfg[id] = { ...existing, ...sanitize(body, { allowUndefined: false }) };
  writeUserConfig(cfg);

  return NextResponse.json(
    { ok: true, id, provider: cfg[id] },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** DELETE — remove a user override. Builtins can't be deleted, only disabled. */
export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = (searchParams.get("id") ?? "").trim();

  if (!PROVIDER_ID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  if (BUILTIN_IDS.has(id)) {
    // Disable instead of delete for builtins
    const cfg = readUserConfig();
    cfg[id] = { ...(cfg[id] ?? {}), enabled: false };
    writeUserConfig(cfg);
    return NextResponse.json(
      { ok: true, id, action: "disabled" },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const cfg = readUserConfig();
  if (!(id in cfg)) {
    return NextResponse.json({ error: "Provider not found" }, { status: 404 });
  }
  delete cfg[id];
  writeUserConfig(cfg);
  return NextResponse.json(
    { ok: true, id, action: "deleted" },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** Strip `id` and other unknown fields; keep only ProviderEntry overrides. */
function sanitize(
  body: Record<string, unknown>,
  opts: { allowUndefined?: boolean } = {},
): Record<string, unknown> {
  const ALLOWED = new Set([
    "extends",
    "label",
    "icon",
    "description",
    "endpoint",
    "env",
    "defaultModel",
    "models",
    "additionalModels",
    "systemPromptFile",
    "systemPrompt",
    "enabled",
    "order",
    "notes",
  ]);

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (!ALLOWED.has(k)) continue;
    if (v === undefined && !opts.allowUndefined) continue;
    out[k] = v;
  }
  return out;
}
