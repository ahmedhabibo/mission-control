import { NextResponse } from "next/server";
import { ensureSchema } from "@/lib/db/client";
import { cancelTask, deleteTask, getTask } from "@/lib/tasks/runner";

export const dynamic = "force-dynamic";

/**
 * GET    /api/tasks/[id] → fetch one task
 * DELETE /api/tasks/[id] → delete a task
 * PATCH  /api/tasks/[id] → { action: "cancel" | "re-run" }
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  ensureSchema();
  const { id } = await params;
  const task = getTask(id);
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ task });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  ensureSchema();
  const { id } = await params;
  deleteTask(id);
  return NextResponse.json({ ok: true });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  ensureSchema();
  const { id } = await params;
  const body = (await request.json()) as { action?: "cancel" | "re-run" };

  if (body.action === "cancel") {
    cancelTask(id);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "re-run") {
    // Re-run: create a new task with the same prompt + intent hint.
    const original = getTask(id);
    if (!original) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const { createTask } = await import("@/lib/tasks/runner");
    const task = await createTask({
      prompt: original.prompt,
      title: `${original.title} (re-run)`,
      intentHint: original.intentHint,
      priority: original.priority,
    });
    return NextResponse.json({ task });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
