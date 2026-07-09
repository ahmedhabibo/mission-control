"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Brain } from "lucide-react";
import { Markdown } from "@/components/markdown";

/**
 * Render an assistant message that may include reasoning ("thinking")
 * in <think>...</think> blocks (Hermes / DeepSeek-R1 / QwQ style).
 *
 * - The visible block renders the cleaned markdown body.
 * - The reasoning block is collapsible; it shows first line of each think
 *   segment as a preview, with full content on expand.
 *
 * Hermes WebUI does the same thing (`show_thinking` setting, defaults to
 * true). We default to visible — users can hide via the Eye button on the
 * message header. State is held locally per instance so different messages
 * can be expanded independently.
 */
export function ThinkingResponse({
  content,
  defaultExpanded = true,
}: {
  content: string;
  defaultExpanded?: boolean;
}) {
  const segments = splitThinking(content);
  const visible = segments.filter((s) => s.kind === "text").map((s) => s.text).join("");
  const thinks = segments.filter((s) => s.kind === "think" && s.text.trim().length > 0);

  if (thinks.length === 0) {
    // No reasoning tags — render the plain content.
    return <MarkdownSafe content={visible || content} />;
  }

  return (
    <div className="space-y-2">
      {thinks.map((t, i) => (
        <ThinkingBlock key={i} content={t.text} defaultExpanded={defaultExpanded} />
      ))}
      {visible.trim().length > 0 && <MarkdownSafe content={visible} />}
    </div>
  );
}

function ThinkingBlock({
  content,
  defaultExpanded,
}: {
  content: string;
  defaultExpanded: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const oneLine = content.replace(/\s+/g, " ").trim().slice(0, 140);
  return (
    <div className="rounded-md border border-dashed border-[var(--border)] bg-[var(--muted)]/40">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs text-[var(--muted-foreground)] hover:bg-[var(--muted)]/60"
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3 shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0" />
        )}
        <Brain className="h-3 w-3 shrink-0" />
        <span className="font-medium">Thinking</span>
        {!expanded && oneLine && (
          <span className="truncate text-[var(--muted-foreground)]/70 italic">
            — {oneLine}
            {content.length > 140 ? "…" : ""}
          </span>
        )}
      </button>
      {expanded && (
        <div className="border-t border-dashed border-[var(--border)]/60 px-3 py-2 text-xs whitespace-pre-wrap text-[var(--muted-foreground)]/90 italic">
          {content.trim()}
        </div>
      )}
    </div>
  );
}

/** Parse out <think>...</think> blocks while leaving the rest of the text. */
function splitThinking(content: string) {
  const out: Array<{ kind: "text" | "think"; text: string }> = [];
  // Match `<think>...</think>` (greedy on tags, lazy on body).
  const re = /<think>([\s\S]*?)<\/think>/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    if (m.index > lastIndex) {
      out.push({ kind: "text", text: content.slice(lastIndex, m.index) });
    }
    out.push({ kind: "think", text: m[1] ?? "" });
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < content.length) {
    out.push({ kind: "text", text: content.slice(lastIndex) });
  }
  return out;
}

/** Lightweight wrapper around the inline Markdown renderer so we don't
 *  re-implement escaping here. Skips the heavy cases (fenced code passes
 *  through). */
function MarkdownSafe({ content }: { content: string }) {
  return <Markdown content={content} />;
}
