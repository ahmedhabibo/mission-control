import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { statusHistory } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * GET /api/history/[toolId] — recent probe history for the detail graph.
 * Returns up to `limit` (default 100) rows newest-first.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ toolId: string }> },
) {
  const { toolId } = await params;
  const url = new URL(_request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 500);

  const rows = db
    .select()
    .from(statusHistory)
    .where(eq(statusHistory.toolId, toolId))
    .orderBy(desc(statusHistory.checkedAt))
    .limit(limit)
    .all();

  // Reverse so oldest is first — easier to plot left-to-right.
  return NextResponse.json({ history: rows.reverse() });
}
