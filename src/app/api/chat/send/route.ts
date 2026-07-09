import { db, ensureSchema } from "@/lib/db/client";
import { conversations, messages } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getChatAdapter } from "@/lib/chat/registry";
import type { ChatRequest } from "@/lib/chat/types";

export const dynamic = "force-dynamic";
// A streaming chat turn can take a while; don't short-circuit it.
export const maxDuration = 120;

/**
 * POST /api/chat/send — stream a response for a conversation.
 *
 * Body: { conversationId, content }
 *
 * Flow:
 * 1. Load the conversation + its adapter; bail if the agent isn't available.
 * 2. Persist the user's message.
 * 3. Build a ChatRequest from the conversation's system prompt + prior turns.
 * 4. Stream adapter chunks to the client as SSE-style `data:` lines; buffer
 *    the full text so we can persist the assistant message on completion.
 * 5. On `done`, persist the assistant message (with token usage + latency).
 *
 * The client parses these the same way it parses the status SSE stream.
 */
export async function POST(request: Request) {
  ensureSchema();
  const body = (await request.json()) as {
    conversationId: string;
    content: string;
    model?: string | null;
  };

  if (!body.conversationId || !body.content?.trim()) {
    return new Response(JSON.stringify({ error: "conversationId and content required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const conv = db
    .select()
    .from(conversations)
    .where(eq(conversations.id, body.conversationId))
    .all()[0];
  if (!conv) {
    return new Response(JSON.stringify({ error: "Conversation not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Model precedence:
  //   1. Per-request `model` (the user just hit "retry" on a different picker)
  //   2. Conversation-level override (set via PATCH)
  //   3. The agent adapter's defaultModel.
  let chosenModel: string | undefined =
    body.model || conv.model || undefined;
  const adapter = getChatAdapter(conv.agentId);
  if (!chosenModel && adapter) {
    chosenModel = adapter.defaultModel;
  }
  if (!adapter) {
    return new Response(JSON.stringify({ error: "Agent not registered" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!adapter.available) {
    return new Response(
      JSON.stringify({ error: adapter.unavailableReason ?? "Agent unavailable" }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  // 1. Persist the user turn.
  db.insert(messages)
    .values({
      conversationId: conv.id,
      role: "user",
      content: body.content,
      createdAt: new Date().toISOString(),
    })
    .run();
  // Auto-title the conversation from the first user message.
  if (conv.title === "New conversation") {
    db.update(conversations)
      .set({
        title: body.content.slice(0, 50) + (body.content.length > 50 ? "…" : ""),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(conversations.id, conv.id))
      .run();
  }

  // 2. Load full history (including the user message we just inserted).
  const history = db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conv.id))
    .orderBy(messages.id)
    .all()
    .map((m) => ({ role: m.role as ChatRequest["history"][number]["role"], content: m.content }));

  const chatRequest: ChatRequest = {
    systemPrompt: conv.systemPrompt ?? undefined,
    history,
    model: chosenModel,
    signal: request.signal,
  };

  // 3. Stream.
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));

      const started = Date.now();
      let full = "";
      let promptTokens: number | undefined;
      let completionTokens: number | undefined;
      let errored = false;

      try {
        for await (const chunk of adapter.stream(chatRequest)) {
          send(chunk);
          if (chunk.type === "delta") {
            full += chunk.content;
          } else if (chunk.type === "done") {
            promptTokens = chunk.promptTokens;
            completionTokens = chunk.completionTokens;
          } else if (chunk.type === "error") {
            errored = true;
            full += `\n\n_[error: ${chunk.message}]_`;
          }
        }

        // 4. Persist the assistant turn (even on error, so it's visible).
        const latencyMs = Date.now() - started;
        db.insert(messages)
          .values({
            conversationId: conv.id,
            role: "assistant",
            content: full || "(no response)",
            promptTokens: promptTokens ?? null,
            completionTokens: completionTokens ?? null,
            latencyMs,
            createdAt: new Date().toISOString(),
          })
          .run();
        db.update(conversations)
          .set({ updatedAt: new Date().toISOString() })
          .where(eq(conversations.id, conv.id))
          .run();
      } catch (err) {
        errored = true;
        send({
          type: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      } finally {
        send({ type: "saved" });
        controller.close();
        void errored;
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
