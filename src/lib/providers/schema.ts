/**
 * Provider config schema — Paseo-style "extends + label + endpoint + env".
 *
 * Every chat-capable agent in Mission Control is a `ProviderEntry`. The
 * builtin `openai-compat` base defines how to stream completions; concrete
 * providers (nim, mistral-direct, hermes) extend it with an endpoint,
 * env-var name, default model, and optional system-prompt file.
 *
 * User-defined overrides live in `data/providers.json` and merge on top
 * of the builtin defaults (so a user can disable, relabel, or add a
 * provider without touching code).
 */

/** A single model offered by a provider. */
export interface ProviderModel {
  id: string;
  /** Display name; defaults to the id's last segment. */
  label?: string;
  isDefault?: boolean;
}

/** Base shape — what every concrete provider entry looks like. */
export interface ProviderEntry {
  /**
   * The provider id this entry extends. Reserved base ids:
   *   - "openai-compat" — generic OpenAI-compatible SSE streaming
   *   - "nim"           — NVIDIA NIM (extends openai-compat)
   *   - "hermes"        — NIM + SOUL.md (extends nim)
   *
   * Custom entries may extend any of the above.
   */
  extends: string;
  /** Human label shown in the Chat picker + Settings. */
  label: string;
  /** lucide-react icon name (matches lib/icons.ts). */
  icon?: string;
  /** Short description shown under the label. */
  description?: string;
  /** OpenAI-compatible base URL (without /chat/completions). */
  endpoint?: string;
  /** Environment variable holding the API key. */
  env?: string;
  /** Default model id (first ProviderModel with isDefault wins). */
  defaultModel?: string;
  /** Explicit model list (otherwise discovered live). */
  models?: ProviderModel[];
  /** Additional models merged with runtime-discovered list. */
  additionalModels?: ProviderModel[];
  /** Absolute path to a Markdown file prepended as system prompt. */
  systemPromptFile?: string;
  /** Inline system prompt (lower precedence than systemPromptFile). */
  systemPrompt?: string;
  /** Disabled entries don't appear in the chat picker or router. */
  enabled?: boolean;
  /** Display order — lower sorts first. */
  order?: number;
  /** Per-provider notes shown in Settings (free text). */
  notes?: string;
}

/** Built-in base providers — cannot be overridden, only extended. */
export const BUILTIN_BASES = new Set(["openai-compat"]);

/** Default ordering when `order` is unset. */
export const DEFAULT_ORDER = 100;

/**
 * Built-in provider definitions. These are the "first-class" providers
 * shipped with Mission Control. User entries in `data/providers.json`
 * can extend any of these to add new providers (e.g. ZCode, OpenRouter,
 * a self-hosted vLLM endpoint) without writing a new adapter file.
 */
export const BUILTIN_PROVIDERS: ProviderEntry[] = [
  {
    extends: "openai-compat",
    label: "OpenAI-Compatible (base)",
    icon: "Plug",
    description:
      "Base provider — any OpenAI-compatible /v1/chat/completions endpoint. Extend this to add a new provider.",
    enabled: false,
    order: 0,
  },
  {
    extends: "openai-compat",
    label: "NVIDIA NIM",
    icon: "CircuitBoard",
    description:
      "Direct NVIDIA NIM API — Nemotron, Llama, GLM, Qwen (free tier).",
    endpoint: "https://integrate.api.nvidia.com/v1",
    env: "NIM_API_KEY",
    defaultModel: "nvidia/nemotron-3-super-120b-a12b",
    enabled: true,
    order: 10,
  },
  {
    extends: "openai-compat",
    label: "Mistral (Direct)",
    icon: "Wind",
    description: "Direct Mistral API — Small & Medium models (free tier).",
    endpoint: "https://api.mistral.ai/v1",
    env: "MISTRAL_API_KEY",
    defaultModel: "mistral-small-latest",
    enabled: true,
    order: 20,
  },
  {
    extends: "nim",
    label: "Hermes",
    icon: "BrainCircuit",
    description: "Hermes agent — NIM backend with your SOUL.md personality.",
    defaultModel: "z-ai/glm-5.2",
    systemPromptFile: "~/.hermes/SOUL.md",
    enabled: true,
    order: 5,
  },
];

/** Stable id (lowercase alphanumeric + hyphens) — the key in providers.json. */
export const PROVIDER_ID_RE = /^[a-z][a-z0-9-]*$/;
