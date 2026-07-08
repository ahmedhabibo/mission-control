import { NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db/client";
import { conversations } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { newConversationId } from "@/lib/chat/id";
import { getChatAdapter } from "@/lib/chat/registry";

export const dynamic = "force-dynamic";

/**
 * GET  /api/chat/conversations           → list all conversations (newest first)
 * POST /api/chat/conversations           → create a new conversation
 *   body: { agentId, title?, systemPrompt?, model? }
 */
export async function GET() {
  ensureSchema();
  const list = db
    .select()
    .from(conversations)
    .orderBy(desc(conversations.updatedAt))
    .all();
  return NextResponse.json({ conversations: list });
}

export async function POST(request: Request) {
  ensureSchema();
  const body = (await request.json()) as {
    agentId: string;
    title?: string;
    systemPrompt?: string;
    model?: string;
  };

  const adapter = getChatAdapter(body.agentId);
  if (!adapter) {
    return NextResponse.json({ error: "Unknown agent" }, { status: 400 });
  }

  const id = newConversationId();
  const title = body.title?.trim() || "New conversation";
  const now = new Date().toISOString();

  db.insert(conversations)
    .values({
      id,
      title,
      agentId: body.agentId,
      systemPrompt: body.systemPrompt ?? null,
      model: body.model ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  const created = db
    .select()
    .from(conversations)
    .where(eq(conversations.id, id))
    .all()[0];

  return NextResponse.json({ conversation: created });
}
