/**
 * Dashboard analytics — aggregates historical task + conversation data
 * from Mission Control's SQLite DB.
 *
 * Returns:
 *   - Per-agent task stats (count, success rate, tokens, latency)
 *   - Token usage over time (last 7 days, bucketed by day)
 *   - Tasks per agent over time
 *   - Intent distribution (code, design, research, knowledge, chat)
 *   - Recent conversations per agent
 */
import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";

export const dynamic = "force-dynamic";

const MC_DB = join(process.cwd(), "data", "mission-control.db");

interface AnalyticsResult {
  agents: Array<{
    id: string;
    name: string;
    taskCount: number;
    doneCount: number;
    failedCount: number;
    successRate: number;
    totalTokens: number;
    avgLatencyMs: number | null;
    lastUsedAt: string | null;
  }>;
  tokenUsageByDay: Array<{ date: string; promptTokens: number; completionTokens: number }>;
  tasksByDay: Array<{ date: string; count: number }>;
  intentDistribution: Array<{ intent: string; count: number }>;
  statusDistribution: Array<{ status: string; count: number }>;
  totals: { tasks: number; agents: number; sessions: number; messages: number; totalTokens: number };
  recentActivity: Array<{
    agentId: string;
    taskId: string;
    title: string;
    status: string;
    intent: string | null;
    createdAt: string;
    promptTokens: number;
    completionTokens: number;
  }>;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const days = Math.min(parseInt(searchParams.get("days") || "7"), 90);

  if (!existsSync(MC_DB)) {
    return NextResponse.json({
      agents: [],
      tokenUsageByDay: [],
      tasksByDay: [],
      intentDistribution: [],
      statusDistribution: [],
      totals: { tasks: 0, agents: 0, sessions: 0, messages: 0, totalTokens: 0 },
      recentActivity: [],
      available: false,
    });
  }

  const db = new Database(MC_DB, { readonly: true, fileMustExist: true });

  // Per-agent aggregation
  if (!readFileSync) readFileSync;
  const agentRows = db
    .prepare(
      `SELECT
         assigned_agent AS id,
         COUNT(*) AS taskCount,
         SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS doneCount,
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failedCount,
         COALESCE(SUM(prompt_tokens + COALESCE(completion_tokens, 0)), 0) AS totalTokens,
         AVG(CASE WHEN latency_ms IS NOT NULL THEN latency_ms END) AS avgLatencyMs,
         MAX(created_at) AS lastUsedAt
       FROM tasks
       WHERE assigned_agent IS NOT NULL
       GROUP BY assigned_agent
       ORDER BY taskCount DESC`,
    )
    .all() as Array<{
      id: string;
      taskCount: number;
      doneCount: number;
      failedCount: number;
      totalTokens: number;
      avgLatencyMs: number | null;
      lastUsedAt: string | null;
    }>;

  const agents = agentRows.map((r) => ({
    id: r.id,
    name: r.id,
    taskCount: r.taskCount,
    doneCount: r.doneCount ?? 0,
    failedCount: r.failedCount ?? 0,
    successRate: r.taskCount > 0 ? Math.round(((r.doneCount ?? 0) / r.taskCount) * 100) : 0,
    totalTokens: r.totalTokens ?? 0,
    avgLatencyMs: r.avgLatencyMs ? Math.round(r.avgLatencyMs) : null,
    lastUsedAt: r.lastUsedAt,
  }));

  // Intent distribution
  const intentRows = db
    .prepare(
      `SELECT intent, COUNT(*) AS count
       FROM tasks
       WHERE intent IS NOT NULL
       GROUP BY intent`,
    )
    .all() as Array<{ intent: string; count: number }>;

  // Status distribution
  const statusRows = db
    .prepare(
      `SELECT status, COUNT(*) AS count
       FROM tasks
       GROUP BY status`,
    )
    .all() as Array<{ status: string; count: number }>;

  // Totals — composed at the end so we can include agent count.
  const aggregated = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM tasks) AS tasks,
         (SELECT COUNT(*) FROM conversations) AS sessions,
         (SELECT COUNT(*) FROM messages) AS messages,
         (SELECT COALESCE(SUM(prompt_tokens + COALESCE(completion_tokens, 0)), 0) FROM tasks) AS totalTokens
       FROM (SELECT 1)`,
    )
    .get() as { tasks: number; sessions: number; messages: number; totalTokens: number };
  const totals = { ...aggregated, agents: agents.length };

  // Tasks + token usage bucketed by day over the window
  const dayRows = db
    .prepare(
      `SELECT
         SUBSTRING(created_at, 1, 10) AS date,
         COUNT(*) AS count,
         COALESCE(SUM(prompt_tokens), 0) AS promptTokens,
         COALESCE(SUM(completion_tokens), 0) AS completionTokens
       FROM tasks
       WHERE created_at >= DATETIME('now', ?)
       GROUP BY SUBSTRING(created_at, 1, 10)
       ORDER BY date ASC`,
    )
    .all(`-${days} days`) as Array<{
      date: string;
      count: number;
      promptTokens: number;
      completionTokens: number;
    }>;

  // Fill in missing days (so the chart renders continuous lines)
  const startTime = Date.now() - days * 24 * 60 * 60 * 1000;
  const tasksByDay: Array<{ date: string; count: number }> = [];
  const tokenUsageByDay: Array<{ date: string; promptTokens: number; completionTokens: number }> = [];
  for (let i = 0; i <= days; i++) {
    const d = new Date(startTime + i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const row = dayRows.find((r) => r.date === d);
    tasksByDay.push({ date: d, count: row?.count ?? 0 });
    tokenUsageByDay.push({
      date: d,
      promptTokens: row?.promptTokens ?? 0,
      completionTokens: row?.completionTokens ?? 0,
    });
  }

  // Recent activity (last 10 tasks)
  const recent = db
    .prepare(
      `SELECT id, assigned_agent, title, status, intent, created_at, prompt_tokens, completion_tokens
       FROM tasks
       ORDER BY created_at DESC
       LIMIT 10`,
    )
    .all() as Array<{
      id: string;
      assigned_agent: string;
      title: string;
      status: string;
      intent: string | null;
      created_at: string;
      prompt_tokens: number | null;
      completion_tokens: number | null;
    }>;
  db.close();

  return NextResponse.json({
    agents,
    tokenUsageByDay,
    tasksByDay,
    intentDistribution: intentRows,
    statusDistribution: statusRows,
    totals: { ...totals, agents: agents.length },
    recentActivity: recent.map((r) => ({
      agentId: r.assigned_agent ?? "unknown",
      taskId: r.id,
      title: r.title,
      status: r.status,
      intent: r.intent,
      createdAt: r.created_at,
      promptTokens: r.prompt_tokens ?? 0,
      completionTokens: r.completion_tokens ?? 0,
    })),
    available: true,
  });
}
