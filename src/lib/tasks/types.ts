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
  /** Chain membership — all tasks in a chain share the same chainId and
   *  are rendered together in the orchestration view. */
  chainId?: string;
  /** Task ids this task is blocked on. Worker skips the task until all
   *  parents are `done`. */
  parentIds?: string[];
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
  /** Same chainId across dependent tasks — identifies a drag-and-drop chain. */
  chainId: string | null;
  /** Dependency ids: this task waits for all listed parents to be `done`. */
  parentIds: string[];
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  /** Retry tracking (v0.3.1) */
  retryCount: number;
  maxRetries: number;
}

/** Live progress event emitted by the runner while executing a task. */
export type TaskEvent =
  | { type: "status"; taskId: string; status: TaskStatus; assignedAgent?: string }
  | { type: "delta"; taskId: string; content: string }
  | { type: "done"; taskId: string; result: string }
  | { type: "error"; taskId: string; message: string };

/** One node in the dependency graph (used by the orchestration view). */
export interface GraphNode {
  id: string;
  task: TaskDTO;
  /** Absolute pixel position in the SVG canvas; assigned client-side. */
  x: number;
  y: number;
  /** Column index for cascading layout (left-of = earlier in chain). */
  col: number;
}

/** Directed edge in the dependency graph. */
export interface GraphEdge {
  from: string; // parent id
  to: string;   // child id
}
