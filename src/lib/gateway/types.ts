/**
 * Gateway wire types — the contract Mission Control assumes the gateway speaks.
 *
 * Keeping this in one place means the rest of the app only imports from
 * `@/lib/gateway`; if the gateway's real protocol evolves, only `client.ts`
 * and `stream.ts` need to change.
 *
 * Conventions (matching OpenAI-ish norms already used elsewhere):
 * - Agents are addressed via stable lowercase ids: hermes, opencode,
 *   mistral-vibe, …  (matches CHAT_AGENTS ids exactly).
 * - Health: `GET /v1/agents/:id/health` → { status, latencyMs, version, detail }.
 * - Streaming chat: `POST /v1/agents/:id/chat/completions` → SSE stream of
 *   the same `delta | done | error` chunks the adapters already emit.
 * - Completion (non-streaming, used for the intent classifier):
 *   `POST /v1/agents/:id/chat/completions` with `stream: false`.
 *
 * The gateway is expected to return JSON in this shape; if the real daemon
 * uses something else, only `client.ts`/`stream.ts` need to translate.
 */

export type GatewayAgentId =
  | "hermes"
  | "opencode"
  | "mistral-vibe"
  | "paseo";

/** Health response returned by `GET /v1/agents/:id/health`. */
export interface GatewayHealth {
  /** online | degraded | offline | unknown */
  status: "online" | "degraded" | "offline" | "unknown";
  latencyMs: number | null;
  version: string | null;
  detail: string;
  /** When the gateway itself last checked. The board stamps its own checkedAt. */
  checkedAt?: string;
  /** Optional per-sub-component result array (mirrors CompositeProbeResult). */
  components?: {
    label: string;
    result: {
      status: "online" | "degraded" | "offline" | "unknown";
      latencyMs: number | null;
      version: string | null;
      detail: string;
      checkedAt?: string;
    };
  }[];
}

export interface GatewayChatRequest {
  /** System prompt — caller-controlled. */
  systemPrompt?: string;
  /** Prior turns oldest first, ending with the latest user turn. */
  history: { role: "system" | "user" | "assistant"; content: string }[];
  /** Optional model override; gateway falls back to its default for the agent. */
  model?: string;
  /** Per-request temperature/max_tokens (used by the intent classifier). */
  temperature?: number;
  max_tokens?: number;
  /** Server-side abort signal forwarded by the route handler. */
  signal?: AbortSignal;
}

/** A single chunk the gateway may emit on the SSE stream. */
export type GatewayChatChunk =
  | { type: "delta"; content: string }
  | {
      type: "done";
      promptTokens?: number;
      completionTokens?: number;
    }
  | { type: "error"; message: string };

/** Catalogue response — agents the gateway currently advertises. */
export interface GatewayCatalogueEntry {
  id: GatewayAgentId | string;
  name: string;
  available: boolean;
  unavailableReason?: string;
  defaultModel?: string;
}

/** Result of a non-streaming chat completion (used by the classifier). */
export interface GatewayChatCompletion {
  content: string;
  promptTokens?: number;
  completionTokens?: number;
  /** ms the gateway took to complete the call (the board uses this). */
  latencyMs?: number;
}
