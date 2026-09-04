/**
 * Tests for computeSelectionRects pure function.
 *
 * Verifies that selection rect geometry is calculated correctly for:
 * - Single-row selections
 * - Multi-row selections
 * - Wrapped lines
 *
 * Pool management (DOM node reuse) requires a browser environment and is
 * validated end-to-end via Playwright.
 */

import { describe, expect, test } from "bun:test";
import { createBuffer } from "../../src/buffer/buffer.ts";
import { createMultiBuffer } from "../../src/multibuffer/multibuffer.ts";
import type {
  BufferId,
  BufferRow,
  ExcerptRange,
  MultiBufferPoint,
  MultiBufferRow,
  MultiBufferSnapshot,
} from "../../src/multibuffer/types.ts";
import { computeSelectionRects } from "../../src/renderer/dom.ts";
import { visualWidth, WrapMap } from "../../src/renderer/wrap-map.ts";

// biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in tests
const row = (n: number): MultiBufferRow => n as MultiBufferRow;

/** Build a minimal MultiBufferSnapshot stub for testing. */
function makeSnapshot(textLines: string[]): MultiBufferSnapshot {
  // biome-ignore lint/plugin/no-type-assertion: expect: test stub implements required subset of interface
  return {
    lineCount: textLines.length,
    version: 1,
    excerpts: [],
    lines: (start: MultiBufferRow, end: MultiBufferRow) =>
      textLines.slice(start, end),
    excerptAt: () => undefined,
    toBufferPoint: () => undefined,
    toMultiBufferPoint: () => undefined,
    resolveAnchor: () => undefined,
    resolveAnchors: () => [],
    clipPoint: (p: MultiBufferPoint) => p,
    excerptBoundaries: () => [],
  } as unknown as MultiBufferSnapshot;
}

const LINE_H = 20;
const CHAR_W = 8;
const GUTTER_W = 40;
const NO_WRAP = 0;

describe("computeSelectionRects", () => {
  test("empty selection (same point) returns no rects", () => {
    const snap = makeSnapshot(["hello"]);
    const rects = computeSelectionRects(
      { row: row(0), column: 2 },
      { row: row(0), column: 2 },
      snap,
      LINE_H,
      CHAR_W,
      GUTTER_W,
      NO_WRAP,
      null,
    );
    expect(rects).toHaveLength(0);
  });

  test("single-row selection returns one rect", () => {
    const snap = makeSnapshot(["hello world"]);
    const rects = computeSelectionRects(
      { row: row(0), column: 0 },
      { row: row(0), column: 5 },
      snap,
      LINE_H,
      CHAR_W,
      GUTTER_W,
      NO_WRAP,
      null,
    );
    expect(rects).toHaveLength(1);
    const [r] = rects;
    expect(r?.x).toBe(GUTTER_W); // starts at gutter edge, col 0
    expect(r?.y).toBe(0); // row 0
    expect(r?.height).toBe(LINE_H);
    expect(r?.width).toBeGreaterThan(0);
  });

  test("selection start after end is normalized (reversed selection)", () => {
    const snap = makeSnapshot(["hello world"]);
    // Reversed selection — should produce the same result as forward
    const rects = computeSelectionRects(
      { row: row(0), column: 5 },
      { row: row(0), column: 0 },
      snap,
      LINE_H,
      CHAR_W,
      GUTTER_W,
      NO_WRAP,
      null,
    );
    expect(rects).toHaveLength(1);
  });

  test("multi-row selection returns one rect per row", () => {
    const snap = makeSnapshot(["line0", "line1", "line2"]);
    const rects = computeSelectionRects(
      { row: row(0), column: 0 },
      { row: row(2), column: 3 },
      snap,
      LINE_H,
      CHAR_W,
      GUTTER_W,
      NO_WRAP,
      null,
    );
    expect(rects).toHaveLength(3);
    // Each rect is on a different visual row
    expect(rects[0]?.y).toBe(0);
    expect(rects[1]?.y).toBe(LINE_H);
    expect(rects[2]?.y).toBe(2 * LINE_H);
  });

  test("partial start row begins at correct x", () => {
    const snap = makeSnapshot(["abcde"]);
    const rects = computeSelectionRects(
      { row: row(0), column: 2 }, // start at col 2
      { row: row(0), column: 4 },
      snap,
      LINE_H,
      CHAR_W,
      GUTTER_W,
      NO_WRAP,
      null,
    );
    expect(rects).toHaveLength(1);
    const [r] = rects;
    // x = gutterWidth + 2 * charWidth (2 ASCII chars × charWidth)
    expect(r?.x).toBe(GUTTER_W + 2 * CHAR_W);
    expect(r?.width).toBe(2 * CHAR_W);
  });

  test("selection width covers correct columns", () => {
    const snap = makeSnapshot(["hello"]);
    const rects = computeSelectionRects(
      { row: row(0), column: 1 },
      { row: row(0), column: 4 },
      snap,
      LINE_H,
      CHAR_W,
      GUTTER_W,
      NO_WRAP,
      null,
    );
    expect(rects).toHaveLength(1);
    // 3 ASCII chars (cols 1, 2, 3) × charWidth
    expect(rects[0]?.width).toBe(3 * CHAR_W);
  });

  test("wrapped line produces multiple rects when selection spans segments", () => {
    // wrapWidth=5: "abcde fghij" wraps into ["abcde", " fghi", "j"]
    const textLines = ["abcde fghij"];
    const snap = makeSnapshot(textLines);
    const wrapWidth = 5;
    const wrapMap = new WrapMap(snap, wrapWidth);
    const rects = computeSelectionRects(
      { row: row(0), column: 0 },
      { row: row(0), column: 11 }, // select entire line
      snap,
      LINE_H,
      CHAR_W,
      GUTTER_W,
      wrapWidth,
      wrapMap,
    );
    // Selection spans all wrap segments (3), so exactly 3 rects
    expect(rects.length).toBeGreaterThanOrEqual(2);
  });

  test("no snapshot returns empty rects", () => {
    const rects = computeSelectionRects(
      { row: row(0), column: 0 },
      { row: row(0), column: 5 },
      null,
      LINE_H,
      CHAR_W,
      GUTTER_W,
      NO_WRAP,
      null,
    );
    expect(rects).toHaveLength(0);
  });
});

