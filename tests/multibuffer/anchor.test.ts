/**
 * Anchor tests.
 *
 * Anchors are stable position references that survive:
 * - Text edits (insert, delete, replace)
 * - Excerpt replacement
 * - Buffer mutations
 */

import { beforeEach, describe, expect, test } from "bun:test";
import {
  adjustOffset,
  anchorsEqual,
  compareAnchors,
  createAnchorRange,
  createSelection,
  resolveAnchorRange,
  reverseSelection,
} from "../../src/multibuffer/anchor.ts";
import { createBuffer } from "../../src/multibuffer/buffer.ts";
import { createMultiBuffer } from "../../src/multibuffer/multibuffer.ts";
import type { BufferOffset, EditEntry } from "../../src/multibuffer/types.ts";
import {
  anchor,
  Bias,
  bufferAnchor,
  createBufferId,
  excerptRange,
  expectOffset,
  expectPoint,
  mbPoint,
  offset,
  resetCounters,
} from "../helpers.ts";

beforeEach(() => {
  resetCounters();
});

// =============================================================================
// Offset Adjustment (pure function)
// =============================================================================

describe("adjustOffset", () => {
  function edit(off: number, deletedLength: number, insertedLength: number): EditEntry {
    return {
      // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in test
      offset: off as BufferOffset,
      deletedLength,
      insertedLength,
    };
  }

  test("offset before edit unchanged", () => {
    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in test
    const result = adjustOffset(5 as BufferOffset, Bias.Left, [edit(10, 5, 3)]);
    expectOffset(result, 5);
  });

  test("offset after edit shifts by net change", () => {
    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in test
    const result = adjustOffset(20 as BufferOffset, Bias.Left, [edit(10, 5, 3)]);
    // 20 - 5 + 3 = 18
    expectOffset(result, 18);
  });

  test("Bias.Left at insert point stays", () => {
    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in test
    const result = adjustOffset(10 as BufferOffset, Bias.Left, [edit(10, 0, 3)]);
    expectOffset(result, 10);
  });

  test("Bias.Right at insert point moves after", () => {
    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in test
    const result = adjustOffset(10 as BufferOffset, Bias.Right, [edit(10, 0, 3)]);
    expectOffset(result, 13);
  });

  test("offset within deleted range clamps to start", () => {
    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in test
    const result = adjustOffset(15 as BufferOffset, Bias.Left, [edit(10, 10, 0)]);
    expectOffset(result, 10);
  });

  test("offset at end of deleted range clamps to start", () => {
    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in test
    const result = adjustOffset(20 as BufferOffset, Bias.Left, [edit(10, 10, 0)]);
    expectOffset(result, 10);
  });

  test("multiple edits applied sequentially", () => {
    // Start at 10, insert 3 at 5 -> 13, delete 2 at 0 -> 11
    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in test
    const result = adjustOffset(10 as BufferOffset, Bias.Left, [
      edit(5, 0, 3),
      edit(0, 2, 0),
    ]);
    expectOffset(result, 11);
  });
});

// =============================================================================
// Anchor Creation
// =============================================================================

describe("Anchor Creation", () => {
  test("anchor helper has correct structure", () => {
    const a = anchor(5, 100, Bias.Left);

    expect(a.excerptId.index).toBe(5);
    expect(a.excerptId.generation).toBe(0);
    expectOffset(a.textAnchor.offset, 100);
    expect(a.textAnchor.bias).toBe(Bias.Left);
  });

  test("bufferAnchor helper has correct structure", () => {
    const ba = bufferAnchor(50, Bias.Right);

    expectOffset(ba.offset, 50);
    expect(ba.bias).toBe(Bias.Right);
  });

  test("createAnchor from MultiBufferPoint", () => {
    const buf = createBuffer(createBufferId(), "Hello\nWorld\nFoo\nBar");
    const mb = createMultiBuffer();
    const eid = mb.addExcerpt(buf, excerptRange(0, 4));

    // Row 1, col 3 = "Wor|ld" -> offset = "Hello\n" (6) + 3 = 9
    const a = mb.createAnchor(mbPoint(1, 3), Bias.Right);
    expect(a).toBeDefined();
    if (!a) return;

    expect(a.excerptId.index).toBe(eid.index);
    expect(a.excerptId.generation).toBe(eid.generation);
    expectOffset(a.textAnchor.offset, 9);
    expect(a.textAnchor.bias).toBe(Bias.Right);
  });

  test("createAnchor returns undefined for invalid position", () => {
    const buf = createBuffer(createBufferId(), "Hello");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 1));

    const a = mb.createAnchor(mbPoint(10, 0), Bias.Left);
    expect(a).toBeUndefined();
  });
});

