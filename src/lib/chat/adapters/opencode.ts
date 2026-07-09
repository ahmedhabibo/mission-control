import { streamViaGateway } from "@/lib/gateway/stream";
import type { ChatAdapter } from "../types";
import { isGatewayConfigured } from "@/lib/gateway/client";

/**
 * Opencode adapter.
 *
 * Wrapped via the gateway. The gateway may shell out to a local `opencode
 * run` (or stream its HTTP form, when shipped) and relay tokens back. MC
 * never spawns the binary directly anymore.
 */
export const opencodeAdapter: ChatAdapter = {
  id: "opencode",
  name: "Opencode",
  icon: "Code2",
  description: "Coding agent — via Mission Control gateway.",
  defaultModel: "nvidia/nemotron-3-super-120b-a12b",
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
