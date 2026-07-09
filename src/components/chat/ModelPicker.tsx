"use client";

import { useState, useEffect, useRef } from "react";
import { ChevronDown, Bot } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Compact per-message / per-conversation model picker.
 *
 * Toggled from a chevron button. Renders a small panel with one entry per
 * (provider, model) pair, plus the agent default option. Selection forwards
 * immediately via `onChange`. Mirrors the Hermes WebUI model selector — same
 * "show friendly label, hide raw provider/model id underneath" treatment.
 */

export interface ModelOption {
  /** Display label shown to the user, e.g. "NVIDIA · GLM 5.2 (primary)". */
  label: string;
  /** Stable id used by the gateway ('provider/model' or alias). */
  value: string;
  /** Short description shown on hover. */
  description?: string;
  /** Badge like "primary", "fallback", "code", "fast". */
  badge?: string;
  /** Relative speed indicator. */
  latency?: "fast" | "medium" | "slow";
  /** Relative cost indicator. */
  price?: "free" | "cheap" | "moderate" | "expensive";
  /** End-to-end tested (live) flag. */
  live?: boolean;
  /** Context window in tokens. */
  contextWindow?: number;
}

export interface PickerGroup {
  provider: string;
  label: string;
  options: ModelOption[];
}

export interface ModelPickerProps {
  /** Flat list of options (legacy). */
  options?: ModelOption[];
  /** Grouped options — displayed under provider section headers. */
  groups?: PickerGroup[];
  value?: string;
  fallbackLabel?: string;
  onChange: (value: string) => void;
  className?: string;
}

export function ModelPicker({
  options,
  groups,
  value,
  fallbackLabel = "default",
  onChange,
  className,
}: ModelPickerProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Close when clicking outside.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Flatten groups for lookup if needed.
  const allOptions = groups
    ? groups.flatMap((g) => g.options)
    : options ?? [];
  const current = allOptions.find((o) => o.value === value);
  const display = current?.label ?? value ?? fallbackLabel;

  const LATENCY_COLORS: Record<string, string> = {
    fast: "text-green-500",
    medium: "text-yellow-500",
    slow: "text-red-500",
  };
  const LATENCY_LABEL: Record<string, string> = {
    fast: "⚡",
    medium: "⏱",
    slow: "🐢",
  };
  const PRICE_LABEL: Record<string, string> = {
    free: "FREE",
    cheap: "$",
    moderate: "$$",
    expensive: "$$$",
  };

  function renderBadges(o: ModelOption) {
    return (
      <span className="flex items-center gap-1">
        {o.live && (
          <span className="rounded bg-green-500/10 px-1 text-[9px] font-semibold uppercase text-green-600">
            ✓
          </span>
        )}
        {o.latency && (
          <span className={LATENCY_COLORS[o.latency]} title={`Speed: ${o.latency}`}>
            {LATENCY_LABEL[o.latency]}
          </span>
        )}
        {o.price && (
          <span className="text-[9px] text-[var(--muted-foreground)]" title={`Cost: ${o.price}`}>
            {PRICE_LABEL[o.price]}
          </span>
        )}
        {o.badge && (
          <span className="rounded-full border border-[var(--border)] px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-[var(--muted-foreground)]">
            {o.badge}
          </span>
        )}
      </span>
    );
  }

  function renderOption(o: ModelOption) {
    return (
      <button
        key={o.value}
        onClick={() => {
          onChange(o.value);
          setOpen(false);
        }}
        className={cn(
          "block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-[var(--muted)]",
          value === o.value && "bg-[var(--muted)]/60",
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium">{o.label}</span>
          {renderBadges(o)}
        </div>
        <div className="font-mono text-[10px] text-[var(--muted-foreground)]/70">{o.value}</div>
        {o.description && (
          <div className="mt-0.5 text-[var(--muted-foreground)]">{o.description}</div>
        )}
      </button>
    );
  }

  return (
    <div ref={wrapRef} className={cn("relative inline-block", className)}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-transparent px-2 py-0.5 text-xs text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
        title={current?.description ?? "Choose model"}
      >
        <Bot className="h-3 w-3 opacity-70" />
        <span className="max-w-[160px] truncate">{display}</span>
        <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute right-0 top-full z-30 mt-1 min-w-[280px] max-w-[360px] max-h-[400px] overflow-y-auto rounded-md border border-[var(--border)] bg-[var(--card)] p-1 shadow-lg"
        >
          <button
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
            className="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-[var(--muted)]"
          >
            <div className="font-medium">Agent default</div>
            <div className="text-[var(--muted-foreground)]">use whatever the gateway picks</div>
          </button>
          {groups ? (
            groups.map((g) => (
              <div key={g.provider} className="mt-1">
                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                  {g.label}
                </div>
                {g.options.map(renderOption)}
              </div>
            ))
          ) : (
            options?.map(renderOption)
          )}
        </div>
      )}
    </div>
  );
}
