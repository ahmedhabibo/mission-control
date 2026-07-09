import { CHAT_AGENTS } from "@/lib/chat/registry";
import type { Intent, RoutingDecision } from "./types";

/**
 * Routing engine — maps a classified Intent to an ordered list of agent ids.
 *
 * Config-driven: ROUTING maps each intent to agents in priority order. At
 * runtime we filter to only currently-available agents, but we keep the full
 * ordered list in the task record so the UI can show "would have used X, but
 * it's offline". The first available agent is the one that actually runs.
 */

/** Intent → ordered agent preferences (highest priority first). */
const ROUTING: Record<Intent, string[]> = {
  // Coding tasks: coding agents first, general brain as fallback.
  code: ["opencode", "hermes", "mistral-vibe"],
  // Design tasks: dedicated design agent first, brain as fallback.
  design: ["hermes", "mistral-vibe"],
  // Research: the general-purpose brains.
  research: ["hermes", "mistral-vibe"],
  // Knowledge tasks: notebook + brain. (Notebook wiring lands in v0.6.)
  knowledge: ["hermes", "mistral-vibe"],
  // General chat: prefer the main brain.
  chat: ["hermes", "mistral-vibe", "opencode"],
};

/** Which agent ids are actually chat-capable right now. */
function availableAgentIds(): Set<string> {
  return new Set(CHAT_AGENTS.filter((a) => a.available).map((a) => a.id));
}

/** Route an intent to agents, keeping order but flagging availability. */
export function route(intent: Intent): RoutingDecision {
  const preferences = ROUTING[intent];
  const available = availableAgentIds();
  const anyAvailable = preferences.some((id) => available.has(id));

  return {
    intent,
    routedAgents: preferences,
    reasoning: anyAvailable
      ? `Intent "${intent}" → agents in priority order; using first available.`
      : `Intent "${intent}" → preferred agents all unavailable.`,
  };
}

/** Convenience: the agent id that will actually run a routed task. */
export function pickAgent(decision: RoutingDecision): string | null {
  const available = availableAgentIds();
  return decision.routedAgents.find((id) => available.has(id)) ?? null;
}
