import { resolveEnv } from "@/lib/utils";
import type { HttpProbe, ProbeResult } from "@/lib/types";
import { unknownIfUnconfigured } from "./shared";

/**
 * HTTP probe adapter.
 *
 * GETs a URL (with `{ENV}` tokens resolved) and treats a 2xx as online.
 * If a required env var is missing, the tool is reported `unknown` so the
 * board shows "needs setup" instead of a misleading "offline".
 */
export async function runHttpProbe(probe: HttpProbe): Promise<ProbeResult> {
  const checkedAt = new Date().toISOString();

  // Missing required env => unconfigured, not broken.
  const unconfigured = unknownIfUnconfigured(probe.requiresEnv, checkedAt);
  if (unconfigured) return unconfigured;

  const url = resolveEnv(probe.url);
  if (!url) {
    return { status: "unknown", latencyMs: null, version: null, detail: "No URL configured", checkedAt };
  }

  const headers: Record<string, string> = {};
  if (probe.authHeaderEnv && process.env[probe.authHeaderEnv]) {
    headers.Authorization = `Bearer ${process.env[probe.authHeaderEnv]}`;
  }

  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), probe.timeoutMs ?? 5000);

  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    const latencyMs = Date.now() - started;
    const ok = res.ok || res.status === (probe.expectStatus ?? 200);

    let detail = `HTTP ${res.status}`;
    let version: string | null = null;
    try {
      // Best-effort: many model-list endpoints expose a count we can surface.
      const body = await res.json();
      const count = body?.data?.length ?? body?.models?.length;
      if (typeof count === "number") detail = `${detail} · ${count} models`;
      const sample = body?.data?.[0]?.id ?? body?.username;
      if (typeof sample === "string") version = sample;
    } catch {
      /* not JSON — that's fine, status code is enough */
    }

    return {
      status: ok ? "online" : "degraded",
      latencyMs,
      version,
      detail,
      checkedAt,
    };
  } catch (err) {
    const detail =
      err instanceof DOMException && err.name === "AbortError"
        ? `Timed out after ${probe.timeoutMs ?? 5000} ms`
        : err instanceof Error
          ? err.message
          : "Request failed";
    return { status: "offline", latencyMs: null, version: null, detail, checkedAt };
  } finally {
    clearTimeout(timer);
  }
}
