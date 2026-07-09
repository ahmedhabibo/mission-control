import { streamViaGateway } from "@/lib/gateway/stream";
import type { ChatAdapter } from "../types";
import { isGatewayConfigured } from "@/lib/gateway/client";

/**
 * Mistral Vibe adapter — chat via the Mission Control gateway.
 *
 * Local dev: the bundled mock gateway exposes a `mistral-vibe` agent that
 * falls through to `mistral-mock` so the streaming pipeline can be
 * exercised without touching api.mistral.ai.
 */
export const mistralAdapter: ChatAdapter = {
  id: "mistral-vibe",
  name: "Mistral",
  icon: "Sparkles",
  description: "Mistral coding agent — via Mission Control gateway.",
  defaultModel: "mistral-small-latest",
  get available() {
    return !!(process.env.MISTRAL_API_KEY || process.env.MC_GATEWAY_URL);
  },
  get unavailableReason() {
    if (process.env.MISTRAL_API_KEY) return "";
    return "Add MISTRAL_API_KEY to .env.local (free at https://console.mistral.ai/api-keys)";
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
