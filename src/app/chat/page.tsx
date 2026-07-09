"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { getIcon } from "@/lib/icons";
import { Markdown } from "@/components/markdown";
import { ThinkingResponse } from "@/components/chat/ThinkingResponse";
import { ModelPicker } from "@/components/chat/ModelPicker";
import {
  MODEL_CATALOG,
  modelsForProvider,
  providerForAgent,
  pickerOptionsFor,
  groupedPickerOptions,
} from "@/lib/chat/models";
import { Button } from "@/components/ui/button";
import { StatusBadge, Badge } from "@/components/ui/badge";
import {
  Plus,
  SendHorizonal,
  Trash2,
  Square,
  PanelLeftClose,
  PanelLeft,
  ChevronDown,
  Loader2,
  ListChecks,
  RefreshCw,
  Eye,
} from "lucide-react";

/* ── Types (mirror API shapes) ──────────────────────────────────── */

interface ChatAgent {
  id: string;
  name: string;
  icon: string;
  description: string;
  defaultModel: string;
  available: boolean;
  unavailableReason?: string;
  /** Gateway health-check result (live ping). */
  healthy?: boolean;
  healthLatencyMs?: number | null;
  healthStatus?: "online" | "degraded" | "offline";
  healthDetail?: string;
}

interface ChatMessage {
  id: number;
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  promptTokens?: number | null;
  completionTokens?: number | null;
  latencyMs?: number | null;
  createdAt: string;
}

interface Conversation {
  id: string;
  title: string;
  agentId: string;
  systemPrompt?: string | null;
  model?: string | null;
  createdAt: string;
  updatedAt: string;
}

/* ── Page ───────────────────────────────────────────────────────── */

