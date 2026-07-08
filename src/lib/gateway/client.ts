/**
 * Mission Control → Gateway client.
 *
 * This is the single boundary where Mission Control talks to the gateway.
 * The rest of the app never reads `MC_GATEWAY_URL` / `MC_GATEWAY_TOKEN`
 * directly. Centralizing it here means:
 *   1. Adding API-key auth to the gateway is a one-line change.
 *   2. Swapping transport (e.g. mTLS later) is local.
 *   3. Tests can stub this module instead of stubbing individual providers.
 *
 * Failures are domain-shaped, not raw fetwork errors: when the gateway is
 * unreachable, `getHealth()` returns `{ status: "offline", detail: "…" }`
 * instead of throwing, so the status board keeps working.
 */

import type {
  GatewayCatalogueEntry,
  GatewayChatCompletion,
  GatewayChatRequest,
  GatewayHealth,
} from "./types";

/** True iff the gateway env vars are configured. Probe/health paths consult this. */
export function isGatewayConfigured(): boolean {
  return Boolean(process.env.MC_GATEWAY_URL && process.env.MC_GATEWAY_TOKEN);
}

/** Base URL with no trailing slash. */
function gatewayBaseUrl(): string {
  return (process.env.MC_GATEWAY_URL ?? "").replace(/\/$/, "");
}

/** Bearer token. Empty string if unconfigured (caller asked for offline). */
function gatewayToken(): string {
  return process.env.MC_GATEWAY_TOKEN ?? "";
}

/** Common headers for every authenticated request. */
function authHeaders(extra?: HeadersInit): HeadersInit {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${gatewayToken()}`,
    ...extra,
  };
}

class GatewayUnreachableError extends Error {
  constructor(public readonly cause: unknown) {
    super("Gateway unreachable");
    this.name = "GatewayUnreachableError";
  }
}

/**
 * `GET /v1/agents/:id/health` — returns `{ status, latencyMs, version, detail }`.
 * Never throws; on any error returns `offline` with the error string as detail
 * so the board can render it. Honours a per-call `signal` plus a fallback timeout.
 */
export async function getHealth(
  agentId: string,
  opts: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<GatewayHealth> {
  if (!isGatewayConfigured()) {
    return {
      status: "unknown",
      latencyMs: null,
      version: null,
      detail: "Gateway not configured (MC_GATEWAY_URL + MC_GATEWAY_TOKEN)",
    };
  }

  const timeoutMs = opts.timeoutMs ?? 5000;
  const id = setTimeout(() => {
    // The abort controller + signal pattern: most fetch impls honour AbortSignal.
    opts.signal?.dispatchEvent?.(new Event("timeout"));
  }, timeoutMs);
  // Use AbortSignal.timeout for portability — Node 18+ supports it.
  const signal =
    opts.signal ??
    (typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
      ? AbortSignal.timeout(timeoutMs)
      : undefined);

  const url = `${gatewayBaseUrl()}/v1/agents/${encodeURIComponent(agentId)}/health`;
  try {
    const res = await fetch(url, { headers: authHeaders(), signal, cache: "no-store" });
    if (!res.ok) {
      const detail = await safeText(res);
      return {
        status: "offline",
        latencyMs: null,
        version: null,
        detail: `gateway ${res.status}: ${detail}`,
      };
    }
    const json = (await res.json()) as GatewayHealth;
    return {
      status: json.status ?? "unknown",
      latencyMs: json.latencyMs ?? null,
      version: json.version ?? null,
      detail: json.detail ?? "",
      ...(json.components ? { components: json.components } : {}),
    };
  } catch (err) {
    return {
      status: "offline",
      latencyMs: null,
      version: null,
      detail: `gateway unreachable: ${(err as Error).message ?? String(err)}`,
    };
  } finally {
    clearTimeout(id);
  }
}

/**
 * `GET /v1/agents` — gateway-supplied catalogue of advertised agents.
 * On any failure returns an empty list; callers fall back to the static registry.
 */
export async function listAgents(): Promise<GatewayCatalogueEntry[]> {
  if (!isGatewayConfigured()) return [];
  const url = `${gatewayBaseUrl()}/v1/agents`;
  try {
    const res = await fetch(url, {
      headers: authHeaders(),
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { agents?: GatewayCatalogueEntry[] };
    return json.agents ?? [];
  } catch {
    return [];
  }
}

/**
 * `POST /v1/agents/:id/chat/completions` with `stream: false` — used by the
 * intent classifier (small, non-streaming). Throws `GatewayUnreachableError`
 * on transport failure so callers can fall back to the rule-based path.
 */
export async function chatCompletion(
  agentId: string,
  req: GatewayChatRequest,
): Promise<GatewayChatCompletion> {
  if (!isGatewayConfigured()) {
    throw new GatewayUnreachableError("MC_GATEWAY_URL/MC_GATEWAY_TOKEN unset");
  }
  const url = `${gatewayBaseUrl()}/v1/agents/${encodeURIComponent(agentId)}/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      stream: false,
      systemPrompt: req.systemPrompt,
      history: req.history,
      model: req.model,
      temperature: req.temperature,
      max_tokens: req.max_tokens,
    }),
    signal: req.signal ?? AbortSignal.timeout(15000),
    cache: "no-store",
  }).catch((err) => {
    throw new GatewayUnreachableError(err);
  });
  if (!res.ok) {
    const detail = await safeText(res);
    throw new GatewayUnreachableError(`gateway ${res.status}: ${detail}`);
  }
  const json = (await res.json()) as {
    content?: string;
    promptTokens?: number;
    completionTokens?: number;
    latencyMs?: number;
  };
  return {
    content: json.content ?? "",
    promptTokens: json.promptTokens,
    completionTokens: json.completionTokens,
    latencyMs: json.latencyMs,
  };
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return res.statusText;
  }
}

export { GatewayUnreachableError };
