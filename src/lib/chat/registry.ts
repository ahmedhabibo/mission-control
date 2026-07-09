import type { ChatAdapter } from "./types";
import { hermesAdapter } from "./adapters/hermes";
import { mistralAdapter } from "./adapters/mistral";
import { opencodeAdapter } from "./adapters/opencode";
import { openrouterAdapter } from "./adapters/openrouter";

/**
 * Chat agent registry — the chat equivalent of tools.config.ts.
 *
 * Add an agent here to make it appear in the agent picker. Each adapter owns
 * its availability logic (env configured, binary present), so the UI can show
 * which agents are ready to chat right now.
 */
export const CHAT_AGENTS: ChatAdapter[] = [
  hermesAdapter,
  mistralAdapter,
  openrouterAdapter,
  opencodeAdapter,
];

/** Look up an adapter by id. */
export function getChatAdapter(id: string): ChatAdapter | undefined {
  return CHAT_AGENTS.find((a) => a.id === id);
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
    unavailableReason: a.unavailableReason,
  }));
}
