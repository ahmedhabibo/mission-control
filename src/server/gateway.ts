/**
 * Mission Control Gateway — standalone Node dev/mock gateway.
 *
 * Why this exists
 * ---------------
 * v0.3 of Mission Control reframed the chat layer so all providers hang
 * behind a single gateway, reachable as `MC_GATEWAY_URL` + `MC_GATEWAY_TOKEN`.
 * To make local development possible without standing up a real backend,
 * this file ships a tiny HTTP server that speaks the same wire protocol
 * the hardened gateway will eventually speak.
 *
 * Wire contract — must match `src/lib/gateway/types.ts`
 *   GET  /health                                          → { status, uptime }
 *   GET  /v1/agents                                       → { agents: [...] }
 *   GET  /v1/agents/:id/health                            → per-agent health
 *   GET  /v1/agents/:id/info                              → details + capabilities
 *   POST /v1/agents/:id/chat/completions   body { stream, history, systemPrompt, model }
 *      with stream:true  → SSE: `data: { type:"delta", content }\n\n`
 *                           `data: { type:"done",  promptTokens, completionTokens }\n\n`
 *                           `data: { type:"error", message }\n\n`
 *      with stream:false → JSON: { content, promptTokens, completionTokens, latencyMs }
 *
 * Auth: every /v1/* path requires an Authorization header with a bearer
 * scheme (`Bearer <token>`). Set MC_GATEWAY_TOKEN to enable; leave empty for
 * an open server (dev convenience).
 *
 * Built-in agents (mockable, swap by registering more)
 *   - `echo`         → echoes last user turn; great for proving the SSE pipe
 *   - `hermes-mock`  → deterministic JSON-style answer useful for classifier
 *                      smoke-testing; never calls an external model
 *   - `mistral-mock` → same shape as hermes-mock with a different flavour string
 *
 * Not for production. Real credentials belong in the hardened gateway;
 * this server has zero provider integrations and exists only so Mission
 * Control's v0.3 surface can be exercised before that backend exists.
 */

import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

// ── Config ──────────────────────────────────────────────────────────

const PORT = Number(process.env.MC_GATEWAY_PORT ?? 8787);
const TOKEN = process.env.MC_GATEWAY_TOKEN ?? "";
const HOST = process.env.MC_GATEWAY_HOST ?? "127.0.0.1";

if (!TOKEN) {
  console.warn(
    "[gateway] MC_GATEWAY_TOKEN is empty — requests without a token will be rejected.",
  );
}

// ── Agent catalogue ─────────────────────────────────────────────────

type AgentHandler = AgentDefinition & {
  /** Run a streaming chat; yield ChatChunk-shaped JSON objects. */
  chat: (req: ChatRequest) => AsyncIterable<ChatChunk>;
  /** Non-streaming completion. */
  complete: (req: ChatRequest) => Promise<ChatCompletionResult>;
  /** Lightweight probe. */
  health: () => HealthResult;
};

interface AgentDefinition {
  id: string;
  name: string;
  description: string;
  defaultModel: string;
  capabilities: ("chat" | "completion" | "tools" | "vision")[];
}

interface ChatRequest {
  systemPrompt?: string;
  history: { role: "system" | "user" | "assistant"; content: string }[];
  model?: string;
  temperature?: number;
  max_tokens?: number;
}

interface ChatChunk {
  type: "delta" | "done" | "error";
  content?: string;
  promptTokens?: number;
  completionTokens?: number;
  message?: string;
}

interface ChatCompletionResult extends Required<Pick<ChatChunk, never>> {
  content: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
}

interface HealthResult {
  status: "online" | "degraded" | "offline";
  latencyMs: number | null;
  version: string | null;
  detail: string;
  components?: { label: string; result: Omit<HealthResult, "components"> }[];
}

// ── Mock agents ─────────────────────────────────────────────────────

