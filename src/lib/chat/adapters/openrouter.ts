import { streamViaGateway } from "@/lib/gateway/stream";
import type { ChatAdapter } from "../types";

/**
 * OpenRouter adapter — chat via the Mission Control gateway.
 *
 * OpenRouter provides access to 200+ models from OpenAI, Anthropic, Google,
 * Meta, Mistral, and more through a single API key. The gateway routes
 * "openrouter" requests to api.openrouter.ai/v1/chat/completions.
 *
 * Availabilty requires both the gateway to be configured AND the
 * OPENROUTER_API_KEY env var to be set in the gateway environment.
 * (The adapter itself only knows about the gateway; the gateway owns
 * all provider credentials.)
 */
export const openrouterAdapter: ChatAdapter = {
  id: "openrouter",
  name: "OpenRouter",
  icon: "Route",
  description: "200+ models via one API — GPT-4o, Claude, Gemini, Llama and more.",
  defaultModel: "openai/gpt-4o-mini",
  get available() {
    return !!(process.env.MC_GATEWAY_URL && process.env.MC_GATEWAY_TOKEN);
  },
  get unavailableReason() {
    if (process.env.MC_GATEWAY_URL && process.env.MC_GATEWAY_TOKEN) return "";
    return "Set MC_GATEWAY_URL and MC_GATEWAY_TOKEN in .env.local";
  },
  stream(req) {
    return streamViaGateway(this.id, {
      systemPrompt: req.systemPrompt,
      history: req.history,
      model: req.model,
      signal: req.signal,
    });
  },
};