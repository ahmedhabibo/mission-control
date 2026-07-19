/**
 * Test 3: Task routing engine
 * Verifies intent → agent mapping and availability filtering.
 */
import { describe, it, expect, vi } from "vitest";

// Mock getChatAdapters so we control availability
vi.mock("@/lib/chat/registry", () => ({
  getChatAdapters: () => [
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
    // ROUTING[code] = ["hermes", "nim", "mistral-direct"]
    // Only "hermes" is among the configured mock agents — the others aren't
    // actually mock ids, but route() returns the preference list regardless.
    expect(decision.routedAgents).toEqual(["hermes", "nim", "mistral-direct"]);
  });

  it("returns ordered agent list for chat intent", () => {
    const decision: RoutingDecision = route("chat");
    expect(decision.routedAgents).toEqual(["hermes", "nim", "mistral-direct"]);
  });

  it("includes reasoning explaining the routing", () => {
    const decision = route("research");
    expect(decision.reasoning).toContain("research");
  });
});

describe("pickAgent", () => {
  it("picks the first available agent from the routed list", () => {
    const decision = route("code");
    // Only "hermes" is available in the mock — the other routed ids aren't
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
