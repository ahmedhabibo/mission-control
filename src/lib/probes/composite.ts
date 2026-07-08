import type { CompositeProbe, CompositeProbeResult, ProbeConfig, ProbeResult } from "@/lib/types";
import { runCliProbe } from "./cli";
import { runGatewayProbe } from "./gateway";
import { runHttpProbe } from "./http";

/** Dispatch a single (non-composite) probe to its adapter. */
export async function runProbe(probe: ProbeConfig): Promise<ProbeResult> {
  switch (probe.type) {
    case "http":
      return runHttpProbe(probe);
    case "cli":
      return runCliProbe(probe);
    case "gateway":
      return runGatewayProbe(probe);
    case "composite":
      // Nested composites aren't supported — flatten at config time instead.
      throw new Error("composite probes cannot be nested");
    default: {
      const _exhaustive: never = probe;
      throw new Error(`Unhandled probe type: ${(_exhaustive as { type: string }).type}`);
    }
  }
}

/**
 * Composite probe adapter (used by Hermes).
 *
 * Runs all component sub-probes in parallel, then rolls the parent's status
 * up from them. `any-online` (default): online if ≥1 component is online,
 * offline only if all are offline, degraded otherwise. `all-online`: parent
 * is online only when every component is online.
 */
export async function runCompositeProbe(
  probe: CompositeProbe,
): Promise<CompositeProbeResult> {
  const entries = await Promise.all(
    probe.components.map(async (c) => ({
      label: c.label,
      result: await runProbe(c),
    })),
  );

  const rollup = probe.rollup ?? "any-online";
  const statuses = entries.map((e) => e.result.status);

  let parentStatus: ProbeResult["status"];
  if (rollup === "all-online") {
    parentStatus = statuses.every((s) => s === "online")
      ? "online"
      : statuses.every((s) => s === "offline" || s === "unknown")
        ? "offline"
        : "degraded";
  } else {
    // any-online
    parentStatus = statuses.some((s) => s === "online")
      ? statuses.some((s) => s === "offline" || s === "unknown")
        ? "degraded"
        : "online"
      : statuses.every((s) => s === "unknown")
        ? "unknown"
        : "offline";
  }

  // For latency, report the slowest online component so the user feels the
  // "worst case" response time, or null if nothing responded.
  const latencies = entries
    .map((e) => e.result.latencyMs)
    .filter((v): v is number => v !== null);
  const latencyMs = latencies.length ? Math.max(...latencies) : null;

  return {
    status: parentStatus,
    latencyMs,
    version: null,
    detail: `${entries.filter((e) => e.result.status === "online").length}/${entries.length} components online`,
    checkedAt: new Date().toISOString(),
    components: entries,
  };
}
