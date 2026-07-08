import { NextResponse } from "next/server";
import { getSnapshot, getLastSweepAt } from "@/lib/runner";
import { TOOLS } from "@/config/tools.config";

export const dynamic = "force-dynamic";

/** GET /api/status — current cached snapshot of every tool. */
export async function GET() {
  const snapshot = getSnapshot();
  const summary = {
    total: snapshot.length,
    online: snapshot.filter((s) => s.result.status === "online").length,
    degraded: snapshot.filter((s) => s.result.status === "degraded").length,
    offline: snapshot.filter((s) => s.result.status === "offline").length,
    unknown: snapshot.filter((s) => s.result.status === "unknown").length,
    lastSweep: getLastSweepAt(),
    // Reflect which tools are enabled by default so the client can show
    // disabled ones dimmed without a separate call.
    enabledDefaults: Object.fromEntries(
      TOOLS.map((t) => [t.id, t.enabled ?? true]),
    ),
  };
  return NextResponse.json({ summary, tools: snapshot });
}
