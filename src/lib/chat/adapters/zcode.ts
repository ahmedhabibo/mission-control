import { streamViaGateway } from "@/lib/gateway/stream";
import type { ChatAdapter } from "../types";
import { isGatewayConfigured } from "@/lib/gateway/client";

/**
 * Zcode adapter — chat via Mission Control gateway.
 *
 * Gateway shells out to `zcode run` on the user's behalf and relays the
 * result back as a stream. Mission Control no longer spawns the binary.
 */
export const zcodeAdapter: ChatAdapter = {
  id: "zcode",
  name: "Zcode",
  icon: "Terminal",
  description: "ZCode agent — routed via gateway.",
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
