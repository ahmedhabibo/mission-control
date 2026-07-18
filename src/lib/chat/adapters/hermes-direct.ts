import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { ChatAdapter, ChatChunk } from "../types";
import { nimAdapter } from "./nim";

/**
 * Hermes adapter — NIM backend with Hermes SOUL.md as system prompt.
 *
 * This is NOT a gateway adapter. It calls NVIDIA NIM directly using
 * NIM_API_KEY, but prepends the Hermes SOUL.md personality as the
 * system prompt. This makes the chat feel like talking to Hermes,
 * with all of Ahmed's domain expertise (ERP, finance, Odoo).
 *
 * The default model is read from ~/.hermes/config.yaml (if present),
 * falling back to z-ai/glm-5.2 (the Hermes default).
 */
const HERMES_SYSTEM_PROMPT = loadHermesSoul();

function loadHermesSoul(): string {
  const soulPath = join(homedir(), ".hermes", "SOUL.md");
  if (!existsSync(soulPath)) {
    return "You are Hermes, a helpful AI assistant.";
  }
  try {
    const full = readFileSync(soulPath, "utf-8");
    // Truncate to first 2000 chars to keep the prompt manageable
    const truncated = full.slice(0, 2000);
    return `${truncated}\n\nYou are responding in the Mission Control chat interface. Be concise and helpful.`;
  } catch {
    return "You are Hermes, a helpful AI assistant.";
  }
}

export const hermesDirectAdapter: ChatAdapter = {
  id: "hermes",
  name: "Hermes",
  icon: "BrainCircuit",
  description: "Hermes agent — NIM backend with your SOUL.md personality.",
  defaultModel: "z-ai/glm-5.2",
  get available() {
    return Boolean(process.env.NIM_API_KEY);
  },
  get unavailableReason() {
    return process.env.NIM_API_KEY
      ? ""
      : "Set NIM_API_KEY in .env.local";
  },
  stream(req) {
    // Inject the Hermes SOUL.md as system prompt
    const systemPrompt = req.systemPrompt
      ? `${HERMES_SYSTEM_PROMPT}\n\n${req.systemPrompt}`
      : HERMES_SYSTEM_PROMPT;

    // Delegate to the NIM adapter with the Hermes system prompt
    return nimAdapter.stream({
      ...req,
      systemPrompt,
      model: req.model || this.defaultModel,
    });
  },
};
