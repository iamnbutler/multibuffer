/**
 * Tests for column decorations (intraline highlighting) in the DOM highlighter.
 *
 * Column decorations are what `makeColumnDecoration()` (`src/diff/diff-styles.ts`)
 * produces for intraline diff highlighting: the red/green character-level
 * backgrounds inside a changed line. They travel from `DiffController` and
 * `src/diff/multibuffer.ts` through `DomRenderer`, which hands them to one of
 * two functions in `src/renderer/highlighter.ts`:
 *
 * - `buildHighlightedSpans(container, text, tokens, columnDecorations)` when the
 *   row also has syntax tokens (`dom.ts:990`),
 * - `buildColumnDecoratedContent(container, text, columnDecorations)` when it
 *   does not (`dom.ts:993`).
 *
 * Both delegate the actual splitting to the private `renderTextWithBackground`.
 * `highlighter.test.ts` covers `buildHighlightedSpans` only in its three-argument
 * form, and `highlighted-spans-parity.test.ts` deliberately stays on the
 * three-argument form the injection copy also has, so the `columnDecorations`
 * argument — and `buildColumnDecoratedContent` entirely — had no coverage.
 *
 * The contract pinned here is per character: a character's background is the
 * `backgroundColor` of the *last* decoration in array order that covers it, and
 * the concatenated span text always reproduces the input line exactly.
 */

import { afterAll, describe, expect, it } from "bun:test";
import { Window } from "happy-dom";
import type { Token } from "../../src/renderer/highlighter.ts";
import {
  buildColumnDecoratedContent,
  buildHighlightedSpans,
} from "../../src/renderer/highlighter.ts";

/**
 * Structural mirror of the `ColumnDecoration` interface in highlighter.ts,
 * which is module-private. Structural typing makes this assignable.
 */
interface ColumnDecoration {
  startColumn: number;
  endColumn: number;
  style: { backgroundColor?: string };
}

const win = new Window({ url: "https://localhost:8080/" });
const doc = win.document;

// Both functions call the global `document` directly.
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

/** One entry per rendered span, in document order. */
type Spans = Array<{ text: string; color: string; background: string }>;

function readSpans(container: HTMLElement): Spans {
  const out: Spans = [];
  for (const node of Array.from(container.childNodes)) {
    // biome-ignore lint/plugin/no-type-assertion: expect: happy-dom child nodes are Elements with textContent and style
    const el = node as unknown as HTMLElement;
    out.push({
      text: el.textContent ?? "",
      color: el.style.color,
      background: el.style.backgroundColor,
    });
  }
  return out;
}

/** Expand rendered spans to one background colour per character. */
function backgroundPerChar(spans: Spans): string[] {
  const out: string[] = [];
  for (const span of spans) {
    for (let i = 0; i < span.text.length; i++) out.push(span.background);
  }
  return out;
}

function spanText(spans: Spans): string {
  return spans.map((s) => s.text).join("");
}

// Opaque colours: happy-dom normalises these to `rgb(r, g, b)` form, so the
// expected values below are written the same way the DOM reports them.
const RED = "rgb(255, 0, 0)";
const GREEN = "rgb(0, 255, 0)";
const KEYWORD = "rgb(0, 0, 255)";

function decoration(
  startColumn: number,
  endColumn: number,
  backgroundColor: string,
): ColumnDecoration {
  return { startColumn, endColumn, style: { backgroundColor } };
}

