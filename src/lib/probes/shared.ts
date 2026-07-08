/** Small helpers shared across probe adapters. */

/**
 * If any of the given env vars are unset/empty, return an `unknown` result —
 * meaning "not configured yet". This keeps unconfigured tools from showing as
 * broken (`offline`) on the board.
 */
export function unknownIfUnconfigured(
  required: string[] | undefined,
  checkedAt: string,
) {
  if (!required?.length) return null;
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length === 0) return null;
  return {
    status: "unknown" as const,
    latencyMs: null,
    version: null,
    detail: `Set env: ${missing.join(", ")}`,
    checkedAt,
  };
}
