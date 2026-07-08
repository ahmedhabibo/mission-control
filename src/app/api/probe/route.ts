import { NextResponse } from "next/server";
import { probeOne, sweepAll } from "@/lib/runner";

export const dynamic = "force-dynamic";

/**
 * POST /api/probe — manually trigger probes.
 * Body: { toolId?: string }
 *  - with `toolId`: re-probe that one tool and return its result.
 *  - without: run a full sweep and return the snapshot.
 */
export async function POST(request: Request) {
  let body: { toolId?: string } = {};
  try {
    body = await request.json();
  } catch {
    // Empty body is fine — treat as a full sweep.
  }

  if (body.toolId) {
    const result = await probeOne(body.toolId);
    return NextResponse.json({ toolId: body.toolId, result });
  }

  const tools = await sweepAll();
  return NextResponse.json({ tools });
}
