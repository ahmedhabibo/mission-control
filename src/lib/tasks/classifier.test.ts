/**
 * Test 2: Intent classifier (rule-based tier only)
 * Verifies keyword matching maps to the right Intent.
 * LLM fallback is NOT tested here — it requires a live gateway.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the gateway client so classifier never tries to call the LLM.
vi.mock("@/lib/gateway/client", () => ({
  isGatewayConfigured: () => false,
  chatCompletion: vi.fn(),
}));

import { classifyIntent } from "@/lib/tasks/classifier";

describe("classifyIntent (rule-based)", () => {
  it("classifies coding prompts as 'code'", async () => {
    const result = await classifyIntent("Write a Python function to sort a list");
    expect(result.intent).toBe("code");
    expect(result.method).toBe("rule");
  });

  it("classifies design prompts as 'design'", async () => {
    const result = await classifyIntent("Design a landing page with a modern layout");
    expect(result.intent).toBe("design");
    expect(result.method).toBe("rule");
  });

  it("classifies research prompts as 'research'", async () => {
    const result = await classifyIntent("Research the pros and cons of different databases");
    expect(result.intent).toBe("research");
    expect(result.method).toBe("rule");
  });

  it("defaults to 'chat' when no patterns match", async () => {
    const result = await classifyIntent("Hello, how are you?");
    expect(result.intent).toBe("chat");
    expect(result.method).toBe("rule");
  });

  it("picks the intent with the most keyword hits", async () => {
    // "Write a unit test" has both code (test, unit test) and knowledge (note) hits,
    // but code should win because it has more matches.
    const result = await classifyIntent("Write a unit test for the API endpoint");
    expect(result.intent).toBe("code");
  });
});
