import { NextResponse } from "next/server";
import { listChatAgents } from "@/lib/chat/registry";
import { checkAgentsHealth } from "@/lib/chat/health";

export const dynamic = "force-dynamic";

/** GET /api/chat/agents — client-safe list of chat-capable agents with health. */
export async function GET() {
  const agents = listChatAgents();

  // Ping the gateway for each available agent's health. We only check
  // agents that are flagged `available` (env configured); unavailable
  // agents are already "offline" by definition.
  const availableIds = agents.filter((a) => a.available).map((a) => a.id);
  const healthMap = availableIds.length > 0
    ? await checkAgentsHealth(availableIds, 2500)
    : {};

  return NextResponse.json({
    agents: agents.map((a) => ({
      ...a,
      healthy: a.available ? (healthMap[a.id]?.healthy ?? false) : false,
      healthLatencyMs: a.available ? (healthMap[a.id]?.latencyMs ?? null) : null,
      healthStatus: a.available ? (healthMap[a.id]?.status ?? "offline") : "offline",
      healthDetail: a.available ? (healthMap[a.id]?.detail ?? undefined) : undefined,
    })),
  });
}
