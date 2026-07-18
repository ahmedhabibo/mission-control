import type { ChatAdapter } from "./types";
import { nimAdapter } from "./adapters/nim";
import { mistralDirectAdapter } from "./adapters/mistral-direct";
import { hermesDirectAdapter } from "./adapters/hermes-direct";

/**
 * Chat agent registry — the agents you can actually chat with.
 *
 * All adapters call LLM provider APIs directly (NIM, Mistral) — no
 * gateway required. The Hermes adapter uses NIM with the Hermes
 * SOUL.md as system prompt for personality.
 *
 * CLI agents (opencode, kilo, grok, claude, codex) are NOT chat agents —
 * they're terminal coding tools used by the Tasks/Orchestration pages.
 */
export const CHAT_AGENTS: ChatAdapter[] = [
  hermesDirectAdapter,
  nimAdapter,
  mistralDirectAdapter,
];

/** Look up an adapter by id. */
export function getChatAdapter(id: string): ChatAdapter | undefined {
  return CHAT_AGENTS.find((a) => a.id === id);
}

/** The first available adapter — used as the default for new conversations. */
export function defaultChatAdapter(): ChatAdapter {
  return CHAT_AGENTS.find((a) => a.available) ?? CHAT_AGENTS[0];
}

/** Public (client-safe) summary of each agent — no secrets, no stream fns. */
export function listChatAgents() {
  return CHAT_AGENTS.map((a) => ({
    id: a.id,
    name: a.name,
    icon: a.icon,
    description: a.description,
    defaultModel: a.defaultModel,
    available: a.available,
    unavailableReason: a.unavailableReason ?? null,
  }));
}
