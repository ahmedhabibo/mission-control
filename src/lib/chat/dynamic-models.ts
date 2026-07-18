/**
 * Dynamic model discovery — reads models from Hermes config.yaml.
 *
 * Instead of a hardcoded list, we parse ~/.hermes/config.yaml to get the
 * actual models the user has configured. This is the single source of
 * truth for the model picker.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface DiscoveredModel {
  id: string;
  provider: "nvidia" | "mistral" | "openrouter" | "openai" | "anthropic";
  friendlyName: string;
  description?: string;
  contextWindow?: number;
  latency?: "fast" | "medium" | "slow";
  price?: "free" | "cheap" | "moderate" | "expensive";
  /** Whether this model is the user's default (from config.yaml). */
  isDefault?: boolean;
}

// Simple YAML parser — we only need to extract model IDs from the providers section.
// We avoid the js-yaml dependency since we just need model names.
function parseModelsFromYaml(yamlText: string): DiscoveredModel[] {
  const models: DiscoveredModel[] = [];
  const lines = yamlText.split("\n");

  let inProviders = false;
  let currentProvider: string | null = null;
  let inModels = false;
  let defaultModel: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Detect default model
    if (trimmed.startsWith("default:") && !inProviders) {
      const m = trimmed.match(/default:\s*(\S+)/);
      if (m) defaultModel = m[1].replace(/^["']|["']$/g, "");
    }

    // Detect providers section
    if (/^providers:/.test(trimmed)) {
      inProviders = true;
      continue;
    }

    if (inProviders) {
      // New provider block (2-space indent, no further indent)
      const providerMatch = line.match(/^  (\w+):\s*$/);
      if (providerMatch) {
        currentProvider = providerMatch[1];
        inModels = false;
        continue;
      }

      // Non-indented line means we've left providers
      if (/^\S/.test(line) && !line.startsWith(" ")) {
        inProviders = false;
        currentProvider = null;
        continue;
      }

      // Detect models: subsection
      if (currentProvider && line.match(/^    models:\s*$/)) {
        inModels = true;
        continue;
      }

      // Parse model entries (6-space indent key: under models:)
      if (inModels && currentProvider) {
        const modelMatch = line.match(/^      (\S+):\s*$/);
        if (modelMatch) {
          const modelId = modelMatch[1].replace(/:$/, "");
          if (modelId && !modelId.includes(":")) {
            const provider = mapProvider(currentProvider);
            models.push({
              id: modelId,
              provider,
              friendlyName: friendlyName(modelId),
            });
          }
        }
      }
    }
  }

  // Mark the default model
  if (defaultModel) {
    for (const m of models) {
      if (m.id === defaultModel) m.isDefault = true;
    }
  }

  return models;
}

function mapProvider(yamlProvider: string): DiscoveredModel["provider"] {
  switch (yamlProvider.toLowerCase()) {
    case "nvidia":
      return "nvidia";
    case "mistral":
      return "mistral";
    case "openrouter":
      return "openrouter";
    case "openai":
      return "openai";
    case "anthropic":
      return "anthropic";
    default:
      return "nvidia";
  }
}

function friendlyName(modelId: string): string {
  // Extract the short name from model IDs like "nvidia/nemotron-3-super-120b-a12b"
  const parts = modelId.split("/");
  const shortName = parts[parts.length - 1];

  // Clean up: replace hyphens with spaces, title-case
  return shortName
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/(\d+)b\b/gi, "$1B");
}

let cached: DiscoveredModel[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 60_000; // 1 minute

/** Returns models discovered from Hermes config.yaml. */
export function discoverModels(): DiscoveredModel[] {
  const now = Date.now();
  if (cached && now - cacheTime < CACHE_TTL) return cached;

  const configPath = join(homedir(), ".hermes", "config.yaml");
  if (!existsSync(configPath)) {
    cached = [];
    return cached;
  }

  try {
    const yamlText = readFileSync(configPath, "utf-8");
    cached = parseModelsFromYaml(yamlText);
    cacheTime = now;
    return cached;
  } catch {
    cached = [];
    return cached;
  }
}

/** Returns models for a specific agent (by provider). */
export function modelsForChatAgent(agentId: string): DiscoveredModel[] {
  const all = discoverModels();
  switch (agentId) {
    case "nim":
    case "hermes":
      return all.filter((m) => m.provider === "nvidia");
    case "mistral-direct":
      return all.filter((m) => m.provider === "mistral");
    case "openrouter":
      return all.filter((m) => m.provider === "openrouter");
    default:
      return all;
  }
}
