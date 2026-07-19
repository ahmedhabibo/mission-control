/**
 * Provider config loader — merges built-in providers with user overrides.
 *
 * On-disk format (data/providers.json):
 * {
 *   "nim":      { "defaultModel": "nvidia/...", "enabled": true },
 *   "zcode":    { "extends": "openai-compat", "label": "ZCode", "endpoint": "...", "env": "ZCODE_API_KEY", "defaultModel": "glm-5.2" }
 * }
 *
 * Top-level keys are provider ids. Each value is a partial ProviderEntry
 * that merges on top of the builtin with the same id (if any). Values
 * without a builtin equivalent become brand-new providers (provided
 * `extends` is set).
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

import {
  BUILTIN_PROVIDERS,
  ProviderEntry,
  PROVIDER_ID_RE,
} from "./schema";

const DATA_DIR = join(process.cwd(), "data");
const CONFIG_FILE = join(DATA_DIR, "providers.json");

/** Final merged entry — same shape as ProviderEntry plus a stable id. */
export interface ResolvedProvider extends ProviderEntry {
  id: string;
}

/** Read and parse data/providers.json (returns {} if missing or malformed). */
export function readUserConfig(): Record<string, Partial<ProviderEntry>> {
  try {
    if (!existsSync(CONFIG_FILE)) return {};
    const raw = readFileSync(CONFIG_FILE, "utf-8");
    return JSON.parse(raw) as Record<string, Partial<ProviderEntry>>;
  } catch {
    return {};
  }
}

/** Persist the user overrides (atomic write). */
export function writeUserConfig(cfg: Record<string, Partial<ProviderEntry>>): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2) + "\n", "utf-8");
}

/**
 * Resolve the final provider list — builtins merged with user overrides,
 * plus any user-defined providers.
 *
 * Returns providers keyed by id, sorted by `order` (asc), then by label.
 * Disabled entries are kept in the map but marked `enabled: false` so the
 * Settings page can show them.
 */
export function resolveProviders(): ResolvedProvider[] {
  const userCfg = readUserConfig();

  // Start with builtins keyed by their (synthetic) id
  const byId = new Map<string, ResolvedProvider>();

  // The builtin entries don't have an `id` field — assign from a synthetic
  // mapping that mirrors Paseo's first-class ids.
  const BUILTIN_ID_BY_LABEL: Record<string, string> = {
    "OpenAI-Compatible (base)": "openai-compat",
    "NVIDIA NIM": "nim",
    "Mistral (Direct)": "mistral-direct",
    "Hermes": "hermes",
  };

  for (const b of BUILTIN_PROVIDERS) {
    const id = BUILTIN_ID_BY_LABEL[b.label] ?? b.label.toLowerCase();
    byId.set(id, { ...b, id });
  }

  // Merge user overrides for known ids, or add brand-new providers
  for (const [id, override] of Object.entries(userCfg)) {
    if (!PROVIDER_ID_RE.test(id)) continue;

    const existing = byId.get(id);
    if (existing) {
      // Shallow merge — null/undefined in override is ignored
      const merged: ResolvedProvider = {
        ...existing,
        ...Object.fromEntries(
          Object.entries(override).filter(([, v]) => v !== undefined),
        ),
        id,
      };
      byId.set(id, merged);
    } else if (override.extends) {
      // Brand-new user-defined provider
      byId.set(id, {
        extends: override.extends,
        label: override.label ?? id,
        icon: override.icon ?? "Plug",
        description: override.description ?? "",
        endpoint: override.endpoint,
        env: override.env,
        defaultModel: override.defaultModel,
        models: override.models,
        additionalModels: override.additionalModels,
        systemPromptFile: override.systemPromptFile,
        systemPrompt: override.systemPrompt,
        enabled: override.enabled ?? true,
        order: override.order ?? 100,
        notes: override.notes,
        id,
      });
    }
    // Entries without `extends` and without a builtin match are dropped
  }

  // Sort: enabled first, then by order asc, then label asc
  return [...byId.values()].sort((a, b) => {
    if ((a.enabled ?? true) !== (b.enabled ?? true)) {
      return (a.enabled ?? true) ? -1 : 1;
    }
    const oa = a.order ?? 100;
    const ob = b.order ?? 100;
    if (oa !== ob) return oa - ob;
    return a.label.localeCompare(b.label);
  });
}

/** Look up a single resolved provider by id. */
export function getProvider(id: string): ResolvedProvider | undefined {
  return resolveProviders().find((p) => p.id === id);
}

/**
 * Follow the `extends` chain to find the resolved endpoint + env + base
 * for a given provider. Used by the OpenAI-compat streaming adapter.
 */
export interface ResolvedEndpoint {
  endpoint: string;
  env: string;
  systemPromptFile?: string;
  systemPrompt?: string;
  /** Whether the parent chain had `openai-compat` as a base. */
  isOpenAICompat: boolean;
}

/** Resolve the endpoint + env by walking the `extends` chain. */
export function resolveEndpoint(providerId: string): ResolvedEndpoint | null {
  const providers = resolveProviders();
  const byId = new Map(providers.map((p) => [p.id, p]));

  let current = byId.get(providerId);
  if (!current) return null;

  const chain: ResolvedProvider[] = [current];
  while (current.extends && current.extends !== current.id) {
    const parent = byId.get(current.extends);
    if (!parent) break;
    chain.push(parent);
    current = parent;
  }

  // Walk from the base upward, letting concrete overrides win
  let endpoint = "";
  let env = "";
  let systemPromptFile: string | undefined;
  let systemPrompt: string | undefined;
  let isOpenAICompat = false;

  // chain is ordered [provider, parent, grandparent, ..., base]
  // Walk base-first so the most-concrete entry overrides
  for (let i = chain.length - 1; i >= 0; i--) {
    const p = chain[i];
    if (p.id === "openai-compat" || p.extends === "openai-compat") {
      isOpenAICompat = true;
    }
    if (p.endpoint) endpoint = p.endpoint;
    if (p.env) env = p.env;
    if (p.systemPromptFile) systemPromptFile = p.systemPromptFile;
    if (p.systemPrompt) systemPrompt = p.systemPrompt;
  }

  if (!endpoint || !env) return null;

  return { endpoint, env, systemPromptFile, systemPrompt, isOpenAICompat };
}

/** Expand `~` in a path. */
export function expandPath(p: string): string {
  if (p.startsWith("~")) return join(homedir(), p.slice(1));
  return p;
}
