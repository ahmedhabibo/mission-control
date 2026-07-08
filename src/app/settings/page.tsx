"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Check, ArrowLeft, Plug, PlugZap } from "lucide-react";

type ToolSetting = {
  id: string;
  name: string;
  description: string;
  category: string;
  deployment: string;
  enabled: boolean;
  requiredEnv: string[];
  hasEndpointOverride: boolean;
  endpointOverride: string | null;
};

export default function SettingsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<{ tools: ToolSetting[] }>({
    queryKey: ["settings"],
    queryFn: () => fetch("/api/settings").then((r) => r.json()),
  });

  const mutate = useMutation({
    mutationFn: (body: { toolId: string; enabled?: boolean; endpointOverride?: string | null }) =>
      fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings"] }),
  });

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <Link
        href="/"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to status board
      </Link>

      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
        Enable tools and configure endpoints. All credentials live behind
        a single Mission Control gateway — set{" "}
        <code className="rounded bg-[var(--muted)] px-1 py-0.5 font-mono text-xs">
          MC_GATEWAY_URL
        </code>{" "}
        and{" "}
        <code className="rounded bg-[var(--muted)] px-1 py-0.5 font-mono text-xs">
          MC_GATEWAY_TOKEN
        </code>{" "}
        once. Provider keys (NIM, Mistral, etc.) belong inside the gateway,
        never in this database.
      </p>

      <GatewayStatusBanner />

      <EnvHint />

      <div className="mt-6 space-y-3">
        {isLoading ? (
          <div className="text-sm text-[var(--muted-foreground)]">Loading…</div>
        ) : (
          data?.tools.map((tool) => (
            <ToolSettingRow
              key={tool.id}
              tool={tool}
              saving={mutate.isPending}
              onToggle={(enabled) => mutate.mutate({ toolId: tool.id, enabled })}
              onEndpoint={(endpointOverride) =>
                mutate.mutate({ toolId: tool.id, endpointOverride })
              }
            />
          ))
        )}
      </div>
    </div>
  );
}

function ToolSettingRow({
  tool,
  saving,
  onToggle,
  onEndpoint,
}: {
  tool: ToolSetting;
  saving: boolean;
  onToggle: (enabled: boolean) => void;
  onEndpoint: (value: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(tool.endpointOverride ?? "");

  useEffect(() => {
    setDraft(tool.endpointOverride ?? "");
  }, [tool.endpointOverride]);

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{tool.name}</h3>
            <Badge className="capitalize text-[var(--muted-foreground)]">{tool.category}</Badge>
            <Badge className="capitalize text-[var(--muted-foreground)]">{tool.deployment}</Badge>
          </div>
          <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">{tool.description}</p>
          {tool.requiredEnv.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-[var(--muted-foreground)]">env:</span>
              {tool.requiredEnv.map((env) => {
                const set = Boolean(process.env[env]); // client can't see env; show as config hint only
                return (
                  <code
                    key={env}
                    className="rounded border border-[var(--border)] bg-[var(--muted)] px-1.5 py-0.5 font-mono text-[var(--muted-foreground)] text-xs"
                    title="Set this in .env.local"
                  >
                    {env}
                  </code>
                );
              })}
            </div>
          )}
        </div>

        {/* Toggle */}
        <button
          role="switch"
          aria-checked={tool.enabled}
          disabled={saving}
          onClick={() => onToggle(!tool.enabled)}
          className={cn(
            "relative h-6 w-11 shrink-0 rounded-full border transition-colors",
            tool.enabled
              ? "border-[var(--status-online)] bg-[var(--status-online)]/30"
              : "border-[var(--border)] bg-[var(--muted)]",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 h-4 w-4 rounded-full bg-[var(--foreground)] transition-transform",
              tool.enabled ? "translate-x-5" : "translate-x-0.5",
            )}
          />
        </button>
      </div>

      {/* Endpoint override editor (for tools that take a base URL/container). */}
      {tool.deployment !== "local" || tool.requiredEnv.length > 0 ? (
        <div className="mt-3 border-t border-[var(--border)] pt-3">
          {editing ? (
            <div className="flex gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="https://…  or  container-name  (leave blank for default)"
                className="h-8 flex-1 rounded-md border border-[var(--border)] bg-[var(--input)] px-2 font-mono text-xs"
              />
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  onEndpoint(draft.trim() || null);
                  setEditing(false);
                }}
              >
                <Check className="h-3.5 w-3.5" />
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--muted-foreground)]">
                {tool.endpointOverride ? (
                  <>
                    endpoint:{" "}
                    <code className="font-mono text-[var(--foreground)]">
                      {tool.endpointOverride}
                    </code>
                  </>
                ) : (
                  "endpoint: registry default"
                )}
              </span>
              <button
                className="font-medium text-[var(--accent)] hover:underline"
                onClick={() => setEditing(true)}
              >
                {tool.endpointOverride ? "Edit" : "Override"}
              </button>
            </div>
          )}
        </div>
      ) : null}
    </Card>
  );
}

function EnvHint() {
  return (
    <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--muted)] p-3 text-xs text-[var(--muted-foreground)]">
      <p>
        <span className="font-semibold text-[var(--foreground)]">Tip:</span> Copy{" "}
        <code className="rounded bg-[var(--card)] px-1 py-0.5 font-mono">.env.example</code>{" "}
        to{" "}
        <code className="rounded bg-[var(--card)] px-1 py-0.5 font-mono">.env.local</code>{" "}
        and fill in your gateway credentials. Tools with missing config show
        as{" "}
        <span className="text-[var(--status-unknown)]">needs setup</span>, not
        broken.
      </p>
    </div>
  );
}

/** Banner that shows whether the gateway is reachable, with agent list. */
function GatewayStatusBanner() {
  const { data, isLoading } = useQuery<{
    configured: boolean;
    agents: { id: string; name?: string; available: boolean }[];
    detail: string;
    checkedAt: string;
  }>({
    queryKey: ["gateway-status"],
    queryFn: () => fetch("/api/gateway/status").then((r) => r.json()),
    refetchInterval: 15_000,
  });

  if (isLoading) {
    return (
      <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--muted)] p-3 text-xs text-[var(--muted-foreground)]">
        Checking gateway…
      </div>
    );
  }

  const configured = data?.configured ?? false;
  const tone = configured ? "ok" : "warn";

  return (
    <div
      className={cn(
        "mt-4 flex items-start gap-3 rounded-lg border p-3 text-xs",
        tone === "ok"
          ? "border-[var(--status-online)]/40 bg-[var(--status-online)]/5"
          : "border-[var(--status-unknown)]/40 bg-[var(--status-unknown)]/5",
      )}
    >
      {tone === "ok" ? (
        <PlugZap className="mt-0.5 h-4 w-4 text-[var(--status-online)]" />
      ) : (
        <Plug className="mt-0.5 h-4 w-4 text-[var(--status-unknown)]" />
      )}
      <div className="flex-1">
        <div className="font-semibold text-[var(--foreground)]">
          Gateway: {configured ? "online" : "not configured"}
        </div>
        <div className="mt-0.5 text-[var(--muted-foreground)]">{data?.detail}</div>
        {configured && data?.agents.length ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {data.agents.slice(0, 12).map((a) => (
              <Badge
                key={a.id}
                className={cn(
                  "font-mono text-[10px]",
                  a.available
                    ? "text-[var(--status-online)]"
                    : "text-[var(--muted-foreground)]",
                )}
              >
                {a.id}
              </Badge>
            ))}
            {data.agents.length > 12 && (
              <span className="text-[var(--muted-foreground)]">
                +{data.agents.length - 12} more
              </span>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
