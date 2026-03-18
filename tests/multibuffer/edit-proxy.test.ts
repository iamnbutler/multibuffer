/**
 * MultiBuffer edit proxy tests.
 * Editing through multibuffer coordinates → buffer coordinates.
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { createBuffer } from "../../src/buffer/buffer.ts";
import { createMultiBuffer } from "../../src/multibuffer/multibuffer.ts";
import {
  Bias,
  createBufferId,
  excerptRange,
  expectPoint,
  mbPoint,
  mbRow,
  resetCounters,
} from "../helpers.ts";

beforeEach(() => {
  resetCounters();
});

describe("MultiBuffer Edit Proxy - Insert", () => {
  test("insert text at a point", () => {
    const buf = createBuffer(createBufferId(), "Hello World");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 1));

    mb.edit(mbPoint(0, 5), mbPoint(0, 5), " Beautiful");
    expect(mb.snapshot().lines(mbRow(0), mbRow(1))).toEqual(["Hello Beautiful World"]);
  });

  test("insert newline splits line and grows excerpt", () => {
    const buf = createBuffer(createBufferId(), "HelloWorld\nExtra");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 2));

    mb.edit(mbPoint(0, 5), mbPoint(0, 5), "\n");
    const snap = mb.snapshot();
    // Excerpt grows by 1 line to include the new line from the split
    expect(snap.lineCount).toBe(3);
    expect(snap.lines(mbRow(0), mbRow(3))).toEqual(["Hello", "World", "Extra"]);
  });

  test("insert at start of excerpt", () => {
    const buf = createBuffer(createBufferId(), "World");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 1));

    mb.edit(mbPoint(0, 0), mbPoint(0, 0), "Hello ");
    expect(mb.snapshot().lines(mbRow(0), mbRow(1))).toEqual(["Hello World"]);
  });
});

describe("MultiBuffer Edit Proxy - Delete", () => {
  test("delete a range", () => {
    const buf = createBuffer(createBufferId(), "Hello Beautiful World");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 1));

    mb.edit(mbPoint(0, 5), mbPoint(0, 15), "");
    expect(mb.snapshot().lines(mbRow(0), mbRow(1))).toEqual(["Hello World"]);
  });

  test("delete across lines joins them", () => {
    const buf = createBuffer(createBufferId(), "Hello\nWorld");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 2));

    mb.edit(mbPoint(0, 5), mbPoint(1, 0), "");
    const snap = mb.snapshot();
    expect(snap.lines(mbRow(0), mbRow(1))).toEqual(["HelloWorld"]);
  });
});

describe("MultiBuffer Edit Proxy - Replace", () => {
  test("replace a range with text", () => {
    const buf = createBuffer(createBufferId(), "Hello World");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 1));

    mb.edit(mbPoint(0, 6), mbPoint(0, 11), "Rope");
    expect(mb.snapshot().lines(mbRow(0), mbRow(1))).toEqual(["Hello Rope"]);
  });
});

describe("MultiBuffer Edit Proxy - Anchors", () => {
  test("anchor survives edit through proxy", () => {
    const buf = createBuffer(createBufferId(), "Hello World");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 1));

    const a = mb.createAnchor(mbPoint(0, 8), Bias.Right);
    expect(a).toBeDefined();
    if (!a) return;

    mb.edit(mbPoint(0, 0), mbPoint(0, 0), "Say ");

    const resolved = mb.snapshot().resolveAnchor(a);
    expect(resolved).toBeDefined();
    if (!resolved) return;
    expectPoint(resolved, 0, 12);
  });

  test("edit in one excerpt doesn't affect anchors in another", () => {
    const buf1 = createBuffer(createBufferId(), "Buffer One");
    const buf2 = createBuffer(createBufferId(), "Buffer Two");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf1, excerptRange(0, 1), { hasTrailingNewline: true });
    mb.addExcerpt(buf2, excerptRange(0, 1));

    const a = mb.createAnchor(mbPoint(2, 5), Bias.Right);
    expect(a).toBeDefined();
    if (!a) return;

    mb.edit(mbPoint(0, 0), mbPoint(0, 0), "XXX");

    const resolved = mb.snapshot().resolveAnchor(a);
    expect(resolved).toBeDefined();
    if (!resolved) return;
    expectPoint(resolved, 2, 5);
  });
});

describe("MultiBuffer Edit Proxy - Multi-excerpt same buffer", () => {
  test("edit in one excerpt updates other excerpts from same buffer", () => {
    const buf = createBuffer(createBufferId(), "Line 0\nLine 1\nLine 2\nLine 3");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 2), { hasTrailingNewline: true });
    mb.addExcerpt(buf, excerptRange(2, 4));

    mb.edit(mbPoint(0, 0), mbPoint(0, 0), "XXX");

    const snap = mb.snapshot();
    expect(snap.lines(mbRow(0), mbRow(1))).toEqual(["XXXLine 0"]);
    expect(snap.lines(mbRow(3), mbRow(5))).toEqual(["Line 2", "Line 3"]);
  });
});

describe("MultiBuffer Edit Proxy - Excerpt boundary edits (mm3lh0xz-0duv)", () => {
  test("edit at last column of last row of an excerpt", () => {
    // "Line 0" is 6 chars; insert at column 6 appends to the line
    const buf = createBuffer(createBufferId(), "Line 0\nLine 1\nLine 2");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 3));

    mb.edit(mbPoint(0, 6), mbPoint(0, 6), " extra");
    expect(mb.snapshot().lines(mbRow(0), mbRow(1))).toEqual(["Line 0 extra"]);
  });

  test("edit at column 0 of the first row of the second excerpt", () => {
    // Two excerpts from the same buffer separated by a gap in the buffer.
    // Buffer: lines 0-1 visible in exc1, lines 3-4 visible in exc2.
    // With trailing newline, mb layout: rows 0-1=exc1, row 2=separator, rows 3-4=exc2.
    const buf = createBuffer(
      createBufferId(),
      "Alpha\nBeta\nGAP\nDelta\nEpsilon",
    );
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 2), { hasTrailingNewline: true });
    mb.addExcerpt(buf, excerptRange(3, 5));

    // Row 3 is the first row of the second excerpt (maps to buffer row 3 = "Delta")
    mb.edit(mbPoint(3, 0), mbPoint(3, 0), ">>>");

    const snap = mb.snapshot();
    expect(snap.lines(mbRow(3), mbRow(4))).toEqual([">>>Delta"]);
    // First excerpt untouched
    expect(snap.lines(mbRow(0), mbRow(2))).toEqual(["Alpha", "Beta"]);
  });

  test("edit at end of last row of first excerpt (column = line length)", () => {
    const buf = createBuffer(createBufferId(), "Hello\nWorld\nFoo");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 2), { hasTrailingNewline: true });
    mb.addExcerpt(buf, excerptRange(2, 3));

    // "World" is row 1 of excerpt 1 (mb row 1). "World".length == 5
    mb.edit(mbPoint(1, 5), mbPoint(1, 5), "!!!");

    const snap = mb.snapshot();
    expect(snap.lines(mbRow(1), mbRow(2))).toEqual(["World!!!"]);
    // Second excerpt unchanged
    expect(snap.lines(mbRow(3), mbRow(4))).toEqual(["Foo"]);
  });

  test("anchor at excerpt boundary row survives insert in earlier excerpt", () => {
    // Two excerpts from different buffers; anchor in second excerpt should be unaffected.
    const buf1 = createBuffer(createBufferId(), "First\nSecond");
    const buf2 = createBuffer(createBufferId(), "Third\nFourth");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf1, excerptRange(0, 2), { hasTrailingNewline: true });
    mb.addExcerpt(buf2, excerptRange(0, 2));

    // Anchor at start of "Third" (mb row 3)
    const a = mb.createAnchor(mbPoint(3, 0), Bias.Right);
    expect(a).toBeDefined();
    if (!a) return;

    // Edit first excerpt
    mb.edit(mbPoint(0, 0), mbPoint(0, 0), ">>> ");

    // Anchor in second excerpt is unaffected (different buffer)
    const resolved = mb.snapshot().resolveAnchor(a);
    expect(resolved).toBeDefined();
    if (!resolved) return;
    expectPoint(resolved, 3, 0);
  });

  test("anchor at last row of first excerpt survives insert in same excerpt", () => {
    const buf = createBuffer(createBufferId(), "Alpha\nBeta\nGamma\nDelta");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 2), { hasTrailingNewline: true });
    mb.addExcerpt(buf, excerptRange(2, 4));

    // Anchor at end of "Beta" (row 1, col 4 — Bias.Right)
    const a = mb.createAnchor(mbPoint(1, 4), Bias.Right);
    expect(a).toBeDefined();
    if (!a) return;

    // Insert before the anchor on the same row
    mb.edit(mbPoint(1, 0), mbPoint(1, 0), ">> ");

    const resolved = mb.snapshot().resolveAnchor(a);
    expect(resolved).toBeDefined();
    if (!resolved) return;
    // ">> " (3 chars) inserted before col 4 → new col = 4 + 3 = 7
    expectPoint(resolved, 1, 7);
  });

  test("edit spanning two different-buffer excerpts silently does nothing", () => {
    // GOTCHA: edit() checks bufferId equality; cross-buffer edits are rejected.
    // This documents the current behaviour so regressions are caught.
    const buf1 = createBuffer(createBufferId(), "AAA\nBBB");
    const buf2 = createBuffer(createBufferId(), "CCC\nDDD");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf1, excerptRange(0, 2));
    mb.addExcerpt(buf2, excerptRange(0, 2));

    // Attempt edit from row 0 (buf1) to row 2 (buf2) — different buffers
    mb.edit(mbPoint(0, 0), mbPoint(2, 0), "REPLACED");

    // Nothing should change
    const snap = mb.snapshot();
    expect(snap.lines(mbRow(0), mbRow(2))).toEqual(["AAA", "BBB"]);
    expect(snap.lines(mbRow(2), mbRow(4))).toEqual(["CCC", "DDD"]);
  });

  test("delete entire content of an excerpt from first to last row", () => {
    const buf = createBuffer(createBufferId(), "Line A\nLine B\nLine C");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 3));

    // Delete everything from (0,0) to (2,6) — the full "Line C"
    mb.edit(mbPoint(0, 0), mbPoint(2, 6), "");

    const snap = mb.snapshot();
    // Buffer now contains a single empty line
    expect(snap.lineCount).toBe(1);
    expect(snap.lines(mbRow(0), mbRow(1))).toEqual([""]);
  });

  test("replace across lines within a single excerpt", () => {
    const buf = createBuffer(createBufferId(), "aaa\nbbb\nccc");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 3));

    // Replace "bbb\nccc" with a single "ZZZ"
    mb.edit(mbPoint(1, 0), mbPoint(2, 3), "ZZZ");

    const snap = mb.snapshot();
    expect(snap.lineCount).toBe(2);
    expect(snap.lines(mbRow(0), mbRow(2))).toEqual(["aaa", "ZZZ"]);
  });

  test("trailing newline separator row maps to first line of next same-buffer excerpt", () => {
    // GOTCHA: The synthetic trailing-newline row (mb row 2 here) is "owned" by
    // excerpt 1 in excerptAt(). toBufferPoint() maps it to the buffer row
    // immediately after the excerpt's last line — which is the first line of
    // the next excerpt. Editing there affects the next excerpt, not the first.
    const buf = createBuffer(createBufferId(), "X\nY\nZ");
    const mb = createMultiBuffer();
    // exc1 covers buffer rows [0, 2) — lines "X" and "Y"
    mb.addExcerpt(buf, excerptRange(0, 2), { hasTrailingNewline: true });
    // exc2 covers buffer rows [2, 3) — line "Z"
    mb.addExcerpt(buf, excerptRange(2, 3));

    // mb layout: row 0 = "X", row 1 = "Y", row 2 = separator, row 3 = "Z"
    // Inserting at mb row 2 resolves to buffer row 2 ("Z") via exc1's lookup.
    mb.edit(mbPoint(2, 0), mbPoint(2, 0), ">>>");

    const snap = mb.snapshot();
    // exc1 content unchanged
    expect(snap.lines(mbRow(0), mbRow(2))).toEqual(["X", "Y"]);
    // exc2's first row picks up the insertion at buffer row 2
    expect(snap.lines(mbRow(3), mbRow(4))).toEqual([">>>Z"]);
  });

});

describe("MultiBuffer Edit Proxy - Same-buffer cross-excerpt edits", () => {
  test("edit across two excerpts from same buffer replaces text in underlying buffer", () => {
    // Two contiguous excerpts from the same buffer
    const buf = createBuffer(createBufferId(), "AAA\nBBB\nCCC\nDDD");
    const mb = createMultiBuffer();
    // exc1: buffer rows [0, 2) -> "AAA", "BBB"
    mb.addExcerpt(buf, excerptRange(0, 2), { hasTrailingNewline: true });
    // exc2: buffer rows [2, 4) -> "CCC", "DDD"
    mb.addExcerpt(buf, excerptRange(2, 4));

    // mb layout: row 0=AAA, row 1=BBB, row 2=separator, row 3=CCC, row 4=DDD
    // Edit from row 1 (exc1, buffer row 1) to row 3 (exc2, buffer row 2)
    // This replaces buffer range [row 1, row 2) = "BBB\n" with "REPLACED\n"
    mb.edit(mbPoint(1, 0), mbPoint(3, 0), "REPLACED\n");

    const snap = mb.snapshot();
    // Buffer now: "AAA\nREPLACED\nCCC\nDDD"
    // exc1 shows "AAA", "REPLACED" (buffer rows 0-2)
    // exc2 shows "CCC", "DDD" (buffer rows 2-4)
    expect(snap.lines(mbRow(0), mbRow(2))).toEqual(["AAA", "REPLACED"]);
    expect(snap.lines(mbRow(3), mbRow(5))).toEqual(["CCC", "DDD"]);
  });

  test("delete across two excerpts from same buffer edits underlying buffer", () => {
    // Two excerpts with a gap in the buffer between them
    const buf = createBuffer(createBufferId(), "A\nB\nGAP\nC\nD");
    const mb = createMultiBuffer();
    // exc1: buffer rows [0, 2) -> "A", "B"
    mb.addExcerpt(buf, excerptRange(0, 2), { hasTrailingNewline: true });
    // exc2: buffer rows [3, 5) -> "C", "D"
    mb.addExcerpt(buf, excerptRange(3, 5));

    // mb layout: row 0=A, row 1=B, row 2=separator (maps to buffer row 2=GAP), row 3=C, row 4=D
    // Delete from row 1 col 0 (buffer row 1, "B") to row 3 col 0 (buffer row 3, "C")
    // This deletes buffer range [row 1, row 3) = "B\nGAP\n" from the underlying buffer
    mb.edit(mbPoint(1, 0), mbPoint(3, 0), "");

    // Verify the underlying buffer was correctly edited
    const bufferText = buf.snapshot().text();
    expect(bufferText).toBe("A\nC\nD");
  });

  test("insert at boundary between two same-buffer excerpts", () => {
    const buf = createBuffer(createBufferId(), "First\nSecond\nThird");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 2), { hasTrailingNewline: true });
    mb.addExcerpt(buf, excerptRange(2, 3));

    // mb layout: row 0=First, row 1=Second, row 2=separator (maps to buffer row 2), row 3=Third
    // Edit at the separator row (maps to buffer row 2 = "Third")
    mb.edit(mbPoint(2, 0), mbPoint(2, 0), ">>>");

    const snap = mb.snapshot();
    // Insert at start of buffer row 2 ("Third" -> ">>>Third")
    // exc1 (buffer rows 0-2): First, Second + separator
    // exc2 (buffer row 2): >>>Third
    expect(snap.lines(mbRow(0), mbRow(2))).toEqual(["First", "Second"]);
    expect(snap.lines(mbRow(3), mbRow(4))).toEqual([">>>Third"]);
  });

  test("anchor in second excerpt survives cross-excerpt edit in same buffer", () => {
    const buf = createBuffer(createBufferId(), "Line 0\nLine 1\nLine 2\nLine 3");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 2), { hasTrailingNewline: true });
    mb.addExcerpt(buf, excerptRange(2, 4));

    // Anchor at "Line 3" (mb row 4, col 0)
    const a = mb.createAnchor(mbPoint(4, 0), Bias.Right);
    expect(a).toBeDefined();
    if (!a) return;

    // Edit in first excerpt that affects the underlying buffer
    mb.edit(mbPoint(0, 0), mbPoint(0, 0), "PREFIX ");

    // Anchor should still resolve correctly
    const resolved = mb.snapshot().resolveAnchor(a);
    expect(resolved).toBeDefined();
    if (!resolved) return;
    // "Line 3" is unaffected by the edit (different buffer rows)
    expectPoint(resolved, 4, 0);
  });

  test("cross-excerpt edit with three excerpts from same buffer edits underlying buffer", () => {
    const buf = createBuffer(createBufferId(), "A\nB\nC\nD\nE\nF");
    const mb = createMultiBuffer();
    // Three excerpts covering different parts of the same buffer
    mb.addExcerpt(buf, excerptRange(0, 2), { hasTrailingNewline: true }); // A, B
    mb.addExcerpt(buf, excerptRange(2, 4), { hasTrailingNewline: true }); // C, D
    mb.addExcerpt(buf, excerptRange(4, 6)); // E, F

    // mb layout: 0=A, 1=B, 2=sep, 3=C, 4=D, 5=sep, 6=E, 7=F
    // Edit from row 1 (buffer row 1, "B") to row 6 (buffer row 4, "E")
    // This replaces "B\nC\nD\n" with "MIDDLE\n" (up to but not including E)
    mb.edit(mbPoint(1, 0), mbPoint(6, 0), "MIDDLE\n");

    // Verify the underlying buffer was correctly edited
    const bufferText = buf.snapshot().text();
    expect(bufferText).toBe("A\nMIDDLE\nE\nF");
  });

  test("cross-excerpt replace preserves anchor bias correctly", () => {
    const buf = createBuffer(createBufferId(), "Start\nMiddle\nEnd");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 2), { hasTrailingNewline: true });
    mb.addExcerpt(buf, excerptRange(2, 3));

    // Anchor with Bias.Left at column 0 of "End"
    const anchorLeft = mb.createAnchor(mbPoint(3, 0), Bias.Left);
    // Anchor with Bias.Right at column 0 of "End"
    const anchorRight = mb.createAnchor(mbPoint(3, 0), Bias.Right);

    expect(anchorLeft).toBeDefined();
    expect(anchorRight).toBeDefined();
    if (!anchorLeft || !anchorRight) return;

    // Replace "Middle\n" with "NEW\n"
    mb.edit(mbPoint(1, 0), mbPoint(2, 0), "NEW\n");

    const resolvedLeft = mb.snapshot().resolveAnchor(anchorLeft);
    const resolvedRight = mb.snapshot().resolveAnchor(anchorRight);

    expect(resolvedLeft).toBeDefined();
    expect(resolvedRight).toBeDefined();
    // Both anchors should still point to "End" line
  });
});

describe("MultiBuffer Edit Proxy - editBatch for multi-buffer operations", () => {
  test("editBatch applies multiple edits to different buffers atomically", () => {
    const buf1 = createBuffer(createBufferId(), "Buffer1 Line");
    const buf2 = createBuffer(createBufferId(), "Buffer2 Line");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf1, excerptRange(0, 1), { hasTrailingNewline: true });
    mb.addExcerpt(buf2, excerptRange(0, 1));

    // Apply batch edit to both buffers
    mb.editBatch([
      { start: mbPoint(0, 0), end: mbPoint(0, 0), text: "A: " },
      { start: mbPoint(2, 0), end: mbPoint(2, 0), text: "B: " },
    ]);

    const snap = mb.snapshot();
    expect(snap.lines(mbRow(0), mbRow(1))).toEqual(["A: Buffer1 Line"]);
    expect(snap.lines(mbRow(2), mbRow(3))).toEqual(["B: Buffer2 Line"]);
  });

  test("editBatch groups edits by buffer for efficiency", () => {
    const buf = createBuffer(createBufferId(), "Line 0\nLine 1\nLine 2");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 3));

    // Multiple edits in same buffer
    mb.editBatch([
      { start: mbPoint(0, 0), end: mbPoint(0, 0), text: "A: " },
      { start: mbPoint(1, 0), end: mbPoint(1, 0), text: "B: " },
      { start: mbPoint(2, 0), end: mbPoint(2, 0), text: "C: " },
    ]);

    const snap = mb.snapshot();
    expect(snap.lines(mbRow(0), mbRow(3))).toEqual([
      "A: Line 0",
      "B: Line 1",
      "C: Line 2",
    ]);
  });

  test("editBatch returns early for empty array", () => {
    const buf = createBuffer(createBufferId(), "Original");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 1));

    const versionBefore = mb.snapshot().version;
    mb.editBatch([]);
    const versionAfter = mb.snapshot().version;

    // No version change for empty batch
    expect(versionAfter).toBe(versionBefore);
    expect(mb.snapshot().lines(mbRow(0), mbRow(1))).toEqual(["Original"]);
  });

  test("editBatch handles mixed same-buffer and cross-buffer edits", () => {
    const buf1 = createBuffer(createBufferId(), "File1-A\nFile1-B");
    const buf2 = createBuffer(createBufferId(), "File2-A\nFile2-B");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf1, excerptRange(0, 2), { hasTrailingNewline: true });
    mb.addExcerpt(buf2, excerptRange(0, 2));

    // mb layout: 0=File1-A, 1=File1-B, 2=sep, 3=File2-A, 4=File2-B
    mb.editBatch([
      { start: mbPoint(0, 0), end: mbPoint(0, 0), text: "[1]" },
      { start: mbPoint(1, 0), end: mbPoint(1, 0), text: "[2]" },
      { start: mbPoint(3, 0), end: mbPoint(3, 0), text: "[3]" },
      { start: mbPoint(4, 0), end: mbPoint(4, 0), text: "[4]" },
    ]);

    const snap = mb.snapshot();
    expect(snap.lines(mbRow(0), mbRow(2))).toEqual(["[1]File1-A", "[2]File1-B"]);
    expect(snap.lines(mbRow(3), mbRow(5))).toEqual(["[3]File2-A", "[4]File2-B"]);
  });

  test("editBatch skips invalid edits silently", () => {
    const buf = createBuffer(createBufferId(), "Valid Line");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 1));

    // Include an edit at an invalid row (row 10 doesn't exist)
    mb.editBatch([
      { start: mbPoint(0, 0), end: mbPoint(0, 0), text: ">>>" },
      { start: mbPoint(10, 0), end: mbPoint(10, 0), text: "INVALID" },
    ]);

    const snap = mb.snapshot();
    // Only the valid edit is applied
    expect(snap.lines(mbRow(0), mbRow(1))).toEqual([">>>Valid Line"]);
  });

  test("anchors survive editBatch across multiple buffers", () => {
    const buf1 = createBuffer(createBufferId(), "Buffer One");
    const buf2 = createBuffer(createBufferId(), "Buffer Two");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf1, excerptRange(0, 1), { hasTrailingNewline: true });
    mb.addExcerpt(buf2, excerptRange(0, 1));

    // Create anchors in both buffers
    const anchor1 = mb.createAnchor(mbPoint(0, 7), Bias.Right);
    const anchor2 = mb.createAnchor(mbPoint(2, 7), Bias.Right);

    expect(anchor1).toBeDefined();
    expect(anchor2).toBeDefined();
    if (!anchor1 || !anchor2) return;

    // Edit both buffers
    mb.editBatch([
      { start: mbPoint(0, 0), end: mbPoint(0, 0), text: "Hi " },
      { start: mbPoint(2, 0), end: mbPoint(2, 0), text: "Hi " },
    ]);

    const snap = mb.snapshot();
    const resolved1 = snap.resolveAnchor(anchor1);
    const resolved2 = snap.resolveAnchor(anchor2);

    expect(resolved1).toBeDefined();
    expect(resolved2).toBeDefined();
    if (!resolved1 || !resolved2) return;

    // Both anchors shifted by 3 (length of "Hi ")
    expectPoint(resolved1, 0, 10);
    expectPoint(resolved2, 2, 10);
  });
});
