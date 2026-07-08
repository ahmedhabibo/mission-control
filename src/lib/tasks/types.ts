/** Task domain types for the orchestration layer (v0.3). */

export type Intent = "code" | "design" | "research" | "knowledge" | "chat";

export type TaskStatus = "queued" | "running" | "done" | "failed" | "cancelled";

/** What the UI sends to create a task. */
export interface CreateTaskInput {
  title?: string;
  prompt: string;
  /** "auto" to classify, or a fixed Intent to skip classification. */
  intentHint?: Intent | "auto";
  priority?: number;
}

/** What the routing engine decides before execution. */
export interface RoutingDecision {
  intent: Intent;
  /** Ordered agent ids — first available wins. */
  routedAgents: string[];
  /** Why this routing was chosen (shown in UI). */
  reasoning: string;
}

/** Payload returned by the create-task endpoint. */
export interface TaskDTO {
  id: string;
  title: string;
  prompt: string;
  intent: Intent | null;
  intentHint: Intent | "auto";
  routedAgents: string[];
  assignedAgent: string | null;
  status: TaskStatus;
  priority: number;
  result: string | null;
  latencyMs: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

/** Live progress event emitted by the runner while executing a task. */
export type TaskEvent =
  | { type: "status"; taskId: string; status: TaskStatus; assignedAgent?: string }
  | { type: "delta"; taskId: string; content: string }
  | { type: "done"; taskId: string; result: string }
  | { type: "error"; taskId: string; message: string };
