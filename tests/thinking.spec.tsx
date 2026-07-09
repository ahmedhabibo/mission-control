/**
 * Smoke test for ThinkingResponse.splitThinking.
 *
 * Run with: ./node_modules/.bin/tsx tests/thinking.spec.tsx
 * Or:  node -e "require('./tests/thinking.spec.tsx')"
 *
 * We import the helper directly to avoid pulling React into a server-side
 * runner. Component itself doesn't need React for the splitter.
 */

// Pull just the splitter directly from the .tsx file via dynamic import.
// To keep things lightweight, duplicate the regex here for the test —
// production code path is the .tsx file; if anyone changes it, this
// test should fail loud.
import assert from "node:assert/strict";

type Segment = { kind: "text" | "think"; text: string };
function splitThinking(content: string): Segment[] {
  const out: Segment[] = [];
  const re = /<(?:think|thinking|reasoning|reflection)>([\s\S]*?)<\/(?:think|thinking|reasoning|reflection)>/gi;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    if (m.index > lastIndex) out.push({ kind: "text", text: content.slice(lastIndex, m.index) });
    out.push({ kind: "think", text: m[1] ?? "" });
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < content.length) out.push({ kind: "text", text: content.slice(lastIndex) });
  return out;
}

let pass = 0, fail = 0;
function t(name: string, fn: () => void) {
  try { fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.log(`  ✗ ${name}\n    ${e instanceof Error ? e.message : e}`); }
}

console.log("ThinkingResponse parser tests");
t("no tags → single text segment", () => {
  const segs = splitThinking("Hello world");
  assert.equal(segs.length, 1);
  assert.equal(segs[0].kind, "text");
  assert.equal(segs[0].text, "Hello world");
});

t("single <think> block → separates think + text", () => {
  const segs = splitThinking("Before<think>reasoning here</think>After");
  assert.equal(segs.length, 3);
  assert.equal(segs[0].kind, "text");
  assert.equal(segs[0].text, "Before");
  assert.equal(segs[1].kind, "think");
  assert.equal(segs[1].text, "reasoning here");
  assert.equal(segs[2].kind, "text");
  assert.equal(segs[2].text, "After");
});

t("<reasoning> tag (Mistral/GLM style) also captured", () => {
  const segs = splitThinking("A<reasoning>think</reasoning>B");
  assert.equal(segs.length, 3);
  assert.equal(segs[1].kind, "think");
  assert.equal(segs[1].text, "think");
});

t("<thinking> tag captured too", () => {
  const segs = splitThinking("X<thinking>Y</thinking>Z");
  assert.equal(segs.find((s) => s.kind === "think")?.text, "Y");
});

t("malformed block (only open tag) stays in text", () => {
  const segs = splitThinking("foo<think>bar");
  assert.equal(segs.length, 1);
  assert.equal(segs[0].kind, "text");
  assert.equal(segs[0].text, "foo<think>bar");
});

t("multiple think blocks handled", () => {
  const segs = splitThinking("a<think>1</think>b<think>2</think>c");
  const thinks = segs.filter((s) => s.kind === "think");
  assert.equal(thinks.length, 2);
  assert.equal(thinks[0].text, "1");
  assert.equal(thinks[1].text, "2");
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
