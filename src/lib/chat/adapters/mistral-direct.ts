import type { ChatAdapter, ChatChunk } from "../types";

/**
 * Mistral Direct adapter — calls api.mistral.ai directly, no gateway needed.
 *
 * Uses MISTRAL_API_KEY from .env.local to stream completions from
 * https://api.mistral.ai/v1/chat/completions (OpenAI-compatible SSE).
 */
export const mistralDirectAdapter: ChatAdapter = {
  id: "mistral-direct",
  name: "Mistral (Direct)",
  icon: "Wind",
  description: "Direct Mistral API — Small & Medium models (free tier).",
  defaultModel: process.env.MISTRAL_DEFAULT_MODEL || "mistral-small-latest",
  get available() {
    return Boolean(process.env.MISTRAL_API_KEY);
  },
  get unavailableReason() {
    return process.env.MISTRAL_API_KEY
      ? ""
      : "Set MISTRAL_API_KEY in .env.local";
  },
  stream(req) {
    return streamMistralDirect(req);
  },
};

async function* streamMistralDirect(req: {
  systemPrompt?: string;
  history: { role: "user" | "assistant" | "system"; content: string }[];
  model?: string;
  signal?: AbortSignal;
}): AsyncGenerator<ChatChunk> {
  const apiKey = process.env.MISTRAL_API_KEY;
  const model = req.model || mistralDirectAdapter.defaultModel;

  if (!apiKey) {
    yield { type: "error", message: "MISTRAL_API_KEY is not set" };
    return;
  }

  const messages: Array<{ role: string; content: string }> = [];
  if (req.systemPrompt) {
    messages.push({ role: "system", content: req.systemPrompt });
  }
  for (const msg of req.history) {
    messages.push({ role: msg.role, content: msg.content });
  }

  let promptTokens: number | undefined;
  let completionTokens: number | undefined;

  try {
    const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        max_tokens: 2048,
      }),
      signal: req.signal,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => res.statusText);
      yield { type: "error", message: `Mistral API ${res.status}: ${detail.slice(0, 200)}` };
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) {
      yield { type: "error", message: "No response body from Mistral API" };
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;
        const data = trimmed.slice(6);
        if (data === "[DONE]") continue;

        try {
          const json = JSON.parse(data);
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) {
            yield { type: "delta", content: delta };
          }
          if (json.usage) {
            promptTokens = json.usage.prompt_tokens;
            completionTokens = json.usage.completion_tokens;
          }
        } catch {
          // Partial JSON — skip
        }
      }
    }

    yield { type: "done", promptTokens, completionTokens };
  } catch (err) {
    yield {
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