// =============================================================================
// Anchor Resolution
// =============================================================================

describe("Anchor Resolution", () => {
  test("resolveAnchor returns current MultiBufferPoint", () => {
    const buf = createBuffer(createBufferId(), "Hello\nWorld\nFoo");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 3));

    const a = mb.createAnchor(mbPoint(1, 3), Bias.Right);
    expect(a).toBeDefined();
    if (!a) return;

    const resolved = mb.snapshot().resolveAnchor(a);
    expect(resolved).toBeDefined();
    if (!resolved) return;
    expectPoint(resolved, 1, 3);
  });

  test("resolveAnchor returns undefined for invalid anchor", () => {
    const buf = createBuffer(createBufferId(), "Hello");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 1));

    const fakeAnchor = anchor(999, 0, Bias.Left);
    expect(mb.snapshot().resolveAnchor(fakeAnchor)).toBeUndefined();
  });

  test("resolveAnchor follows replaced_excerpts chain", () => {
    const buf = createBuffer(createBufferId(), "Line 0\nLine 1\nLine 2\nLine 3");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 4));

    // Create anchor at row 1, col 2
    const a = mb.createAnchor(mbPoint(1, 2), Bias.Right);
    expect(a).toBeDefined();
    if (!a) return;

    // Replace the excerpt — anchor's excerptId is now stale
    mb.setExcerptsForBuffer(buf, [excerptRange(0, 4)]);

    // Should still resolve via replacement chain
    const resolved = mb.snapshot().resolveAnchor(a);
    expect(resolved).toBeDefined();
    if (!resolved) return;
    expectPoint(resolved, 1, 2);
  });
});

// =============================================================================
// Bias Behavior at Insert Position
// =============================================================================

describe("Anchor Bias - Insert Behavior", () => {
  test("Bias.Left anchor stays left of inserted text", () => {
    const buf = createBuffer(createBufferId(), "Hello World");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 1));

    const a = mb.createAnchor(mbPoint(0, 5), Bias.Left);
    expect(a).toBeDefined();
    if (!a) return;

    buf.insert(offset(5), "ABC");

    const resolved = mb.snapshot().resolveAnchor(a);
    expect(resolved).toBeDefined();
    if (!resolved) return;
    expectPoint(resolved, 0, 5);
  });

  test("Bias.Right anchor moves right of inserted text", () => {
    const buf = createBuffer(createBufferId(), "Hello World");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 1));

    const a = mb.createAnchor(mbPoint(0, 5), Bias.Right);
    expect(a).toBeDefined();
    if (!a) return;

    buf.insert(offset(5), "ABC");

    const resolved = mb.snapshot().resolveAnchor(a);
    expect(resolved).toBeDefined();
    if (!resolved) return;
    expectPoint(resolved, 0, 8);
  });

  test("Bias.Left anchor unaffected by insert after", () => {
    const buf = createBuffer(createBufferId(), "Hello World");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 1));

    const a = mb.createAnchor(mbPoint(0, 5), Bias.Left);
    expect(a).toBeDefined();
    if (!a) return;

    buf.insert(offset(8), "XYZ");

    const resolved = mb.snapshot().resolveAnchor(a);
    expect(resolved).toBeDefined();
    if (!resolved) return;
    expectPoint(resolved, 0, 5);
  });

  test("Bias.Right anchor unaffected by insert after", () => {
    const buf = createBuffer(createBufferId(), "Hello World");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 1));

    const a = mb.createAnchor(mbPoint(0, 5), Bias.Right);
    expect(a).toBeDefined();
    if (!a) return;

    buf.insert(offset(8), "XYZ");

    const resolved = mb.snapshot().resolveAnchor(a);
    expect(resolved).toBeDefined();
    if (!resolved) return;
    expectPoint(resolved, 0, 5);
  });

  test("Both biases shift for insert before", () => {
    const buf = createBuffer(createBufferId(), "Hello World");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 1));

    const aLeft = mb.createAnchor(mbPoint(0, 10), Bias.Left);
    const aRight = mb.createAnchor(mbPoint(0, 10), Bias.Right);
    expect(aLeft).toBeDefined();
    expect(aRight).toBeDefined();
    if (!aLeft || !aRight) return;

    buf.insert(offset(5), "XYZ");

    const snap = mb.snapshot();
    const rLeft = snap.resolveAnchor(aLeft);
    const rRight = snap.resolveAnchor(aRight);
    expect(rLeft).toBeDefined();
    expect(rRight).toBeDefined();
    if (!rLeft || !rRight) return;
    expectPoint(rLeft, 0, 13);
    expectPoint(rRight, 0, 13);
  });
});

