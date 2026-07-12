import { NextResponse } from "next/server";
import { ensureSchema } from "@/lib/db/client";
import { createTask, listTasks } from "@/lib/tasks/runner";
import { createTaskSchema, formatZodError } from "@/lib/validation";

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
  const json = await request.json().catch(() => ({}));
  const parsed = createTaskSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
  }
  const { prompt, title, intentHint, priority, chainId, parentIds } = parsed.data;

  const task = await createTask({
    prompt,
    title,
    intentHint,
    priority,
    chainId,
    parentIds,
  });
  return NextResponse.json({ task });
}
