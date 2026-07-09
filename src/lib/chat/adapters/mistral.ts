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
    return isGatewayConfigured();
  },
  get unavailableReason() {
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
