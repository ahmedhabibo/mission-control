import type { ChatAdapter, ChatChunk } from "../types";

/**
 * NVIDIA NIM adapter — direct API calls, no gateway required.
 *
 * Uses NIM_API_KEY + NIM_BASE_URL from .env.local to stream completions
 * from https://integrate.api.nvidia.com/v1/chat/completions (OpenAI-compatible).
 *
 * This is the primary chat backend when the gateway is not running.
 */
export const nimAdapter: ChatAdapter = {
  id: "nim",
  name: "NVIDIA NIM",
  icon: "CircuitBoard",
  description: "Direct NVIDIA NIM API — Nemotron, Llama, GLM, Qwen (free tier).",
  defaultModel: process.env.NIM_DEFAULT_MODEL || "nvidia/nemotron-3-super-120b-a12b",
  get available() {
    return Boolean(process.env.NIM_API_KEY);
  },
  get unavailableReason() {
    return process.env.NIM_API_KEY
      ? ""
      : "Set NIM_API_KEY in .env.local (free at https://build.nvidia.com)";
  },
  stream(req) {
    return streamNim(req);
  },
};

/**
 * Stream a chat completion directly from the NVIDIA NIM API.
 * OpenAI-compatible SSE format: data: {choices:[{delta:{content}}]}
 */
async function* streamNim(req: {
  systemPrompt?: string;
  history: { role: "user" | "assistant" | "system"; content: string }[];
  model?: string;
  signal?: AbortSignal;
}): AsyncGenerator<ChatChunk> {
  const baseUrl = (process.env.NIM_BASE_URL || "https://integrate.api.nvidia.com/v1").replace(/\/$/, "");
  const apiKey = process.env.NIM_API_KEY;
  const model = req.model || nimAdapter.defaultModel;

  if (!apiKey) {
    yield { type: "error", message: "NIM_API_KEY is not set" };
    return;
  }

  // Build messages array from system prompt + history
  const messages: Array<{ role: string; content: string }> = [];
  if (req.systemPrompt) {
    messages.push({ role: "system", content: req.systemPrompt });
  }
  for (const msg of req.history) {
    messages.push({ role: msg.role, content: msg.content });
  }

  let full = "";
  let promptTokens: number | undefined;
  let completionTokens: number | undefined;

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
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
      yield { type: "error", message: `NIM API ${res.status}: ${detail.slice(0, 200)}` };
      return;
    }

    // Parse SSE stream
    const reader = res.body?.getReader();
    if (!reader) {
      yield { type: "error", message: "No response body from NIM API" };
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
            full += delta;
            yield { type: "delta", content: delta };
          }
          // Capture usage from the final chunk
          if (json.usage) {
            promptTokens = json.usage.prompt_tokens;
            completionTokens = json.usage.completion_tokens;
          }
        } catch {
          // Partial JSON — skip, will be completed in next chunk
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
