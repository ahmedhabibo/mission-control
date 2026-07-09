import type { ToolDefinition } from "@/lib/types";

/**
 * The tool registry — the single source of truth for every tool Mission
 * Control knows about. Adding or editing a tool is a change here, not a
 * code change in the adapters. Probes are typed and validated at compile time.
 *
 * v0.3 — tools are wired through the Mission Control Gateway.
 * Every probe of type `gateway` calls `GET /v1/agents/:id/health` on the
 * configured gateway, with no provider API key in scope here. The CLI
 * probes (`opencode`, `paseo`) still shell out locally for
 * `--version` since those binaries are user-side.
 *
 * Tools default to `enabled: false` if they need a gateway and one isn't
 * yet configured; unconfigured probes report `unknown`, not `offline`.
 */
export const TOOLS: ToolDefinition[] = [
  {
    id: "hermes",
    name: "Hermes Agent",
    description: "Main brain — Nvidia NIM core + desktop / web / messaging surfaces.",
    icon: "BrainCircuit",
    category: "brain",
    deployment: "hybrid",
    probe: {
      type: "gateway",
      label: "Hermes",
      agentId: "hermes",
      timeoutMs: 5000,
    },
    links: [{ label: "Nvidia NIM", url: "https://build.nvidia.com" }],
  },

  {
    id: "opencode",
    name: "Opencode",
    description: "Open coding agent (local binary).",
    icon: "Code2",
    category: "coding",
    deployment: "local",
    probe: {
      type: "cli",
      label: "opencode",
      command: ["opencode", "--version"],
      versionRegex: "v?(\\d+\\.\\d+\\.\\d+[^\\s]*)",
      timeoutMs: 5000,
    },
    links: [{ label: "opencode.ai", url: "https://opencode.ai" }],
  },

  {
    id: "mistral-vibe",
    name: "Mistral Vibe",
    description: "Mistral coding agent — free tier.",
    icon: "Sparkles",
    category: "coding",
    deployment: "remote",
    probe: {
      type: "gateway",
      label: "Mistral Vibe",
      agentId: "mistral-vibe",
      timeoutMs: 5000,
    },
    links: [{ label: "mistral.ai", url: "https://mistral.ai" }],
  },

  {
    id: "paseo",
    name: "Paseo",
    description: "Agent + worktree manager — desktop & mobile.",
    icon: "Smartphone",
    category: "mobile",
    deployment: "local",
    probe: {
      type: "cli",
      label: "paseo",
      command: ["paseo", "--version"],
      versionRegex: "v?(\\d+\\.\\d+\\.\\d+[^\\s]*)",
      timeoutMs: 5000,
    },
  },


];

/** Look up a tool by id. */
export function getTool(id: string): ToolDefinition | undefined {
  return TOOLS.find((t) => t.id === id);
}
