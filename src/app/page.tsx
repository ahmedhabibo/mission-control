import { redirect } from "next/navigation";

/**
 * The home route (`/`) is the Dashboard — analytics overview.
 *
 * The detailed per-tool Status Board lives at `/status` via the original
 * page that used to be at `/`. The redirect lets users keep coming back to
 * `/` for the high-level view while `/status` remains the focused board.
 */
export default function HomePage() {
  redirect("/dashboard");
}
