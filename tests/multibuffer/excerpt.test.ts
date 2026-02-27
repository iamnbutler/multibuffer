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
import { createBuffer } from "../../src/multibuffer/buffer.ts";
import { createExcerpt, toExcerptInfo } from "../../src/multibuffer/excerpt.ts";
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
  range,
  resetCounters,
  row,
} from "../helpers.ts";

beforeEach(() => {
  resetCounters();
});

// =============================================================================
// ExcerptRange Validation
// =============================================================================

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

// =============================================================================
// ExcerptInfo
// =============================================================================

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

// =============================================================================
// Empty Excerpt Edge Cases (GOTCHA from research)
// =============================================================================

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

  test.todo("empty excerpt followed by non-empty excerpt", () => {
    // Empty excerpt at row 10
    // Non-empty excerpt should start at row 10 (not 11)
  });

  test.todo("multiple consecutive empty excerpts", () => {
    // Multiple empty excerpts should all have same startRow/endRow
  });
});

// =============================================================================
// Trailing Newline Handling (GOTCHA from research)
// =============================================================================

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

// =============================================================================
// Excerpt Creation (requires implementation)
// =============================================================================

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

// =============================================================================
// Excerpt Range Merging
// =============================================================================

describe("Excerpt Range Merging", () => {
  test.todo("adjacent ranges merge", () => {
    // If range1.end.row + 1 == range2.start.row, they should merge
  });

  test.todo("overlapping ranges merge", () => {
    // If range1.end >= range2.start, they should merge
  });

  test.todo("non-adjacent ranges stay separate", () => {
    // Gap of 2+ lines means separate excerpts
  });

  test.todo("merge tracking returns correct counts", () => {
    // (merged_ranges, counts_per_original_range) ?
  });
});

// =============================================================================
// Excerpt Expansion
// =============================================================================

describe("Excerpt Expansion", () => {
  test.todo("expand adds context lines before", () => {
    // expandExcerpt(id, 3, 0) adds 3 lines before
  });

  test.todo("expand adds context lines after", () => {
    // expandExcerpt(id, 0, 3) adds 3 lines after
  });

  test.todo("expand is clamped to buffer bounds", () => {
    // Cannot expand before line 0 or past last line
  });

  test.todo("expand updates startRow for subsequent excerpts", () => {
    // If excerpt A expands, excerpt B's startRow increases
  });
});

// =============================================================================
// Excerpt ID Monotonicity (GOTCHA from research)
// =============================================================================

describe("Excerpt ID Monotonicity", () => {
  test.todo("IDs never decrease", () => {
    // Creating, removing, creating again should still increase
  });

  test.todo("removed excerpt IDs are not reused", () => {
    // Add excerpt (id=1), remove it, add another (id=2, not 1)
    // This is CRITICAL for anchor stability
  });

  test.todo("IDs survive excerpt replacement", () => {
    // setExcerptsForBuffer creates new IDs, doesn't reuse old ones
    // Old IDs tracked in replaced_excerpts map
  });
});

// =============================================================================
// Anchor Stability Within Excerpts
// =============================================================================

describe("Excerpt Anchor Stability", () => {
  test.todo("anchor in excerpt survives buffer edit before excerpt", () => {
    // Edit in buffer at line 5
    // Excerpt starts at line 10
    // Anchor at line 12 should still point to same logical position
  });

  test.todo("anchor in excerpt survives buffer edit within excerpt", () => {
    // Anchor at line 15 in excerpt
    // Insert text at line 12
    // Anchor should now be at line 16 (shifted by insert)
  });

  test.todo("anchor in excerpt survives buffer edit after excerpt", () => {
    // Excerpt is lines 10-20
    // Edit at line 25
    // Anchor at line 15 should be unchanged
  });

  test.todo("anchor with Bias.Left stays left of inserted text", () => {
    // Insert at anchor position
    // Anchor with Bias.Left should resolve to position before inserted text
  });

  test.todo("anchor with Bias.Right moves right of inserted text", () => {
    // Insert at anchor position
    // Anchor with Bias.Right should resolve to position after inserted text
  });
});

// =============================================================================
// Excerpt Replacement
// =============================================================================

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
