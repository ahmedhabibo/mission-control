"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Save,
  Plus,
  Trash2,
  RotateCcw,
  ChevronUp,
  ChevronDown,
  PlugZap,
  Cog,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/* ── Types ────────────────────────────────────────────────────────── */

interface AgentSetting {
  agentId: string;
  name: string;
  kind: "chat" | "profile" | "cli" | "gateway" | "mcp";
  enabled: boolean;
  customLabel?: string | null;
  defaultModel?: string | null;
  sortOrder: number;
  notes?: string | null;
  available: boolean;
  description: string;
}

interface ConfigRow {
  key: string;
  value: string;
  isSecret: boolean;
  description?: string;
}

const ENV_FIELDS: ConfigRow[] = [
  {
    key: "MC_GATEWAY_URL",
    value: "",
    isSecret: false,
    description: "URL of the Mission Control gateway (http://localhost:8788)",
  },
  {
    key: "MC_GATEWAY_TOKEN",
    value: "",
    isSecret: true,
    description: "Bearer token for the gateway (40-90 day rotation)",
  },
  {
    key: "NIM_API_KEY",
    value: "",
    isSecret: true,
    description: "NVIDIA NIM free-tier key (https://build.nvidia.com)",
  },
  {
    key: "MISTRAL_API_KEY",
    value: "",
    isSecret: true,
    description: "Mistral AI free-tier key (https://console.mistral.ai/api-keys)",
  },
  {
    key: "OPENROUTER_API_KEY",
    value: "",
    isSecret: true,
    description: "Optional — OpenRouter aggregator key",
  },
];

/**
 * Settings page — three sections:
 *   1. **Provider credentials** — the env vars the chat adapters read.
 *   2. **Agent roster** — per-agent enable/disable, reorder, model, label.
 *   3. **Restore defaults** — clear all persisted config.
 *
 * Env vars are NEVER stored server-side; the page writes them to .env.local
 * via `/api/settings/env` which shells out to a Node script. Secrets are
 * masked in the UI.
 */
