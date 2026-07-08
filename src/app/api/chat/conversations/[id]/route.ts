import { NextResponse } from "next/server";
import { db, ensureSchema, raw } from "@/lib/db/client";
import { conversations, messages } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getChatAdapter } from "@/lib/chat/registry";

export const dynamic = "force-dynamic";

/**
 * GET    /api/chat/conversations/[id] → conversation + its messages
 * DELETE /api/chat/conversations/[id] → delete conversation (cascades messages)
 * PATCH  /api/chat/conversations/[id] → { title?, systemPrompt?, model? }
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  ensureSchema();
  const { id } = await params;

  const conv = db.select().from(conversations).where(eq(conversations.id, id)).all()[0];
  if (!conv) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const msgs = db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(messages.id)
    .all();

  // Attach the agent metadata so the UI can render its icon/name/description.
  const adapter = getChatAdapter(conv.agentId);
  const agent = adapter
    ? {
        id: adapter.id,
        name: adapter.name,
        icon: adapter.icon,
        available: adapter.available,
      }
    : null;

  return NextResponse.json({ conversation: conv, messages: msgs, agent });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  ensureSchema();
  const { id } = await params;
  // ON DELETE CASCADE handles messages; raw delete avoids a second statement.
  raw.prepare(`DELETE FROM conversations WHERE id = ?`).run(id);
  return NextResponse.json({ ok: true });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  ensureSchema();
  const { id } = await params;
  const body = (await request.json()) as {
    title?: string;
    systemPrompt?: string | null;
    model?: string | null;
  };

  const existing = db.select().from(conversations).where(eq(conversations.id, id)).all()[0];
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  db.update(conversations)
    .set({
      title: body.title ?? existing.title,
      systemPrompt: body.systemPrompt ?? existing.systemPrompt,
      model: body.model ?? existing.model,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(conversations.id, id))
    .run();

  const updated = db.select().from(conversations).where(eq(conversations.id, id)).all()[0];
  return NextResponse.json({ conversation: updated });
}
