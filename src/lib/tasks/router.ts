import { getChatAdapters } from "@/lib/chat/registry";
import type { Intent, RoutingDecision } from "./types";

/**
 * Routing engine — maps a classified Intent to an ordered list of agent ids.
 *
 * All agents route through direct API adapters built from the resolved
 * provider config (`data/providers.json`) — no gateway required.
 * The first available agent runs the task.
 */

const ROUTING: Record<Intent, string[]> = {
  code: ["hermes", "nim", "mistral-direct"],
  design: ["hermes", "nim"],
  research: ["hermes", "nim", "mistral-direct"],
  knowledge: ["hermes", "nim"],
  chat: ["hermes", "nim", "mistral-direct"],
};

function availableAgentIds(): Set<string> {
  return new Set(getChatAdapters().filter((a) => a.available).map((a) => a.id));
}

export function route(intent: Intent): RoutingDecision {
  const preferences = ROUTING[intent];
  const available = availableAgentIds();
  const anyAvailable = preferences.some((id) => available.has(id));

  return {
    intent,
    routedAgents: preferences,
    reasoning: anyAvailable
      ? `Intent "${intent}" → routed to ${preferences.join(", ")} (first available runs).`
      : `Intent "${intent}" → all agents unavailable. Check NIM_API_KEY.`,
  };
}

export function pickAgent(decision: RoutingDecision): string | null {
  const available = availableAgentIds();
  return decision.routedAgents.find((id) => available.has(id)) ?? null;
}
