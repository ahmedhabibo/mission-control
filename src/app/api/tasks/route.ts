import { NextResponse } from "next/server";
import { ensureSchema } from "@/lib/db/client";
import { createTask, listTasks } from "@/lib/tasks/runner";
import type { Intent } from "@/lib/tasks/types";

export const dynamic = "force-dynamic";

/**
 * GET  /api/tasks          → list tasks (newest first)
 * POST /api/tasks          → create + enqueue a task
 *   body: { prompt, title?, intentHint?, priority?, chainId?, parentIds? }
 */
export async function GET() {
  ensureSchema();
  return NextResponse.json({ tasks: listTasks() });
}

export async function POST(request: Request) {
  ensureSchema();
  const body = (await request.json()) as {
    prompt?: string;
    title?: string;
    intentHint?: Intent | "auto";
    priority?: number;
    chainId?: string;
    parentIds?: string[];
  };

  if (!body.prompt?.trim()) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  const task = await createTask({
    prompt: body.prompt,
    title: body.title,
    intentHint: body.intentHint ?? "auto",
    priority: body.priority,
    chainId: body.chainId,
    parentIds: body.parentIds,
  });
  return NextResponse.json({ task });
}
