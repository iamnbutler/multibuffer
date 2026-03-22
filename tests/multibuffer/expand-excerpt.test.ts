/**
 * expandExcerpt tests — written BEFORE implementation changes (TDD).
 *
 * Tests cover expanding an excerpt's context range by N lines before/after,
 * clamping to buffer bounds, accumulation across repeated calls, and
 * interactions with multiple excerpts.
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { createBuffer } from "../../src/buffer/buffer.ts";
import { createMultiBuffer } from "../../src/multibuffer/multibuffer.ts";
import {
  createBufferId,
  excerptRange,
  generateText,
  mbRow,
  num,
  resetCounters,
} from "../helpers.ts";

beforeEach(() => {
  resetCounters();
});

/**
 * Helper: create a buffer with `lineCount` lines and a multibuffer with one
 * excerpt covering buffer rows `startRow ..< endRow`.
 */
function setup(lineCount: number, startRow: number, endRow: number) {
  const mb = createMultiBuffer();
  const buffer = createBuffer(createBufferId(), generateText(lineCount));
  const excerptId = mb.addExcerpt(buffer, excerptRange(startRow, endRow));
  return { mb, buffer, excerptId };
}

describe("expandExcerpt", () => {
  test("expand by N lines before adds lines above the excerpt", () => {
    const { mb, excerptId } = setup(25, 5, 10);
    expect(mb.lineCount).toBe(5); // rows 5-9

    mb.expandExcerpt(excerptId, 3, 0);

    // Now covers rows 2-9 → 8 lines
    expect(mb.lineCount).toBe(8);
    const snap = mb.snapshot();
    const lines = snap.lines(mbRow(0), mbRow(8));
    // First line should be "Line 3" (0-indexed buffer row 2 → generateText's "Line 3")
    expect(lines[0]).toBe("Line 3");
    // The original first line "Line 6" should now be at index 3
    expect(lines[3]).toBe("Line 6");
  });

  test("expand by N lines after adds lines below the excerpt", () => {
    const { mb, excerptId } = setup(25, 5, 10);
    expect(mb.lineCount).toBe(5);

    mb.expandExcerpt(excerptId, 0, 3);

    // Now covers rows 5-12 → 8 lines
    expect(mb.lineCount).toBe(8);
    const snap = mb.snapshot();
    const lines = snap.lines(mbRow(0), mbRow(8));
    // Last line should be "Line 13" (buffer row 12)
    expect(lines[7]).toBe("Line 13");
  });

  test("expand both before and after simultaneously", () => {
    const { mb, excerptId } = setup(25, 5, 10);
    expect(mb.lineCount).toBe(5);

    mb.expandExcerpt(excerptId, 2, 3);

    // Now covers rows 3-12 → 10 lines
    expect(mb.lineCount).toBe(10);
    const snap = mb.snapshot();
    const lines = snap.lines(mbRow(0), mbRow(10));
    expect(lines[0]).toBe("Line 4"); // buffer row 3
    expect(lines[9]).toBe("Line 13"); // buffer row 12
  });

  test("clamps to buffer start (can't expand before row 0)", () => {
    const { mb, excerptId } = setup(25, 2, 7);
    expect(mb.lineCount).toBe(5);

    // Ask for 10 lines before, but only 2 rows available
    mb.expandExcerpt(excerptId, 10, 0);

    // Should clamp to row 0 → covers rows 0-6 → 7 lines
    expect(mb.lineCount).toBe(7);
    const snap = mb.snapshot();
    const lines = snap.lines(mbRow(0), mbRow(7));
    expect(lines[0]).toBe("Line 1"); // buffer row 0
  });

  test("clamps to buffer end (can't expand past last row)", () => {
    const { mb, excerptId } = setup(25, 20, 25);
    expect(mb.lineCount).toBe(5);

    // Ask for 10 lines after, but buffer only has 25 lines (rows 0-24)
    mb.expandExcerpt(excerptId, 0, 10);

    // Should clamp to buffer lineCount (25) → still covers rows 20-25 → 5 lines
    expect(mb.lineCount).toBe(5);
  });

  test("expanding already-full-range excerpt is no-op", () => {
    // Excerpt already covers entire buffer
    const { mb, excerptId } = setup(10, 0, 10);
    expect(mb.lineCount).toBe(10);

    mb.expandExcerpt(excerptId, 5, 5);

    // Should remain 10 lines — clamped at both ends
    expect(mb.lineCount).toBe(10);
    const snap = mb.snapshot();
    const lines = snap.lines(mbRow(0), mbRow(10));
    expect(lines[0]).toBe("Line 1");
    expect(lines[9]).toBe("Line 10");
  });

  test("updates multibuffer lineCount after expansion", () => {
    const { mb, excerptId } = setup(25, 5, 10);
    const lineCountBefore = mb.lineCount;

    mb.expandExcerpt(excerptId, 2, 2);

    expect(mb.lineCount).toBe(lineCountBefore + 4);
  });

  test("updates subsequent excerpt row offsets after expansion", () => {
    const mb = createMultiBuffer();
    const buffer = createBuffer(createBufferId(), generateText(30));
    const idA = mb.addExcerpt(buffer, excerptRange(5, 10)); // 5 lines at mb rows 0-4
    mb.addExcerpt(buffer, excerptRange(20, 25)); // 5 lines at mb rows 5-9

    // Second excerpt starts at row 5
    expect(num(mb.excerpts[1]?.startRow ?? mbRow(-1))).toBe(5);

    mb.expandExcerpt(idA, 2, 2);

    // First excerpt now covers rows 3-11 → 9 lines (mb rows 0-8)
    // Second excerpt should start at row 9
    expect(num(mb.excerpts[1]?.startRow ?? mbRow(-1))).toBe(9);
  });

  test("repeated expansion accumulates (expand 2, then expand 2 more = 4 total)", () => {
    const { mb, excerptId } = setup(25, 10, 15);
    expect(mb.lineCount).toBe(5);

    mb.expandExcerpt(excerptId, 2, 0);
    expect(mb.lineCount).toBe(7); // rows 8-14

    mb.expandExcerpt(excerptId, 2, 0);
    expect(mb.lineCount).toBe(9); // rows 6-14

    const snap = mb.snapshot();
    const lines = snap.lines(mbRow(0), mbRow(9));
    expect(lines[0]).toBe("Line 7"); // buffer row 6
  });

  test("lines from expansion are readable in snapshot", () => {
    const { mb, excerptId } = setup(25, 5, 10);

    mb.expandExcerpt(excerptId, 3, 3);

    // Now covers rows 2-12 → 11 lines
    const snap = mb.snapshot();
    const lines = snap.lines(mbRow(0), mbRow(11));
    expect(lines.length).toBe(11);

    // Verify all lines are readable and correct
    for (let i = 0; i < 11; i++) {
      expect(lines[i]).toBe(`Line ${i + 3}`); // buffer row 2+i → "Line (2+i+1)"
    }
  });
});

