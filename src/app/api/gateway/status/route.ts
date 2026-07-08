import { NextResponse } from "next/server";
import { isGatewayConfigured, listAgents } from "@/lib/gateway/client";

export const dynamic = "force-dynamic";

/**
 * GET /api/gateway/status — system-wide gateway reachability.
 * Returns whether MC_GATEWAY_URL + MC_GATEWAY_TOKEN are set AND what
 * agents the gateway currently advertises.
 *
 * Used by the Settings page to show a banner; safe to expose publicly
 * inside the app — the response carries no secrets.
 */
export async function GET() {
  const configured = isGatewayConfigured();
  const agents = configured ? await listAgents() : [];
  return NextResponse.json({
    configured,
    agents,
    // A single line of detail for the banner:
    detail: configured
      ? `${agents.length} agent(s) advertised by gateway`
      : "Set MC_GATEWAY_URL and MC_GATEWAY_TOKEN in .env.local",
    checkedAt: new Date().toISOString(),
  });
}