describe("buildColumnDecoratedContent", () => {
  it("should render the whole line as one span when there are no decorations", () => {
    const container = makeContainer();
    buildColumnDecoratedContent(container, "hello world", []);
    const spans = readSpans(container);
    expect(spans.length).toBe(1);
    expect(spans[0]?.text).toBe("hello world");
    expect(spans[0]?.background).toBe("");
  });

  it("should split the line at the decoration boundaries", () => {
    const container = makeContainer();
    // "hello world" with columns 6-11 ("world") highlighted.
    buildColumnDecoratedContent(container, "hello world", [decoration(6, 11, GREEN)]);
    const spans = readSpans(container);
    expect(spans.length).toBe(2);
    expect(spans[0]?.text).toBe("hello ");
    expect(spans[0]?.background).toBe("");
    expect(spans[1]?.text).toBe("world");
    expect(spans[1]?.background).toBe(GREEN);
  });

  it("should produce an undecorated tail after an interior decoration", () => {
    const container = makeContainer();
    buildColumnDecoratedContent(container, "abcdef", [decoration(2, 4, RED)]);
    const spans = readSpans(container);
    expect(spans.map((s) => s.text)).toEqual(["ab", "cd", "ef"]);
    expect(spans.map((s) => s.background)).toEqual(["", RED, ""]);
  });

  it("should apply no colour to spans, only backgrounds", () => {
    const container = makeContainer();
    buildColumnDecoratedContent(container, "abcdef", [decoration(0, 3, RED)]);
    for (const span of readSpans(container)) {
      expect(span.color).toBe("");
    }
  });

  it("should clamp a decoration that runs past the end of the line", () => {
    const container = makeContainer();
    buildColumnDecoratedContent(container, "abc", [
      decoration(1, Number.MAX_SAFE_INTEGER, RED),
    ]);
    const spans = readSpans(container);
    expect(spanText(spans)).toBe("abc");
    expect(backgroundPerChar(spans)).toEqual(["", RED, RED]);
  });

  it("should ignore a decoration that lies entirely beyond the line", () => {
    const container = makeContainer();
    buildColumnDecoratedContent(container, "abc", [decoration(10, 20, RED)]);
    const spans = readSpans(container);
    expect(spanText(spans)).toBe("abc");
    expect(backgroundPerChar(spans)).toEqual(["", "", ""]);
  });

  it("should ignore a zero-width decoration", () => {
    const container = makeContainer();
    // An empty intraline range covers no character, so it must paint nothing.
    buildColumnDecoratedContent(container, "abc", [decoration(1, 1, RED)]);
    const spans = readSpans(container);
    expect(spanText(spans)).toBe("abc");
    expect(backgroundPerChar(spans)).toEqual(["", "", ""]);
  });

  it("should let the last decoration win where two overlap", () => {
    const container = makeContainer();
    // Delete- and insert-style ranges overlapping on columns 2-3.
    buildColumnDecoratedContent(container, "abcdef", [
      decoration(0, 4, RED),
      decoration(2, 6, GREEN),
    ]);
    const spans = readSpans(container);
    expect(spanText(spans)).toBe("abcdef");
    expect(backgroundPerChar(spans)).toEqual([RED, RED, GREEN, GREEN, GREEN, GREEN]);
  });

  it("should keep adjacent decorations separate", () => {
    const container = makeContainer();
    buildColumnDecoratedContent(container, "abcd", [
      decoration(0, 2, RED),
      decoration(2, 4, GREEN),
    ]);
    const spans = readSpans(container);
    expect(spans.map((s) => s.text)).toEqual(["ab", "cd"]);
    expect(spans.map((s) => s.background)).toEqual([RED, GREEN]);
  });
});

describe("buildHighlightedSpans with column decorations", () => {
  it("should keep the syntax colour while adding the decoration background", () => {
    const container = makeContainer();
    // A decoration nested inside a single token: the real intraline diff case,
    // where a changed substring sits inside one highlighted identifier.
    const tokens: Token[] = [{ startColumn: 0, endColumn: 6, color: KEYWORD }];
    buildHighlightedSpans(container, "abcdef", tokens, [decoration(2, 4, RED)]);
    const spans = readSpans(container);
    expect(spans.map((s) => s.text)).toEqual(["ab", "cd", "ef"]);
    // The token colour survives the split on every segment...
    expect(spans.map((s) => s.color)).toEqual([KEYWORD, KEYWORD, KEYWORD]);
    // ...and only the covered segment gains a background.
    expect(spans.map((s) => s.background)).toEqual(["", RED, ""]);
  });

  it("should decorate gaps between tokens", () => {
    const container = makeContainer();
    // The decoration falls in the untokenised gap, not on the token.
    const tokens: Token[] = [{ startColumn: 6, endColumn: 11, color: KEYWORD }];
    buildHighlightedSpans(container, "hello world", tokens, [decoration(0, 5, RED)]);
    const spans = readSpans(container);
    expect(spanText(spans)).toBe("hello world");
    expect(backgroundPerChar(spans)).toEqual([
      RED, RED, RED, RED, RED, "", "", "", "", "", "",
    ]);
  });

  it("should decorate trailing text after the last token", () => {
    const container = makeContainer();
    const tokens: Token[] = [{ startColumn: 0, endColumn: 2, color: KEYWORD }];
    buildHighlightedSpans(container, "abcdef", tokens, [decoration(4, 6, GREEN)]);
    const spans = readSpans(container);
    expect(spanText(spans)).toBe("abcdef");
    expect(backgroundPerChar(spans)).toEqual(["", "", "", "", GREEN, GREEN]);
  });

  it("should split a decoration that straddles a token boundary", () => {
    const container = makeContainer();
    // The decoration spans columns 1-5, crossing the 3-column token edge, so it
    // must be cut at the boundary and reapplied to both sides.
    const tokens: Token[] = [
      { startColumn: 0, endColumn: 3, color: KEYWORD },
      { startColumn: 3, endColumn: 6, color: GREEN },
    ];
    buildHighlightedSpans(container, "abcdef", tokens, [decoration(1, 5, RED)]);
    const spans = readSpans(container);
    expect(spanText(spans)).toBe("abcdef");
    expect(backgroundPerChar(spans)).toEqual(["", RED, RED, RED, RED, ""]);
    // Each half keeps its own token colour across the shared decoration.
    expect(spans.map((s) => [s.text, s.color])).toEqual([
      ["a", KEYWORD],
      ["bc", KEYWORD],
      ["de", GREEN],
      ["f", GREEN],
    ]);
  });

  it("should behave identically to buildColumnDecoratedContent when there are no tokens", () => {
    const decorations = [decoration(1, 3, RED), decoration(2, 5, GREEN)];
    const withTokens = makeContainer();
    buildHighlightedSpans(withTokens, "abcdef", [], decorations);
    const withoutTokens = makeContainer();
    buildColumnDecoratedContent(withoutTokens, "abcdef", decorations);
    expect(readSpans(withTokens)).toEqual(readSpans(withoutTokens));
  });
});

