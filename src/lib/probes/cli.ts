import { execFile } from "node:child_process";
import { resolve } from "node:path";
import type { CliProbe, ProbeResult } from "@/lib/types";
import { unknownIfUnconfigured } from "./shared";

/**
 * CLI probe adapter.
 *
 * Runs a local command; success = exit code 0. An optional `versionRegex`
 * captures a version string from stdout. We wrap execFile in a promise with
 * an abort-based timeout so a hung command can't stall the sweep.
 */
export function runCliProbe(probe: CliProbe): Promise<ProbeResult> {
  const checkedAt = new Date().toISOString();
  const unconfigured = unknownIfUnconfigured([], checkedAt);
  if (unconfigured) return Promise.resolve(unconfigured);

  const [cmd, ...args] = probe.command;
  const timeoutMs = probe.timeoutMs ?? 5000;
  const started = Date.now();

  return new Promise((resolveFn) => {
    const child = execFile(cmd, args, {
      cwd: probe.cwd ? resolve(probe.cwd) : undefined,
      timeout: timeoutMs,
      maxBuffer: 1 << 16, // 64 KiB is plenty for `--version` output
    });

    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => (stdout += d));
    child.stderr?.on("data", (d) => (stderr += d));

    child.on("error", (err) => {
      // ENOENT = command not installed. Not configured, not broken.
      const isMissing = (err as NodeJS.ErrnoException).code === "ENOENT";
      resolveFn({
        status: isMissing ? "unknown" : "offline",
        latencyMs: null,
        version: null,
        detail: isMissing ? `Command not found: ${cmd}` : err.message,
        checkedAt,
      });
    });

    child.on("close", (code) => {
      const latencyMs = Date.now() - started;
      let version: string | null = null;
      if (probe.versionRegex) {
        const match = stdout.match(probe.versionRegex);
        if (match?.[1]) version = match[1];
      }
      const detail = code === 0 ? (stdout.trim() || "ok") : `exit ${code}: ${stderr.trim() || stdout.trim()}`;
      resolveFn({
        status: code === 0 ? "online" : "offline",
        latencyMs,
        version,
        detail,
        checkedAt,
      });
    });
  });
}
