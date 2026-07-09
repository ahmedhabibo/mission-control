import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/chat/models — live model catalogue from all configured providers.
 *
 * Calls the gateway's /v1/models endpoint which proxies to:
 *   - NVIDIA NIM  (https://integrate.api.nvidia.com/v1/models)
 *   - Mistral    (https://api.mistral.ai/v1/models)
 *   - OpenRouter  (https://openrouter.ai/api/v1/models)
 *
 * Results are cached for 5 minutes (300s) in a module-level variable so
 * concurrent requests don't hammer the provider APIs. The cache is
 * per-server-instance (Next.js dev = single process).
 */

interface LiveModel {
  id: string;
  provider: string;
  owned_by?: string;
}

let cachedModels: LiveModel[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Friendly-name lookup — tries to make model IDs human-readable.
 * e.g. "nvidia/nemotron-3-super-120b-a12b" → "Nemotron Super 120B"
 * Falls back to the raw ID if no friendly name is known.
 */
function friendlyName(id: string, provider: string): string {
  // For Mistral, IDs are already short (mistral-small-latest).
  if (provider === "mistral") {
    return id
      .replace(/-/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .replace("Latest", "");
  }
  // For NIM and OpenRouter, IDs are "org/model-name" — take the model part.
  const parts = id.split("/");
  const modelPart = parts.length > 1 ? parts.slice(1).join("/") : id;
  // CamelCase / kebab → Title Case
  return modelPart
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function GET() {
  const gatewayUrl = process.env.MC_GATEWAY_URL;
  const gatewayToken = process.env.MC_GATEWAY_TOKEN;

  // Return cache if fresh.
  if (cachedModels && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return NextResponse.json({ models: enrichModels(cachedModels), cached: true });
  }

  if (!gatewayUrl) {
    return NextResponse.json({
      models: [],
      error: "MC_GATEWAY_URL not configured",
    });
  }

  try {
    const headers: Record<string, string> = {};
    if (gatewayToken) headers["Authorization"] = `Bearer ${gatewayToken}`;

    const res = await fetch(`${gatewayUrl}/v1/models`, { headers });
    if (!res.ok) {
      return NextResponse.json(
        { models: [], error: `Gateway returned ${res.status}` },
        { status: 502 },
      );
    }

    const data = await res.json();
    const models: LiveModel[] = data.models ?? [];

    // Update cache.
    cachedModels = models;
    cacheTimestamp = Date.now();

    return NextResponse.json({ models: enrichModels(models), cached: false });
  } catch (err) {
    // Return stale cache if available.
    if (cachedModels) {
      return NextResponse.json({
        models: enrichModels(cachedModels),
        cached: true,
        stale: true,
      });
    }
    return NextResponse.json(
      { models: [], error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}

/**
 * Enrich raw provider model IDs with friendly names and group them by provider.
 */
function enrichModels(models: LiveModel[]) {
  // Group by provider.
  const byProvider: Record<string, LiveModel[]> = {};
  for (const m of models) {
    if (!byProvider[m.provider]) byProvider[m.provider] = [];
    byProvider[m.provider].push(m);
  }

  // Build grouped output.
  const groups = Object.entries(byProvider).map(([provider, ms]) => ({
    provider,
    count: ms.length,
    models: ms.map((m) => ({
      id: m.id,
      provider: m.provider,
      friendlyName: friendlyName(m.id, m.provider),
      owned_by: m.owned_by,
    })),
  }));

  return {
    total: models.length,
    groups,
  };
}
