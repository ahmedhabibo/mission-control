/** Agent route — merges chat adapters (can chat) with discovered CLI agents (can run tasks). */
import { NextResponse } from "next/server";
import { discoverAgents } from "@/lib/discovery/agents";
import { getChatAdapters } from "@/lib/chat/registry";

export const dynamic = "force-dynamic";

/**
 * GET /api/chat/agents — returns two categories:
 *   1. Chat agents (from registry) — can actually chat (Hermes, NIM, Mistral)
 *   2. CLI agents (from discovery) — can run tasks, not direct chat
 * Both are returned; the UI distinguishes them with `chatCapable: true/false`.
 */
export async function GET() {
  const startedAt = Date.now();

  // 1. Chat-capable adapters from the resolved provider config
  const chatAgents = getChatAdapters().map((a) => ({
    id: a.id,
    name: a.name,
    description: a.description,
    icon: a.icon,
    kind: "chat" as const,
    chatCapable: true,
    profile: undefined as string | undefined,
    defaultModel: a.defaultModel,
    available: a.available,
    unavailableReason: a.unavailableReason ?? null,
    healthy: a.available,
    healthLatencyMs: null as number | null,
    healthStatus: (a.available ? "online" : "offline") as string,
    healthDetail: null as string | null,
  }));

  // 2. Discovered CLI agents (for Tasks/Orchestration, not direct chat)
  const discovered = await discoverAgents();
  const cliAgents = discovered.map((a) => ({
    id: a.id,
    name: a.name,
    description: a.description,
    icon: a.icon,
    kind: a.kind,
    chatCapable: false,
    profile: a.profile,
    defaultModel: a.defaultModel,
    available: a.live,
    unavailableReason: a.reason ?? null,
    healthy: a.live,
    healthLatencyMs: null as number | null,
    healthStatus: (a.live ? "online" : "offline") as string,
    healthDetail: null as string | null,
  }));

  // Chat agents first, then CLIs
  const all = [...chatAgents, ...cliAgents];

  return NextResponse.json(
    {
      agents: all,
      meta: {
        scannedAt: new Date().toISOString(),
        discoveredCount: all.length,
        liveCount: all.filter((a) => a.healthy).length,
        chatAgentCount: chatAgents.filter((a) => a.available).length,
        cliAgentCount: cliAgents.filter((a) => a.available).length,
        elapsedMs: Date.now() - startedAt,
      },
    },
    { headers: { "Cache-Control": "no-store, must-revalidate" } },
  );
}
