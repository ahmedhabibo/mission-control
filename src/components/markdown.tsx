"use client";

import { useMemo } from "react";

/**
 * Minimal dependency-free Markdown renderer.
 *
 * Handles the subset that matters for agent chat: fenced code blocks, inline
 * code, bold, italic, links, headings, unordered/ordered lists, blockquotes,
 * and paragraphs. For anything fancier later we can swap in react-markdown,
 * but a focused renderer keeps the client bundle small and avoids version
 * churn with React 19.
 *
 * Security: input is escaped before any markup is applied, and HTML is only
 * emitted for constructs we generate ourselves — never raw from the model.
 */

export function Markdown({ content }: { content: string }) {
  const html = useMemo(() => renderMarkdown(content), [content]);
  return (
    <div
      className="prose-chat"
      // html is produced by our own renderer over escaped text; safe.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/** Escape HTML-significant characters. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Apply inline formatting to already-escaped text. */
function inline(s: string): string {
  return (
    s
      // inline code `code`
      .replace(/`([^`]+)`/g, '<code class="ic">$1</code>')
      // bold **text**
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      // italic *text*
      .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
      // links [text](url)
      .replace(
        /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
      )
  );
}

function renderMarkdown(src: string): string {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;
  let inCode = false;
  let codeLang = "";
  let codeBuf: string[] = [];

  const flushCode = () => {
    if (!inCode) return;
    out.push(
      `<pre class="cb"><code data-lang="${esc(codeLang)}">${esc(codeBuf.join("\n"))}</code></pre>`,
    );
    inCode = false;
    codeLang = "";
    codeBuf = [];
  };

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    const fence = line.match(/^```(\w*)\s*$/);
    if (fence) {
      if (inCode) {
        flushCode();
      } else {
        inCode = true;
        codeLang = fence[1] ?? "";
        codeBuf = [];
      }
      i++;
      continue;
    }
    if (inCode) {
      codeBuf.push(line);
      i++;
      continue;
    }

    // Blank line
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Heading
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      out.push(`<h${level}>${inline(esc(h[2]))}</h${level}>`);
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith(">")) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].startsWith(">")) {
        buf.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      out.push(`<blockquote>${inline(esc(buf.join(" ")))}</blockquote>`);
      continue;
    }

    // Unordered list
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(`<li>${inline(esc(lines[i].replace(/^\s*[-*+]\s+/, "")))}</li>`);
        i++;
      }
      out.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(`<li>${inline(esc(lines[i].replace(/^\s*\d+\.\s+/, "")))}</li>`);
        i++;
      }
      out.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    // Paragraph (gather consecutive non-blank, non-special lines)
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^```/.test(lines[i]) &&
      !/^#{1,6}\s/.test(lines[i]) &&
      !lines[i].startsWith(">") &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    out.push(`<p>${inline(esc(para.join("\n"))).replace(/\n/g, "<br/>")}</p>`);
  }

  flushCode();
  return out.join("\n");
}
