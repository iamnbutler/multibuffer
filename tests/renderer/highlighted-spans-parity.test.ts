/**
 * Parity tests for the two `buildHighlightedSpans` implementations.
 *
 * The same token-to-span algorithm is written out twice:
 *
 * - `src/renderer/highlighter.ts` — used by `DomRenderer` (`dom.ts:990`) and
 *   covered by `highlighter.test.ts`.
 * - `src/renderer/injection-highlighter.ts` — re-exported from the package as
 *   `buildHighlightedSpansWithInjection` (`src/renderer/index.ts:9`), with no
 *   in-repo caller and, until this file, no test at all.
 *
 * Both copies must agree on the span structure they produce for a given
 * (text, tokens) pair, since both are public API describing the same feature.
 * These tests pin that shared contract so the copies cannot drift apart
 * silently, and give the injection copy its first direct coverage.
 *
 * Note: the injection copy has no `columnDecorations` parameter, so parity is
 * asserted over the three-argument form the two genuinely share.
 */

import { afterAll, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import type { Token } from "../../src/renderer/highlighter.ts";
import { buildHighlightedSpans } from "../../src/renderer/highlighter.ts";
import { buildHighlightedSpans as buildHighlightedSpansWithInjection } from "../../src/renderer/injection-highlighter.ts";

const win = new Window({ url: "https://localhost:8080/" });
const doc = win.document;

// Both implementations call the global `document` directly.
const originalDocument = globalThis.document;
// biome-ignore lint/plugin/no-type-assertion: expect: globalThis extension for DOM APIs requires type assertion
(globalThis as unknown as Record<string, unknown>).document = doc;

afterAll(() => {
  // biome-ignore lint/plugin/no-type-assertion: expect: globalThis extension for DOM APIs requires type assertion
  (globalThis as unknown as Record<string, unknown>).document = originalDocument;
  win.close();
});

function makeContainer(): HTMLElement {
  // biome-ignore lint/plugin/no-type-assertion: expect: happy-dom returns Element which is compatible with HTMLElement at runtime
  return doc.createElement("div") as unknown as HTMLElement;
}

/** The rendered span structure: one entry per span, in document order. */
type Spans = Array<{ text: string; color: string }>;

function readSpans(container: HTMLElement): Spans {
  const out: Spans = [];
  for (const node of Array.from(container.childNodes)) {
    // biome-ignore lint/plugin/no-type-assertion: expect: happy-dom child nodes are Elements with textContent and style
    const el = node as unknown as HTMLElement;
    out.push({ text: el.textContent ?? "", color: el.style.color });
  }
  return out;
}

function renderWith(
  build: (container: HTMLElement, text: string, tokens: Token[]) => void,
  text: string,
  tokens: Token[],
): Spans {
  const container = makeContainer();
  build(container, text, tokens);
  return readSpans(container);
}

/**
 * Cases chosen to exercise every branch both copies contain: the empty-token
 * short circuit, the leading/interior gap fill, endColumn clamping, the
 * `Math.max(pos, end)` overlap guard, and the trailing fill.
 */
const CASES: Array<{ name: string; text: string; tokens: Token[] }> = [
  { name: "no tokens", text: "hello world", tokens: [] },
  { name: "empty text, no tokens", text: "", tokens: [] },
  {
    name: "single token covering the whole line",
    text: "const",
    tokens: [{ startColumn: 0, endColumn: 5, color: "red" }],
  },
  {
    name: "leading gap before the first token",
    text: "hello world",
    tokens: [{ startColumn: 6, endColumn: 11, color: "red" }],
  },
  {
    name: "trailing gap after the last token",
    text: "const x",
    tokens: [{ startColumn: 0, endColumn: 5, color: "red" }],
  },
  {
    name: "interior gap between two tokens",
    text: "const x = 42",
    tokens: [
      { startColumn: 0, endColumn: 5, color: "red" },
      { startColumn: 10, endColumn: 12, color: "blue" },
    ],
  },
  {
    name: "contiguous tokens produce no gap span",
    text: "ab",
    tokens: [
      { startColumn: 0, endColumn: 1, color: "red" },
      { startColumn: 1, endColumn: 2, color: "blue" },
    ],
  },
  {
    name: "endColumn past end of text is clamped",
    text: "hi",
    tokens: [{ startColumn: 0, endColumn: Number.MAX_SAFE_INTEGER, color: "blue" }],
  },
  {
    name: "token starting past end of text emits nothing",
    text: "hi",
    tokens: [{ startColumn: 5, endColumn: 9, color: "blue" }],
  },
  {
    name: "overlapping tokens hit the Math.max(pos, end) guard",
    text: "abcdefghij",
    tokens: [
      { startColumn: 0, endColumn: 5, color: "red" },
      { startColumn: 3, endColumn: 8, color: "blue" },
    ],
  },
  {
    name: "a fully swallowed token does not rewind pos",
    text: "abcdefghij",
    tokens: [
      { startColumn: 0, endColumn: 8, color: "red" },
      { startColumn: 2, endColumn: 4, color: "blue" },
    ],
  },
  {
    name: "css variable colors are passed through verbatim",
    text: "const",
    tokens: [{ startColumn: 0, endColumn: 5, color: "var(--syntax-keyword, #fb4934)" }],
  },
];

describe("buildHighlightedSpans parity across implementations", () => {
  for (const { name, text, tokens } of CASES) {
    test(`${name}: both implementations agree`, () => {
      const fromHighlighter = renderWith(buildHighlightedSpans, text, tokens);
      const fromInjection = renderWith(buildHighlightedSpansWithInjection, text, tokens);
      expect(fromInjection).toEqual(fromHighlighter);
    });
  }

  test("every case reassembles the original text", () => {
    for (const { name, text, tokens } of CASES) {
      const spans = renderWith(buildHighlightedSpansWithInjection, text, tokens);
      const joined = spans.map((s) => s.text).join("");
      // Overlapping tokens intentionally re-emit already-covered characters,
      // so only the non-overlapping cases can round-trip exactly.
      if (name.includes("overlapping") || name.includes("swallowed")) continue;
      expect(joined).toBe(text);
    }
  });
});

describe("buildHighlightedSpansWithInjection", () => {
  test("clears any previous content before rebuilding", () => {
    const container = makeContainer();
    container.textContent = "stale";
    buildHighlightedSpansWithInjection(container, "ab", [
      { startColumn: 0, endColumn: 2, color: "red" },
    ]);
    expect(container.textContent).toBe("ab");
    expect(container.childNodes.length).toBe(1);
  });

  test("gap spans carry no explicit color", () => {
    const container = makeContainer();
    buildHighlightedSpansWithInjection(container, "hello world", [
      { startColumn: 6, endColumn: 11, color: "red" },
    ]);
    const spans = readSpans(container);
    expect(spans.length).toBe(2);
    expect(spans[0]).toEqual({ text: "hello ", color: "" });
    expect(spans[1]).toEqual({ text: "world", color: "red" });
  });
});
