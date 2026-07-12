import { NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db/client";
import { conversations } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { newConversationId } from "@/lib/chat/id";
import { getChatAdapter } from "@/lib/chat/registry";
import { createConversationSchema, formatZodError } from "@/lib/validation";

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
  const json = await request.json().catch(() => ({}));
  const parsed = createConversationSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
  }
  const { agentId, title: titleInput, systemPrompt, model } = parsed.data;

  const adapter = getChatAdapter(agentId);
  if (!adapter) {
    return NextResponse.json({ error: "Unknown agent" }, { status: 400 });
  }

  const id = newConversationId();
  const title = titleInput?.trim() || "New conversation";
  const now = new Date().toISOString();

  db.insert(conversations)
    .values({
      id,
      title,
      agentId,
      systemPrompt: systemPrompt ?? null,
      model: model ?? null,
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