/** Helper: yield tokens from a string with a tiny delay to look like streaming. */
async function* streamTokens(text: string, { perCharDelayMs = 18 } = {}) {
  for (const ch of text) {
    yield { type: "delta" as const, content: ch };
    if (perCharDelayMs > 0) await sleep(perCharDelayMs);
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function lastUserText(req: ChatRequest): string {
  for (let i = req.history.length - 1; i >= 0; i--) {
    if (req.history[i].role === "user") return req.history[i].content;
  }
  return "";
}

function approxTokens(text: string): number {
  // Very rough heuristic; the real gateway should return authoritative token counts.
  return Math.max(1, Math.ceil(text.length / 4));
}

const ECHO_AGENT: AgentHandler = {
  id: "echo",
  name: "Echo",
  description: "Echoes the last user turn back. Useful for proving the SSE pipe.",
  defaultModel: "echo-1",
  capabilities: ["chat", "completion"],
  health() {
    return {
      status: "online",
      latencyMs: 1,
      version: "echo-1",
      detail: "always-on stub",
    };
  },
  chat(req) {
    const text = lastUserText(req) || "(no user message)";
    return (async function* () {
      for await (const c of streamTokens("ECHO: " + text)) yield c;
      const inToks = approxTokens((req.systemPrompt ?? "") + req.history.map((m) => m.content).join(""));
      yield { type: "done", promptTokens: inToks, completionTokens: approxTokens("ECHO: " + text) };
    })();
  },
  async complete(req) {
    const text = "ECHO: " + (lastUserText(req) || "");
    return {
      content: text,
      promptTokens: approxTokens(req.history.map((m) => m.content).join("")),
      completionTokens: approxTokens(text),
      latencyMs: 5,
    };
  },
};

const HERMES_MOCK: AgentHandler = {
  id: "hermes-mock",
  name: "Hermes (mock)",
  description: "Deterministic answer generator. Used by the task classifier.",
  defaultModel: "hermes-mock-1",
  capabilities: ["chat", "completion"],
  health() {
    return {
      status: "online",
      latencyMs: 8,
      version: "hermes-mock-1",
      detail: "deterministic stub",
    };
  },
  chat(req) {
    const user = lastUserText(req);
    const reply =
      `I am the gateway-side Hermes mock.\n` +
      `You said: "${user.slice(0, 200)}".\n` +
      `System prompt length: ${(req.systemPrompt ?? "").length} chars.`;
    return (async function* () {
      for await (const c of streamTokens(reply)) yield c;
      const inToks = approxTokens((req.systemPrompt ?? "") + req.history.map((m) => m.content).join(""));
      yield { type: "done", promptTokens: inToks, completionTokens: approxTokens(reply) };
    })();
  },
  async complete(req) {
    const user = lastUserText(req);
    const reply =
      `Ack. (${user.slice(0, 80)}).`;
    return {
      content: reply,
      promptTokens: approxTokens(req.history.map((m) => m.content).join("")),
      completionTokens: approxTokens(reply),
      latencyMs: 4,
    };
  },
};

const MISTRAL_MOCK: AgentHandler = {
  ...HERMES_MOCK,
  id: "mistral-mock",
  name: "Mistral (mock)",
  description: "Same handler as hermes-mock with a different label.",
  defaultModel: "mistral-mock-1",
};

// Built-in agents (mockable, swap by registering more)
// Canonical names that the rest of MC uses (CHAT_AGENTS ids + probe agentIds).
// The aliases below map those to the mock handlers so the dev gateway has
// answers for every id we route to.
const ALIAS_BACKEND: Record<string, AgentHandler> = {
  "hermes": HERMES_MOCK,
  "mistral-vibe": MISTRAL_MOCK,
  "mistral": MISTRAL_MOCK,
};

const AGENTS: AgentHandler[] = [ECHO_AGENT, HERMES_MOCK, MISTRAL_MOCK];

function getAgent(id: string): AgentHandler | undefined {
  const direct = AGENTS.find((a) => a.id === id);
  if (direct) return direct;
  return ALIAS_BACKEND[id];
}

// ── HTTP routing ────────────────────────────────────────────────────

function sendJSON(res: ServerResponse, status: number, body: unknown) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(text),
    "Cache-Control": "no-store",
  });
  res.end(text);
}

