/**
 * Excerpt tests - written BEFORE implementation.
 *
 * Excerpts are views into buffers, representing a contiguous range of lines.
 *
 * Key patterns
 * - Excerpts reference buffers, they don't copy text
 * - hasTrailingNewline flag for synthetic newlines
 * - Empty excerpts are valid (start == end)
 * - Excerpt IDs are monotonically increasing, never reused
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { createBuffer } from "../../src/buffer/buffer.ts";
import { createExcerpt, mergeExcerptRanges, toExcerptInfo } from "../../src/multibuffer/excerpt.ts";
import { createMultiBuffer } from "../../src/multibuffer/multibuffer.ts";
import type {
  ExcerptInfo,
  ExcerptRange,
} from "../../src/multibuffer/types.ts";
import {
  Bias,
  createBufferId,
  createExcerptId,
  excerptId,
  excerptRange,
  expectPoint,
  mbPoint,
  mbRow,
  num,
  offset,
  range,
  resetCounters,
  row,
} from "../helpers.ts";

beforeEach(() => {
  resetCounters();
});


describe("ExcerptRange", () => {
  test("context contains primary range", () => {
    const er: ExcerptRange = {
      context: range(5, 0, 15, 0),
      primary: range(8, 0, 12, 0),
    };

    // Primary should be within context
    expect(num(er.primary.start.row) >= num(er.context.start.row)).toBe(true);
    expect(num(er.primary.end.row) <= num(er.context.end.row)).toBe(true);
  });

  test("context and primary can be equal", () => {
    const r = range(10, 0, 20, 0);
    const er: ExcerptRange = {
      context: r,
      primary: r,
    };
    expect(er.context).toEqual(er.primary);
  });

  test("excerptRange helper creates valid ranges", () => {
    const er = excerptRange(5, 15, 8, 12);
    expectPoint(er.context.start, 5, 0);
    expectPoint(er.context.end, 15, 0);
    expectPoint(er.primary.start, 8, 0);
    expectPoint(er.primary.end, 12, 0);
  });

  test("excerptRange without primary uses context", () => {
    const er = excerptRange(10, 20);
    expect(er.context).toEqual(er.primary);
  });
});


describe("ExcerptInfo", () => {
  test("calculates line count from range", () => {
    const info: ExcerptInfo = {
      id: createExcerptId(),
      bufferId: createBufferId(),
      range: excerptRange(0, 10, 2, 8),
      startRow: mbRow(0),
      endRow: mbRow(10),
      hasTrailingNewline: false,
    };

    const lineCount = num(info.endRow) - num(info.startRow);
    expect(lineCount).toBe(10);
  });

  test("excerpts can have different start rows in multibuffer", () => {
    const excerpt1: ExcerptInfo = {
      id: excerptId(1),
      bufferId: createBufferId(),
      range: excerptRange(0, 5),
      startRow: mbRow(0),
      endRow: mbRow(5),
      hasTrailingNewline: false,
    };

    const excerpt2: ExcerptInfo = {
      id: excerptId(2),
      bufferId: createBufferId(),
      range: excerptRange(0, 10),
      startRow: mbRow(5),
      endRow: mbRow(15),
      hasTrailingNewline: false,
    };

    expect(num(excerpt2.startRow)).toBe(num(excerpt1.endRow));
  });

  test("excerpt IDs are unique and have increasing indices", () => {
    const id1 = createExcerptId();
    const id2 = createExcerptId();
    const id3 = createExcerptId();

    expect(id1.index < id2.index).toBe(true);
    expect(id2.index < id3.index).toBe(true);
  });
});


describe("Empty Excerpt Edge Cases", () => {
  test("empty excerpt has zero line count", () => {
    // GOTCHA: An excerpt can be completely empty (start == end)
    // It still takes up space in the tree structure
    const info: ExcerptInfo = {
      id: excerptId(1),
      bufferId: createBufferId(),
      range: excerptRange(5, 5), // Same start and end
      startRow: mbRow(10),
      endRow: mbRow(10), // Same - zero lines
      hasTrailingNewline: false,
    };

    const lineCount = num(info.endRow) - num(info.startRow);
    expect(lineCount).toBe(0);
  });

  test("empty excerpt followed by non-empty excerpt", () => {
    // Empty excerpt at row 10
    // Non-empty excerpt should start at row 10 (not 11)
    const buf = createBuffer(createBufferId(), "A\nB\nC\nD\nE");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(2, 2)); // empty: start == end
    mb.addExcerpt(buf, excerptRange(0, 2)); // non-empty: 2 lines

    const [emptyInfo, nonEmptyInfo] = mb.excerpts;
    if (!emptyInfo || !nonEmptyInfo) throw new Error("Expected two excerpts");
    // Empty excerpt contributes zero rows
    expect(num(emptyInfo.endRow) - num(emptyInfo.startRow)).toBe(0);
    // Non-empty excerpt starts immediately at the same multibuffer row
    expect(num(nonEmptyInfo.startRow)).toBe(num(emptyInfo.endRow));
    // Total line count comes from non-empty excerpt only
    expect(mb.lineCount).toBe(2);
  });

  test("multiple consecutive empty excerpts", () => {
    // Multiple empty excerpts should all have same startRow/endRow
    const buf = createBuffer(createBufferId(), "A\nB\nC\nD\nE");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(1, 1)); // empty
    mb.addExcerpt(buf, excerptRange(2, 2)); // empty
    mb.addExcerpt(buf, excerptRange(3, 3)); // empty

    // Each empty excerpt has zero height
    for (const info of mb.excerpts) {
      expect(num(info.endRow) - num(info.startRow)).toBe(0);
    }
    // All stack at multibuffer row 0; total line count is 0
    expect(mb.lineCount).toBe(0);
    expect(mb.excerpts.every((e) => num(e.startRow) === 0)).toBe(true);
    expect(mb.excerpts.every((e) => num(e.endRow) === 0)).toBe(true);
  });
});


describe("Trailing Newline Handling", () => {
  test("hasTrailingNewline flag affects line count", () => {
    // GOTCHA: When hasTrailingNewline is true, the excerpt has a synthetic
    // newline added. This affects position calculations.
    const withoutNewline: ExcerptInfo = {
      id: excerptId(1),
      bufferId: createBufferId(),
      range: excerptRange(0, 5),
      startRow: mbRow(0),
      endRow: mbRow(5),
      hasTrailingNewline: false,
    };

    const withNewline: ExcerptInfo = {
      id: excerptId(2),
      bufferId: createBufferId(),
      range: excerptRange(0, 5),
      startRow: mbRow(0),
      endRow: mbRow(6), // One extra line for trailing newline
      hasTrailingNewline: true,
    };

    expect(num(withNewline.endRow) - num(withoutNewline.endRow)).toBe(1);
  });

  test.todo("position conversion accounts for trailing newline", () => {
    // When resolving ranges: if hasTrailingNewline, end_before_newline -= 1
    // This is an off-by-one trap
  });
});


describe("Excerpt Creation", () => {
  test("creates excerpt from buffer range", () => {
    const buf = createBuffer(createBufferId(), "A\nB\nC\nD\nE");
    const snapshot = buf.snapshot();
    const id = createExcerptId();
    const er = excerptRange(1, 4); // lines B, C, D

    const excerpt = createExcerpt(id, snapshot, er, false);

    expect(excerpt.id).toEqual(id);
    expect(excerpt.bufferId).toBe(snapshot.id);
    expect(excerpt.hasTrailingNewline).toBe(false);
  });

  test("validates range is within buffer bounds", () => {
    const buf = createBuffer(createBufferId(), "A\nB\nC");
    const snapshot = buf.snapshot();
    const id = createExcerptId();
    const er = excerptRange(0, 10); // end row 10 exceeds 3-line buffer

    expect(() => createExcerpt(id, snapshot, er, false)).toThrow();
  });

  test("excerpt lines match buffer lines", () => {
    const buf = createBuffer(createBufferId(), "A\nB\nC\nD\nE");
    const snapshot = buf.snapshot();
    const id = createExcerptId();
    const er = excerptRange(1, 4); // lines B, C, D

    const excerpt = createExcerpt(id, snapshot, er, false);

    // Excerpt provides a view — accessing lines goes through buffer snapshot
    expect(excerpt.buffer.line(row(1))).toBe("B");
    expect(excerpt.buffer.line(row(2))).toBe("C");
    expect(excerpt.buffer.line(row(3))).toBe("D");
    expect(excerpt.buffer).toBe(snapshot); // same reference
  });

  test("excerpt references buffer snapshot, not copy", () => {
    const buf = createBuffer(createBufferId(), "A\nB\nC");
    const snapshot = buf.snapshot();
    const id = createExcerptId();
    const er = excerptRange(0, 3);

    const excerpt = createExcerpt(id, snapshot, er, false);

    // Strict reference equality — no copying
    expect(excerpt.buffer).toBe(snapshot);
  });

  test("excerpt textSummary is accurate", () => {
    const buf = createBuffer(createBufferId(), "Hello\nWorld\nFoo");
    const snapshot = buf.snapshot();
    const id = createExcerptId();
    const er = excerptRange(0, 3); // all 3 lines

    const excerpt = createExcerpt(id, snapshot, er, false);

    expect(excerpt.textSummary.lines).toBe(3);
    expect(excerpt.textSummary.bytes).toBe(15); // "Hello\nWorld\nFoo"
    expect(excerpt.textSummary.lastLineLength).toBe(3); // "Foo"
  });

  test("toExcerptInfo converts with startRow", () => {
    const buf = createBuffer(createBufferId(), "A\nB\nC\nD\nE");
    const snapshot = buf.snapshot();
    const id = createExcerptId();
    const er = excerptRange(1, 4); // 3 lines: B, C, D

    const excerpt = createExcerpt(id, snapshot, er, false);
    const info = toExcerptInfo(excerpt, mbRow(10));

    expect(num(info.startRow)).toBe(10);
    expect(num(info.endRow)).toBe(13); // 3 lines
    expect(info.hasTrailingNewline).toBe(false);
  });

  test("toExcerptInfo accounts for trailing newline", () => {
    const buf = createBuffer(createBufferId(), "A\nB\nC\nD\nE");
    const snapshot = buf.snapshot();
    const id = createExcerptId();
    const er = excerptRange(1, 4); // 3 lines: B, C, D

    const excerpt = createExcerpt(id, snapshot, er, true);
    const info = toExcerptInfo(excerpt, mbRow(10));

    expect(num(info.startRow)).toBe(10);
    expect(num(info.endRow)).toBe(14); // 3 lines + 1 trailing newline
    expect(info.hasTrailingNewline).toBe(true);
  });
});


describe("Excerpt Range Merging", () => {
  test("adjacent ranges merge", () => {
    const merged = mergeExcerptRanges([
      excerptRange(0, 5),
      excerptRange(5, 10),
    ]);
    expect(merged.length).toBe(1);
    expect(num(merged[0]?.context.start.row ?? row(0))).toBe(0);
    expect(num(merged[0]?.context.end.row ?? row(0))).toBe(10);
  });

  test("overlapping ranges merge", () => {
    const merged = mergeExcerptRanges([
      excerptRange(0, 8),
      excerptRange(5, 15),
    ]);
    expect(merged.length).toBe(1);
    expect(num(merged[0]?.context.start.row ?? row(0))).toBe(0);
    expect(num(merged[0]?.context.end.row ?? row(0))).toBe(15);
  });

  test("non-adjacent ranges stay separate", () => {
    const merged = mergeExcerptRanges([
      excerptRange(0, 5),
      excerptRange(10, 15),
    ]);
    expect(merged.length).toBe(2);
    expect(num(merged[0]?.context.end.row ?? row(0))).toBe(5);
    expect(num(merged[1]?.context.start.row ?? row(0))).toBe(10);
  });

  test("merge tracking returns correct counts", () => {
    const merged = mergeExcerptRanges([
      excerptRange(0, 5),
      excerptRange(3, 8),
      excerptRange(7, 12),
      excerptRange(20, 25),
    ]);
    // First three overlap/are adjacent → merge into one (0-12)
    // Last one is separate (20-25)
    expect(merged.length).toBe(2);
    expect(num(merged[0]?.context.start.row ?? row(0))).toBe(0);
    expect(num(merged[0]?.context.end.row ?? row(0))).toBe(12);
    expect(num(merged[1]?.context.start.row ?? row(0))).toBe(20);
  });

  test("unsorted ranges are sorted before merging", () => {
    const merged = mergeExcerptRanges([
      excerptRange(10, 15),
      excerptRange(0, 5),
      excerptRange(5, 10),
    ]);
    expect(merged.length).toBe(1);
    expect(num(merged[0]?.context.start.row ?? row(0))).toBe(0);
    expect(num(merged[0]?.context.end.row ?? row(0))).toBe(15);
  });

  test("empty input returns empty", () => {
    expect(mergeExcerptRanges([]).length).toBe(0);
  });

  test("single range returned as-is", () => {
    const merged = mergeExcerptRanges([excerptRange(5, 10)]);
    expect(merged.length).toBe(1);
    expect(num(merged[0]?.context.start.row ?? row(0))).toBe(5);
  });
});


describe("Excerpt Expansion", () => {
  test("expand adds context lines before", () => {
    const buf = createBuffer(createBufferId(), "L0\nL1\nL2\nL3\nL4\nL5\nL6\nL7\nL8\nL9");
    const mb = createMultiBuffer();
    const eid = mb.addExcerpt(buf, excerptRange(5, 8)); // lines 5-7

    expect(mb.lineCount).toBe(3);
    mb.expandExcerpt(eid, 2, 0); // add 2 lines before
    expect(mb.lineCount).toBe(5); // now lines 3-7
    expect(mb.excerpts[0]?.range.context.start.row).toBe(row(3));
  });

  test("expand adds context lines after", () => {
    const buf = createBuffer(createBufferId(), "L0\nL1\nL2\nL3\nL4\nL5\nL6\nL7\nL8\nL9");
    const mb = createMultiBuffer();
    const eid = mb.addExcerpt(buf, excerptRange(2, 5)); // lines 2-4

    expect(mb.lineCount).toBe(3);
    mb.expandExcerpt(eid, 0, 3); // add 3 lines after
    expect(mb.lineCount).toBe(6); // now lines 2-7
    expect(mb.excerpts[0]?.range.context.end.row).toBe(row(8));
  });

  test("expand is clamped to buffer bounds", () => {
    const buf = createBuffer(createBufferId(), "L0\nL1\nL2\nL3\nL4");
    const mb = createMultiBuffer();
    const eid = mb.addExcerpt(buf, excerptRange(1, 4)); // lines 1-3

    mb.expandExcerpt(eid, 100, 100); // way past bounds
    // Should clamp to 0..5 (full buffer)
    expect(mb.excerpts[0]?.range.context.start.row).toBe(row(0));
    expect(mb.excerpts[0]?.range.context.end.row).toBe(row(5));
  });

  test("expand updates startRow for subsequent excerpts", () => {
    const buf1 = createBuffer(createBufferId(), "L0\nL1\nL2\nL3\nL4\nL5\nL6\nL7\nL8\nL9");
    const buf2 = createBuffer(createBufferId(), "A\nB\nC");
    const mb = createMultiBuffer();
    const eid1 = mb.addExcerpt(buf1, excerptRange(3, 5), { hasTrailingNewline: true });
    mb.addExcerpt(buf2, excerptRange(0, 3));

    const startRowBefore = num(mb.excerpts[1]?.startRow ?? mbRow(0));
    mb.expandExcerpt(eid1, 2, 0); // add 2 lines before first excerpt
    const startRowAfter = num(mb.excerpts[1]?.startRow ?? mbRow(0));
    expect(startRowAfter).toBe(startRowBefore + 2);
  });
});


describe("Excerpt ID Monotonicity", () => {
  test("IDs never decrease", () => {
    // Creating, removing, creating again should still increase
    // SlotMap reuses the slot index but increments the generation,
    // so the combined (index, generation) key is always unique.
    const buf = createBuffer(createBufferId(), "A\nB\nC");
    const mb = createMultiBuffer();
    const id1 = mb.addExcerpt(buf, excerptRange(0, 3));
    mb.removeExcerpt(id1);
    const id2 = mb.addExcerpt(buf, excerptRange(0, 3));
    // id2 must be distinct from id1 (different index or higher generation)
    const same = id1.index === id2.index && id1.generation === id2.generation;
    expect(same).toBe(false);
  });

  test("removed excerpt IDs are not reused", () => {
    // Add excerpt (id=1), remove it, add another (id=2, not 1)
    // This is CRITICAL for anchor stability
    const buf = createBuffer(createBufferId(), "A\nB\nC");
    const mb = createMultiBuffer();
    const id1 = mb.addExcerpt(buf, excerptRange(0, 3));
    mb.removeExcerpt(id1);
    const id2 = mb.addExcerpt(buf, excerptRange(0, 3));

    // The old (index, generation) pair is no longer live
    expect(
      mb.excerpts.find(
        (e) => e.id.index === id1.index && e.id.generation === id1.generation,
      ),
    ).toBeUndefined();
    // The new excerpt is reachable via its fresh ID
    expect(
      mb.excerpts.find(
        (e) => e.id.index === id2.index && e.id.generation === id2.generation,
      ),
    ).toBeDefined();
  });

  test("IDs survive excerpt replacement", () => {
    // setExcerptsForBuffer creates new IDs, doesn't reuse old ones
    // Old IDs tracked in replaced_excerpts map
    const buf = createBuffer(createBufferId(), "A\nB\nC");
    const mb = createMultiBuffer();
    const oldId = mb.addExcerpt(buf, excerptRange(0, 3));

    // Create anchor before replacement so we can verify the chain
    const a = mb.createAnchor(mbPoint(0, 1), Bias.Right);
    expect(a).toBeDefined();
    if (!a) return;

    const [newId] = mb.setExcerptsForBuffer(buf, [excerptRange(0, 3)]);
    expect(newId).toBeDefined();
    if (!newId) return;

    // Old ID is gone from the live excerpt list
    expect(
      mb.excerpts.find(
        (e) => e.id.index === oldId.index && e.id.generation === oldId.generation,
      ),
    ).toBeUndefined();
    // New ID is live
    expect(
      mb.excerpts.find(
        (e) => e.id.index === newId.index && e.id.generation === newId.generation,
      ),
    ).toBeDefined();
    // Anchor created in the old excerpt resolves via replacement chain
    const resolved = mb.snapshot().resolveAnchor(a);
    expect(resolved).toBeDefined();
  });
});


describe("Excerpt Anchor Stability", () => {
  test("anchor in excerpt survives buffer edit before excerpt", () => {
    // Buffer: "A\nB\nC\nD\nE\nF\nG\nH\nI\nJ" (10 lines, each 2 bytes except last)
    // Each row n starts at byte offset n*2 (for single-letter lines)
    // Excerpt: buffer rows 5-9 (F,G,H,I), mb rows 0-3
    // Anchor at mb row 2, col 0 → buffer row 7 ("H"), byte offset 14
    const buf = createBuffer(createBufferId(), "A\nB\nC\nD\nE\nF\nG\nH\nI\nJ");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(5, 9));

    const a = mb.createAnchor(mbPoint(2, 0), Bias.Right);
    expect(a).toBeDefined();
    if (!a) return;

    // Insert "XX" (2 bytes, no newline) at offset 4 — start of "C", row 2, before excerpt
    // Row numbers don't shift (no newline added); only byte offsets shift.
    buf.insert(offset(4), "XX");

    // Adjusted offset: 14 + 2 = 16.  Buffer row 7 ("H") is still at row 7 in the new
    // "A\nB\nXXC\nD\nE\nF\nG\nH\nI\nJ" layout.  Row 7 is in [5,9) → mb row 2, col 0.
    const resolved = mb.snapshot().resolveAnchor(a);
    expect(resolved).toBeDefined();
    if (!resolved) return;
    expectPoint(resolved, 2, 0);
  });

  test("anchor in excerpt survives buffer edit within excerpt", () => {
    // Full 10-line excerpt (rows 0-10), anchor at mb row 7 ("H").
    // Insert a new line inside the excerpt before the anchor — anchor shifts by +1 row.
    const buf = createBuffer(createBufferId(), "A\nB\nC\nD\nE\nF\nG\nH\nI\nJ");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 10));

    const a = mb.createAnchor(mbPoint(7, 0), Bias.Right);
    expect(a).toBeDefined();
    if (!a) return;

    // Insert "X\n" (2 bytes) at offset 8 — start of "E", row 4, within the excerpt
    buf.insert(offset(8), "X\n");

    // Adjusted offset: 14 + 2 = 16.  "H" now at row 8 in the updated buffer
    // "A\nB\nC\nD\nX\nE\nF\nG\nH\nI\nJ".  Row 8 is in [0,10) → mb row 8, col 0.
    const resolved = mb.snapshot().resolveAnchor(a);
    expect(resolved).toBeDefined();
    if (!resolved) return;
    expectPoint(resolved, 8, 0);
  });

  test("anchor in excerpt survives buffer edit after excerpt", () => {
    // Excerpt: rows 5-9 (F,G,H,I), anchor at mb row 2 ("H").
    // Edit is at row 9 — after the excerpt ends — so the anchor byte offset is unchanged.
    const buf = createBuffer(createBufferId(), "A\nB\nC\nD\nE\nF\nG\nH\nI\nJ");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(5, 9));

    const a = mb.createAnchor(mbPoint(2, 0), Bias.Right);
    expect(a).toBeDefined();
    if (!a) return;

    // Insert "XX" (2 bytes) at offset 18 — start of "J", row 9, after the excerpt
    buf.insert(offset(18), "XX");

    // Anchor offset 14 < edit offset 18 → unchanged.  Still row 7, mb row 2, col 0.
    const resolved = mb.snapshot().resolveAnchor(a);
    expect(resolved).toBeDefined();
    if (!resolved) return;
    expectPoint(resolved, 2, 0);
  });

  test("anchor with Bias.Left stays left of inserted text", () => {
    const buf = createBuffer(createBufferId(), "Hello");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 1));

    const a = mb.createAnchor(mbPoint(0, 3), Bias.Left);
    expect(a).toBeDefined();
    if (!a) return;

    // Insert "XX" exactly at col 3 (byte offset 3)
    mb.edit(mbPoint(0, 3), mbPoint(0, 3), "XX");

    // Bias.Left: anchor clamps to the insert position — stays at col 3
    const resolved = mb.snapshot().resolveAnchor(a);
    expect(resolved).toBeDefined();
    if (!resolved) return;
    expectPoint(resolved, 0, 3);
  });

  test("anchor with Bias.Right moves right of inserted text", () => {
    const buf = createBuffer(createBufferId(), "Hello");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 1));

    const a = mb.createAnchor(mbPoint(0, 3), Bias.Right);
    expect(a).toBeDefined();
    if (!a) return;

    // Insert "XX" exactly at col 3 (byte offset 3)
    mb.edit(mbPoint(0, 3), mbPoint(0, 3), "XX");

    // Bias.Right: anchor moves past the 2 inserted bytes — resolves to col 5
    const resolved = mb.snapshot().resolveAnchor(a);
    expect(resolved).toBeDefined();
    if (!resolved) return;
    expectPoint(resolved, 0, 5);
  });
});


describe("Excerpt Replacement", () => {
  test("replaced excerpt tracked in map", () => {
    const buf = createBuffer(createBufferId(), "Line 0\nLine 1\nLine 2");
    const mb = createMultiBuffer();
    const oldId = mb.addExcerpt(buf, excerptRange(0, 3));

    const newIds = mb.setExcerptsForBuffer(buf, [excerptRange(0, 3)]);
    expect(newIds.length).toBe(1);
    // Old ID should no longer be directly in excerpts
    const found = mb.excerpts.find(
      (e) => e.id.index === oldId.index && e.id.generation === oldId.generation,
    );
    expect(found).toBeUndefined();
  });

  test("replacement chain is followed", () => {
    const buf = createBuffer(createBufferId(), "Line 0\nLine 1\nLine 2");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 3));

    // Create anchor in original excerpt
    const a = mb.createAnchor(mbPoint(1, 2), Bias.Right);
    expect(a).toBeDefined();
    if (!a) return;

    // Replace twice: original -> A -> B
    mb.setExcerptsForBuffer(buf, [excerptRange(0, 3)]);
    mb.setExcerptsForBuffer(buf, [excerptRange(0, 3)]);

    // Anchor should still resolve
    const resolved = mb.snapshot().resolveAnchor(a);
    expect(resolved).toBeDefined();
    if (!resolved) return;
    expectPoint(resolved, 1, 2);
  });

  test("anchor degrades gracefully when excerpt fully removed", () => {
    const buf = createBuffer(createBufferId(), "Hello");
    const mb = createMultiBuffer();
    const eid = mb.addExcerpt(buf, excerptRange(0, 1));

    const a = mb.createAnchor(mbPoint(0, 3), Bias.Right);
    expect(a).toBeDefined();
    if (!a) return;

    mb.removeExcerpt(eid);
    expect(mb.snapshot().resolveAnchor(a)).toBeUndefined();
  });
});
