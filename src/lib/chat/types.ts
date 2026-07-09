/**
 * Chat domain types shared across the adapter interface, API, and UI.
 *
 * The design mirrors OpenAI's chat-completions shape since it's the de-facto
 * wire format that NIM, Mistral, and most providers expose — so an
 * OpenAI-compatible agent is just a thin HTTP call, and adapters for agents
 * without an HTTP API (Opencode) translate into the same shape.
 */

export type ChatRole = "system" | "user" | "assistant";

/** A single message in a conversation. */
export interface ChatMessage {
  id?: number;
  conversationId: string;
  role: ChatRole;
  content: string;
  promptTokens?: number | null;
  completionTokens?: number | null;
  latencyMs?: number | null;
  createdAt?: string;
}

/** A conversation thread + its agent binding + its messages. */
export interface Conversation {
  id: string;
  title: string;
  agentId: string;
  systemPrompt?: string | null;
  model?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A streaming chunk emitted by an adapter. */
export type ChatChunk =
  | { type: "delta"; content: string }
  | { type: "done"; promptTokens?: number; completionTokens?: number }
  | { type: "error"; message: string };

/** Request shape passed to a ChatAdapter. */
export interface ChatRequest {
  /** System prompt (highest precedence). */
  systemPrompt?: string;
  /** Prior turns, oldest first, ending with the latest user message. */
  history: { role: ChatRole; content: string }[];
  /** Model override; adapter falls back to its default if unset. */
  model?: string;
  /** Caller-controlled abort signal (e.g. client cancellation). */
  signal?: AbortSignal;
}

/**
 * ChatAdapter — the contract every agent implements to participate in chat.
 * A chat-capable agent exposes a stream() that yields ChatChunk events so the
 * UI can render tokens as they arrive. Non-chat agents (e.g. pure CLI tools)
 * simply aren't registered and don't appear in the chat agent picker.
 */
export interface ChatAdapter {
  id: string;
  /** Display name. */
  name: string;
  /** lucide-react icon name (matches lib/icons.ts). */
  icon: string;
  /** Short description shown in the agent picker. */
  description: string;
  /** Default model id used when the conversation doesn't override it. */
  defaultModel: string;
  /** Whether this agent is usable right now (env configured, online, etc.). */
  available: boolean;
  /** Human-readable reason when `available` is false. */
  unavailableReason?: string;
  /** Stream a response for the given request. */
  stream(req: ChatRequest): AsyncIterable<ChatChunk>;
}
