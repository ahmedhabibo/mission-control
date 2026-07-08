import { randomBytes } from "node:crypto";

/** Generate a short id for a task, matching the conversation id style. */
export function newTaskId(): string {
  const time = Date.now().toString(36);
  const rand = randomBytes(2).toString("base64url").slice(0, 4);
  return `t_${time}_${rand}`;
}
