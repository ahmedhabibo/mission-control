import { randomBytes } from "node:crypto";

/**
 * Generate a short, sortable-ish id for a conversation.
 * Format: "c_<base36 timestamp>_<8 random chars>" — compact and unique enough
 * for a single-user local instance, no ULID dependency needed.
 */
export function newConversationId(): string {
  const time = Date.now().toString(36);
  const rand = randomBytes(4).toString("base64url").slice(0, 8);
  return `c_${time}_${rand}`;
}
