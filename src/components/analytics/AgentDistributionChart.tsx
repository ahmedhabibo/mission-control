"use client";

import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
} from "recharts";
import type { AgentDistDataPoint } from "@/lib/analytics/transforms";

interface AgentDistributionChartProps {
  data: AgentDistDataPoint[];
}

/**
 * Agent distribution chart — donut chart showing tool count by status
 * (online, degraded, offline, unknown).
 */
export function AgentDistributionChart({ data }: AgentDistributionChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-[280px] items-center justify-center text-sm text-[var(--muted-foreground)]">
        No tools registered yet.
      </div>
    );
  }

  const total = data.reduce((acc, d) => acc + d.value, 0);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={90}
          paddingAngle={2}
          dataKey="value"
          nameKey="name"
          stroke="var(--card)"
          strokeWidth={2}
        >
          {data.map((entry) => (
            <Cell key={entry.name} fill={entry.color} />
          ))}
        </Pie>
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
            return [
              `${v} (${total > 0 ? Math.round((v / total) * 100) : 0}%)`,
              String(name),
            ];
          }) as never}
        />
        <Legend
          verticalAlign="bottom"
          height={32}
          wrapperStyle={{ fontSize: 11, color: "var(--muted-foreground)" }}
          iconType="circle"
          iconSize={8}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
