/**
 * Provider-backed ChatAdapter registry.
 *
 * Replaces the old hand-written adapters (nim.ts, mistral-direct.ts,
 * hermes-direct.ts) with a single OpenAI-compatible streaming function
 * parameterised by the resolved provider config.
 *
 * Existing call sites (registry.ts, /api/chat/agents, /api/chat/send,
 * task router) keep their imports of `CHAT_AGENTS` — this module just
 * sits behind `src/lib/chat/registry.ts` and emits the same shape.
 */

import { existsSync, readFileSync } from "node:fs";

import type { ChatAdapter, ChatChunk } from "@/lib/chat/types";
import { expandPath, resolveEndpoint, resolveProviders } from "./config";

/**
 * Build a ChatAdapter from a resolved provider entry. Returns null if the
 * provider isn't OpenAI-compatible or is disabled.
 */
function adapterFromProvider(
  providerId: string,
): ChatAdapter | null {
  const providers = resolveProviders();
  const provider = providers.find((p) => p.id === providerId);
  if (!provider || provider.enabled === false) return null;

  const endpoint = resolveEndpoint(providerId);
  if (!endpoint || !endpoint.isOpenAICompat) return null;

  const apiKey = process.env[endpoint.env];
  const available = Boolean(apiKey);
  const defaultModel = provider.defaultModel ?? "";

  // Load system prompt from file or inline
  const systemPromptFromFile = endpoint.systemPromptFile
    ? loadFile(expandPath(endpoint.systemPromptFile))
    : null;
  const baseSystemPrompt = systemPromptFromFile ?? endpoint.systemPrompt ?? "";

  const adapter: ChatAdapter = {
    id: provider.id,
    name: provider.label,
    icon: provider.icon ?? "Plug",
    description: provider.description ?? "",
    defaultModel,
    available,
    unavailableReason: available
      ? ""
      : `Set ${endpoint.env} in Settings (or .env.local)`,
    stream(req) {
      return streamOpenAICompat({
        endpoint: endpoint.endpoint,
        apiKey: apiKey ?? "",
        model: req.model || defaultModel,
        systemPrompt: baseSystemPrompt
          ? req.systemPrompt
            ? `${baseSystemPrompt}\n\n${req.systemPrompt}`
            : baseSystemPrompt
          : req.systemPrompt,
        history: req.history,
        signal: req.signal,
        temperature: req.temperature,
        maxTokens: req.maxTokens,
      });
    },
  };

  return adapter;
}

function loadFile(path: string): string | null {
  try {
    if (!existsSync(path)) return null;
    const full = readFileSync(path, "utf-8");
    // Truncate large files (e.g. SOUL.md is huge)
    return full.slice(0, 2000);
  } catch {
    return null;
  }
}

/** OpenAI-compatible SSE streaming — the heart of every provider. */
async function* streamOpenAICompat(args: {
  endpoint: string;
  apiKey: string;
  model: string;
  systemPrompt?: string;
  history: { role: "system" | "user" | "assistant"; content: string }[];
  signal?: AbortSignal;
  temperature?: number;
  maxTokens?: number;
}): AsyncGenerator<ChatChunk> {
  if (!args.apiKey) {
    yield { type: "error", message: `API key not configured` };
    return;
  }
  if (!args.model) {
    yield { type: "error", message: `No model selected` };
    return;
  }

  const messages: Array<{ role: string; content: string }> = [];
  if (args.systemPrompt) {
    messages.push({ role: "system", content: args.systemPrompt });
  }
  for (const m of args.history) {
    messages.push({ role: m.role, content: m.content });
  }

  let promptTokens: number | undefined;
  let completionTokens: number | undefined;

  try {
    const res = await fetch(`${args.endpoint.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${args.apiKey}`,
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        model: args.model,
        messages,
        stream: true,
        max_tokens: args.maxTokens ?? 2048,
        temperature: args.temperature,
      }),
      signal: args.signal,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => res.statusText);
      yield {
        type: "error",
        message: `Provider ${res.status}: ${detail.slice(0, 200)}`,
      };
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) {
      yield { type: "error", message: "No response body from provider" };
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
          // Partial JSON — wait for the next chunk
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

/**
 * Build the chat-capable adapter list from the resolved providers.
 * Used by `src/lib/chat/registry.ts` — drop-in replacement for the
 * old static CHAT_AGENTS array.
 */
export function buildChatAdapters(): ChatAdapter[] {
  const providers = resolveProviders();
  const adapters: ChatAdapter[] = [];
  for (const p of providers) {
    if (p.id === "openai-compat") continue; // base, not chat-capable
    if (p.enabled === false) continue;
    const a = adapterFromProvider(p.id);
    if (a) adapters.push(a);
  }
  return adapters;
}

/** All entries (including disabled + base) — used by Settings UI. */
export function allProviderEntries() {
  return resolveProviders().map((p) => ({
    id: p.id,
    extends: p.extends,
    label: p.label,
    icon: p.icon ?? "Plug",
    description: p.description ?? "",
    endpoint: p.endpoint ?? "",
    env: p.env ?? "",
    defaultModel: p.defaultModel ?? "",
    enabled: p.enabled ?? true,
    order: p.order ?? 100,
    notes: p.notes ?? "",
    systemPromptFile: p.systemPromptFile ?? "",
  }));
}
