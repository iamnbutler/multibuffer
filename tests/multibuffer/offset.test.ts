/**
 * Tests for src/buffer/offset.ts
 *
 * `adjustOffset` is a pure function that maps a buffer offset across a
 * sequence of edits.  Each edit is an {offset, deletedLength, insertedLength}
 * triple.  The bias parameter controls where an offset that sits exactly at
 * the start of an edit lands:
 *
 *   Bias.Left  → stays at edit.offset (before the inserted text)
 *   Bias.Right → jumps to edit.offset + insertedLength (after the inserted text)
 */

import { describe, expect, test } from "bun:test";
import { adjustOffset } from "../../src/buffer/offset.ts";
import { Bias, type BufferOffset, type EditEntry } from "../../src/buffer/types.ts";

// Small helpers to keep tests readable.
function off(n: number): BufferOffset {
  // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
  return n as BufferOffset;
}

function edit(
  editOffset: number,
  deletedLength: number,
  insertedLength: number,
): EditEntry {
  return {
    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
    offset: editOffset as BufferOffset,
    deletedLength,
    insertedLength,
  };
}

function adjust(
  o: number,
  bias: Bias,
  edits: EditEntry[],
): number {
  // biome-ignore lint/plugin/no-type-assertion: expect: unwrapping branded numeric type
  return adjustOffset(off(o), bias, edits) as number;
}

// ---------------------------------------------------------------------------
// Single-edit cases
// ---------------------------------------------------------------------------

describe("adjustOffset — offset before the edit", () => {
  test("pure insertion: offset before insertion point is unchanged", () => {
    // Insert 3 chars at position 5; offset 3 is before, so unchanged.
    expect(adjust(3, Bias.Left, [edit(5, 0, 3)])).toBe(3);
    expect(adjust(3, Bias.Right, [edit(5, 0, 3)])).toBe(3);
  });

  test("pure deletion: offset before deletion range is unchanged", () => {
    // Delete chars 5-8; offset 2 is before, so unchanged.
    expect(adjust(2, Bias.Left, [edit(5, 3, 0)])).toBe(2);
    expect(adjust(2, Bias.Right, [edit(5, 3, 0)])).toBe(2);
  });

  test("replacement: offset before replacement is unchanged", () => {
    // Replace chars 10-15 with 2 chars; offset 7 is before.
    expect(adjust(7, Bias.Right, [edit(10, 5, 2)])).toBe(7);
  });
});

// ---------------------------------------------------------------------------

describe("adjustOffset — offset after the edit", () => {
  test("pure insertion: offset after insertion shifts right by insertedLength", () => {
    // Insert 4 chars at 5.  Offset 6 (which is after 5+0=5) shifts by +4.
    expect(adjust(6, Bias.Left, [edit(5, 0, 4)])).toBe(10);
    expect(adjust(6, Bias.Right, [edit(5, 0, 4)])).toBe(10);
  });

  test("pure deletion: offset after deleted range shifts left by deletedLength", () => {
    // Delete 3 chars starting at 2 (positions 2,3,4 removed). Offset 5 shifts -3.
    expect(adjust(5, Bias.Left, [edit(2, 3, 0)])).toBe(2);
    expect(adjust(5, Bias.Right, [edit(2, 3, 0)])).toBe(2);
  });

  test("replacement: offset after replacement shifts by (insertedLength - deletedLength)", () => {
    // Replace 5 chars at 10 with 2 chars (net -3).  Offset 20 → 17.
    expect(adjust(20, Bias.Left, [edit(10, 5, 2)])).toBe(17);
    expect(adjust(20, Bias.Right, [edit(10, 5, 2)])).toBe(17);
  });

  test("replacement growing: offset after replacement shifts right", () => {
    // Replace 2 chars at 3 with 5 chars (net +3).  Offset 10 → 13.
    expect(adjust(10, Bias.Right, [edit(3, 2, 5)])).toBe(13);
  });
});

// ---------------------------------------------------------------------------

describe("adjustOffset — offset at the edit start (bias-sensitive)", () => {
  test("insertion at cursor: Bias.Left keeps offset before inserted text", () => {
    // Insert 4 chars at 5.  Cursor is at 5, Bias.Left → stays at 5.
    expect(adjust(5, Bias.Left, [edit(5, 0, 4)])).toBe(5);
  });

  test("insertion at cursor: Bias.Right moves offset after inserted text", () => {
    // Insert 4 chars at 5.  Cursor is at 5, Bias.Right → moves to 9.
    expect(adjust(5, Bias.Right, [edit(5, 0, 4)])).toBe(9);
  });

  test("deletion starting at offset: Bias.Left clamps to edit start", () => {
    // Delete 3 chars at 5.  Offset is 5, Bias.Left → stays at 5.
    expect(adjust(5, Bias.Left, [edit(5, 3, 0)])).toBe(5);
  });

  test("deletion starting at offset: Bias.Right clamps to edit start (no text inserted)", () => {
    // Delete 3 chars at 5.  Offset is 5, Bias.Right → 5 + insertedLength(0) = 5.
    expect(adjust(5, Bias.Right, [edit(5, 3, 0)])).toBe(5);
  });

  test("replacement at cursor: Bias.Left clamps to replacement start", () => {
    // Replace 3 chars at 4 with 6 chars.  Cursor is at 4, Bias.Left → stays at 4.
    expect(adjust(4, Bias.Left, [edit(4, 3, 6)])).toBe(4);
  });

  test("replacement at cursor: Bias.Right moves after inserted text", () => {
    // Replace 3 chars at 4 with 6 chars.  Cursor at 4, Bias.Right → 4+6=10.
    expect(adjust(4, Bias.Right, [edit(4, 3, 6)])).toBe(10);
  });
});

