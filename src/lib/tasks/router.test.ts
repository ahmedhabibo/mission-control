/**
 * Test 3: Task routing engine
 * Verifies intent → agent mapping and availability filtering.
 */
import { describe, it, expect, vi } from "vitest";

// Mock CHAT_AGENTS so we control availability
vi.mock("@/lib/chat/registry", () => ({
  CHAT_AGENTS: [
    { id: "hermes", available: true },
    { id: "opencode", available: false },
    { id: "mistral-vibe", available: true },
  ],
}));

import { route, pickAgent } from "@/lib/tasks/router";
import type { RoutingDecision } from "@/lib/tasks/types";

describe("route", () => {
  it("returns ordered agent list for code intent", () => {
    const decision: RoutingDecision = route("code");
    expect(decision.routedAgents).toEqual(["opencode", "hermes", "mistral-vibe"]);
  });

  it("returns ordered agent list for chat intent", () => {
    const decision: RoutingDecision = route("chat");
    expect(decision.routedAgents).toEqual(["hermes", "mistral-vibe", "opencode"]);
  });

  it("includes reasoning explaining the routing", () => {
    const decision = route("research");
    expect(decision.reasoning).toContain("research");
  });
});

describe("pickAgent", () => {
  it("picks the first available agent from the routed list", () => {
    const decision = route("code");
    // opencode is unavailable, so hermes (2nd) is picked
    const agent = pickAgent(decision);
    expect(agent).toBe("hermes");
  });

  it("returns null when all routed agents are unavailable", () => {
    const decision: RoutingDecision = {
      intent: "code",
      routedAgents: ["nonexistent"],
      reasoning: "test",
    };
    const agent = pickAgent(decision);
    expect(agent).toBeNull();
  });
});
