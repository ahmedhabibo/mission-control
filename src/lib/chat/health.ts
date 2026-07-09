/**
 * Provider health checks — lightweight pings to the Mission Control gateway
 * to verify each agent's backing provider is reachable and responding.
 *
 * The gateway already exposes `GET /v1/agents/:id/health` which returns a
 * HealthResult. We call it with a short timeout (2.5s) so a slow provider
 * doesn't block the /api/chat/agents response.
 *
 * Usage:
 *   const h = await checkAgentHealth("hermes");
 *   // h = { healthy: true, latencyMs: 142 } | { healthy: false, latencyMs: null }
 */

export interface AgentHealth {
  healthy: boolean;
  latencyMs: number | null;
  status: "online" | "degraded" | "offline";
  detail?: string;
}

/**
 * Ping a single agent's health endpoint on the gateway.
 * Returns within `timeoutMs` regardless of provider response time.
 */
export async function checkAgentHealth(
  agentId: string,
  timeoutMs = 2500,
): Promise<AgentHealth> {
  const gatewayUrl = process.env.MC_GATEWAY_URL;
  const gatewayToken = process.env.MC_GATEWAY_TOKEN;

  if (!gatewayUrl) {
    return { healthy: false, latencyMs: null, status: "offline", detail: "MC_GATEWAY_URL not set" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers: Record<string, string> = {};
    if (gatewayToken) headers["Authorization"] = `Bearer ${gatewayToken}`;

    const startedAt = Date.now();
    const res = await fetch(
      `${gatewayUrl}/v1/agents/${encodeURIComponent(agentId)}/health`,
      { headers, signal: controller.signal },
    );
    const latencyMs = Date.now() - startedAt;

    if (!res.ok) {
      return { healthy: false, latencyMs, status: "offline", detail: `HTTP ${res.status}` };
    }

    const data = await res.json();
    const status = (data?.status ?? "offline") as AgentHealth["status"];
    return {
      healthy: status === "online",
      latencyMs,
      status,
      detail: data?.detail,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("aborted") || msg.includes("AbortError")) {
      return { healthy: false, latencyMs: null, status: "degraded", detail: "timeout" };
    }
    return { healthy: false, latencyMs: null, status: "offline", detail: msg };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Batch-check health for all agents concurrently.
 * Returns a map of agentId → AgentHealth.
 */
export async function checkAgentsHealth(
  agentIds: string[],
  timeoutMs = 2500,
): Promise<Record<string, AgentHealth>> {
  const entries = await Promise.all(
    agentIds.map(async (id) => [id, await checkAgentHealth(id, timeoutMs)] as const),
  );
  return Object.fromEntries(entries);
}