// ---------------------------------------------------------------------------

describe("adjustOffset — offset within the deleted range", () => {
  test("offset in middle of deletion: clamped to edit start regardless of bias", () => {
    // Delete 6 chars at 5.  Offset 8 is within [5, 11).
    expect(adjust(8, Bias.Left, [edit(5, 6, 0)])).toBe(5);
    expect(adjust(8, Bias.Right, [edit(5, 6, 0)])).toBe(5);
  });

  test("offset at end of deleted range: clamped to edit start", () => {
    // Delete 4 chars at 2 (range [2,6)).  Offset 6 is the exclusive end → shifted.
    // editEnd = 2 + 4 = 6; offset > editEnd is false (6 > 6 is false),
    // so offset is within [editStart, editEnd] → clamps to edit.offset.
    expect(adjust(6, Bias.Left, [edit(2, 4, 0)])).toBe(2);
  });

  test("offset within deleted-then-replaced range: clamped to edit start", () => {
    // Replace 5 chars at 3 with 2 chars.  Offset 7 is within [3, 8).
    expect(adjust(7, Bias.Left, [edit(3, 5, 2)])).toBe(3);
    expect(adjust(7, Bias.Right, [edit(3, 5, 2)])).toBe(3);
  });
});

// ---------------------------------------------------------------------------

describe("adjustOffset — multiple edits applied in sequence", () => {
  test("two insertions at different positions", () => {
    // First: insert 3 chars at 0 → offsets shift right by 3 for all positions ≥ 0.
    // Second: insert 2 chars at 10 (in the adjusted space).
    // Test offset originally at 12 (after both edits):
    //   after edit1: 12 → 15 (12 > 0, shift +3)
    //   after edit2: 15 > 12 (10+2), shift +2 → 17
    expect(adjust(12, Bias.Right, [edit(0, 0, 3), edit(10, 0, 2)])).toBe(17);
  });

  test("insert then delete: offset before both edits unchanged", () => {
    // insert 4 at 5, then delete 2 at 8.
    // Offset 2 is before edit1 (offset < 5) → unchanged after edit1.
    // 2 is still before edit2 (8) → unchanged after edit2.
    expect(adjust(2, Bias.Left, [edit(5, 0, 4), edit(8, 2, 0)])).toBe(2);
  });

  test("insert then delete: offset passes through both", () => {
    // insert 3 at 2, then delete 4 at 10 (in adjusted space).
    // Offset 12:
    //   after edit1: 12 > 2, shift +3 → 15
    //   after edit2: 15 > 10+4=14, shift -4 → 11
    expect(adjust(12, Bias.Right, [edit(2, 0, 3), edit(10, 4, 0)])).toBe(11);
  });

  test("three edits: offset adjusted through all three", () => {
    // insert 2 at 0, delete 1 at 5, insert 1 at 10
    // Offset 11:
    //   after edit1: 11 > 0, +2 → 13
    //   after edit2: 13 > 5+1=6, -1 → 12
    //   after edit3: 12 > 10, +1 → 13
    expect(adjust(11, Bias.Right, [edit(0, 0, 2), edit(5, 1, 0), edit(10, 0, 1)])).toBe(13);
  });

  test("empty edit sequence: offset unchanged", () => {
    expect(adjust(7, Bias.Left, [])).toBe(7);
    expect(adjust(0, Bias.Right, [])).toBe(0);
  });
});

// ---------------------------------------------------------------------------

describe("adjustOffset — boundary and identity cases", () => {
  test("offset 0 before any edit", () => {
    expect(adjust(0, Bias.Left, [edit(5, 2, 3)])).toBe(0);
  });

  test("offset 0 at insertion point with Bias.Right moves after inserted text", () => {
    expect(adjust(0, Bias.Right, [edit(0, 0, 5)])).toBe(5);
  });

  test("offset 0 at deletion start clamps to 0", () => {
    expect(adjust(0, Bias.Left, [edit(0, 3, 0)])).toBe(0);
    expect(adjust(0, Bias.Right, [edit(0, 3, 0)])).toBe(0);
  });

  test("insert zero chars (no-op insertion): offset at that point unchanged", () => {
    // insertedLength 0 and deletedLength 0 is a no-op edit.
    expect(adjust(5, Bias.Left, [edit(5, 0, 0)])).toBe(5);
    // Bias.Right: offset === edit.offset → edit.offset + 0 = 5.
    expect(adjust(5, Bias.Right, [edit(5, 0, 0)])).toBe(5);
  });

  test("large offset far past edit range: shifts correctly", () => {
    // Delete 100 chars at 50.  Offset 1000 → 900.
    expect(adjust(1000, Bias.Left, [edit(50, 100, 0)])).toBe(900);
  });
});