function readBody(req: IncomingMessage, max = 1 << 20): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let bytes = 0;
    req.on("data", (c: Buffer) => {
      bytes += c.length;
      if (bytes > max) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

function authOK(req: IncomingMessage): boolean {
  if (!TOKEN) return true; // No token configured → open (dev convenience).
  const h = req.headers.authorization ?? "";
  const expected = "Bearer ";
  if (!h.startsWith(expected)) return false;
  return h.slice(expected.length).trim() === TOKEN;
}

function unauthorized(res: ServerResponse) {
  sendJSON(res, 401, { error: "missing or invalid bearer token" });
}

async function route(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const segments = url.pathname.split("/").filter(Boolean);
  const startedAt = Date.now();

  // Always-answer fast paths.
  if (req.method === "GET" && segments[0] === "health") {
    return sendJSON(res, 200, {
      status: "online",
      uptime: process.uptime(),
      agents: AGENTS.length,
    });
  }

  // Everything below requires auth.
  if (!authOK(req)) return unauthorized(res);

  if (req.method === "GET" && segments[0] === "v1" && segments[1] === "agents") {
    if (segments.length === 2) {
      return sendJSON(res, 200, {
        agents: AGENTS.map((a) => ({
          id: a.id,
          name: a.name,
          description: a.description,
          available: true,
          defaultModel: a.defaultModel,
          capabilities: a.capabilities,
        })),
      });
    }
    const id = segments[2];
    const cmd = segments[3];
    if (!id) return sendJSON(res, 400, { error: "missing agent id" });
    const agent = getAgent(id);
    if (!agent) {
      return sendJSON(res, 200, {
        id,
        status: "offline",
        latencyMs: null,
        version: null,
        detail: "Agent not found in this gateway's catalogue.",
      });
    }
    if (cmd === "health") {
      return sendJSON(res, 200, agent.health());
    }
    if (cmd === "info") {
      return sendJSON(res, 200, {
        id: agent.id,
        name: agent.name,
        description: agent.description,
        defaultModel: agent.defaultModel,
        capabilities: agent.capabilities,
        health: agent.health(),
      });
    }
    return sendJSON(res, 404, { error: "unknown subcommand" });
  }

  if (
    req.method === "POST" &&
    segments[0] === "v1" &&
    segments[1] === "agents" &&
    segments[3] === "chat" &&
    segments[4] === "completions"
  ) {
    const id = segments[2];
    const agent = getAgent(id);
    if (!agent) {
      return sendJSON(res, 200, {
        type: "error",
        message: `Gateway has no agent "${id}".`,
      });
    }
    let body: {
      stream?: boolean;
      systemPrompt?: string;
      history?: ChatRequest["history"];
      model?: string;
      temperature?: number;
      max_tokens?: number;
    };
    try {
      const raw = await readBody(req);
      body = raw ? JSON.parse(raw) : {};
    } catch (err) {
      return sendJSON(res, 400, { error: "invalid JSON body", detail: (err as Error).message });
    }

    const reqShape: ChatRequest = {
      systemPrompt: body.systemPrompt,
      history: Array.isArray(body.history) ? body.history : [],
      model: body.model,
      temperature: body.temperature,
      max_tokens: body.max_tokens,
    };

    if (body.stream === false) {
      try {
        const result = await agent.complete(reqShape);
        return sendJSON(res, 200, {
          ...result,
          id: randomUUID(),
          model: body.model ?? agent.defaultModel,
          agent: agent.id,
          finished: Date.now() - startedAt,
        });
      } catch (err) {
        return sendJSON(res, 500, { error: (err as Error).message });
      }
    }

    // Default: streaming SSE.
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const writeChunk = (c: ChatChunk) => {
      const payload = JSON.stringify(c);
      res.write(`data: ${payload}\n\n`);
    };

    // Heartbeat listener — close on client disconnect.
    const conn = req.socket;
    let closed = false;
    conn.on("close", () => {
      closed = true;
    });

    (async () => {
      try {
        for await (const c of agent.chat(reqShape)) {
          if (closed) break;
          writeChunk(c);
        }
      } catch (err) {
        writeChunk({ type: "error", message: (err as Error).message });
      } finally {
        res.end();
      }
    })();
    return;
  }

  return sendJSON(res, 404, {
    error: "not_found",
    method: req.method,
    path: url.pathname,
    hint: "Routes: GET /health · GET /v1/agents · GET /v1/agents/:id/health · POST /v1/agents/:id/chat/completions",
  });
}

// ── Server boot ─────────────────────────────────────────────────────

export function startGatewayServer() {
  const server = createServer((req, res) => {
    void route(req, res).catch((err) => {
      console.error("[gateway] unhandled:", err);
      if (!res.headersSent) sendJSON(res, 500, { error: "internal" });
      else res.end();
    });
  });

  server.listen(PORT, HOST, () => {
    console.log(`[gateway] listening on http://${HOST}:${PORT}`);
    console.log(`[gateway] catalog ids: ${AGENTS.map((a) => a.id).join(", ")}`);
    console.log(`[gateway] alias ids  : ${Object.keys(ALIAS_BACKEND).join(", ")}`);
    if (TOKEN) {
      console.log(`[gateway] auth: bearer required (token len=${TOKEN.length})`);
    } else {
      console.log(`[gateway] auth: open (no MC_GATEWAY_TOKEN set)`);
    }
  });

  server.on("error", (err) => {
    console.error("[gateway] server error:", err);
  });

  return server;
}

// Direct CLI entry — `node .../gateway.js` boots the server.
if (typeof require !== "undefined" && require.main === module) {
  startGatewayServer();
}
