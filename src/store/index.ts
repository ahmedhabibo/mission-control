/**
 * Zustand 5 store for Mission Control.
 *
 * Adapted from builderz-labs/mission-control's src/store/index.ts pattern.
 * Replaces scattered useState in the chat page with a single store that
 * survives route remounts and can be shared across panels.
 *
 * Slices:
 *   - chat: current conversation, messages, streaming state, thinking toggle, model
 *   - ui: active panel, sidebar open/closed, theme
 *
 * Persistence: chat slice persists showThinking + lastModel to localStorage
 * (matching the current localStorage pattern in the chat page).
 */

import { create } from "zustand";

// ── Types ───────────────────────────────────────────────────────

export interface ChatMessage {
  id: number;
  role: "user" | "assistant" | "system";
  content: string;
  promptTokens?: number;
  completionTokens?: number;
  latencyMs?: number;
  error?: boolean;
}

interface MCState {
  // ── Chat slice ───────────────────────────────────────────────
  conversationId: string | null;
  messages: ChatMessage[];
  streaming: boolean;
  showThinking: boolean;
  currentModel: string | null;

  setConversation: (id: string | null) => void;
  setMessages: (msgs: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  appendMessage: (msg: ChatMessage) => void;
  updateLastMessage: (content: string) => void;
  setStreaming: (s: boolean) => void;
  toggleThinking: () => void;
  setShowThinking: (v: boolean) => void;
  setModel: (m: string | null) => void;
  resetChat: () => void;

  // ── UI slice ────────────────────────────────────────────────
  activePanel: string;
  sidebarOpen: boolean;
  setActivePanel: (p: string) => void;
  toggleSidebar: () => void;
  setSidebar: (v: boolean) => void;
}

// ── Persistence helpers ─────────────────────────────────────────

const STORAGE_KEY = "mc:settings";

function loadPersisted(): { showThinking?: boolean; currentModel?: string | null } {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function savePersisted(state: { showThinking: boolean; currentModel: string | null }) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      showThinking: state.showThinking,
      currentModel: state.currentModel,
    }));
  } catch {
    // ignore quota errors
  }
}

const persisted = loadPersisted();

// ── Store ────────────────────────────────────────────────────────

export const useMCStore = create<MCState>((set, get) => ({
  // ── Chat ─────────────────────────────────────────────────────
  conversationId: null,
  messages: [],
  streaming: false,
  showThinking: persisted.showThinking ?? true,
  currentModel: persisted.currentModel ?? null,

  setConversation: (id) => set({ conversationId: id }),

  setMessages: (msgs) =>
    set((state) => ({
      messages: typeof msgs === "function" ? msgs(state.messages) : msgs,
    })),

  appendMessage: (msg) =>
    set((state) => ({ messages: [...state.messages, msg] })),

  updateLastMessage: (content) =>
    set((state) => {
      const msgs = [...state.messages];
      if (msgs.length > 0) {
        msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], content };
      }
      return { messages: msgs };
    }),

  setStreaming: (s) => set({ streaming: s }),
  toggleThinking: () => {
    const newVal = !get().showThinking;
    set({ showThinking: newVal });
    savePersisted({ showThinking: newVal, currentModel: get().currentModel });
  },
  setShowThinking: (v) => {
    set({ showThinking: v });
    savePersisted({ showThinking: v, currentModel: get().currentModel });
  },
  setModel: (m) => {
    set({ currentModel: m });
    savePersisted({ showThinking: get().showThinking, currentModel: m });
  },
  resetChat: () => set({ conversationId: null, messages: [], streaming: false }),

  // ── UI ──────────────────────────────────────────────────────
  activePanel: "dashboard",
  sidebarOpen: true,
  setActivePanel: (p) => set({ activePanel: p }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebar: (v) => set({ sidebarOpen: v }),
}));
