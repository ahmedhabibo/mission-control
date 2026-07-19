/**
 * Chat adapter registry — Paseo-style provider config shim.
 *
 * Adding a new chat-capable agent no longer requires writing a new adapter
 * file in `lib/chat/adapters/`. Instead, add an entry to
 * `data/providers.json` that extends `"openai-compat"` (or `"nim"` for
 * the Hermes pattern). The new entry shows up in the Chat picker,
 * /api/chat/agents, /api/chat/models, /api/chat/send, and the task
 * router automatically — no code changes.
 */

import type { ChatAdapter } from "./types";
import { buildChatAdapters } from "@/lib/providers/registry";

/** Build a fresh adapter list on each access — cheap (one file read). */
export function getChatAdapters(): ChatAdapter[] {
  return buildChatAdapters();
}

/** Look up an adapter by id. */
export function getChatAdapter(id: string): ChatAdapter | undefined {
  return getChatAdapters().find((a) => a.id === id);
}

/** The first available adapter — used as the default for new conversations. */
export function defaultChatAdapter(): ChatAdapter {
  const all = getChatAdapters();
  return all.find((a) => a.available) ?? all[0];
}

/** Public (client-safe) summary of each agent — no secrets, no stream fns. */
export function listChatAgents() {
  return getChatAdapters().map((a) => ({
    id: a.id,
    name: a.name,
    icon: a.icon,
    description: a.description,
    defaultModel: a.defaultModel,
    available: a.available,
    unavailableReason: a.unavailableReason ?? null,
  }));
}
