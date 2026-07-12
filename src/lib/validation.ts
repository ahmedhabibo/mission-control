/**
 * Zod 4 validation schemas for Mission Control API routes.
 *
 * Adapted from builderz-labs/mission-control's validation.ts pattern.
 * Each schema mirrors the body shape expected by a POST/PUT/PATCH route.
 *
 * Usage in a route handler:
 *   import { createTaskSchema } from "@/lib/validation";
 *   const parsed = createTaskSchema.safeParse(body);
 *   if (!parsed.success) {
 *     return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
 *   }
 *   // parsed.data is now typed
 */

import { z } from "zod";

// ── Tasks ──────────────────────────────────────────────────────

export const createTaskSchema = z.object({
  prompt: z.string().min(1, "prompt is required"),
  title: z.string().optional(),
  intentHint: z.enum(["auto", "code", "design", "research", "knowledge", "chat"]).default("auto"),
  priority: z.number().int().min(-100).max(100).default(0),
  chainId: z.string().optional(),
  parentIds: z.array(z.string()).optional(),
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const patchTaskSchema = z.object({
  action: z.enum(["cancel", "re-run"]),
});
export type PatchTaskInput = z.infer<typeof patchTaskSchema>;

// ── Chat ────────────────────────────────────────────────────────

export const createConversationSchema = z.object({
  agentId: z.string().min(1, "agentId is required"),
  title: z.string().optional(),
  systemPrompt: z.string().optional(),
  model: z.string().optional(),
});
export type CreateConversationInput = z.infer<typeof createConversationSchema>;

export const patchConversationSchema = z.object({
  title: z.string().optional(),
  systemPrompt: z.string().optional(),
  model: z.string().optional(),
});
export type PatchConversationInput = z.infer<typeof patchConversationSchema>;

export const sendChatSchema = z.object({
  conversationId: z.string().min(1, "conversationId is required"),
  content: z.string().min(1, "content is required"),
});
export type SendChatInput = z.infer<typeof sendChatSchema>;

// ── Settings ────────────────────────────────────────────────────

export const updateSettingsSchema = z.object({
  toolId: z.string().min(1, "toolId is required"),
  enabled: z.boolean().optional(),
  endpointOverride: z.string().nullable().optional(),
});
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;

// ── Probe ───────────────────────────────────────────────────────

export const probeSchema = z.object({
  toolId: z.string().optional(),
});
export type ProbeInput = z.infer<typeof probeSchema>;

// ── Agents (for forthcoming /api/agents routes) ─────────────────

export const registerAgentSchema = z.object({
  id: z.string().min(1).max(64).optional(), // auto-generated if omitted
  name: z.string().min(1, "name is required").max(100),
  role: z.enum(["agent", "researcher", "coder", "reviewer", "ceo", "cto", "designer", "marketer"]).default("agent"),
  defaultModel: z.string().optional(),
  budgetMonthly: z.number().int().positive().optional(),
  soulConfig: z.record(z.string(), z.unknown()).optional(),
  capabilities: z.array(z.string()).optional(),
  workspacePath: z.string().optional(),
});
export type RegisterAgentInput = z.infer<typeof registerAgentSchema>;

export const heartbeatSchema = z.object({
  status: z.enum(["ok", "error", "timeout"]),
  latencyMs: z.number().int().positive().optional(),
  detail: z.record(z.string(), z.unknown()).optional(),
});
export type HeartbeatInput = z.infer<typeof heartbeatSchema>;

// ── Routines (for forthcoming /api/cron routes) ─────────────────

export const createRoutineSchema = z.object({
  title: z.string().min(1, "title is required"),
  schedule: z.string().min(1, "schedule is required"), // NL or cron
  agentId: z.string().optional(),
  taskTemplate: z.object({
    title: z.string().min(1),
    prompt: z.string().min(1),
    intentHint: z.enum(["auto", "code", "design", "research", "knowledge", "chat"]).default("auto"),
    priority: z.number().int().min(-100).max(100).default(0),
  }),
  enabled: z.boolean().default(true),
});
export type CreateRoutineInput = z.infer<typeof createRoutineSchema>;

// ── Skills (for forthcoming /api/skills routes) ──────────────────

export const installSkillSchema = z.object({
  slug: z.string().min(1, "slug is required"),
  source: z.enum(["local", "clawdhub", "skills.sh"]).default("local"),
  path: z.string().optional(),
});
export type InstallSkillInput = z.infer<typeof installSkillSchema>;

// ── Helper: format Zod errors for API responses ──────────────────

/** Convert a ZodError to a flat { field: message[] } object for API responses. */
export function formatZodError(error: z.ZodError): Record<string, string[]> {
  return error.flatten().fieldErrors;
}
