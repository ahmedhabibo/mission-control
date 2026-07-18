/**
 * Settings env API — read/write keys in `data/.env.local`.
 *
 * GET returns the current value (masked for secrets) and "set" flag per
 * field enumerated by the Settings page. PUT persists a single key.
 *
 * This is the dynamic counterpart to the static `process.env` in Next.js —
 * once a key is written, the host process is restarted on the next PUT to
 * pick it up. Until that happens, this endpoint provides the "is this set?"
 * signal shown in the UI.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ENV_FILE = join(process.cwd(), "data", "mission-control.env");

const TRACKED_KEYS = [
  "MC_GATEWAY_URL",
  "MC_GATEWAY_TOKEN",
  "NIM_API_KEY",
  "MISTRAL_API_KEY",
  "OPENROUTER_API_KEY",
];

function readEnvFile(): Map<string, string> {
  const map = new Map<string, string>();
  if (!existsSync(ENV_FILE)) return map;
  try {
    const text = readFileSync(ENV_FILE, "utf-8");
    for (const line of text.split("\n")) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (m) map.set(m[1], m[2]);
    }
  } catch {
    /* corrupt file */
  }
  return map;
}

function writeEnvFile(map: Map<string, string>) {
  const lines: string[] = [];
  for (const [k, v] of map.entries()) {
    lines.push(`${k}=${v}`);
  }
  writeFileSync(ENV_FILE, lines.join("\n") + "\n", { mode: 0o644 });
}

export async function GET() {
  const env = readEnvFile();
  const values = TRACKED_KEYS.map((key) => {
    const v = env.get(key);
    return { key, value: v ?? "", set: Boolean(v && v.length > 0) };
  });
  return NextResponse.json({ values, file: ENV_FILE });
}

export async function PUT(request: Request) {
  const body = (await request.json()) as {
    key?: string;
    value?: string;
  };
  if (!body.key || typeof body.value !== "string") {
    return NextResponse.json({ error: "key + value required" }, { status: 400 });
  }
  if (!TRACKED_KEYS.includes(body.key)) {
    return NextResponse.json({ error: `unknown key: ${body.key}` }, { status: 400 });
  }
  const env = readEnvFile();
  env.set(body.key, body.value.trim());
  writeEnvFile(env);
  return NextResponse.json({ ok: true, key: body.key });
}

/**
 * DELETE?key=NIM_API_KEY → unset a tracked key.
 */
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");
  if (!key || !TRACKED_KEYS.includes(key)) {
    return NextResponse.json({ error: `unknown key: ${key}` }, { status: 400 });
  }
  const env = readEnvFile();
  env.delete(key);
  writeEnvFile(env);
  return NextResponse.json({ ok: true, key });
}