// =============================================================================
// Bias Behavior at Delete Position
// =============================================================================

describe("Anchor Bias - Delete Behavior", () => {
  test("anchor before deleted range unchanged", () => {
    const buf = createBuffer(createBufferId(), "0123456789ABCDEFGHIJ");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 1));

    const a = mb.createAnchor(mbPoint(0, 5), Bias.Left);
    expect(a).toBeDefined();
    if (!a) return;

    buf.delete(offset(10), offset(20));

    const resolved = mb.snapshot().resolveAnchor(a);
    expect(resolved).toBeDefined();
    if (!resolved) return;
    expectPoint(resolved, 0, 5);
  });

  test("anchor after deleted range shifts", () => {
    // 25 chars on one line
    const buf = createBuffer(createBufferId(), "0123456789ABCDEFGHIJklmno");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 1));

    // Anchor at column 24
    const a = mb.createAnchor(mbPoint(0, 24), Bias.Left);
    expect(a).toBeDefined();
    if (!a) return;

    // Delete 10 chars from offset 10-20
    buf.delete(offset(10), offset(20));

    const resolved = mb.snapshot().resolveAnchor(a);
    expect(resolved).toBeDefined();
    if (!resolved) return;
    // 24 - 10 = 14
    expectPoint(resolved, 0, 14);
  });

  test("anchor within deleted range clamps to start", () => {
    const buf = createBuffer(createBufferId(), "0123456789ABCDEFGHIJ");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 1));

    const a = mb.createAnchor(mbPoint(0, 15), Bias.Left);
    expect(a).toBeDefined();
    if (!a) return;

    buf.delete(offset(10), offset(20));

    const resolved = mb.snapshot().resolveAnchor(a);
    expect(resolved).toBeDefined();
    if (!resolved) return;
    expectPoint(resolved, 0, 10);
  });

  test("Bias.Left at delete end stays at delete start", () => {
    const buf = createBuffer(createBufferId(), "0123456789ABCDEFGHIJ");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 1));

    const a = mb.createAnchor(mbPoint(0, 20), Bias.Left);
    expect(a).toBeDefined();
    if (!a) return;

    buf.delete(offset(10), offset(20));

    const resolved = mb.snapshot().resolveAnchor(a);
    expect(resolved).toBeDefined();
    if (!resolved) return;
    expectPoint(resolved, 0, 10);
  });

  test("Bias.Right at delete start moves to delete start", () => {
    const buf = createBuffer(createBufferId(), "0123456789ABCDEFGHIJ");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 1));

    const a = mb.createAnchor(mbPoint(0, 10), Bias.Right);
    expect(a).toBeDefined();
    if (!a) return;

    buf.delete(offset(10), offset(20));

    const resolved = mb.snapshot().resolveAnchor(a);
    expect(resolved).toBeDefined();
    if (!resolved) return;
    expectPoint(resolved, 0, 10);
  });
});

// =============================================================================
// Bias at Excerpt Boundaries
// =============================================================================

describe("Anchor Bias - Excerpt Boundaries", () => {
  test.todo("Bias.Left at excerpt end stays in current excerpt", () => {
    // Depends on bias-aware excerptAt
  });

  test.todo("Bias.Right at excerpt start stays in current excerpt", () => {
    // Depends on bias-aware excerptAt
  });

  test.todo("clipping preserves bias at excerpt boundary", () => {
    // Depends on bias-aware excerptAt
  });
});

