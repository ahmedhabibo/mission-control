import { NextResponse } from "next/server";
import { listChatAgents } from "@/lib/chat/registry";

export const dynamic = "force-dynamic";

/** GET /api/chat/agents — client-safe list of chat-capable agents. */
export async function GET() {
  return NextResponse.json({ agents: listChatAgents() });
}
