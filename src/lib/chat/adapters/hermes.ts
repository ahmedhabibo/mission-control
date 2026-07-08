import { streamViaGateway } from "@/lib/gateway/stream";
import type { ChatAdapter } from "../types";
import { isGatewayConfigured } from "@/lib/gateway/client";

/**
 * Hermes adapter — chat via the Mission Control gateway.
 *
 * The gateway owns all provider credentials. Mission Control only knows the
 * gateway URL + token, never the underlying Nvidia NIM key. The gateway maps
 * the `hermes` agent id to its real backend provider; for local dev, the
 * bundled mock gateway (`src/server/gateway.ts`) routes `hermes` to the
 * local `hermes-mock` handler so the SSE pipe is exercised end-to-end.
 */
export const hermesAdapter: ChatAdapter = {
  id: "hermes",
  name: "Hermes",
  icon: "BrainCircuit",
  description: "Main brain — via Mission Control gateway.",
  defaultModel: "gateway-default",
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
