/**
 * Core type definitions for Mission Control.
 *
 * The whole system is config-driven: each tool declares how to probe it,
 * and the probe engine dispatches to the right adapter. Adapters are the
 * four union members below (`http` | `cli` | `docker` | `composite`).
 */

/** A tool's observed health at a point in time. */
export type HealthStatus = "online" | "degraded" | "offline" | "unknown";

/**
 * Probe adapters. A tool's `probe` field uses exactly one of these shapes.
 * - `http`: ping an HTTP endpoint (gated by the gateway for any agent).
 * - `cli`: run a local command, success = exit 0 (opencode, zcode, paseo).
 * - `composite`: run several sub-probes and roll up their results.
 * - `gateway`: ask the Mission Control gateway about the agent.
 */
export type ProbeConfig =
  | HttpProbe
  | CliProbe
  | CompositeProbe
  | GatewayProbe;

export interface GatewayProbe extends ProbeBase {
  type: "gateway";
  /** Agent id as registered in the gateway (matches CHAT_AGENTS ids). */
  agentId: string;
  /** Override the gateway URL via env var. Default reads MC_GATEWAY_URL. */
  urlEnv?: string;
  timeoutMs?: number;
}

interface ProbeBase {
  /** Friendly label shown next to the probe's own status chip. */
  label: string;
}

export interface HttpProbe extends ProbeBase {
  type: "http";
  /** Absolute URL to GET. `env` values resolve at runtime, e.g. `{NIM_BASE_URL}/v1/models`. */
  url: string;
  /** Expected status code range; default 2xx is acceptable. */
  expectStatus?: number;
  /** Env var names whose presence we check before treating the tool as configurable. */
  requiresEnv?: string[];
  /** Bearer token env var, if the endpoint needs auth. */
  authHeaderEnv?: string;
  /** Timeout in ms (default 5000). */
  timeoutMs?: number;
}

export interface CliProbe extends ProbeBase {
  type: "cli";
  /** Command array, e.g. ["opencode", "--version"]. */
  command: string[];
  /** Regex tested against stdout; capture group 1 becomes `version`. Optional. */
  versionRegex?: string;
  /** Working directory for the command. Optional. */
  cwd?: string;
  timeoutMs?: number;
}

export interface CompositeProbe extends ProbeBase {
  type: "composite";
  /** Sub-probes run in parallel; each gets its own chip in the UI. */
  components: ProbeConfig[];
  /**
   * Roll-up rule for the parent's overall status:
   * - `any-online` (default): parent online if ≥1 online; offline only if all offline.
   * - `all-online`:     parent online only when every component is online.
   */
  rollup?: "any-online" | "all-online";
}

/** A single tool in the registry. */
export interface ToolDefinition {
  /** Stable slug, used in URLs and the DB. */
  id: string;
  /** Display name. */
  name: string;
  /** One-line description for the card. */
  description: string;
  /** Icon name from lucide-react. */
  icon: string;
  /** Category for grouping/filtering in the UI. */
  category: "brain" | "coding" | "messaging" | "design" | "knowledge" | "mobile";
  /** Where the tool runs — affects probe assumptions. */
  deployment: "local" | "remote" | "hybrid";
  /** The probe definition. */
  probe: ProbeConfig;
  /** Docs/links shown on the detail page. */
  links?: { label: string; url: string }[];
  /** Off by default until the user configures it. */
  enabled?: boolean;
}

/** Result of running one probe. */
export interface ProbeResult {
  status: HealthStatus;
  /** Latency in ms, or null if the probe didn't measure it. */
  latencyMs: number | null;
  /** Detected version string, if any. */
  version: string | null;
  /** Human-readable detail (error message, model count, etc.). */
  detail: string;
  /** ISO timestamp. */
  checkedAt: string;
}

/** A composite tool also returns per-component results. */
export interface CompositeProbeResult extends ProbeResult {
  components?: { label: string; result: ProbeResult }[];
}

/** A tool's full status: its definition snapshot + latest probe result. */
export interface ToolStatus {
  tool: ToolDefinition;
  result: ProbeResult;
}

/** Roll-up status across all tools (for the dashboard header). */
export interface BoardSummary {
  total: number;
  online: number;
  degraded: number;
  offline: number;
  unknown: number;
  /** ISO timestamp of the last sweep. */
  lastSweep: string | null;
}