// =============================================================================
// Anchor Survival Through Buffer Edits
// =============================================================================

describe("Anchor Survival - Buffer Edits", () => {
  test("anchor survives multiple sequential edits", () => {
    const buf = createBuffer(createBufferId(), "ABCDEFGHIJKLMNOP");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 1));

    const a = mb.createAnchor(mbPoint(0, 8), Bias.Right);
    expect(a).toBeDefined();
    if (!a) return;

    // Edit 1: insert "XX" at offset 2 -> anchor shifts from 8 to 10
    buf.insert(offset(2), "XX");
    // Edit 2: insert "YY" at offset 20 (after anchor at 10) -> stays 10
    buf.insert(offset(20), "YY");
    // Edit 3: delete offsets 0-2 -> anchor shifts from 10 to 8
    buf.delete(offset(0), offset(2));

    const resolved = mb.snapshot().resolveAnchor(a);
    expect(resolved).toBeDefined();
    if (!resolved) return;
    expectPoint(resolved, 0, 8);
  });

  test("anchor survives edit in different excerpt", () => {
    const buf1 = createBuffer(createBufferId(), "Buffer One");
    const buf2 = createBuffer(createBufferId(), "Buffer Two");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf1, excerptRange(0, 1));
    mb.addExcerpt(buf2, excerptRange(0, 1));

    // Anchor in excerpt from buf1
    const a = mb.createAnchor(mbPoint(0, 5), Bias.Right);
    expect(a).toBeDefined();
    if (!a) return;

    // Edit buf2 — should not affect anchor in buf1
    buf2.insert(offset(0), "XXXX");

    const resolved = mb.snapshot().resolveAnchor(a);
    expect(resolved).toBeDefined();
    if (!resolved) return;
    expectPoint(resolved, 0, 5);
  });

  test("anchor survives edit in same buffer different excerpt", () => {
    // Buffer with 4 lines, two excerpts from same buffer
    const buf = createBuffer(createBufferId(), "Line 0\nLine 1\nLine 2\nLine 3");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 2)); // lines 0-1, mb rows 0-1
    mb.addExcerpt(buf, excerptRange(2, 4)); // lines 2-3, mb rows 2-3

    // Anchor in first excerpt at row 0, col 3 -> buffer offset 3
    const a = mb.createAnchor(mbPoint(0, 3), Bias.Right);
    expect(a).toBeDefined();
    if (!a) return;

    // Insert text at buffer offset 20 (in Line 2/3 range, affects second excerpt)
    buf.insert(offset(20), "XX");

    // Anchor in first excerpt should be unaffected (offset 3 < 20)
    const resolved = mb.snapshot().resolveAnchor(a);
    expect(resolved).toBeDefined();
    if (!resolved) return;
    expectPoint(resolved, 0, 3);
  });
});

// =============================================================================
// Anchor Survival Through Excerpt Operations
// =============================================================================