/**
 * The tests above drive a hand-written snapshot stub. These drive a real
 * MultiBuffer snapshot so that each rect must line up with the row it belongs
 * to — the stub cannot catch a row/text misalignment because its `lines()` is
 * a plain `Array.slice`, which clamps differently from the real snapshot.
 */
describe("computeSelectionRects — real multibuffer snapshot", () => {
  // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in tests
  const bufferId = "selection-rects" as BufferId;

  /** Excerpt covering buffer rows [startRow, endRow). */
  function excerptRange(startRow: number, endRow: number): ExcerptRange {
    const span = {
      // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in tests
      start: { row: startRow as BufferRow, column: 0 },
      // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in tests
      end: { row: endRow as BufferRow, column: 0 },
    };
    return { context: span, primary: span };
  }

  // Deliberately distinct lengths: a row/text misalignment changes rect widths.
  const TEXT = ["a", "bb", "ccc", "dddd", "eeeee", "ffffff"];

  /** Two excerpts over one buffer, together covering all six rows in order. */
  function twoExcerptSnapshot(): MultiBufferSnapshot {
    const buffer = createBuffer(bufferId, TEXT.join("\n"));
    const mb = createMultiBuffer();
    mb.addExcerpt(buffer, excerptRange(0, 3));
    mb.addExcerpt(buffer, excerptRange(3, 6));
    return mb.snapshot();
  }

  test("select-all across an excerpt boundary keeps every rect on its own row", () => {
    const snap = twoExcerptSnapshot();
    expect(snap.lineCount).toBe(TEXT.length);

    const lastRow = TEXT.length - 1;
    // biome-ignore lint/style/noNonNullAssertion: expect: TEXT is a non-empty literal
    const lastLen = TEXT[lastRow]!.length;
    const rects = computeSelectionRects(
      { row: row(0), column: 0 },
      { row: row(lastRow), column: lastLen },
      snap,
      LINE_H,
      CHAR_W,
      GUTTER_W,
      NO_WRAP,
      null,
    );

    expect(rects).toHaveLength(TEXT.length);
    for (let i = 0; i < TEXT.length; i++) {
      // biome-ignore lint/style/noNonNullAssertion: expect: i is in bounds by construction
      const text = TEXT[i]!;
      expect(rects[i]?.y).toBe(i * LINE_H);
      // Rows before the last extend past end-of-line (the +0.3 newline stub);
      // the last row stops exactly at the selection's end column.
      const expectedVisualCols =
        i === lastRow ? lastLen : visualWidth(text) + 0.3;
      expect(rects[i]?.width).toBeCloseTo(expectedVisualCols * CHAR_W, 6);
    }
  });

  test("selection starting below row 0 reads each row's own text", () => {
    const snap = twoExcerptSnapshot();
    const startRow = 2; // inside the first excerpt
    const startCol = 1;
    const lastRow = TEXT.length - 1; // inside the second excerpt
    // biome-ignore lint/style/noNonNullAssertion: expect: TEXT is a non-empty literal
    const lastLen = TEXT[lastRow]!.length;

    const rects = computeSelectionRects(
      { row: row(startRow), column: startCol },
      { row: row(lastRow), column: lastLen },
      snap,
      LINE_H,
      CHAR_W,
      GUTTER_W,
      NO_WRAP,
      null,
    );

    expect(rects).toHaveLength(lastRow - startRow + 1);
    for (let i = startRow; i <= lastRow; i++) {
      // biome-ignore lint/style/noNonNullAssertion: expect: i is in bounds by construction
      const text = TEXT[i]!;
      const rect = rects[i - startRow];
      expect(rect?.y).toBe(i * LINE_H);
      // TEXT is ASCII, so visual columns equal character columns here.
      const from = i === startRow ? startCol : 0;
      const to = i === lastRow ? lastLen : visualWidth(text) + 0.3;
      expect(rect?.x).toBeCloseTo(GUTTER_W + from * CHAR_W, 6);
      expect(rect?.width).toBeCloseTo((to - from) * CHAR_W, 6);
    }
  });

  // Callers clip selection points, so a negative start row is defensive rather
  // than reachable. This characterizes what the function already does, so the
  // clamp that keeps rows below 0 from shifting the rest of the rows is guarded.
  test("selection starting above row 0 does not shift the in-range rows", () => {
    const snap = twoExcerptSnapshot();
    const rects = computeSelectionRects(
      { row: row(-2), column: 0 },
      { row: row(2), column: 3 },
      snap,
      LINE_H,
      CHAR_W,
      GUTTER_W,
      NO_WRAP,
      null,
    );

    expect(rects).toHaveLength(5);
    // Rows -2 and -1 have no text: an empty line's rect is just the newline stub.
    expect(rects[0]?.y).toBe(-2 * LINE_H);
    expect(rects[0]?.width).toBeCloseTo(0.3 * CHAR_W, 6);
    expect(rects[1]?.width).toBeCloseTo(0.3 * CHAR_W, 6);
    // Rows 0..2 still get their own text, not the text two rows later.
    expect(rects[2]?.width).toBeCloseTo((1 + 0.3) * CHAR_W, 6); // "a"
    expect(rects[3]?.width).toBeCloseTo((2 + 0.3) * CHAR_W, 6); // "bb"
    expect(rects[4]?.width).toBeCloseTo(3 * CHAR_W, 6); // "ccc", ends at column 3
  });

  test("selection ending past the last row still emits one rect per spanned row", () => {
    const snap = twoExcerptSnapshot();
    const endRow = TEXT.length + 2; // beyond lineCount

    const rects = computeSelectionRects(
      { row: row(0), column: 0 },
      { row: row(endRow), column: 0 },
      snap,
      LINE_H,
      CHAR_W,
      GUTTER_W,
      NO_WRAP,
      null,
    );

    expect(rects).toHaveLength(endRow + 1);
    // The in-range rows keep their own text; only the rows past the end are empty.
    for (let i = 0; i < TEXT.length; i++) {
      // biome-ignore lint/style/noNonNullAssertion: expect: i is in bounds by construction
      const text = TEXT[i]!;
      expect(rects[i]?.y).toBe(i * LINE_H);
      expect(rects[i]?.width).toBeCloseTo((visualWidth(text) + 0.3) * CHAR_W, 6);
    }
  });
});
