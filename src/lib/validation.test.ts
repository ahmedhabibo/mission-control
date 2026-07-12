/**
 * Test 4: Zod validation schemas
 * Verifies that schemas accept valid input and reject invalid input
 * with the right error messages.
 */
import { describe, it, expect } from "vitest";
import {
  createTaskSchema,
  sendChatSchema,
  createConversationSchema,
  registerAgentSchema,
} from "@/lib/validation";

describe("createTaskSchema", () => {
  it("accepts a valid task with just a prompt", () => {
    const parsed = createTaskSchema.safeParse({ prompt: "Write a function" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.prompt).toBe("Write a function");
      expect(parsed.data.intentHint).toBe("auto");
      expect(parsed.data.priority).toBe(0);
    }
  });

  it("rejects an empty prompt", () => {
    const parsed = createTaskSchema.safeParse({ prompt: "" });
    expect(parsed.success).toBe(false);
  });

  it("rejects an invalid intentHint", () => {
    const parsed = createTaskSchema.safeParse({ prompt: "test", intentHint: "invalid" });
    expect(parsed.success).toBe(false);
  });

  it("rejects priority out of range", () => {
    const parsed = createTaskSchema.safeParse({ prompt: "test", priority: 999 });
    expect(parsed.success).toBe(false);
  });
});

describe("sendChatSchema", () => {
  it("accepts valid conversationId + content", () => {
    const parsed = sendChatSchema.safeParse({ conversationId: "c_abc", content: "Hello" });
    expect(parsed.success).toBe(true);
  });

  it("rejects missing conversationId", () => {
    const parsed = sendChatSchema.safeParse({ content: "Hello" });
    expect(parsed.success).toBe(false);
  });

  it("rejects missing content", () => {
    const parsed = sendChatSchema.safeParse({ conversationId: "c_abc" });
    expect(parsed.success).toBe(false);
  });
});

describe("registerAgentSchema", () => {
  it("accepts a valid agent with defaults", () => {
    const parsed = registerAgentSchema.safeParse({ name: "scout" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.role).toBe("agent");
    }
  });

  it("rejects missing name", () => {
    const parsed = registerAgentSchema.safeParse({ role: "coder" });
    expect(parsed.success).toBe(false);
  });
});
