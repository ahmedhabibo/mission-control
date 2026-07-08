"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import type { TokenUsageDataPoint } from "@/lib/analytics/transforms";

interface TokenBurnChartProps {
  data: TokenUsageDataPoint[];
}

/**
 * Token burn chart — stacked area chart showing prompt vs completion token
 * usage per task status category.
 */
export function TokenBurnChart({ data }: TokenBurnChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-[280px] items-center justify-center text-sm text-[var(--muted-foreground)]">
        No token usage recorded yet.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart
        data={data}
        margin={{ top: 10, right: 16, left: 0, bottom: 0 }}
      >
        <defs>
          <linearGradient id="tokPrompt" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.5} />
            <stop offset="95%" stopColor="#6366f1" stopOpacity={0.05} />
          </linearGradient>
          <linearGradient id="tokComp" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#22c55e" stopOpacity={0.5} />
            <stop offset="95%" stopColor="#22c55e" stopOpacity={0.05} />
          </linearGradient>
        </defs>
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
          tickFormatter={(v) => {
            if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}m`;
            if (v >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
            return String(v);
          }}
          tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={50}
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
          formatter={((value: unknown, name: unknown) => {
            const v = Number(value);
            const label = name === "prompt" ? "Prompt" : "Completion";
            return [Number.isNaN(v) ? "0" : v.toLocaleString(), label];
          }) as never}
        />
        <Legend
          wrapperStyle={{ fontSize: 11, color: "var(--muted-foreground)" }}
          iconType="circle"
          iconSize={8}
        />
        <Area
          type="monotone"
          dataKey="prompt"
          stackId="tokens"
          stroke="#6366f1"
          fill="url(#tokPrompt)"
          strokeWidth={1.5}
        />
        <Area
          type="monotone"
          dataKey="completion"
          stackId="tokens"
          stroke="#22c55e"
          fill="url(#tokComp)"
          strokeWidth={1.5}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