export default function SettingsPage() {
  const [agents, setAgents] = useState<AgentSetting[]>([]);
  const [envValues, setEnvValues] = useState<Record<string, string>>({});
  const [envExists, setEnvExists] = useState<Record<string, boolean>>({});
  const [envDirty, setEnvDirty] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<"env" | "agents" | "advanced">("env");
  const [savedToast, setSavedToast] = useState<string | null>(null);

  /* ── Load ──────────────────────────────────────────────────────── */
  useEffect(() => {
    fetch("/api/agent-settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setAgents(d.settings ?? []));

    fetch("/api/settings/env", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const initial: Record<string, string> = {};
        const exists: Record<string, boolean> = {};
        for (const field of d.values ?? []) {
          initial[field.key] = field.value ?? "";
          exists[field.key] = field.set ?? false;
        }
        setEnvValues(initial);
        setEnvExists(exists);
      });
  }, []);

  /* ── Persist one env var ────────────────────────────────────────── */
  async function persistKey(key: string) {
    const v = envValues[key]?.trim();
    if (!v) return;
    try {
      await fetch("/api/settings/env", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value: v }),
      });
      setEnvExists((p) => ({ ...p, [key]: true }));
      setEnvDirty((p) => ({ ...p, [key]: false }));
      setSavedToast(`${key} saved`);
      setTimeout(() => setSavedToast(null), 2000);
    } catch {
      setSavedToast(`Failed to save ${key}`);
    }
  }

  /* ── Persist agent config ────────────────────────────────────────── */
  async function persistAgent(id: string, patch: Partial<AgentSetting>) {
    setAgents((prev) => prev.map((a) => (a.agentId === id ? { ...a, ...patch } : a)));
    try {
      await fetch("/api/agent-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: id, ...patch }),
      });
    } catch {
      /* optimistic */
    }
  }

  async function moveAgent(id: string, dir: "up" | "down") {
    const next = [...agents];
    const idx = next.findIndex((a) => a.agentId === id);
    if (idx < 0) return;
    const swap = dir === "up" ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    setAgents(next);
    await fetch("/api/agent-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentIds: next.map((a) => a.agentId) }),
    });
  }

  async function resetAgent(id: string) {
    setAgents((prev) => prev.map((a) => (a.agentId === id ? { ...a, enabled: true, customLabel: null, defaultModel: null, notes: null } : a)));
    await fetch(`/api/agent-settings?agentId=${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <Link
        href="/status"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to status board
      </Link>

      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
        Configure provider credentials and your agent roster. Changes persist to{" "}
        <code className="rounded bg-[var(--muted)] px-1 py-0.5 font-mono text-xs">.env.local</code>{" "}
        and the <code className="rounded bg-[var(--muted)] px-1 py-0.5 font-mono text-xs">agent_settings</code> SQLite table.
      </p>

      {/* Tabs */}
      <div className="mt-6 flex border-b border-[var(--border)]">
        {[
          { id: "env" as const, label: "Providers", icon: <PlugZap className="h-3.5 w-3.5" /> },
          { id: "agents" as const, label: "Agent roster", icon: <Cog className="h-3.5 w-3.5" /> },
          { id: "advanced" as const, label: "Advanced", icon: <RotateCcw className="h-3.5 w-3.5" /> },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-1.5 border-b-2 px-4 py-2 text-sm",
              activeTab === tab.id
                ? "border-[var(--accent)] text-[var(--foreground)]"
                : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
            )}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Toast */}
      {savedToast && (
        <div className="mb-4 mt-4 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-500">
          {savedToast}
        </div>
      )}

      {activeTab === "env" && (
        <div className="mt-6 space-y-4">
          <p className="text-sm text-[var(--muted-foreground)]">
            Set provider API keys. Each key unlocks the matching chat adapter in Mission Control.
            Keys are written to <code className="rounded bg-[var(--muted)] px-1 font-mono text-xs">.env.local</code>
            (not the database). Empty fields are skipped when you click Save.
          </p>
          {ENV_FIELDS.map((field) => {
            const isSet = envExists[field.key];
            const hasDirty = envDirty[field.key];
            return (
              <div key={field.key} className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="block">
                    <code className="text-sm font-semibold">{field.key}</code>
                    <p className="mt-1 text-xs text-[var(--muted-foreground)]">{field.description}</p>
                  </label>
                  <Badge className={isSet ? "border-emerald-500/30 text-emerald-500" : "border-zinc-500/30 text-zinc-400"}>
                    {isSet ? "Set" : "Not set"}
                  </Badge>
                </div>
                <div className="mt-3 flex gap-2">
                  <input
                    type={field.isSecret ? "password" : "text"}
                    value={envValues[field.key] ?? ""}
                    onChange={(e) => {
                      setEnvValues((p) => ({ ...p, [field.key]: e.target.value }));
                      setEnvDirty((p) => ({ ...p, [field.key]: true }));
                    }}
                    placeholder={isSet ? "•••• (already set; paste new value to overwrite)" : "paste value here"}
                    className="flex-1 rounded-md border border-[var(--border)] bg-[var(--input)] px-3 py-1.5 font-mono text-sm focus:border-[var(--ring)] focus:outline-none"
                  />
                  <button
                    onClick={() => persistKey(field.key)}
                    disabled={!hasDirty || !envValues[field.key]}
                    className="inline-flex items-center gap-1.5 rounded-md border border-[var(--accent)] bg-[var(--accent)]/10 px-3 py-1.5 text-xs font-medium hover:bg-[var(--accent)]/20 disabled:opacity-30"
                  >
                    <Save className="h-3 w-3" /> Save
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {activeTab === "agents" && (
        <div className="mt-6 space-y-3">
          <p className="text-sm text-[var(--muted-foreground)]">
            Disable agents you don't use, reorder them, or set a custom label / default model.
            Changes apply immediately (the chat picker respects these).
          </p>
          {agents.map((a, idx) => (
            <div
              key={a.agentId}
              className={cn(
                "rounded-xl border bg-[var(--card)] p-4",
                a.enabled ? "border-[var(--border)]" : "border-dashed border-zinc-700 opacity-70",
              )}
            >
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <code className="text-sm font-semibold">{a.agentId}</code>
                    <Badge className="text-[var(--muted-foreground)]">{a.kind}</Badge>
                    {!a.available && (
                      <Badge className="border-zinc-500/30 text-zinc-400">unavailable</Badge>
                    )}
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    <label className="block">
                      <span className="text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">Custom label</span>
                      <input
                        value={a.customLabel ?? ""}
                        onChange={(e) => setAgents((prev) =>
                          prev.map((x) => (x.agentId === a.agentId ? { ...x, customLabel: e.target.value } : x)),
                        )}
                        onBlur={(e) => persistAgent(a.agentId, { customLabel: e.target.value || null })}
                        placeholder={a.name}
                        className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--input)] px-2 py-1 text-xs focus:border-[var(--ring)] focus:outline-none"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">Default model</span>
                      <input
                        value={a.defaultModel ?? ""}
                        onChange={(e) => setAgents((prev) =>
                          prev.map((x) => (x.agentId === a.agentId ? { ...x, defaultModel: e.target.value } : x)),
                        )}
                        onBlur={(e) => persistAgent(a.agentId, { defaultModel: e.target.value || null })}
                        placeholder={a.defaultModel ?? "provider/model"}
                        className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--input)] px-2 py-1 font-mono text-xs focus:border-[var(--ring)] focus:outline-none"
                      />
                    </label>
                    <label className="block sm:col-span-1">
                      <span className="text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">Notes</span>
                      <input
                        value={a.notes ?? ""}
                        onChange={(e) => setAgents((prev) =>
                          prev.map((x) => (x.agentId === a.agentId ? { ...x, notes: e.target.value } : x)),
                        )}
                        onBlur={(e) => persistAgent(a.agentId, { notes: e.target.value || null })}
                        placeholder="free-text"
                        className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--input)] px-2 py-1 text-xs focus:border-[var(--ring)] focus:outline-none"
                      />
                    </label>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => moveAgent(a.agentId, "up")}
                    disabled={idx === 0}
                    className="rounded p-1 text-[var(--muted-foreground)] hover:bg-[var(--muted)] disabled:opacity-30"
                    title="Move up"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => moveAgent(a.agentId, "down")}
                    disabled={idx === agents.length - 1}
                    className="rounded p-1 text-[var(--muted-foreground)] hover:bg-[var(--muted)] disabled:opacity-30"
                    title="Move down"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => persistAgent(a.agentId, { enabled: !a.enabled })}
                    className={cn(
                      "rounded px-2 py-1 text-xs",
                      a.enabled
                        ? "border border-emerald-500/40 text-emerald-500"
                        : "border border-zinc-500/40 text-zinc-400",
                    )}
                  >
                    {a.enabled ? "Enabled" : "Disabled"}
                  </button>
                  <button
                    onClick={() => resetAgent(a.agentId)}
                    className="rounded p-1 text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-red-500"
                    title="Reset to default"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === "advanced" && (
        <div className="mt-6 space-y-4">
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
            <h3 className="text-sm font-semibold">Danger zone</h3>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              These actions affect persistent config. They are not reversible from this UI.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={async () => {
                  if (!confirm("Reset every agent's custom config to defaults?")) return;
                  for (const a of agents) {
                    await fetch(`/api/agent-settings?agentId=${encodeURIComponent(a.agentId)}`, { method: "DELETE" });
                  }
                  location.reload();
                }}
                className="inline-flex items-center gap-1.5 rounded-md border border-red-500/40 bg-red-500/5 px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-500/15"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Reset all agent settings
              </button>
            </div>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
            <h3 className="text-sm font-semibold">About these settings</h3>
            <ul className="mt-2 space-y-1 text-xs text-[var(--muted-foreground)]">
              <li>• Agent enable/disable + sort order persist to <code className="font-mono">agent_settings</code></li>
              <li>• Provider API keys persist to <code className="font-mono">.env.local</code></li>
              <li>• Chat agents: Hermes, NIM, Mistral Direct (can chat)</li>
              <li>• CLI agents: kilo, grok, opencode, claude, codex, lm-studio (run tasks)</li>
              <li>• Hermes config.yaml is read-only here; edit it on disk for model defaults.</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
