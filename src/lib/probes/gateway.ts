/**
 * Gateway probe adapter.
 *
 * Asks the Mission Control gateway `GET /v1/agents/:id/health` and translates
 * the response into a ProbeResult. If the gateway is configured but the agent
 * itself is unknown/unreachable, the gateway's own status field is the source
 * of truth — we just copy it.
 *
 * Important: this adapter never reads provider API keys. All credentials
 * live inside the gateway; Mission Control only knows the bearer token +
 * base URL. That keeps the registry config cleaner and the secret surface
 * strictly to MC_GATEWAY_URL / MC_GATEWAY_TOKEN.
 */
import type { GatewayProbe, ProbeResult } from "@/lib/types";
import { getHealth } from "@/lib/gateway/client";
import { isGatewayConfigured } from "@/lib/gateway/client";

export async function runGatewayProbe(probe: GatewayProbe): Promise<ProbeResult> {
  const checkedAt = new Date().toISOString();

  if (!isGatewayConfigured()) {
    return {
      status: "unknown",
      latencyMs: null,
      version: null,
      detail:
        "Gateway not configured — set MC_GATEWAY_URL and MC_GATEWAY_TOKEN in .env.local.",
      checkedAt,
    };
  }

  const health = await getHealth(probe.agentId, { timeoutMs: probe.timeoutMs ?? 5000 });
  return {
    status: health.status,
    latencyMs: health.latencyMs,
    version: health.version,
    detail: health.detail || `${probe.agentId} @ gateway`,
    checkedAt: health.checkedAt ?? checkedAt,
  };
}