describe("Anchor Survival - Excerpt Operations", () => {
  test.todo("anchor survives excerpt expansion", () => {
    // Depends on expandExcerpt
  });

  test("anchor survives unrelated excerpt removal", () => {
    const buf1 = createBuffer(createBufferId(), "First");
    const buf2 = createBuffer(createBufferId(), "Second");
    const mb = createMultiBuffer();
    const eid1 = mb.addExcerpt(buf1, excerptRange(0, 1));
    mb.addExcerpt(buf2, excerptRange(0, 1));

    // Anchor in second excerpt (row 1)
    const a = mb.createAnchor(mbPoint(1, 3), Bias.Right);
    expect(a).toBeDefined();
    if (!a) return;

    // Remove first excerpt — anchor's excerpt still exists
    mb.removeExcerpt(eid1);

    // Anchor should still resolve (now at row 0 since first excerpt gone)
    const resolved = mb.snapshot().resolveAnchor(a);
    expect(resolved).toBeDefined();
    if (!resolved) return;
    expectPoint(resolved, 0, 3);
  });

  test("anchor survives excerpt replacement", () => {
    const buf = createBuffer(createBufferId(), "ABCDE\nFGHIJ\nKLMNO");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 3));

    const a = mb.createAnchor(mbPoint(1, 2), Bias.Right);
    expect(a).toBeDefined();
    if (!a) return;

    // Replace with two smaller excerpts
    mb.setExcerptsForBuffer(buf, [
      excerptRange(0, 2),
      excerptRange(2, 3),
    ]);

    // Anchor was at buffer row 1 col 2 — now in first new excerpt, mb row 1 col 2
    const resolved = mb.snapshot().resolveAnchor(a);
    expect(resolved).toBeDefined();
    if (!resolved) return;
    expectPoint(resolved, 1, 2);
  });

  test("anchor follows multi-step replacement chain", () => {
    const buf = createBuffer(createBufferId(), "Line 0\nLine 1\nLine 2\nLine 3");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 4));

    const a = mb.createAnchor(mbPoint(2, 3), Bias.Right);
    expect(a).toBeDefined();
    if (!a) return;

    // Replace 1: original → new set A
    mb.setExcerptsForBuffer(buf, [excerptRange(0, 4)]);
    // Replace 2: set A → new set B
    mb.setExcerptsForBuffer(buf, [excerptRange(0, 4)]);

    // Anchor should follow chain: original → A → B
    const resolved = mb.snapshot().resolveAnchor(a);
    expect(resolved).toBeDefined();
    if (!resolved) return;
    expectPoint(resolved, 2, 3);
  });

  test("anchor returns undefined when excerpt fully removed", () => {
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

// =============================================================================
// Anchor Comparison
// =============================================================================

describe("Anchor Comparison", () => {
  test("anchors at same position are equal", () => {
    const a1 = anchor(0, 10, Bias.Left);
    const a2 = anchor(0, 10, Bias.Left);
    expect(anchorsEqual(a1, a2)).toBe(true);
  });

  test("anchors with different bias are not equal", () => {
    const a1 = anchor(0, 10, Bias.Left);
    const a2 = anchor(0, 10, Bias.Right);
    expect(anchorsEqual(a1, a2)).toBe(false);
  });

  test("anchors can be sorted by position", () => {
    const anchors = [
      anchor(1, 20, Bias.Left),
      anchor(0, 5, Bias.Right),
      anchor(0, 10, Bias.Left),
      anchor(1, 5, Bias.Left),
    ];
    anchors.sort(compareAnchors);

    // Sorted: excerpt 0 offset 5, excerpt 0 offset 10, excerpt 1 offset 5, excerpt 1 offset 20
    expect(anchors[0]?.excerptId.index).toBe(0);
    expectOffset(anchors[0]?.textAnchor.offset ?? offset(0), 5);
    expect(anchors[1]?.excerptId.index).toBe(0);
    expectOffset(anchors[1]?.textAnchor.offset ?? offset(0), 10);
    expect(anchors[2]?.excerptId.index).toBe(1);
    expectOffset(anchors[2]?.textAnchor.offset ?? offset(0), 5);
    expect(anchors[3]?.excerptId.index).toBe(1);
    expectOffset(anchors[3]?.textAnchor.offset ?? offset(0), 20);
  });
});

// =============================================================================
// AnchorRange
// =============================================================================

describe("AnchorRange", () => {
  test("AnchorRange tracks both ends independently", () => {
    const buf = createBuffer(createBufferId(), "0123456789ABCDEFGHIJ");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 1));

    const startAnchor = mb.createAnchor(mbPoint(0, 5), Bias.Right);
    const endAnchor = mb.createAnchor(mbPoint(0, 15), Bias.Right);
    expect(startAnchor).toBeDefined();
    expect(endAnchor).toBeDefined();
    if (!startAnchor || !endAnchor) return;

    const range = createAnchorRange(startAnchor, endAnchor);

    // Insert before both -> both shift
    buf.insert(offset(2), "XX");

    const resolved = resolveAnchorRange(mb.snapshot(), range);
    expect(resolved).toBeDefined();
    if (!resolved) return;
    expectPoint(resolved.start, 0, 7);
    expectPoint(resolved.end, 0, 17);
  });

  test("AnchorRange survives edits within range", () => {
    const buf = createBuffer(createBufferId(), "0123456789ABCDEFGHIJ");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 1));

    const startAnchor = mb.createAnchor(mbPoint(0, 10), Bias.Right);
    const endAnchor = mb.createAnchor(mbPoint(0, 20), Bias.Right);
    expect(startAnchor).toBeDefined();
    expect(endAnchor).toBeDefined();
    if (!startAnchor || !endAnchor) return;

    const range = createAnchorRange(startAnchor, endAnchor);

    // Insert "XXX" at offset 15 (within range)
    buf.insert(offset(15), "XXX");

    const resolved = resolveAnchorRange(mb.snapshot(), range);
    expect(resolved).toBeDefined();
    if (!resolved) return;
    // Start is Right-biased at 10 -> insert at 15 is after -> start stays at 10?
    // No: Bias.Right at 10, insert at 15 > 10, so offset is after edit? No, 10 < 15 so offset is before edit.
    // Actually: anchor offset is 10, edit is at 15. 10 < 15, so unchanged.
    expectPoint(resolved.start, 0, 10);
    // End: offset 20, insert 3 at 15 -> 20 is after edit end (15) -> 20 + 3 = 23
    expectPoint(resolved.end, 0, 23);
  });

  test("AnchorRange collapses when content deleted", () => {
    const buf = createBuffer(createBufferId(), "0123456789ABCDEFGHIJ01234");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 1));

    const startAnchor = mb.createAnchor(mbPoint(0, 10), Bias.Right);
    const endAnchor = mb.createAnchor(mbPoint(0, 20), Bias.Right);
    expect(startAnchor).toBeDefined();
    expect(endAnchor).toBeDefined();
    if (!startAnchor || !endAnchor) return;

    const range = createAnchorRange(startAnchor, endAnchor);

    // Delete range 8-22 (encompasses both anchors)
    buf.delete(offset(8), offset(22));

    const resolved = resolveAnchorRange(mb.snapshot(), range);
    expect(resolved).toBeDefined();
    if (!resolved) return;
    // Both anchors (10 and 20) are within [8, 22]
    // Start: offset 10, Bias.Right, at editStart=8? No, 10 > 8 and 10 < 22 so within range
    // 10 != 8 so doesn't match editStart check -> clamps to 8
    expectPoint(resolved.start, 0, 8);
    // End: offset 20, within [8, 22], 20 != 8 -> clamps to 8
    expectPoint(resolved.end, 0, 8);
  });
});