describe("expandExcerpt with multiple excerpts", () => {
  test("expanding one excerpt does not change another excerpt's content", () => {
    const mb = createMultiBuffer();
    const buffer = createBuffer(createBufferId(), generateText(30));
    const idA = mb.addExcerpt(buffer, excerptRange(5, 10)); // "Line 6" .. "Line 10"
    mb.addExcerpt(buffer, excerptRange(20, 25)); // "Line 21" .. "Line 25"

    // Read second excerpt's lines before expansion
    const snapBefore = mb.snapshot();
    const excerptBLines = snapBefore.lines(mbRow(5), mbRow(10));

    // Expand first excerpt
    mb.expandExcerpt(idA, 2, 2);

    // Second excerpt's content should be unchanged (just shifted)
    const snapAfter = mb.snapshot();
    const newStartB = num(mb.excerpts[1]?.startRow ?? mbRow(-1));
    const newEndB = num(mb.excerpts[1]?.endRow ?? mbRow(-1));
    const excerptBLinesAfter = snapAfter.lines(mbRow(newStartB), mbRow(newEndB));

    expect(excerptBLinesAfter).toEqual(excerptBLines);
  });

  test("expanding first excerpt shifts second excerpt's row offsets", () => {
    const mb = createMultiBuffer();
    const buffer = createBuffer(createBufferId(), generateText(30));
    const idA = mb.addExcerpt(buffer, excerptRange(0, 5)); // 5 lines, mb rows 0-4
    mb.addExcerpt(buffer, excerptRange(15, 20)); // 5 lines, mb rows 5-9

    const startBBefore = num(mb.excerpts[1]?.startRow ?? mbRow(-1));
    expect(startBBefore).toBe(5);

    // Expand first excerpt by 3 lines after
    mb.expandExcerpt(idA, 0, 3);

    // First excerpt now has 8 lines → second excerpt starts at row 8
    const startBAfter = num(mb.excerpts[1]?.startRow ?? mbRow(-1));
    expect(startBAfter).toBe(8);

    // Total line count increases by 3
    expect(mb.lineCount).toBe(13); // 8 + 5
  });
});