describe("column decoration character model", () => {
  /**
   * Reference model for the pinned contract: a character's background is the
   * `backgroundColor` of the last decoration in array order that covers it.
   */
  function expectedBackgrounds(length: number, decorations: ColumnDecoration[]): string[] {
    const out: string[] = [];
    for (let i = 0; i < length; i++) {
      let bg = "";
      for (const d of decorations) {
        if (d.startColumn <= i && d.endColumn >= i + 1 && d.style.backgroundColor) {
          bg = d.style.backgroundColor;
        }
      }
      out.push(bg);
    }
    return out;
  }

  const TEXT = "abcde";

  it("should match the reference model for every single-decoration range", () => {
    // Exhaustive over all start <= end within (and just past) the line.
    for (let start = 0; start <= TEXT.length + 1; start++) {
      for (let end = start; end <= TEXT.length + 1; end++) {
        const decorations = [decoration(start, end, RED)];
        const container = makeContainer();
        buildColumnDecoratedContent(container, TEXT, decorations);
        const spans = readSpans(container);
        expect(spanText(spans)).toBe(TEXT);
        expect(backgroundPerChar(spans)).toEqual(
          expectedBackgrounds(TEXT.length, decorations),
        );
      }
    }
  });

  it("should match the reference model for every overlapping decoration pair", () => {
    // Exhaustive over all pairs of ranges within the line: covers nesting,
    // partial overlap, adjacency, containment and disjoint pairs in one sweep.
    for (let aStart = 0; aStart <= TEXT.length; aStart++) {
      for (let aEnd = aStart; aEnd <= TEXT.length; aEnd++) {
        for (let bStart = 0; bStart <= TEXT.length; bStart++) {
          for (let bEnd = bStart; bEnd <= TEXT.length; bEnd++) {
            const decorations = [
              decoration(aStart, aEnd, RED),
              decoration(bStart, bEnd, GREEN),
            ];
            const container = makeContainer();
            buildColumnDecoratedContent(container, TEXT, decorations);
            const spans = readSpans(container);
            expect(spanText(spans)).toBe(TEXT);
            expect(backgroundPerChar(spans)).toEqual(
              expectedBackgrounds(TEXT.length, decorations),
            );
          }
        }
      }
    }
  });

  it("should preserve the line text regardless of tokens and decorations", () => {
    // Tokens and decorations cut the line independently; neither may drop or
    // duplicate a character.
    const tokenSets: Token[][] = [
      [],
      [{ startColumn: 0, endColumn: 5, color: KEYWORD }],
      [
        { startColumn: 0, endColumn: 2, color: KEYWORD },
        { startColumn: 3, endColumn: 5, color: GREEN },
      ],
    ];
    for (const tokens of tokenSets) {
      for (let start = 0; start <= TEXT.length; start++) {
        for (let end = start; end <= TEXT.length; end++) {
          const decorations = [decoration(start, end, RED)];
          const container = makeContainer();
          buildHighlightedSpans(container, TEXT, tokens, decorations);
          const spans = readSpans(container);
          expect(spanText(spans)).toBe(TEXT);
          expect(backgroundPerChar(spans)).toEqual(
            expectedBackgrounds(TEXT.length, decorations),
          );
        }
      }
    }
  });
});