// =============================================================================
// Selection
// =============================================================================

describe("Selection", () => {
  test("Selection has head at start or end", () => {
    const a1 = anchor(0, 5, Bias.Right);
    const a2 = anchor(0, 15, Bias.Right);
    const range = createAnchorRange(a1, a2);

    const selStart = createSelection(range, "start");
    expect(selStart.head).toBe("start");

    const selEnd = createSelection(range, "end");
    expect(selEnd.head).toBe("end");
  });

  test("Selection range survives edits", () => {
    const buf = createBuffer(createBufferId(), "0123456789ABCDEFGHIJ");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 1));

    const startAnchor = mb.createAnchor(mbPoint(0, 5), Bias.Right);
    const endAnchor = mb.createAnchor(mbPoint(0, 15), Bias.Right);
    expect(startAnchor).toBeDefined();
    expect(endAnchor).toBeDefined();
    if (!startAnchor || !endAnchor) return;

    const sel = createSelection(createAnchorRange(startAnchor, endAnchor), "end");

    buf.insert(offset(0), "PRE");

    const resolved = resolveAnchorRange(mb.snapshot(), sel.range);
    expect(resolved).toBeDefined();
    if (!resolved) return;
    expectPoint(resolved.start, 0, 8);
    expectPoint(resolved.end, 0, 18);
    expect(sel.head).toBe("end");
  });

  test("Selection can be reversed", () => {
    const a1 = anchor(0, 5, Bias.Right);
    const a2 = anchor(0, 15, Bias.Right);
    const range = createAnchorRange(a1, a2);

    const sel = createSelection(range, "start");
    const reversed = reverseSelection(sel);
    expect(reversed.head).toBe("end");
    expect(reversed.range).toBe(sel.range);
  });
});

// =============================================================================
// Batch Anchor Resolution (Performance - deferred)
// =============================================================================

describe("Batch Anchor Resolution", () => {
  test.todo("batch resolution reuses cursor state", () => {
    // Optimization: sequential anchors should use seek_forward
  });

  test.todo("batch resolution groups by excerpt", () => {
    // Optimization: anchors from same excerpt resolved together
  });
});
