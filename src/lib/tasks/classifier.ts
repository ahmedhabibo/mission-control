import type { Intent } from "./types";
import { chatCompletion, isGatewayConfigured } from "@/lib/gateway/client";

/**
 * Intent classifier.
 *
 * Two-tier strategy, no hard dependency on any LLM:
 *
 * 1. Keyword rules — fast, deterministic, zero-cost. Covers the obvious cases
 *    ("write a function", "design a landing page", "research X").
 * 2. LLM fallback — only when rules are ambiguous AND the gateway is
 *    configured. Sends a tiny classification request to `hermes` through
 *    the gateway; falls back to "chat" on any error.
 *
 * Classifying via the gateway keeps secrets inside the gateway — Mission
 * Control itself has no provider credentials.
 */

interface Rule {
  intent: Intent;
  // Matched case-insensitively against the whole prompt.
  patterns: RegExp[];
}

const RULES: Rule[] = [
  {
    intent: "code",
    patterns: [
      /\b(code|function|script|bug|debug|refactor|api|endpoint|component|class|method|test|unit test|compile|typescript|python|javascript|rust|sql|regex|algorithm)\b/i,
      /\b(implement|build|fix|patch|write a (script|function|program))\b/i,
      /\b(git|commit|pr|pull request|merge|deploy)\b/i,
    ],
  },
  {
    intent: "design",
    patterns: [
      /\b(design|layout|ui|ux|wireframe|mockup|prototype|figma|color|palette|typography|font|landing page|component library)\b/i,
      /\b(brand(ing)?|logo|icon|illustration|style guide)\b/i,
    ],
  },
  {
    intent: "research",
    patterns: [
      /\b(research|investigate|compare|analyze|analysis|summary|summarize|survey|benchmark|report)\b/i,
      /\b(what('?s| is)|how does|why does|explain|pros and cons|trade-?offs?)\b/i,
    ],
  },
  {
    intent: "knowledge",
    patterns: [
      /\b(note|notes|document|wiki|knowledge base|notebook|save (this|that))\b/i,
      /\b(tag|categor(y|ize)|index|file this)\b/i,
    ],
  },
];

/** Result of classifying a prompt. */
export interface Classification {
  intent: Intent;
  /** How confident we are — "rule" (deterministic) or "llm" (model guess). */
  method: "rule" | "llm";
  reasoning: string;
}

/** Classify a prompt into an Intent. */
export async function classifyIntent(prompt: string): Promise<Classification> {
  // Tier 1: rules. Pick the intent with the most pattern hits; ties broken by
  // the RULES order above (code > design > research > knowledge).
  const scores = RULES.map((rule) => ({
    intent: rule.intent,
    hits: rule.patterns.filter((p) => p.test(prompt)).length,
  })).filter((s) => s.hits > 0);

  if (scores.length > 0) {
    scores.sort((a, b) => b.hits - a.hits);
    const top = scores[0];
    return {
      intent: top.intent,
      method: "rule",
      reasoning: `Matched ${top.hits} ${top.intent}-intent keyword pattern(s).`,
    };
  }

  // Tier 2: LLM fallback (only if the gateway is configured).
  if (isGatewayConfigured()) {
    const llm = await classifyWithLLM(prompt).catch(() => null);
    if (llm) return llm;
  }

  // Default: general chat.
  return {
    intent: "chat",
    method: "rule",
    reasoning: "No specific intent matched; defaulting to general chat.",
  };
}

/**
 * LLM-based classification via the Mission Control gateway. The gateway
 * routes to the configured Hermes/Mistral model; we ask it to reply with a
 * single word so the result is cheap and unambiguous.
 */
async function classifyWithLLM(prompt: string): Promise<Classification | null> {
  const completion = await chatCompletion("hermes", {
    systemPrompt:
      "Classify the user's request into exactly one of: code, design, research, knowledge, chat. Reply with the single word only.",
    history: [{ role: "user", content: prompt.slice(0, 500) }],
    temperature: 0,
    max_tokens: 5,
  });

  const raw = String(completion.content ?? "").trim().toLowerCase();
  const intent = (["code", "design", "research", "knowledge", "chat"] as Intent[]).find(
    (i) => raw.startsWith(i),
  );
  if (!intent) return null;
  return { intent, method: "llm", reasoning: `Classified by gateway (${raw}).` };
}
