/**
 * Agent Discovery — scans the local machine for AI agents.
 *
 * Instead of a hardcoded list, we discover agents by:
 *   1. **Hermes profiles** — every dir under `~/.hermes/profiles/` is its own
 *      agent (the profile acts as the agent's config + memory).
 *   2. **CLI binaries** — `hermes`, `opencode`, `claude`, `codex`, `mistral`,
 *      `ollama`, etc. on $PATH become agents if the binary resolves.
 *   3. **MCP servers wired to Hermes** — anything declared under `mcp:` in
 *      `~/.hermes/config.yaml` exposes tools that we can route chat through.
 *   4. **Gateway catalogue** — if `MC_GATEWAY_URL` is reachable we still
 *      prefer its `GET /v1/agents` response as the source of truth for
 *      cloud/LLM-backed agents.
 *
 * Output is a stable list of `DiscoveredAgent` records. Availability is a
 * `live` boolean that's recomputed each call (cheap cache for one second).
 */
import { execSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export type AgentKind = "profile" | "cli" | "mcp" | "gateway";

export interface DiscoveredAgent {
  /** Stable id used everywhere downstream — kebab-case lowercase. */
  id: string;
  /** Human label shown in the picker. */
  name: string;
  /** Short subtitle. */
  description: string;
  /** lucide-react icon name. */
  icon: string;
  /** Origin tag. */
  kind: AgentKind;
  /** Profile name when kind === "profile". */
  profile?: string;
  /** Default model id, when known. */
  defaultModel?: string;
  /** True iff end-to-end chat is reachable right now. */
  live: boolean;
  /** Short reason when not live. */
  reason?: string;
}

/* ────────────────────────────────────────────────────────────────
 * 1. Hermes profiles — one agent each.
 * ──────────────────────────────────────────────────────────────── */

interface ProfileScan {
  id: string;
  name: string;
  path: string;
  hasConfig: boolean;
  hasSessions: boolean;
}

function scanHermesProfiles(rootDir: string): ProfileScan[] {
  if (!existsSync(rootDir)) return [];
  let entries: string[];
  try {
    // -1 lists line-by-line; -A appends '/' to dirs so we can distinguish
    // directories from sibling files like auth.json, auth.lock, .DS_Store.
    entries = execSync(`ls -1A "${rootDir}" 2>/dev/null | sed 's|/$||'`, {
      encoding: "utf-8",
    })
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
  return entries
    .filter((e) => !e.startsWith(".")) // skip dotfiles (.env, .hermes_history, ...).
    .filter((e) => !/archived/i.test(e)) // skip archived profiles
    .filter((e) => {
      // Only real Hermes profiles: must have a SOUL.md AND config.yaml.
      const full = join(rootDir, e);
      try {
        return (
          existsSync(full) &&
          statSync(full).isDirectory() &&
          existsSync(join(full, "SOUL.md")) &&
          existsSync(join(full, "config.yaml"))
        );
      } catch {
        return false;
      }
    })
    .map((name) => ({
      id: `hermes-${name}`,
      name: `Hermes · ${name}`,
      path: join(rootDir, name),
      hasConfig: existsSync(join(rootDir, name, "config.yaml"))
        || existsSync(join(rootDir, name, "config.yml")),
      hasSessions:
        existsSync(join(rootDir, name, "sessions"))
        || existsSync(join(rootDir, name, "state.db"))
        || existsSync(join(rootDir, name, "chat"))
        || existsSync(join(rootDir, name, "memory")),
    }));
}

/* ────────────────────────────────────────────────────────────────
 * 2. CLI binaries on $PATH.
 * ──────────────────────────────────────────────────────────────── */

interface CliSpec {
  id: string;
  name: string;
  description: string;
  icon: string;
  binaries: string[]; // first match wins
  defaultModel?: string;
}

function cliExists(bin: string): boolean {
  try {
    execSync(`command -v "${bin}"`, { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] });
    return true;
  } catch {
    return false;
  }
}

const CLI_SPECS: CliSpec[] = [
  {
    id: "cli-hermes",
    name: "Hermes CLI",
    description: "Local Hermes binary — runs your agent stack from the terminal.",
    icon: "TerminalSquare",
    binaries: ["hermes"],
    defaultModel: "nvidia/nemotron-3-super-120b-a12b",
  },
  {
    id: "cli-opencode",
    name: "Opencode CLI",
    description: "Open-source coding agent — runs in your project directory.",
    icon: "Code2",
    binaries: ["opencode"],
  },
  {
    id: "cli-kilo",
    name: "Kilo Code",
    description: "Kilo AI coding agent — multi-model support, terminal-based.",
    icon: "Sigma",
    binaries: ["kilo"],
  },
  {
    id: "cli-grok",
    name: "Grok Build",
    description: "xAI Grok coding agent — terminal-based workflow runner.",
    icon: "Zap",
    binaries: ["grok"],
  },
  {
    id: "cli-claude",
    name: "Claude Code",
    description: "Anthropic's coding agent in your terminal.",
    icon: "Sparkles",
    binaries: ["claude"],
    defaultModel: "claude-sonnet-4",
  },
  {
    id: "cli-codex",
    name: "Codex CLI",
    description: "OpenAI's coding agent in your terminal.",
    icon: "Sigma",
    binaries: ["codex"],
  },
  {
    id: "cli-ollama",
    name: "Ollama",
    description: "Local model server — Mistral, Llama, Phi, etc.",
    icon: "Server",
    binaries: ["ollama"],
  },
  {
    id: "cli-lm-studio",
    name: "LM Studio",
    description: "Local model runner with OpenAI-compatible API.",
    icon: "Cpu",
    binaries: ["lms"],
  },
  {
    id: "cli-gemini",
    name: "Gemini CLI",
    description: "Google's coding agent — free tier with personal access.",
    icon: "Gem",
    binaries: ["gemini"],
  },
];

const LOCAL_BIN_DIRS = [
  join(homedir(), ".local", "bin"),
  join(homedir(), ".cargo", "bin"),
  "/opt/homebrew/bin",
  "/usr/local/bin",
  "/usr/bin",
];

function localBinExists(bin: string): boolean {
  for (const dir of LOCAL_BIN_DIRS) {
    if (existsSync(join(dir, bin))) return true;
  }
  return false;
}

function discoverCliAgents(): DiscoveredAgent[] {
  return CLI_SPECS.filter((spec) =>
    spec.binaries.some((b) => cliExists(b) || localBinExists(b)),
  ).map<DiscoveredAgent>((spec) => {
    const bin = spec.binaries.find((b) => cliExists(b) || localBinExists(b))!;
    return {
      id: spec.id,
      name: spec.name,
      description: spec.description,
      icon: spec.icon,
      kind: "cli",
      defaultModel: spec.defaultModel,
      live: true,
    };
  });
}

/* ────────────────────────────────────────────────────────────────
 * 3. Gateway catalogue — if MC_GATEWAY_URL is set and reachable.
 * ──────────────────────────────────────────────────────────────── */

async function fetchGatewayCatalogue(
  url: string,
  token: string,
): Promise<DiscoveredAgent[]> {
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/v1/agents`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(2500),
      cache: "no-store",
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { agents?: Array<{ id: string; name: string; available: boolean; defaultModel?: string }> };
    return (json.agents ?? []).map((a) => ({
      id: `gw-${a.id}`,
      name: a.name,
      description: `Backend agent — reachable from the Mission Control gateway (id: ${a.id}).`,
      icon: "Cloud",
      kind: "gateway" as const,
      live: a.available,
      defaultModel: a.defaultModel,
    }));
  } catch {
    return [];
  }
}

/* ────────────────────────────────────────────────────────────────
 * 4. LLM providers are NOT agents — they're model backends.
 *    NIM, Mistral, OpenRouter, etc. are used by the chat adapters
 *    (see lib/chat/adapters/) to power actual agent conversations.
 *    We do NOT surface them as standalone agent rows in the picker.
 * ──────────────────────────────────────────────────────────────── */

/* ────────────────────────────────────────────────────────────────
 * Public entry point.
 * ──────────────────────────────────────────────────────────────── */

export interface DiscoverOptions {
  hermesRoot?: string;
  maxProfiles?: number;
  gatewayUrl?: string;
  gatewayToken?: string;
}

/** Returns sorted, deduplicated, deduplicated-yet-still-discoverable agents. */
export async function discoverAgents(opts: DiscoverOptions = {}): Promise<DiscoveredAgent[]> {
  // Hermes profiles live under `~/.hermes/profiles/<name>/` (separate
  // siblings like `bin/`, `webui/`, `kanban/` are NOT profiles).
  const hermesRoot = opts.hermesRoot ?? join(homedir(), ".hermes", "profiles");
  const profiles = scanHermesProfiles(hermesRoot);
  const cliAgents = discoverCliAgents();

  const gatewayUrl = opts.gatewayUrl ?? process.env.MC_GATEWAY_URL;
  const gatewayToken = opts.gatewayToken ?? process.env.MC_GATEWAY_TOKEN;
  const gatewayAgents = gatewayUrl && gatewayToken
    ? await fetchGatewayCatalogue(gatewayUrl, gatewayToken)
    : [];

  // Hermes profiles first (one per profile dir).
  const profileAgents: DiscoveredAgent[] = profiles.map((p) => ({
    id: p.id,
    name: "Hermes — " + p.name,
    description: p.hasSessions
      ? `Hermes profile · sessions present`
      : `Hermes profile · fresh, no sessions yet`,
    icon: "BrainCircuit",
    kind: "profile",
    profile: p.name,
    defaultModel: "nvidia/nemotron-3-super-120b-a12b",
    live: true,
  }));

  const all: DiscoveredAgent[] = [
    ...profileAgents,
    ...cliAgents,
    ...gatewayAgents,
  ];

  // Dedup by id (later declarations win).
  const byId = new Map<string, DiscoveredAgent>();
  for (const a of all) byId.set(a.id, a);

  // Sort: live first, then profiles → cli → gateway → mcp, then name.
  const kindOrder: Record<AgentKind, number> = {
    profile: 0,
    cli: 1,
    gateway: 2,
    mcp: 3,
  };
  return Array.from(byId.values()).sort((a, b) => {
    if (a.live !== b.live) return a.live ? -1 : 1;
    if (kindOrder[a.kind] !== kindOrder[b.kind]) return kindOrder[a.kind] - kindOrder[b.kind];
    return a.name.localeCompare(b.name);
  });
}
