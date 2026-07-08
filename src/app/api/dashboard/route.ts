import { NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/db/client";
import { statusHistory, tasks, conversations, messages } from "@/lib/db/schema";
import { sql, desc, inArray } from "drizzle-orm";
import { getSnapshot, getLastSweepAt } from "@/lib/runner";
import { isGatewayConfigured } from "@/lib/gateway/client";

export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard — analytics view for the main Dashboard page.
 *
 * Sources:
 * - `status_history`   → per-tool uptime + latency + status distribution.
 * - `tasks`            → task counts by status, latency stats, tokens used.
 * - `conversations`    → chat thread count + latest activity.
 * - runner snapshot    → live tool status.
 *
 * Everything is computed from real DB rows + the in-memory snapshot. No
 * fabricated values; if a tool was never probed, its row contributes zero
 * to its averages (rather than appearing as a 0% uptime red herring).
 */
export async function GET() {
  ensureSchema();

  // ── Live snapshot ────────────────────────────────────────────────
  const snapshot = getSnapshot();
  const lastSweep = getLastSweepAt();
  const toolIds = snapshot.map((s) => s.tool.id);

  // ── Per-tool stats from status_history ───────────────────────────
  const perToolRows = toolIds.length
    ? db
        .select({
          toolId: statusHistory.toolId,
          checks: sql<number>`count(*)`.as("checks"),
          online: sql<number>`sum(case when status = 'online' then 1 else 0 end)`.as("online"),
          degraded: sql<number>`sum(case when status = 'degraded' then 1 else 0 end)`.as("degraded"),
          offline: sql<number>`sum(case when status = 'offline' then 1 else 0 end)`.as("offline"),
          unknown: sql<number>`sum(case when status = 'unknown' then 1 else 0 end)`.as("unknown"),
          avgLatency: sql<number | null>`avg(latency_ms)`.as("avg_latency"),
          p50: sql<number | null>`max(latency_ms)`.as("p50"),
          p95: sql<number | null>`max(latency_ms)`.as("p95"),
          lastCheckedAt: sql<string | null>`max(checked_at)`.as("last_checked"),
        })
        .from(statusHistory)
        .where(inArray(statusHistory.toolId, toolIds))
        .groupBy(statusHistory.toolId)
        .all()
    : [];

  const perTool = perToolRows.map((r) => {
    const checks = Number(r.checks) || 0;
    const online = Number(r.online) || 0;
    return {
      toolId: r.toolId,
      checks,
      online,
      degraded: Number(r.degraded) || 0,
      offline: Number(r.offline) || 0,
      unknown: Number(r.unknown) || 0,
      uptimePct: checks > 0 ? Math.round((online / checks) * 1000) / 10 : null,
      avgLatencyMs: r.avgLatency !== null ? Math.round(Number(r.avgLatency)) : null,
      // Without percentile_disc we use max as a conservative upper bound;
      // a true p95 needs a richer SQL or a side computation once N grows.
      p50LatencyMs: r.p50 !== null ? Math.round(Number(r.p50)) : null,
      p95LatencyMs: r.p95 !== null ? Math.round(Number(r.p95)) : null,
      lastCheckedAt: r.lastCheckedAt,
    };
  });

  const perToolById = new Map(perTool.map((p) => [p.toolId, p]));

  // Merge live status → top-level tool card data.
  const tools = snapshot.map((s) => {
    const stats = perToolById.get(s.tool.id);
    return {
      id: s.tool.id,
      name: s.tool.name,
      category: s.tool.category,
      status: s.result.status,
      latencyMs: s.result.latencyMs,
      uptimePct: stats?.uptimePct ?? null,
      avgLatencyMs: stats?.avgLatencyMs ?? null,
      p95LatencyMs: stats?.p95LatencyMs ?? null,
      checks: stats?.checks ?? 0,
    };
  });

  // ── Status distribution across all tools ────────────────────────
  const statusDistribution = snapshot.reduce(
    (acc, s) => {
      acc[s.result.status] = (acc[s.result.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  // ── Task analytics ──────────────────────────────────────────────
  const taskRows = db
    .select({
      status: tasks.status,
      count: sql<number>`count(*)`.as("count"),
      avgLatencyMs: sql<number | null>`avg(latency_ms)`.as("avg_latency_ms"),
      avgPrompt: sql<number | null>`avg(prompt_tokens)`.as("avg_prompt"),
      avgCompletion: sql<number | null>`avg(completion_tokens)`.as("avg_completion"),
      totalPrompt: sql<number | null>`sum(prompt_tokens)`.as("total_prompt"),
      totalCompletion: sql<number | null>`sum(completion_tokens)`.as("total_completion"),
    })
    .from(tasks)
    .groupBy(tasks.status)
    .all();

  const taskByStatus: Record<
    string,
    { count: number; avgLatencyMs: number | null; tokens: { prompt: number; completion: number } }
  > = {};
  let totalTasks = 0;
  for (const row of taskRows) {
    const count = Number(row.count) || 0;
    totalTasks += count;
    taskByStatus[row.status] = {
      count,
      avgLatencyMs: row.avgLatencyMs !== null ? Math.round(Number(row.avgLatencyMs)) : null,
      tokens: {
        prompt: Number(row.totalPrompt) || 0,
        completion: Number(row.totalCompletion) || 0,
      },
    };
  }

  const recentTasks = db
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      intent: tasks.intent,
      assignedAgent: tasks.assignedAgent,
      createdAt: tasks.createdAt,
      completedAt: tasks.completedAt,
      latencyMs: tasks.latencyMs,
    })
    .from(tasks)
    .orderBy(desc(tasks.createdAt))
    .limit(8)
    .all();

  // ── Conversation analytics ──────────────────────────────────────
  const convCountRow = db
    .select({ count: sql<number>`count(*)`.as("n") })
    .from(conversations)
    .all()[0];
  const messageCountRow = db
    .select({ count: sql<number>`count(*)`.as("n") })
    .from(messages)
    .all()[0];
  const lastMessageAt = db
    .select({ at: sql<string | null>`max(created_at)`.as("max_at") })
    .from(messages)
    .all()[0];

  const recentConversations = db
    .select({
      id: conversations.id,
      title: conversations.title,
      agentId: conversations.agentId,
      updatedAt: conversations.updatedAt,
    })
    .from(conversations)
    .orderBy(desc(conversations.updatedAt))
    .limit(5)
    .all();

  // ── Total & distributions ───────────────────────────────────────
  const totalTokens = taskRows.reduce(
    (acc, r) =>
      acc +
      (Number(r.totalPrompt) || 0) +
      (Number(r.totalCompletion) || 0),
    0,
  );

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    gateway: { configured: isGatewayConfigured() },
    lastSweep,
    tools,
    statusDistribution,
    tasks: {
      total: totalTasks,
      byStatus: taskByStatus,
      totalTokens,
      recent: recentTasks,
    },
    conversations: {
      total: Number(convCountRow?.count) || 0,
      messages: Number(messageCountRow?.count) || 0,
      lastActivityAt: lastMessageAt?.at ?? null,
      recent: recentConversations,
    },
  });
}
