/**
 * Test 5: Zustand store
 * Verifies the store initializes correctly, updates state, and persists
 * showThinking + currentModel to localStorage.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock localStorage
const mockStorage: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => mockStorage[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { mockStorage[key] = value; }),
  removeItem: vi.fn((key: string) => { delete mockStorage[key]; }),
  clear: vi.fn(() => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); }),
};

// Set up global before importing the store
vi.stubGlobal("localStorage", localStorageMock);
vi.stubGlobal("window", { localStorage: localStorageMock });

// Import after mocks are set up
import { useMCStore } from "@/store/index";

describe("MCStore", () => {
  beforeEach(() => {
    // Reset store to defaults before each test
    useMCStore.getState().resetChat();
    useMCStore.setState({ showThinking: true, currentModel: null, activePanel: "dashboard", sidebarOpen: true });
    Object.keys(mockStorage).forEach(k => delete mockStorage[k]);
    vi.clearAllMocks();
  });

  it("initializes with correct defaults", () => {
    const state = useMCStore.getState();
    expect(state.streaming).toBe(false);
    expect(state.messages).toEqual([]);
    expect(state.showThinking).toBe(true);
    expect(state.currentModel).toBe(null);
    expect(state.activePanel).toBe("dashboard");
    expect(state.sidebarOpen).toBe(true);
  });

  it("toggleThinking flips showThinking and persists to localStorage", () => {
    const store = useMCStore.getState();
    expect(store.showThinking).toBe(true);

    store.toggleThinking();
    expect(useMCStore.getState().showThinking).toBe(false);
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      "mc:settings",
      expect.stringContaining('"showThinking":false')
    );
  });

  it("setModel updates currentModel and persists", () => {
    useMCStore.getState().setModel("nvidia/nemotron-3-super-120b-a12b");
    expect(useMCStore.getState().currentModel).toBe("nvidia/nemotron-3-super-120b-a12b");
    expect(localStorageMock.setItem).toHaveBeenCalled();
  });

  it("appendMessage adds to messages array", () => {
    useMCStore.getState().appendMessage({ id: 1, role: "user", content: "Hello" });
    expect(useMCStore.getState().messages).toHaveLength(1);
    useMCStore.getState().appendMessage({ id: 2, role: "assistant", content: "Hi!" });
    expect(useMCStore.getState().messages).toHaveLength(2);
  });

  it("setActivePanel updates the active panel", () => {
    useMCStore.getState().setActivePanel("tasks");
    expect(useMCStore.getState().activePanel).toBe("tasks");
  });
});
