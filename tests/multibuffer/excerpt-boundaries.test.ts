/**
 * Excerpt boundary and clipPoint tests.
 *
 * Validates that excerptBoundaries() returns correct boundaries between
 * excerpts in the multibuffer view, and that clipPoint() correctly clamps
 * positions with respect to excerpt content and bias.
 *
 * Inspired by Zed's test_excerpt_boundaries_and_clipping.
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { createBuffer } from "../../src/buffer/buffer.ts";
import { createMultiBuffer } from "../../src/multibuffer/multibuffer.ts";
import {
  Bias,
  createBufferId,
  excerptRange,
  expectPoint,
  generateText,
  mbPoint,
  mbRow,
  num,
  resetCounters,
} from "../helpers.ts";

beforeEach(() => {
  resetCounters();
});


describe("excerptBoundaries", () => {
  test("returns empty array for single excerpt (no internal boundaries)", () => {
    const mb = createMultiBuffer();
    const buf = createBuffer(createBufferId(), generateText(10));
    mb.addExcerpt(buf, excerptRange(0, 10));

    const snap = mb.snapshot();
    // A single excerpt has a boundary at row 0 (the start of the first excerpt),
    // but there are no *internal* boundaries between excerpts.
    // Query a range that excludes the very start to see no boundaries.
    const boundaries = snap.excerptBoundaries(mbRow(1), mbRow(10));
    expect(boundaries).toEqual([]);
  });

  test("returns boundary between two excerpts", () => {
    const mb = createMultiBuffer();
    const buf = createBuffer(createBufferId(), generateText(20));
    mb.addExcerpt(buf, excerptRange(0, 10));  // rows 0-9
    mb.addExcerpt(buf, excerptRange(10, 20)); // rows 10-19

    const snap = mb.snapshot();
    const boundaries = snap.excerptBoundaries(mbRow(0), mbRow(20));

    // Should have boundary at row 0 (first excerpt start) and row 10 (second excerpt start)
    expect(boundaries.length).toBe(2);
    const b0 = boundaries[0];
    const b1 = boundaries[1];
    expect(b0).toBeDefined();
    expect(b1).toBeDefined();
    if (!b0 || !b1) return;
    expect(num(b0.row)).toBe(0);
    expect(num(b1.row)).toBe(10);
  });

  test("boundary includes previous and next excerpt info", () => {
    const mb = createMultiBuffer();
    const buf1 = createBuffer(createBufferId(), "AAA\nBBB\nCCC");
    const buf2 = createBuffer(createBufferId(), "DDD\nEEE\nFFF");
    const idA = mb.addExcerpt(buf1, excerptRange(0, 3)); // rows 0-2
    const idB = mb.addExcerpt(buf2, excerptRange(0, 3)); // rows 3-5

    const snap = mb.snapshot();
    const boundaries = snap.excerptBoundaries(mbRow(0), mbRow(6));

    expect(boundaries.length).toBe(2);

    // First boundary: start of first excerpt, no prev
    const first = boundaries[0];
    expect(first).toBeDefined();
    if (!first) return;
    expect(first.prev).toBeUndefined();
    expect(first.next.id).toEqual(idA);

    // Second boundary: start of second excerpt, prev is first excerpt
    const second = boundaries[1];
    expect(second).toBeDefined();
    if (!second) return;
    expect(second.prev).toBeDefined();
    expect(second.prev?.id).toEqual(idA);
    expect(second.next.id).toEqual(idB);
  });

  test("returns only boundaries within requested row range", () => {
    const mb = createMultiBuffer();
    const buf = createBuffer(createBufferId(), generateText(30));
    mb.addExcerpt(buf, excerptRange(0, 10));  // rows 0-9
    mb.addExcerpt(buf, excerptRange(10, 20)); // rows 10-19
    mb.addExcerpt(buf, excerptRange(20, 30)); // rows 20-29

    const snap = mb.snapshot();

    // Query only the middle range — should only see boundary at row 10
    const boundaries = snap.excerptBoundaries(mbRow(5), mbRow(15));
    expect(boundaries.length).toBe(1);
    const b0 = boundaries[0];
    expect(b0).toBeDefined();
    if (!b0) return;
    expect(num(b0.row)).toBe(10);
  });

  test("returns all boundaries when range covers entire multibuffer", () => {
    const mb = createMultiBuffer();
    const buf = createBuffer(createBufferId(), generateText(30));
    mb.addExcerpt(buf, excerptRange(0, 10));  // rows 0-9
    mb.addExcerpt(buf, excerptRange(10, 20)); // rows 10-19
    mb.addExcerpt(buf, excerptRange(20, 30)); // rows 20-29

    const snap = mb.snapshot();
    const boundaries = snap.excerptBoundaries(mbRow(0), mbRow(30));

    expect(boundaries.length).toBe(3);
    const [c0, c1, c2] = boundaries;
    expect(c0).toBeDefined();
    expect(c1).toBeDefined();
    expect(c2).toBeDefined();
    if (!c0 || !c1 || !c2) return;
    expect(num(c0.row)).toBe(0);
    expect(num(c1.row)).toBe(10);
    expect(num(c2.row)).toBe(20);
  });

  test("after removing an excerpt, boundaries update", () => {
    const mb = createMultiBuffer();
    const buf = createBuffer(createBufferId(), generateText(30));
    mb.addExcerpt(buf, excerptRange(0, 10));  // rows 0-9
    const idB = mb.addExcerpt(buf, excerptRange(10, 20)); // rows 10-19
    mb.addExcerpt(buf, excerptRange(20, 30)); // rows 20-29

    // Before removal: 3 boundaries
    let snap = mb.snapshot();
    expect(snap.excerptBoundaries(mbRow(0), mbRow(30)).length).toBe(3);

    // Remove middle excerpt
    mb.removeExcerpt(idB);

    // After removal: 2 boundaries, third excerpt now starts at row 10
    snap = mb.snapshot();
    const boundaries = snap.excerptBoundaries(mbRow(0), mbRow(20));
    expect(boundaries.length).toBe(2);
    const [d0, d1] = boundaries;
    expect(d0).toBeDefined();
    expect(d1).toBeDefined();
    if (!d0 || !d1) return;
    expect(num(d0.row)).toBe(0);
    expect(num(d1.row)).toBe(10);
  });
});


describe("clipPoint", () => {
  test("point within excerpt is unchanged", () => {
    const mb = createMultiBuffer();
    const buf = createBuffer(createBufferId(), "Hello\nWorld\nFoo");
    mb.addExcerpt(buf, excerptRange(0, 3));

    const snap = mb.snapshot();
    const clipped = snap.clipPoint(mbPoint(1, 3), Bias.Right);
    expectPoint(clipped, 1, 3);
  });

  test("point beyond last column clamps to line end", () => {
    const mb = createMultiBuffer();
    const buf = createBuffer(createBufferId(), "Hello\nWorld");
    mb.addExcerpt(buf, excerptRange(0, 2));

    const snap = mb.snapshot();
    // "Hello" is 5 chars, column 100 should clamp to 5
    const clipped = snap.clipPoint(mbPoint(0, 100), Bias.Right);
    expectPoint(clipped, 0, 5);
  });

  test("point beyond last row clamps to last row", () => {
    const mb = createMultiBuffer();
    const buf = createBuffer(createBufferId(), "Hello\nWorld");
    mb.addExcerpt(buf, excerptRange(0, 2));

    const snap = mb.snapshot();
    const clipped = snap.clipPoint(mbPoint(99, 0), Bias.Right);
    // Last row is 1 ("World", 5 chars), column 0 is valid
    expectPoint(clipped, 1, 5);
  });

  test("with Bias.Left at boundary, clamps toward earlier position", () => {
    const mb = createMultiBuffer();
    const buf = createBuffer(createBufferId(), "short\nlonger line\nhi");
    mb.addExcerpt(buf, excerptRange(0, 3));

    const snap = mb.snapshot();
    // Column 50 on "short" (5 chars) should clamp to 5 regardless of bias
    const clipped = snap.clipPoint(mbPoint(0, 50), Bias.Left);
    expectPoint(clipped, 0, 5);
  });

  test("with Bias.Right at boundary, clamps toward later position", () => {
    const mb = createMultiBuffer();
    const buf = createBuffer(createBufferId(), "short\nlonger line\nhi");
    mb.addExcerpt(buf, excerptRange(0, 3));

    const snap = mb.snapshot();
    // Column 50 on "short" (5 chars) should clamp to 5 regardless of bias
    const clipped = snap.clipPoint(mbPoint(0, 50), Bias.Right);
    expectPoint(clipped, 0, 5);
  });

  test("clip on empty multibuffer returns 0,0", () => {
    const mb = createMultiBuffer();

    const snap = mb.snapshot();
    const clipped = snap.clipPoint(mbPoint(5, 10), Bias.Right);
    expectPoint(clipped, 0, 0);
  });

  test("clipPoint on trailing newline row clamps column to 0", () => {
    const mb = createMultiBuffer();
    const buf = createBuffer(createBufferId(), "Hello\nWorld");
    mb.addExcerpt(buf, excerptRange(0, 2), { hasTrailingNewline: true });

    const snap = mb.snapshot();
    // lineCount is 3: row 0 "Hello", row 1 "World", row 2 trailing newline (empty)
    expect(snap.lineCount).toBe(3);
    // Trailing newline row is empty — large column should clamp to 0
    const clipped = snap.clipPoint(mbPoint(2, 100), Bias.Right);
    expectPoint(clipped, 2, 0);
  });

  test("clipPoint past end with trailing newline excerpt returns trailing row column 0", () => {
    const mb = createMultiBuffer();
    const buf = createBuffer(createBufferId(), "Hello\nWorld");
    mb.addExcerpt(buf, excerptRange(0, 2), { hasTrailingNewline: true });

    const snap = mb.snapshot();
    // Row 99 is past end; last row (row 2) is the trailing newline — column 0
    const clipped = snap.clipPoint(mbPoint(99, 10), Bias.Right);
    expectPoint(clipped, 2, 0);
  });
});


describe("Excerpt boundary consistency after edits", () => {
  test("editing first excerpt does not corrupt second excerpt boundary", () => {
    const mb = createMultiBuffer();
    const buf = createBuffer(createBufferId(), "AAA\nBBB\nCCC\nDDD\nEEE\nFFF");
    mb.addExcerpt(buf, excerptRange(0, 3));  // rows 0-2: AAA, BBB, CCC
    mb.addExcerpt(buf, excerptRange(3, 6));  // rows 3-5: DDD, EEE, FFF

    // Edit inside the first excerpt: insert text on row 0
    mb.edit(mbPoint(0, 3), mbPoint(0, 3), "XYZ");

    const snap = mb.snapshot();
    // Second excerpt boundary should still be intact
    const boundaries = snap.excerptBoundaries(mbRow(0), mbRow(6));
    expect(boundaries.length).toBe(2);

    // Verify the second excerpt content is uncorrupted
    const secondBoundary = boundaries[1];
    expect(secondBoundary).toBeDefined();
    if (!secondBoundary) return;
    expect(secondBoundary.next).toBeDefined();
    expect(num(secondBoundary.next.startRow)).toBe(3);
  });

  test("adding excerpt updates boundary list", () => {
    const mb = createMultiBuffer();
    const buf = createBuffer(createBufferId(), generateText(30));
    mb.addExcerpt(buf, excerptRange(0, 10));

    let snap = mb.snapshot();
    let boundaries = snap.excerptBoundaries(mbRow(0), mbRow(10));
    expect(boundaries.length).toBe(1);

    // Add a second excerpt
    mb.addExcerpt(buf, excerptRange(10, 20));

    snap = mb.snapshot();
    boundaries = snap.excerptBoundaries(mbRow(0), mbRow(20));
    expect(boundaries.length).toBe(2);
    const bAdd = boundaries[1];
    expect(bAdd).toBeDefined();
    if (!bAdd) return;
    expect(num(bAdd.row)).toBe(10);
  });

  test("removing excerpt updates boundary list", () => {
    const mb = createMultiBuffer();
    const buf = createBuffer(createBufferId(), generateText(30));
    mb.addExcerpt(buf, excerptRange(0, 10));
    const idB = mb.addExcerpt(buf, excerptRange(10, 20));
    mb.addExcerpt(buf, excerptRange(20, 30));

    let snap = mb.snapshot();
    expect(snap.excerptBoundaries(mbRow(0), mbRow(30)).length).toBe(3);

    mb.removeExcerpt(idB);

    snap = mb.snapshot();
    const boundaries = snap.excerptBoundaries(mbRow(0), mbRow(20));
    expect(boundaries.length).toBe(2);

    // After removal, the third excerpt's prev should now be the first excerpt
    const secondBoundary = boundaries[1];
    expect(secondBoundary).toBeDefined();
    if (!secondBoundary) return;
    expect(secondBoundary.prev).toBeDefined();
    expect(num(secondBoundary.row)).toBe(10);
  });
});
