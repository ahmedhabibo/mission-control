/**
 * Analytics data transformation utilities.
 *
 * Converts raw dashboard API data into chart-compatible formats for the
 * Recharts-based analytics charts on the Dashboard page.
 */

/** A single data point for any chart series. */
export interface ChartDataPoint {
  name: string;
  value: number;
  [key: string]: string | number;
}

/** Tool health data point for the uptime trend chart. */
export interface UptimeDataPoint {
  name: string;
  uptime: number | null;
  avgLatencyMs: number | null;
  checks: number;
  status: string;
}

/** Token usage data point for the token burn area chart. */
export interface TokenUsageDataPoint {
  name: string;
  prompt: number;
  completion: number;
  total: number;
}

/** Task throughput data point for the bar chart. */
export interface TaskThroughputDataPoint {
  name: string;
  count: number;
  avgLatencyMs: number | null;
}

/** Agent distribution data point for the donut chart. */
export interface AgentDistDataPoint {
  name: string;
  value: number;
  color: string;
}

/** Colour palette aligned with the Mission Control dark theme. */
export const CHART_COLORS = {
  online: "#22c55e",
  degraded: "#f59e0b",
  offline: "#ef4444",
  unknown: "#6b7280",
  accent: "#6366f1",
  prompt: "#6366f1",
  completion: "#22c55e",
  done: "#22c55e",
  running: "#6366f1",
  queued: "#f59e0b",
  failed: "#ef4444",
  cancelled: "#6b7280",
} as const;

/** Extra palette for multi-series charts. */
export const SERIES_COLORS = [
  "#6366f1",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#6b7280",
  "#ec4899",
  "#06b6d4",
  "#8b5cf6",
] as const;

/**
 * Transform the dashboard `tools` array into uptime trend chart data.
 * Each data point represents one tool with its uptime percentage and
 * average latency, sorted by uptime descending (healthiest first).
 */
export function transformUptimeData(
  tools: Array<{
    id: string;
    name: string;
    status: string;
    uptimePct: number | null;
    avgLatencyMs: number | null;
    checks: number;
  }>,
): UptimeDataPoint[] {
  return [...tools]
    .map((t) => ({
      name: t.name,
      uptime: t.uptimePct,
      avgLatencyMs: t.avgLatencyMs,
      checks: t.checks,
      status: t.status,
    }))
    .sort((a, b) => (b.uptime ?? -1) - (a.uptime ?? -1));
}

/**
 * Transform task status buckets into token usage chart data.
 * Produces one data point per task status that has any token usage.
 */
export function transformTokenUsageData(
  byStatus: Record<
    string,
    {
      count: number;
      avgLatencyMs: number | null;
      tokens: { prompt: number; completion: number };
    }
  >,
): TokenUsageDataPoint[] {
  return Object.entries(byStatus)
    .filter(([, v]) => v.tokens.prompt > 0 || v.tokens.completion > 0)
    .map(([status, bucket]) => ({
      name: status.charAt(0).toUpperCase() + status.slice(1),
      prompt: bucket.tokens.prompt,
      completion: bucket.tokens.completion,
      total: bucket.tokens.prompt + bucket.tokens.completion,
    }));
}

/**
 * Transform task status buckets into throughput chart data.
 * Produces one bar per status with its task count.
 */
export function transformTaskThroughputData(
  byStatus: Record<
    string,
    {
      count: number;
      avgLatencyMs: number | null;
      tokens: { prompt: number; completion: number };
    }
  >,
): TaskThroughputDataPoint[] {
  const order = ["done", "running", "queued", "failed", "cancelled"];
  return order
    .filter((key) => byStatus[key]?.count > 0)
    .map((key) => ({
      name: key.charAt(0).toUpperCase() + key.slice(1),
      count: byStatus[key].count,
      avgLatencyMs: byStatus[key].avgLatencyMs,
    }));
}

/**
 * Transform the tool status distribution into donut chart data.
 * Uses the CSS-variable-aligned colour palette.
 */
export function transformAgentDistData(
  statusDistribution: Record<string, number>,
): AgentDistDataPoint[] {
  const colorMap: Record<string, string> = {
    online: CHART_COLORS.online,
    degraded: CHART_COLORS.degraded,
    offline: CHART_COLORS.offline,
    unknown: CHART_COLORS.unknown,
  };
  return Object.entries(statusDistribution)
    .filter(([, count]) => count > 0)
    .map(([status, count]) => ({
      name: status.charAt(0).toUpperCase() + status.slice(1),
      value: count,
      color: colorMap[status] ?? CHART_COLORS.unknown,
    }));
}
