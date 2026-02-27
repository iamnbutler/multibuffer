/**
 * MultiBuffer edit proxy tests.
 * Editing through multibuffer coordinates → buffer coordinates.
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { createBuffer } from "../../src/multibuffer/buffer.ts";
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

  test.todo("edit spanning start of first excerpt through end of last excerpt deletes middle entirely", () => {
    // Complex case: three excerpts from the same buffer.
    // Edit from end of first excerpt to start of third excerpt.
    // Expected: middle excerpt removed, first/last trimmed.
    // Not yet implemented — current edit() only handles single-excerpt edits.
  });

  test.todo("cross-excerpt delete from same buffer clips to excerpt boundary", () => {
    // If start and end are in different excerpts of the same buffer, the edit
    // currently edits the underlying buffer including the gap — which is likely
    // not the intended behaviour. A future fix should clip to excerpt boundaries.
  });
});
