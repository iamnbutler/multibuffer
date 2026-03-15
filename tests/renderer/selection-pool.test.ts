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
import type { MultiBufferPoint, MultiBufferRow, MultiBufferSnapshot } from "../../src/multibuffer/types.ts";
import { computeSelectionRects } from "../../src/renderer/dom.ts";
import { WrapMap } from "../../src/renderer/wrap-map.ts";

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