export default function ChatPage() {
  const [agents, setAgents] = useState<ChatAgent[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [agentPickerOpen, setAgentPickerOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<string>("hermes");
  const [submittingTask, setSubmittingTask] = useState(false);
  const [taskToast, setTaskToast] = useState(false);
  // Show the model's reasoning block separately, like the Hermes WebUI.
  // Persisted in localStorage so the user's preference survives reloads.
  const [showThinking, setShowThinking] = useState(true);
  // Tracks the in-flight retry per message id (so multiple messages can retry
  // concurrently and we can show a spinner on just the right one).
  const [retryingId, setRetryingId] = useState<number | null>(null);
  // Live model list from /api/chat/models (fetched once on mount, refreshed
  // every 5 min by the API route cache). Merged into groupedPickerOptions.
  const [liveModels, setLiveModels] = useState<Array<{ id: string; provider: string; friendlyName?: string }>>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  /* ── Persisted UI prefs ─────────────────────────────────────── */
  useEffect(() => {
    try {
      const v = window.localStorage.getItem("mc:showThinking");
      if (v != null) setShowThinking(v === "1");
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem("mc:showThinking", showThinking ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [showThinking]);

  /* ── Load agents on mount ──────────────────────────────────── */
  useEffect(() => {
    fetch("/api/chat/agents")
      .then((r) => r.json())
      .then((d) => {
        setAgents(d.agents);
        // Pre-select the first available agent.
        const first = d.agents.find((a: ChatAgent) => a.available);
        if (first) setSelectedAgent(first.id);
      });
    // Fetch live model catalogue from the gateway. The API route
    // caches for 5 min, so this is cheap on repeated calls.
    fetch("/api/chat/models")
      .then((r) => r.json())
      .then((d) => {
        if (d.models?.groups) {
          // Flatten the grouped response into a single array.
          const flat: Array<{ id: string; provider: string; friendlyName?: string }> = [];
          for (const g of d.models.groups) {
            for (const m of g.models) {
              flat.push({ id: m.id, provider: g.provider, friendlyName: m.friendlyName });
            }
          }
          setLiveModels(flat);
        }
      })
      .catch(() => {});
  }, []);

  /* ── Load conversations on mount ───────────────────────────── */
  const loadConversations = useCallback(() => {
    fetch("/api/chat/conversations")
      .then((r) => r.json())
      .then((d) => setConversations(d.conversations))
      .catch(() => {});
  }, []);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  /* ── Load messages when active conversation changes ────────── */
  useEffect(() => {
    if (!active) return;
    fetch(`/api/chat/conversations/${active}`)
      .then((r) => r.json())
      .then((d) => {
        setMessages(d.messages ?? []);
        if (d.conversation) {
          setSelectedAgent(d.conversation.agentId);
        }
      })
      .catch(() => {});
    setStreaming(false);
    setAgentPickerOpen(false);
  }, [active]);

  /* ── Auto-scroll to bottom on new messages ──────────────────── */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  /* ── Create new conversation ────────────────────────────────── */
  async function newConversation() {
    const res = await fetch("/api/chat/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId: selectedAgent }),
    });
    const { conversation } = await res.json();
    setConversations((prev) => [conversation, ...prev]);
    setActive(conversation.id);
    setMessages([]);
    inputRef.current?.focus();
  }

  /* ── Delete conversation ───────────────────────────────────── */
  async function deleteConversation(id: string) {
    await fetch(`/api/chat/conversations/${id}`, { method: "DELETE" });
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (active === id) {
      setActive(null);
      setMessages([]);
    }
  }

  /* ── Send a message ────────────────────────────────────────── */
  async function send(opts: { messageOverride?: string } = {}) {
    const content = (opts.messageOverride ?? input).trim();
    if (!content || streaming || !active) return;

    // Use the conversation's current model for this turn (or the agent
    // default when it's null). The /api/chat/send route forwards `model`.
    const conv = conversations.find((c) => c.id === active);
    const modelId = conv?.model ?? undefined;

    if (!opts.messageOverride) setInput("");
    setStreaming(true);

    const abort = new AbortController();
    abortRef.current = abort;

    // Optimistically add the user message.
    const userMsg: ChatMessage = {
      id: -Date.now(),
      conversationId: active,
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    // Streaming assistant placeholder.
    setMessages((prev) => [
      ...prev,
      { id: 0, conversationId: active, role: "assistant", content: "", createdAt: "" },
    ]);

    try {
      const res = await fetch("/api/chat/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: active, content, model: modelId }),
        signal: abort.signal,
      });

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (!payload) continue;
          try {
            const event = JSON.parse(payload);
            if (event.type === "delta") {
              fullText += event.content;
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last?.role === "assistant") {
                  updated[updated.length - 1] = { ...last, content: fullText };
                }
                return updated;
              });
            }
            // done/error/saved are handled by the server persisting; we
            // refresh on saved to get proper DB ids + token counts.
            if (event.type === "saved") {
              // Reload to get persisted messages with real ids.
              fetch(`/api/chat/conversations/${active}`)
                .then((r) => r.json())
                .then((d) => setMessages(d.messages ?? []))
                .catch(() => {});
              loadConversations(); // refresh sidebar title if auto-titled
            }
          } catch {
            /* ignore malformed events */
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        // User cancelled — that's fine.
      } else {
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === "assistant") {
            updated[updated.length - 1] = {
              ...last,
              content: last.content + `\n\n_Error: ${err instanceof Error ? err.message : String(err)}_`,
            };
          }
          return updated;
        });
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  function stopStreaming() {
    abortRef.current?.abort();
  }

  /**
   * Retry: user pressed "retry" next to an assistant message — re-run the
   * assistant turn with the *last user message* before this assistant message,
   * using whichever model the conversation is currently set to. The new
   * response overwrites the slot; older messages stay put.
   */
  async function retry(msg: ChatMessage) {
    if (!active || msg.role !== "assistant") return;
    // Find the immediately preceding user message.
    const idx = messages.findIndex((m) => m.id === msg.id);
    const prev = idx > 0 ? messages[idx - 1] : undefined;
    if (!prev || prev.role !== "user") return;
    setRetryingId(msg.id);
    setStreaming(true);
    // Wipe the assistant slot to "streaming" by replacing it with placeholder.
    setMessages((list) =>
      list.map((m) => (m.id === msg.id ? { ...m, content: "" } : m)),
    );
    try {
      const conv = conversations.find((c) => c.id === active);
      const modelId = conv?.model ?? undefined;
      const res = await fetch("/api/chat/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: active,
          content: prev.content,
          model: modelId,
        }),
      });
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");
      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (!payload) continue;
          try {
            const event = JSON.parse(payload);
            if (event.type === "delta") {
              fullText += event.content;
              setMessages((list) =>
                list.map((m) => (m.id === msg.id ? { ...m, content: fullText } : m)),
              );
            } else if (event.type === "saved") {
              fetch(`/api/chat/conversations/${active}`)
                .then((r) => r.json())
                .then((d) => setMessages(d.messages ?? []))
                .catch(() => {});
            }
          } catch {
            /* ignore malformed events */
          }
        }
      }
    } catch (err) {
      setMessages((list) =>
        list.map((m) =>
          m.id === msg.id
            ? {
                ...m,
                content:
                  (m.content || "") +
                  `\n\n_Retry failed: ${err instanceof Error ? err.message : String(err)}_`,
              }
            : m,
        ),
      );
    } finally {
      setStreaming(false);
      setRetryingId(null);
      abortRef.current = null;
    }
  }

  /* ── Bridge: send the current input to the task router instead ── */
  async function submitAsTask() {
    const content = input.trim();
    if (!content || submittingTask) return;
    setSubmittingTask(true);
    try {
      await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: content }),
      });
      setInput("");
      // Notify the user it's been routed; they can watch it on /tasks.
      setTaskToast(true);
      setTimeout(() => setTaskToast(false), 3000);
    } finally {
      setSubmittingTask(false);
    }
  }

  /* ── Keyboard: Enter to send, Shift+Enter for newline ──────── */
  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  /* ── Auto-resize textarea ──────────────────────────────────── */
  function onInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }

  const activeConv = conversations.find((c) => c.id === active);
  const activeAgent = agents.find((a) => a.id === selectedAgent);

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      {/* ── Sidebar ────────────────────────────────────────── */}
      <aside
        className={cn(
          "flex flex-col border-r border-[var(--border)] bg-[var(--background)] transition-all duration-200",
          sidebarOpen ? "w-72" : "w-0 overflow-hidden",
        )}
      >
        <div className="flex items-center gap-2 border-b border-[var(--border)] p-3">
          <Button
            size="sm"
            variant="primary"
            className="flex-1 justify-center gap-1.5"
            onClick={newConversation}
          >
            <Plus className="h-3.5 w-3.5" />
            New chat
          </Button>
          <button
            onClick={() => setSidebarOpen(false)}
            className="rounded-md p-1.5 text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
            title="Close sidebar"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {conversations.length === 0 && (
            <p className="px-2 py-8 text-center text-xs text-[var(--muted-foreground)]">
              No conversations yet.
              <br />
              Click &ldquo;New chat&rdquo; to start.
            </p>
          )}
          {conversations.map((conv) => {
            const agent = agents.find((a) => a.id === conv.agentId);
            const Icon = getIcon(agent?.icon ?? "Terminal");
            return (
              <div
                key={conv.id}
                onClick={() => setActive(conv.id)}
                className={cn(
                  "group flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors cursor-pointer",
                  active === conv.id
                    ? "bg-[var(--muted)]"
                    : "hover:bg-[var(--muted)]/50",
                )}
              >
                <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--muted-foreground)]" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{conv.title}</div>
                  <div className="truncate text-xs text-[var(--muted-foreground)]">
                    {agent?.name ?? conv.agentId}
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteConversation(conv.id);
                  }}
                  className="mt-0.5 shrink-0 rounded p-0.5 text-[var(--muted-foreground)] opacity-0 transition-opacity hover:text-[var(--status-offline)] group-hover:opacity-100"
                  title="Delete"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      </aside>

      {/* ── Main panel ───────────────────────────────────────── */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Top bar */}
        <div className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-2.5">
          {!sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="rounded-md p-1.5 text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
              title="Open sidebar"
            >
              <PanelLeft className="h-4 w-4" />
            </button>
          )}

          {activeConv && activeAgent ? (
            <>
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--muted)]">
                {(() => {
                  const Icon = getIcon(activeAgent.icon);
                  return <Icon className="h-3.5 w-3.5" />;
                })()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{activeConv.title}</div>
                <div className="flex items-center gap-2 truncate text-xs text-[var(--muted-foreground)]">
                  <span>
                    {activeAgent.name} · {activeConv.model ?? activeAgent.defaultModel}
                  </span>
                </div>
              </div>
              <ModelPicker
                groups={groupedPickerOptions(liveModels)}
                value={activeConv.model ?? ""}
                fallbackLabel={activeAgent.defaultModel}
                onChange={async (model) => {
                  await fetch(`/api/chat/conversations/${activeConv.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ model }),
                  });
                  setConversations((prev) =>
                    prev.map((c) =>
                      c.id === activeConv.id
                        ? { ...c, model: model || null }
                        : c,
                    ),
                  );
                  loadConversations();
                }}
              />
              <button
                onClick={() => setShowThinking((s) => !s)}
                title="Toggle model reasoning visibility — mirrors Hermes WebUI's `show_thinking` setting"
                className="inline-flex h-5 w-5 items-center justify-center rounded-md border border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
              >
                <Eye className={cn("h-3 w-3", !showThinking && "opacity-50")} />
              </button>
              <StatusBadge
                status={
                  !activeAgent.available
                    ? "offline"
                    : activeAgent.healthStatus ?? (activeAgent.healthy ? "online" : "offline")
                }
                pulse={activeAgent.healthy && !activeAgent.healthLatencyMs}
              />
              {activeAgent.healthLatencyMs != null && activeAgent.healthy && (
                <span className="text-[10px] text-[var(--muted-foreground)]">
                  {activeAgent.healthLatencyMs}ms
                </span>
              )}
            </>
          ) : (
            <div className="flex-1 text-sm text-[var(--muted-foreground)]">
              Select or create a conversation
            </div>
          )}
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {!active ? (
            <EmptyState
              agents={agents}
              selectedAgent={selectedAgent}
              onSelect={setSelectedAgent}
              agentPickerOpen={agentPickerOpen}
              onTogglePicker={() => setAgentPickerOpen(!agentPickerOpen)}
              onStart={() => newConversation()}
            />
          ) : messages.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-[var(--muted-foreground)]">
              Start a conversation with {activeAgent?.name ?? "the agent"}.
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-4">
              {messages.map((msg) => {
                if (msg.role === "system") return null;
                const isUser = msg.role === "user";
                return (
                  <div
                    key={msg.id}
                    className={cn(
                      "flex gap-3",
                      isUser ? "justify-end" : "justify-start",
                    )}
                  >
                    {!isUser && activeAgent && (
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--muted)]">
                        {(() => {
                          const Icon = getIcon(activeAgent.icon);
                          return <Icon className="h-3.5 w-3.5" />;
                        })()}
                      </div>
                    )}
                    <div
                      className={cn(
                        "max-w-[80%] rounded-xl px-3.5 py-2.5",
                        isUser
                          ? "bg-[var(--accent)]/15 border border-[var(--accent)]/20"
                          : "border border-[var(--border)] bg-[var(--card)]",
                      )}
                    >
                      {isUser ? (
                        <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
                      ) : (
                        // ThinkingResponse renders the response body and splits
                        // out any <think>...</think> reasoning into its own
                        // collapsible section. Falls back to plain markdown
                        // when the model didn't emit a thinking block.
                        <ThinkingResponse
                          content={msg.content}
                          defaultExpanded={showThinking}
                        />
                      )}
                      {/* Token/latency footer for assistant messages. */}
                      {!isUser && msg.latencyMs != null && (
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[var(--border)] pt-1.5 text-xs text-[var(--muted-foreground)]">
                          <span>{formatLatency(msg.latencyMs)}</span>
                          {msg.promptTokens != null && (
                            <span>
                              {msg.promptTokens}
                              {(msg.completionTokens ?? 0) > 0 ? `+${msg.completionTokens}` : ""} tokens
                            </span>
                          )}
                          {!isUser && msg.id > 0 && (
                            <button
                              onClick={() => retry(msg)}
                              disabled={retryingId === msg.id || streaming}
                              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-[var(--muted)] disabled:opacity-50"
                              title="Re-run the assistant turn with the same user message — uses the conversation's current model."
                            >
                              {retryingId === msg.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <RefreshCw className="h-3 w-3" />
                              )}
                              retry
                            </button>
                          )}
                        </div>
                      )}
                      {/* Streaming indicator */}
                      {!isUser && streaming && msg.id === 0 && !msg.content && (
                        <div className="flex items-center gap-1.5 mt-2 text-xs text-[var(--muted-foreground)]">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          waiting for response…
                        </div>
                      )}
                      {!isUser && streaming && msg.id === 0 && msg.content && (
                        <div className="flex items-center gap-1.5 mt-1.5 text-[10px] text-[var(--muted-foreground)]">
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)]" />
                          streaming…
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input bar */}
        <div className="border-t border-[var(--border)] px-4 py-3">
          <div className="mx-auto flex max-w-3xl items-end gap-2">
            <div className="relative flex-1">
              <textarea
                ref={inputRef}
                value={input}
                onChange={onInput}
                onKeyDown={onKeyDown}
                placeholder={
                  !active ? "Create a conversation first…" : streaming ? "Waiting for response…" : "Type a message…"
                }
                disabled={!active || streaming}
                rows={1}
                className="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--input)] px-3.5 py-2.5 text-sm placeholder:text-[var(--muted-foreground)] focus:border-[var(--ring)] focus:outline-none focus:ring-1 focus:ring-[var(--ring)] disabled:opacity-50"
                style={{ minHeight: "40px", maxHeight: "200px" }}
              />
              <span className="absolute bottom-1.5 right-3 text-xs text-[var(--muted-foreground)]">
                Shift+Enter for newline
              </span>
            </div>
            {streaming ? (
              <Button
                size="md"
                variant="secondary"
                onClick={stopStreaming}
                title="Stop"
                className="h-[40px] w-[40px] p-0"
              >
                <Square className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <>
                <Button
                  size="md"
                  variant="outline"
                  onClick={submitAsTask}
                  disabled={!input.trim() || submittingTask}
                  title="Submit as a routed task (Mission Control picks the agent)"
                  className="h-[40px] w-[40px] p-0"
                >
                  {submittingTask ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ListChecks className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  size="md"
                  variant="primary"
                  onClick={() => send()}
                  disabled={!active || !input.trim()}
                  title="Send"
                  className="h-[40px] w-[40px] p-0"
                >
                  <SendHorizonal className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
          {/* Toast: task submitted */}
          {taskToast && (
            <div className="mx-auto mt-2 flex max-w-3xl items-center gap-2 rounded-md border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-3 py-1.5 text-xs text-[var(--accent)]">
              <ListChecks className="h-3.5 w-3.5" />
              Task submitted — Mission Control is routing it.
              <Link href="/tasks" className="ml-auto font-medium underline">
                View on Tasks →
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Empty state (no active conversation) ─────────────────────── */

function EmptyState({
  agents,
  selectedAgent,
  onSelect,
  agentPickerOpen,
  onTogglePicker,
  onStart,
}: {
  agents: ChatAgent[];
  selectedAgent: string;
  onSelect: (id: string) => void;
  agentPickerOpen: boolean;
  onTogglePicker: () => void;
  onStart: () => void;
}) {
  const current = agents.find((a) => a.id === selectedAgent);
  const Icon = getIcon(current?.icon ?? "BrainCircuit");

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-6">
      <div className="text-center">
        <h2 className="text-lg font-semibold">Mission Control Chat</h2>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Talk to any agent in your stack from one place.
        </p>
      </div>

      {/* Agent picker */}
      <div className="w-64">
        <button
          onClick={onTogglePicker}
          className="flex w-full items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--card)] px-3.5 py-2.5 text-sm transition-colors hover:bg-[var(--muted)]"
        >
          <span className="flex items-center gap-2">
            <Icon className="h-4 w-4" />
            {current?.name ?? "Select agent"}
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-[var(--muted-foreground)] transition-transform",
              agentPickerOpen && "rotate-180",
            )}
          />
        </button>
        {agentPickerOpen && (
          <div className="mt-1 rounded-xl border border-[var(--border)] bg-[var(--card)] py-1 shadow-lg">
            {agents.map((agent) => {
              const AIcon = getIcon(agent.icon);
              return (
                <button
                  key={agent.id}
                  onClick={() => {
                    onSelect(agent.id);
                    onTogglePicker();
                  }}
                  className={cn(
                    "flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm transition-colors",
                    agent.id === selectedAgent
                      ? "bg-[var(--accent)]/10"
                      : "hover:bg-[var(--muted)]",
                  )}
                >
                  <AIcon className="h-4 w-4 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{agent.name}</span>
                      {!agent.available && (
                        <Badge className="text-[var(--muted-foreground)]">unavailable</Badge>
                      )}
                      {agent.available && (
                        <span
                          className={cn(
                            "inline-flex h-1.5 w-1.5 rounded-full",
                            agent.healthy
                              ? "bg-green-500"
                              : agent.healthStatus === "degraded"
                                ? "bg-yellow-500"
                                : "bg-red-500",
                          )}
                          title={
                            agent.healthy
                              ? `Online${agent.healthLatencyMs ? ` · ${agent.healthLatencyMs}ms` : ""}`
                              : agent.healthDetail ?? "Offline"
                          }
                        />
                      )}
                    </div>
                    <div className="truncate text-xs text-[var(--muted-foreground)]">
                      {agent.description}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <Button
        variant="primary"
        onClick={onStart}
        disabled={!current?.available}
      >
        <Plus className="h-4 w-4" />
        Start conversation
      </Button>

      {!current?.available && current?.unavailableReason && (
        <p className="max-w-sm text-center text-xs text-[var(--muted-foreground)]">
          {current.unavailableReason}
        </p>
      )}
    </div>
  );
}

function formatLatency(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
