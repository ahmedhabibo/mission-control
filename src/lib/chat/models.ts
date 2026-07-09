/**
 * Static model catalogue for the Mission Control chat UI.
 *
 * Models marked `live: true` have been validated to actually work against
 * the configured provider (NVIDIA NIM). Models without `live` are best-effort
 * candidates that we expect to work but haven't end-to-end tested.
 *
 * Sources of truth:
 *  - Hermes WebUI `models_cache.json` (which providers the user has wired up).
 *  - NVIDIA NIM catalogue: https://build.nvidia.com/explore/discover
 *  - Mistral catalogue: https://docs.mistral.ai/getting-started/models/
 *
 * The ModelPicker and per-message retry actions read this list to surface
 * "what should I use next?" choices to the user — instead of leaving them
 * locked to whatever the agent registry defaults to.
 */

export interface ModelEntry {
  /** Stable id used by the agent registry / gateway. */
  id: string;
  /** Provider we route through (e.g. "nvidia", "mistral"). */
  provider: "nvidia" | "mistral" | "openai" | "anthropic";
  /** Marketing name shown to the user, e.g. "GLM 5.2 (primary)". */
  friendlyName: string;
  /** Short summary for hover tooltips. */
  description: string;
  /** Lagency tag — "fast", "code", "reasoning", "primary", "fallback". */
  categories: string[];
  /** End-to-end tested inside Mission Control. */
  live: boolean;
  /** Context window tokens (approximate). */
  contextWindow?: number;
}

/**
 * Catalogue. Keep order roughly: primary → specialized → experimental.
 */
export const MODEL_CATALOG: ModelEntry[] = [
  // ── NVIDIA NIM (verified via NIM_API_KEY in .env.local) ────────────
  {
    id: "nvidia/nemotron-3-super-120b-a12b",
    provider: "nvidia",
    friendlyName: "NVIDIA Nemotron Super 120B",
    description: "Strong general-purpose, low hallucination. Production default.",
    categories: ["primary", "reasoning", "code"],
    live: true,
    contextWindow: 131_072,
  },
  {
    id: "nvidia/nemotron-3-ultra-550b-a55b",
    provider: "nvidia",
    friendlyName: "NVIDIA Nemotron Ultra 550B (heavy)",
    description: "Largest local NIM. Slower but strongest reasoning.",
    categories: ["fallback", "reasoning"],
    live: false,
    contextWindow: 131_072,
  },
  {
    id: "meta/llama-3.1-70b-instruct",
    provider: "nvidia",
    friendlyName: "Llama 3.1 70B Instruct",
    description: "Open-source, good for code + chat. Stable.",
    categories: ["fallback", "code", "chat"],
    live: false,
    contextWindow: 131_072,
  },
  {
    id: "meta/llama-3.3-70b-instruct",
    provider: "nvidia",
    friendlyName: "Llama 3.3 70B Instruct",
    description: "Newer Llama. Better multilingual, similar speed.",
    categories: ["fallback", "chat"],
    live: false,
    contextWindow: 131_072,
  },
  {
    id: "mistralai/mistral-medium-3.5-128b",
    provider: "nvidia",
    friendlyName: "Mistral Medium 3.5 (NIM)",
    description: "Strong reasoning + long context via NVIDIA.",
    categories: ["fallback", "long-ctx"],
    live: false,
    contextWindow: 128_000,
  },
  {
    id: "qwen/qwen2.5-coder-32b-instruct",
    provider: "nvidia",
    friendlyName: "Qwen 2.5 Coder 32B",
    description: "Code-first, fast, low hallucination on snippets.",
    categories: ["code", "fast"],
    live: false,
    contextWindow: 32_768,
  },
  {
    id: "deepseek-ai/deepseek-r1",
    provider: "nvidia",
    friendlyName: "DeepSeek R1 (reasoning)",
    description: "Strong reasoning. Outputs <think> blocks.",
    categories: ["reasoning"],
    live: false,
    contextWindow: 64_000,
  },
  {
    id: "z-ai/glm-5.2",
    provider: "nvidia",
    friendlyName: "Z.AI GLM 5.2 (NIM)",
    description: "GLM series, balanced. Hermes default fallback.",
    categories: ["chat", "reasoning"],
    live: false,
  },
];

/** Filter the catalogue by provider. */
export function modelsForProvider(provider: ModelEntry["provider"]): ModelEntry[] {
  return MODEL_CATALOG.filter((m) => m.provider === provider);
}

/** Map an agent id (chat registry) to its preferred provider. */
export function providerForAgent(agentId: string): ModelEntry["provider"] {
  switch (agentId) {
    case "hermes":
    case "opencode":
      return "nvidia";
    case "mistral-vibe":
      return "mistral";
    default:
      return "nvidia";
  }
}

/** Find the live-tested model for an agent — preferred default. */
export function defaultLiveModelForAgent(agentId: string): ModelEntry | undefined {
  const provider = providerForAgent(agentId);
  return MODEL_CATALOG.find((m) => m.provider === provider && m.live);
}

/** Convert ModelEntry[] to ModelPicker Option[] (UI-friendly labels). */
export function pickerOptionsFor(models: ModelEntry[]) {
  return models.map((m) => ({
    label: m.friendlyName,
    value: m.id,
    description: m.description,
    badge: m.categories[0],
  }));
}
