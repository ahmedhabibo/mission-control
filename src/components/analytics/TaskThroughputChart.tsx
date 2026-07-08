"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";
import { CHART_COLORS } from "@/lib/analytics/transforms";
import type { TaskThroughputDataPoint } from "@/lib/analytics/transforms";

interface TaskThroughputChartProps {
  data: TaskThroughputDataPoint[];
}

/** Map task status names to chart colours. */
const STATUS_COLORS: Record<string, string> = {
  Done: CHART_COLORS.done,
  Running: CHART_COLORS.running,
  Queued: CHART_COLORS.queued,
  Failed: CHART_COLORS.failed,
  Cancelled: CHART_COLORS.cancelled,
};

/**
 * Task throughput chart — vertical bar chart showing task counts per status.
 * Each bar is colour-coded by its status.
 */
export function TaskThroughputChart({ data }: TaskThroughputChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-[280px] items-center justify-center text-sm text-[var(--muted-foreground)]">
        No tasks submitted yet.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart
        data={data}
        margin={{ top: 10, right: 16, left: 0, bottom: 0 }}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="var(--border)"
          vertical={false}
        />
        <XAxis
          dataKey="name"
          tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: "var(--border)" }}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={35}
        />
        <Tooltip
          contentStyle={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: 12,
            color: "var(--foreground)",
          }}
          labelStyle={{ color: "var(--foreground)", fontWeight: 600 }}
          formatter={((value: unknown) => [Number(value), "Tasks"]) as never}
        />
        <Bar
          dataKey="count"
          name="Tasks"
          radius={[4, 4, 0, 0]}
          maxBarSize={60}
        >
          {data.map((entry) => (
            <Cell
              key={entry.name}
              fill={STATUS_COLORS[entry.name] ?? CHART_COLORS.unknown}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
