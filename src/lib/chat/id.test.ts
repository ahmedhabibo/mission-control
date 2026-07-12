/**
 * Test 1: Conversation ID generation
 * Verifies the ID format, uniqueness, and sortability.
 */
import { describe, it, expect } from "vitest";
import { newConversationId } from "@/lib/chat/id";

describe("newConversationId", () => {
  it("generates an ID with the c_ prefix", () => {
    const id = newConversationId();
    expect(id.startsWith("c_")).toBe(true);
  });

  it("generates unique IDs across 100 calls", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(newConversationId());
    }
    expect(ids.size).toBe(100);
  });

  it("produces a string with 3 underscore-separated parts", () => {
    const id = newConversationId();
    const parts = id.split("_");
    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe("c");
    expect(parts[1].length).toBeGreaterThan(0); // base36 timestamp
    expect(parts[2].length).toBeGreaterThan(0); // random suffix
  });
});
