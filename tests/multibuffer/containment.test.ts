/**
 * Containment tests — excerptAt, toBufferPoint/toMultiBufferPoint round-trips,
 * and coordinate conversion stability after edits.
 *
 * Setup: 3 excerpts from 2 buffers.
 *
 *   bufA = 20 lines ("A 1" … "A 20")
 *   bufB = 20 lines ("B 1" … "B 20")
 *
 *   excerpt 0: bufA rows  0–10  → mb rows  0–9   (10 lines)
 *   excerpt 1: bufB rows  5–15  → mb rows 10–19  (10 lines)
 *   excerpt 2: bufA rows 10–20  → mb rows 20–29  (10 lines)
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { createBuffer } from "../../src/buffer/buffer.ts";
import { createMultiBuffer } from "../../src/multibuffer/multibuffer.ts";
import type { ExcerptId } from "../../src/multibuffer/types.ts";
import {
  createBufferId,
  excerptRange,
  expectPoint,
  generateText,
  mbPoint,
  mbRow,
  num,
  point,
  resetCounters,
  str,
} from "../helpers.ts";

// Shared state rebuilt before each test.
let mb: ReturnType<typeof createMultiBuffer>;
let idA: ExcerptId;
let idB: ExcerptId;
let idC: ExcerptId;

beforeEach(() => {
  resetCounters();

  mb = createMultiBuffer();
  const bufA = createBuffer(createBufferId(), generateText(20, "A"));
  const bufB = createBuffer(createBufferId(), generateText(20, "B"));

  idA = mb.addExcerpt(bufA, excerptRange(0, 10));   // mb rows  0–9
  idB = mb.addExcerpt(bufB, excerptRange(5, 15));    // mb rows 10–19
  idC = mb.addExcerpt(bufA, excerptRange(10, 20));   // mb rows 20–29
});


describe("excerptAt", () => {
  test("returns correct excerpt for row in first excerpt", () => {
    const snap = mb.snapshot();
    const info = snap.excerptAt(mbRow(3));
    expect(info).toBeDefined();
    expect(info?.id).toEqual(idA);
  });

  test("returns correct excerpt for row in middle excerpt", () => {
    const snap = mb.snapshot();
    const info = snap.excerptAt(mbRow(14));
    expect(info).toBeDefined();
    expect(info?.id).toEqual(idB);
  });

  test("returns correct excerpt for row in last excerpt", () => {
    const snap = mb.snapshot();
    const info = snap.excerptAt(mbRow(25));
    expect(info).toBeDefined();
    expect(info?.id).toEqual(idC);
  });

  test("returns correct excerpt at first row of an excerpt", () => {
    const snap = mb.snapshot();

    // First row of excerpt 0
    expect(snap.excerptAt(mbRow(0))?.id).toEqual(idA);
    // First row of excerpt 1
    expect(snap.excerptAt(mbRow(10))?.id).toEqual(idB);
    // First row of excerpt 2
    expect(snap.excerptAt(mbRow(20))?.id).toEqual(idC);
  });

  test("returns correct excerpt at last row of an excerpt", () => {
    const snap = mb.snapshot();

    // Last row of excerpt 0 (rows 0–9 → last = 9)
    expect(snap.excerptAt(mbRow(9))?.id).toEqual(idA);
    // Last row of excerpt 1 (rows 10–19 → last = 19)
    expect(snap.excerptAt(mbRow(19))?.id).toEqual(idB);
    // Last row of excerpt 2 (rows 20–29 → last = 29)
    expect(snap.excerptAt(mbRow(29))?.id).toEqual(idC);
  });

  test("returns undefined for row beyond all excerpts", () => {
    const snap = mb.snapshot();
    // Total lines = 30, so row 30 is out of bounds.
    expect(snap.excerptAt(mbRow(30))).toBeUndefined();
    expect(snap.excerptAt(mbRow(100))).toBeUndefined();
  });
});


describe("toBufferPoint / toMultiBufferPoint round-trip", () => {
  test("round-trips correctly for point in first excerpt", () => {
    const snap = mb.snapshot();
    const original = mbPoint(5, 2);
    const bufResult = snap.toBufferPoint(original);
    expect(bufResult).toBeDefined();
    if (!bufResult) return;

    const mbResult = snap.toMultiBufferPoint(bufResult.excerpt.id, bufResult.point);
    expect(mbResult).toBeDefined();
    if (!mbResult) return;
    expectPoint(mbResult, 5, 2);
  });

  test("round-trips correctly for point in second excerpt", () => {
    const snap = mb.snapshot();
    const original = mbPoint(13, 0);
    const bufResult = snap.toBufferPoint(original);
    expect(bufResult).toBeDefined();
    if (!bufResult) return;

    const mbResult = snap.toMultiBufferPoint(bufResult.excerpt.id, bufResult.point);
    expect(mbResult).toBeDefined();
    if (!mbResult) return;
    expectPoint(mbResult, 13, 0);
  });

  test("toBufferPoint returns correct buffer ID and buffer-local coordinates", () => {
    const snap = mb.snapshot();

    // mb row 3 → excerpt 0 (bufA rows 0–10), so buffer row = 3
    const res0 = snap.toBufferPoint(mbPoint(3, 1));
    expect(res0).toBeDefined();
    if (!res0) return;
    expect(str(res0.excerpt.bufferId)).toBe(str(mb.excerpts[0]?.bufferId ?? ""));
    expectPoint(res0.point, 3, 1);

    // mb row 12 → excerpt 1 (bufB rows 5–15), offset = 2, so buffer row = 7
    const res1 = snap.toBufferPoint(mbPoint(12, 0));
    expect(res1).toBeDefined();
    if (!res1) return;
    expect(str(res1.excerpt.bufferId)).toBe(str(mb.excerpts[1]?.bufferId ?? ""));
    expectPoint(res1.point, 7, 0);

    // mb row 22 → excerpt 2 (bufA rows 10–20), offset = 2, so buffer row = 12
    const res2 = snap.toBufferPoint(mbPoint(22, 0));
    expect(res2).toBeDefined();
    if (!res2) return;
    expect(str(res2.excerpt.bufferId)).toBe(str(mb.excerpts[2]?.bufferId ?? ""));
    expectPoint(res2.point, 12, 0);
  });

  test("toMultiBufferPoint returns correct multibuffer row accounting for preceding excerpts", () => {
    const snap = mb.snapshot();

    // Excerpt 1 (idB) covers bufB rows 5–15, starting at mb row 10.
    // Buffer row 8 → offset 3 → mb row 13.
    const result = snap.toMultiBufferPoint(idB, point(8, 4));
    expect(result).toBeDefined();
    if (!result) return;
    expectPoint(result, 13, 4);

    // Excerpt 2 (idC) covers bufA rows 10–20, starting at mb row 20.
    // Buffer row 15 → offset 5 → mb row 25.
    const result2 = snap.toMultiBufferPoint(idC, point(15, 0));
    expect(result2).toBeDefined();
    if (!result2) return;
    expectPoint(result2, 25, 0);
  });

  test("toBufferPoint at start of excerpt returns start of excerpt's buffer range", () => {
    const snap = mb.snapshot();

    // Excerpt 1 starts at mb row 10, buffer range starts at row 5.
    const res = snap.toBufferPoint(mbPoint(10, 0));
    expect(res).toBeDefined();
    if (!res) return;
    expectPoint(res.point, 5, 0);
    expect(res.excerpt.id).toEqual(idB);
  });

  test("toBufferPoint at end of excerpt returns end of excerpt's buffer range", () => {
    const snap = mb.snapshot();

    // Excerpt 0: mb rows 0–9 → bufA rows 0–10. Last row is mb row 9 → buffer row 9.
    const res = snap.toBufferPoint(mbPoint(9, 0));
    expect(res).toBeDefined();
    if (!res) return;
    expectPoint(res.point, 9, 0);
    expect(res.excerpt.id).toEqual(idA);
  });
});


describe("Coordinate conversion after edits", () => {
  test("toBufferPoint still correct after editing text in an excerpt", () => {
    // Edit inside excerpt 0 (mb row 2): insert some text on that line.
    // This is a same-line edit (no line count change), so row mapping is stable.
    mb.edit(mbPoint(2, 0), mbPoint(2, 0), "INSERTED ");

    const snap = mb.snapshot();
    // mb row 2 should still map to buffer row 2 in the first excerpt.
    const res = snap.toBufferPoint(mbPoint(2, 0));
    expect(res).toBeDefined();
    if (!res) return;
    expectPoint(res.point, 2, 0);
    expect(res.excerpt.id).toEqual(idA);

    // Excerpt 1 should be unaffected: mb row 12 → buffer row 7.
    const res1 = snap.toBufferPoint(mbPoint(12, 0));
    expect(res1).toBeDefined();
    if (!res1) return;
    expectPoint(res1.point, 7, 0);
  });

  test("toMultiBufferPoint still correct after inserting lines (which shifts rows)", () => {
    // Insert a newline inside excerpt 0, which adds a line.
    // Before: excerpt 0 = 10 lines (mb rows 0–9).
    // After: excerpt 0 grows by 1 line to 11 lines (mb rows 0–10).
    // Excerpt 1 should shift: mb rows 11–20.
    // Excerpt 2 should shift: mb rows 21–30.
    mb.edit(mbPoint(2, 0), mbPoint(2, 0), "new line\n");

    const snap = mb.snapshot();

    // Excerpt 1 (idB): bufB row 8 → offset 3 in excerpt → mb row = new excerpt1 start + 3.
    // Excerpt 1 starts at mb row 11 after the inserted line.
    const res = snap.toMultiBufferPoint(idB, point(8, 0));
    expect(res).toBeDefined();
    if (!res) return;
    expect(num(res.row)).toBe(14);

    // Excerpt 2 (idC): bufA rows [10,20) shifted to [11,21) after the insert.
    // bufA row 15 → offset 4 in excerpt (15 - 11) → mb row = 21 + 4 = 25.
    const res2 = snap.toMultiBufferPoint(idC, point(15, 0));
    expect(res2).toBeDefined();
    if (!res2) return;
    expect(num(res2.row)).toBe(25);
  });

  test("conversions correct after expanding an excerpt", () => {
    // Expand excerpt 1 (idB) by 2 lines before and 3 lines after.
    // Before: bufB rows 5–15 (10 lines), mb rows 10–19.
    // After: bufB rows 3–18 (15 lines), mb rows 10–24.
    // Excerpt 2 should shift to mb rows 25–34.
    mb.expandExcerpt(idB, 2, 3);

    const snap = mb.snapshot();

    // Verify excerpt 1 now covers more buffer rows.
    const info1 = snap.excerptAt(mbRow(10));
    expect(info1).toBeDefined();
    expect(info1?.id).toEqual(idB);
    // The expanded excerpt should now have 15 lines.
    if (info1) {
      expect(num(info1.endRow) - num(info1.startRow)).toBe(15);
    }

    // mb row 10 (start of expanded excerpt) → buffer row 3 (was 5, now 3).
    const res0 = snap.toBufferPoint(mbPoint(10, 0));
    expect(res0).toBeDefined();
    if (!res0) return;
    expectPoint(res0.point, 3, 0);

    // Excerpt 2 now starts at mb row 25.
    const res2 = snap.toBufferPoint(mbPoint(25, 0));
    expect(res2).toBeDefined();
    if (!res2) return;
    expect(res2.excerpt.id).toEqual(idC);
    // mb row 25 → excerpt 2, offset 0 → buffer row 10.
    expectPoint(res2.point, 10, 0);
  });
});
