/**
 * MultiBuffer tests - written BEFORE implementation.
 *
 * A MultiBuffer presents multiple excerpts as a unified scrollable view.
 *
 * Key patterns
 * - 3-layer position translation: MultiBuffer → Excerpt → Buffer
 * - Binary search for excerptAt (O(log n))
 * - Singleton optimization for single-buffer case
 * - replaced_excerpts map for anchor survival
 * - Snapshot pattern for immutable concurrent reads
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { createBuffer } from "../../src/multibuffer/buffer.ts";
import { createMultiBuffer } from "../../src/multibuffer/multibuffer.ts";
import {
  Bias,
  benchmark,
  createBufferId,
  excerptRange,
  expectPoint,
  generateText,
  mbPoint,
  mbRow,
  num,
  point,
  resetCounters,
  time,
} from "../helpers.ts";

beforeEach(() => {
  resetCounters();
});

// =============================================================================
// MultiBuffer Creation
// =============================================================================

describe("MultiBuffer Creation", () => {
  test("creates empty multibuffer", () => {
    const mb = createMultiBuffer();
    expect(mb.lineCount).toBe(0);
    expect(mb.excerpts).toEqual([]);
    expect(mb.isSingleton).toBe(false);
  });

  test("creates multibuffer with single excerpt", () => {
    const mb = createMultiBuffer();
    const buffer = createBuffer(createBufferId(), generateText(10));
    mb.addExcerpt(buffer, excerptRange(0, 10));
    expect(mb.lineCount).toBe(10);
    expect(mb.excerpts.length).toBe(1);
    expect(mb.isSingleton).toBe(true);
  });

  test("singleton flag is true for single buffer single excerpt", () => {
    const mb = createMultiBuffer();
    const buffer = createBuffer(createBufferId(), generateText(5));
    mb.addExcerpt(buffer, excerptRange(0, 5));
    expect(mb.isSingleton).toBe(true);
  });

  test("singleton flag becomes false with multiple excerpts", () => {
    const mb = createMultiBuffer();
    const buffer = createBuffer(createBufferId(), generateText(20));
    mb.addExcerpt(buffer, excerptRange(0, 10));
    expect(mb.isSingleton).toBe(true);

    mb.addExcerpt(buffer, excerptRange(10, 20));
    expect(mb.isSingleton).toBe(false);
  });

  test("singleton flag becomes false with multiple buffers", () => {
    const mb = createMultiBuffer();
    const buf1 = createBuffer(createBufferId(), generateText(5));
    const buf2 = createBuffer(createBufferId(), generateText(5));
    mb.addExcerpt(buf1, excerptRange(0, 5));
    expect(mb.isSingleton).toBe(true);

    mb.addExcerpt(buf2, excerptRange(0, 5));
    expect(mb.isSingleton).toBe(false);
  });
});

// =============================================================================
// Multiple Excerpts
// =============================================================================

describe("MultiBuffer - Multiple Excerpts", () => {
  test("line count is sum of excerpt line counts", () => {
    const mb = createMultiBuffer();
    const buffer = createBuffer(createBufferId(), generateText(100));
    mb.addExcerpt(buffer, excerptRange(0, 10));
    mb.addExcerpt(buffer, excerptRange(20, 40));
    mb.addExcerpt(buffer, excerptRange(50, 65));
    expect(mb.lineCount).toBe(10 + 20 + 15);
  });

  test("excerpts are ordered by addition order", () => {
    const mb = createMultiBuffer();
    const buffer = createBuffer(createBufferId(), generateText(30));
    const idA = mb.addExcerpt(buffer, excerptRange(0, 10));
    const idB = mb.addExcerpt(buffer, excerptRange(10, 20));
    const idC = mb.addExcerpt(buffer, excerptRange(20, 30));

    expect(mb.excerpts.length).toBe(3);
    expect(mb.excerpts[0]?.id).toEqual(idA);
    expect(mb.excerpts[1]?.id).toEqual(idB);
    expect(mb.excerpts[2]?.id).toEqual(idC);
  });

  test("removing excerpt updates line count", () => {
    const mb = createMultiBuffer();
    const buffer = createBuffer(createBufferId(), generateText(50));
    mb.addExcerpt(buffer, excerptRange(0, 10));
    const idB = mb.addExcerpt(buffer, excerptRange(10, 30));
    mb.addExcerpt(buffer, excerptRange(30, 45));
    expect(mb.lineCount).toBe(10 + 20 + 15);

    mb.removeExcerpt(idB);
    expect(mb.lineCount).toBe(10 + 15);
  });

  test("removing excerpt updates subsequent excerpt start rows", () => {
    const mb = createMultiBuffer();
    const buffer = createBuffer(createBufferId(), generateText(50));
    mb.addExcerpt(buffer, excerptRange(0, 10)); // rows 0-9
    const idB = mb.addExcerpt(buffer, excerptRange(10, 30)); // rows 10-29
    mb.addExcerpt(buffer, excerptRange(30, 45)); // rows 30-44

    mb.removeExcerpt(idB);

    // Excerpt C should now start at row 10 (was 30)
    expect(mb.excerpts.length).toBe(2);
    expect(num(mb.excerpts[1]?.startRow ?? mbRow(0))).toBe(10);
    expect(num(mb.excerpts[1]?.endRow ?? mbRow(0))).toBe(25);
  });

  test("removing first excerpt shifts all rows", () => {
    const mb = createMultiBuffer();
    const buffer = createBuffer(createBufferId(), generateText(30));
    const idA = mb.addExcerpt(buffer, excerptRange(0, 10));
    mb.addExcerpt(buffer, excerptRange(10, 30));

    mb.removeExcerpt(idA);

    expect(mb.excerpts.length).toBe(1);
    expect(num(mb.excerpts[0]?.startRow ?? mbRow(-1))).toBe(0);
    expect(num(mb.excerpts[0]?.endRow ?? mbRow(-1))).toBe(20);
  });

  test("removing last excerpt doesn't affect others", () => {
    const mb = createMultiBuffer();
    const buffer = createBuffer(createBufferId(), generateText(30));
    mb.addExcerpt(buffer, excerptRange(0, 10));
    const idB = mb.addExcerpt(buffer, excerptRange(10, 30));

    mb.removeExcerpt(idB);

    expect(mb.excerpts.length).toBe(1);
    expect(num(mb.excerpts[0]?.startRow ?? mbRow(-1))).toBe(0);
    expect(num(mb.excerpts[0]?.endRow ?? mbRow(-1))).toBe(10);
  });
});

// =============================================================================
// Row Navigation (Binary Search)
// =============================================================================

describe("MultiBuffer - Row Navigation", () => {
  test("excerptAt returns correct excerpt for row", () => {
    const mb = createMultiBuffer();
    const buffer = createBuffer(createBufferId(), generateText(30));
    const idA = mb.addExcerpt(buffer, excerptRange(0, 10)); // rows 0-9
    const idB = mb.addExcerpt(buffer, excerptRange(10, 30)); // rows 10-29

    const snap = mb.snapshot();
    const atRow5 = snap.excerptAt(mbRow(5));
    const atRow15 = snap.excerptAt(mbRow(15));

    expect(atRow5?.id).toEqual(idA);
    expect(atRow15?.id).toEqual(idB);
  });

  test("excerptAt returns correct excerpt at boundaries", () => {
    const mb = createMultiBuffer();
    const buffer = createBuffer(createBufferId(), generateText(30));
    const idA = mb.addExcerpt(buffer, excerptRange(0, 10)); // rows 0-9
    const idB = mb.addExcerpt(buffer, excerptRange(10, 30)); // rows 10-29

    const snap = mb.snapshot();
    expect(snap.excerptAt(mbRow(0))?.id).toEqual(idA);
    expect(snap.excerptAt(mbRow(9))?.id).toEqual(idA);
    expect(snap.excerptAt(mbRow(10))?.id).toEqual(idB);
  });

  test("excerptAt returns undefined for out of bounds", () => {
    const mb = createMultiBuffer();
    const buffer = createBuffer(createBufferId(), generateText(10));
    mb.addExcerpt(buffer, excerptRange(0, 10));

    const snap = mb.snapshot();
    expect(snap.excerptAt(mbRow(10))).toBeUndefined();
    expect(snap.excerptAt(mbRow(11))).toBeUndefined();
  });

  test("excerptAt returns undefined for negative row", () => {
    const mb = createMultiBuffer();
    const buffer = createBuffer(createBufferId(), generateText(10));
    mb.addExcerpt(buffer, excerptRange(0, 10));

    const snap = mb.snapshot();
    expect(snap.excerptAt(mbRow(-1))).toBeUndefined();
  });

  test("excerptAt uses binary search (O(log n))", () => {
    const mb = createMultiBuffer();
    const buffer = createBuffer(createBufferId(), generateText(10_000));
    for (let i = 0; i < 1000; i++) {
      mb.addExcerpt(buffer, excerptRange(i * 10, i * 10 + 10));
    }
    const snap = mb.snapshot();

    const early = benchmark(() => snap.excerptAt(mbRow(50)), 1000);
    const late = benchmark(() => snap.excerptAt(mbRow(9950)), 1000);

    // Binary search: late lookup should be within 3x of early
    expect(late.avgMs).toBeLessThan(early.avgMs * 3 + 0.001);
  });
});

// =============================================================================
// Position Conversion (3-Layer Model)
// =============================================================================

describe("MultiBuffer - Position Conversion", () => {
  test("toBufferPoint converts multibuffer position to buffer position", () => {
    const mb = createMultiBuffer();
    const buffer = createBuffer(createBufferId(), generateText(100));
    mb.addExcerpt(buffer, excerptRange(50, 60)); // rows 0-9 → buffer 50-59
    mb.addExcerpt(buffer, excerptRange(80, 100)); // rows 10-29 → buffer 80-99

    const snap = mb.snapshot();
    const result = snap.toBufferPoint(mbPoint(5, 3));
    if (!result) throw new Error("expected result");
    expectPoint(result.point, 55, 3);
  });

  test("toBufferPoint returns undefined for invalid position", () => {
    const mb = createMultiBuffer();
    const buffer = createBuffer(createBufferId(), generateText(10));
    mb.addExcerpt(buffer, excerptRange(0, 10));

    const snap = mb.snapshot();
    expect(snap.toBufferPoint(mbPoint(20, 0))).toBeUndefined();
  });

  test("toMultiBufferPoint converts buffer position to multibuffer position", () => {
    const mb = createMultiBuffer();
    const buffer = createBuffer(createBufferId(), generateText(100));
    mb.addExcerpt(buffer, excerptRange(50, 60)); // mb rows 0-9
    const idB = mb.addExcerpt(buffer, excerptRange(80, 100)); // mb rows 10-29

    const snap = mb.snapshot();
    const result = snap.toMultiBufferPoint(idB, point(85, 3));
    if (!result) throw new Error("expected result");
    expectPoint(result, 15, 3); // 85 - 80 = 5 offset, + 10 start = row 15
  });

  test("toMultiBufferPoint returns undefined for position outside excerpt", () => {
    const mb = createMultiBuffer();
    const buffer = createBuffer(createBufferId(), generateText(100));
    const id = mb.addExcerpt(buffer, excerptRange(50, 60));

    const snap = mb.snapshot();
    // Buffer row 45 is before the excerpt range
    expect(snap.toMultiBufferPoint(id, point(45, 0))).toBeUndefined();
  });

  test("toMultiBufferPoint returns undefined for unknown excerpt", () => {
    const mb = createMultiBuffer();
    const buffer = createBuffer(createBufferId(), generateText(10));
    mb.addExcerpt(buffer, excerptRange(0, 10));

    const snap = mb.snapshot();
    // Fabricate a non-existent excerpt ID
    const fakeId = { index: 999, generation: 0 };
    // biome-ignore lint/plugin/no-type-assertion: expect: test fabrication of branded ExcerptId
    expect(snap.toMultiBufferPoint(fakeId as never, point(0, 0))).toBeUndefined();
  });

  test("position conversion roundtrip", () => {
    const mb = createMultiBuffer();
    const buffer = createBuffer(createBufferId(), generateText(50));
    mb.addExcerpt(buffer, excerptRange(10, 20)); // mb rows 0-9
    mb.addExcerpt(buffer, excerptRange(30, 50)); // mb rows 10-29

    const snap = mb.snapshot();
    const testPoints = [mbPoint(0, 0), mbPoint(5, 3), mbPoint(10, 0), mbPoint(25, 2)];

    for (const p of testPoints) {
      const bufResult = snap.toBufferPoint(p);
      if (!bufResult) throw new Error(`expected bufResult for ${num(p.row)},${p.column}`);
      const mbResult = snap.toMultiBufferPoint(bufResult.excerpt.id, bufResult.point);
      if (!mbResult) throw new Error(`expected mbResult for ${num(p.row)},${p.column}`);
      expectPoint(mbResult, num(p.row), p.column);
    }
  });

  test("position conversion handles excerpt with offset", () => {
    const mb = createMultiBuffer();
    // Buffer with 200 lines, excerpt covers rows 100-200
    const buffer = createBuffer(createBufferId(), generateText(200));
    mb.addExcerpt(buffer, excerptRange(100, 200)); // mb rows 0-99

    const snap = mb.snapshot();
    const result = snap.toBufferPoint(mbPoint(50, 0));
    if (!result) throw new Error("expected result");
    expectPoint(result.point, 150, 0); // 100 + 50 = 150
  });
});

// =============================================================================
// Line Access Across Excerpts
// =============================================================================

describe("MultiBuffer - Line Access", () => {
  test("lines() returns lines from single excerpt", () => {
    const mb = createMultiBuffer();
    const buffer = createBuffer(createBufferId(), "A\nB\nC\nD\nE");
    mb.addExcerpt(buffer, excerptRange(0, 5));

    const snap = mb.snapshot();
    expect(snap.lines(mbRow(1), mbRow(4))).toEqual(["B", "C", "D"]);
  });

  test("lines() returns lines across excerpt boundary", () => {
    const mb = createMultiBuffer();
    const buf1 = createBuffer(createBufferId(), "A1\nA2\nA3");
    const buf2 = createBuffer(createBufferId(), "B1\nB2\nB3");
    mb.addExcerpt(buf1, excerptRange(0, 3)); // mb rows 0-2
    mb.addExcerpt(buf2, excerptRange(0, 3)); // mb rows 3-5

    const snap = mb.snapshot();
    expect(snap.lines(mbRow(1), mbRow(5))).toEqual(["A2", "A3", "B1", "B2"]);
  });

  test("lines() returns lines across multiple excerpts", () => {
    const mb = createMultiBuffer();
    const buf1 = createBuffer(createBufferId(), "A1\nA2\nA3");
    const buf2 = createBuffer(createBufferId(), "B1\nB2\nB3");
    const buf3 = createBuffer(createBufferId(), "C1\nC2\nC3");
    mb.addExcerpt(buf1, excerptRange(0, 3)); // mb rows 0-2
    mb.addExcerpt(buf2, excerptRange(0, 3)); // mb rows 3-5
    mb.addExcerpt(buf3, excerptRange(0, 3)); // mb rows 6-8

    const snap = mb.snapshot();
    expect(snap.lines(mbRow(2), mbRow(8))).toEqual([
      "A3", "B1", "B2", "B3", "C1", "C2",
    ]);
  });

  test("lines() handles empty range", () => {
    const mb = createMultiBuffer();
    const buffer = createBuffer(createBufferId(), "A\nB\nC");
    mb.addExcerpt(buffer, excerptRange(0, 3));

    const snap = mb.snapshot();
    expect(snap.lines(mbRow(1), mbRow(1))).toEqual([]);
  });

  test("lines() clamps to valid range", () => {
    const mb = createMultiBuffer();
    const buffer = createBuffer(createBufferId(), "A\nB\nC");
    mb.addExcerpt(buffer, excerptRange(0, 3));

    const snap = mb.snapshot();
    const result = snap.lines(mbRow(0), mbRow(100));
    expect(result).toEqual(["A", "B", "C"]);
  });
});

// =============================================================================
// Clipping with Bias
// =============================================================================

describe("MultiBuffer - Clipping", () => {
  test("clipPoint clamps to valid multibuffer position", () => {
    const mb = createMultiBuffer();
    const buffer = createBuffer(createBufferId(), "Hello\nWorld");
    mb.addExcerpt(buffer, excerptRange(0, 2));

    const snap = mb.snapshot();
    const clipped = snap.clipPoint(mbPoint(10, 0), Bias.Right);
    // Past end → clamp to end of last line
    expectPoint(clipped, 1, 5);
  });

  test.todo("clipPoint respects Bias.Left at boundaries", () => {
    // GOTCHA: Must preserve bias semantics through the 3-layer conversion
  });

  test.todo("clipPoint respects Bias.Right at boundaries", () => {
    // At excerpt boundary, Bias.Right should prefer next excerpt
  });

  test.todo("clipPoint at excerpt boundary with Bias.Left", () => {
    // At row 10 (start of excerpt B), Bias.Left -> end of excerpt A
  });

  test.todo("clipPoint at excerpt boundary with Bias.Right", () => {
    // At row 10 (start of excerpt B), Bias.Right -> start of excerpt B
  });
});

// =============================================================================
// Anchor Operations
// =============================================================================

describe("MultiBuffer - Anchors", () => {
  test.todo("createAnchor returns anchor for valid position", () => {});
  test.todo("createAnchor returns undefined for invalid position", () => {});
  test.todo("anchor stores correct excerpt ID", () => {});
  test.todo("anchor stores correct buffer offset", () => {});
  test.todo("resolveAnchor returns current position", () => {});
  test.todo("resolveAnchor follows replaced_excerpts chain", () => {});
});

// =============================================================================
// Anchor Survival Through Edits
// =============================================================================

describe("MultiBuffer - Anchor Survival", () => {
  test.todo("anchor survives insert before anchor", () => {});
  test.todo("anchor survives insert after anchor", () => {});
  test.todo("anchor with Bias.Left at insert position stays left", () => {});
  test.todo("anchor with Bias.Right at insert position moves right", () => {});
  test.todo("anchor survives delete that doesn't include anchor", () => {});
  test.todo("anchor at deleted position resolves to boundary", () => {});
});

// =============================================================================
// Anchor Survival Through Excerpt Replacement
// =============================================================================

describe("MultiBuffer - Anchor Survival Through Replacement", () => {
  test.todo("anchor survives excerpt replacement", () => {});
  test.todo("anchor follows replacement chain", () => {});
  test.todo("anchor degrades when excerpt removed without replacement", () => {});
});

// =============================================================================
// Excerpt Boundaries
// =============================================================================

describe("MultiBuffer - Excerpt Boundaries", () => {
  test("excerptBoundaries returns boundaries in viewport", () => {
    const mb = createMultiBuffer();
    const buf1 = createBuffer(createBufferId(), generateText(10));
    const buf2 = createBuffer(createBufferId(), generateText(10));
    const buf3 = createBuffer(createBufferId(), generateText(10));
    mb.addExcerpt(buf1, excerptRange(0, 10)); // rows 0-9
    mb.addExcerpt(buf2, excerptRange(0, 10)); // rows 10-19
    mb.addExcerpt(buf3, excerptRange(0, 10)); // rows 20-29

    const snap = mb.snapshot();
    // Viewport rows 8-25 should include boundaries at row 10 and 20
    const boundaries = snap.excerptBoundaries(mbRow(8), mbRow(25));
    expect(boundaries.length).toBe(2);
    expect(num(boundaries[0]?.row ?? mbRow(-1))).toBe(10);
    expect(num(boundaries[1]?.row ?? mbRow(-1))).toBe(20);
  });

  test("excerptBoundaries includes boundary at start of viewport", () => {
    const mb = createMultiBuffer();
    const buf1 = createBuffer(createBufferId(), generateText(10));
    const buf2 = createBuffer(createBufferId(), generateText(10));
    mb.addExcerpt(buf1, excerptRange(0, 10)); // rows 0-9
    mb.addExcerpt(buf2, excerptRange(0, 10)); // rows 10-19

    const snap = mb.snapshot();
    const boundaries = snap.excerptBoundaries(mbRow(10), mbRow(15));
    expect(boundaries.length).toBe(1);
    expect(num(boundaries[0]?.row ?? mbRow(-1))).toBe(10);
  });

  test("excerptBoundaries prev is undefined for first excerpt", () => {
    const mb = createMultiBuffer();
    const buffer = createBuffer(createBufferId(), generateText(10));
    mb.addExcerpt(buffer, excerptRange(0, 10));

    const snap = mb.snapshot();
    const boundaries = snap.excerptBoundaries(mbRow(0), mbRow(10));
    // First excerpt boundary: prev is undefined
    expect(boundaries.length).toBe(1);
    expect(boundaries[0]?.prev).toBeUndefined();
  });

  test("excerptBoundaries tracks file changes", () => {
    const mb = createMultiBuffer();
    const buf1 = createBuffer(createBufferId(), generateText(5));
    const buf2 = createBuffer(createBufferId(), generateText(5));
    mb.addExcerpt(buf1, excerptRange(0, 5));
    mb.addExcerpt(buf2, excerptRange(0, 5));

    const snap = mb.snapshot();
    const boundaries = snap.excerptBoundaries(mbRow(0), mbRow(10));
    expect(boundaries.length).toBe(2);
    // Second boundary has prev from buf1 and next from buf2
    expect(boundaries[1]?.prev?.bufferId).toBe(buf1.id);
    expect(boundaries[1]?.next.bufferId).toBe(buf2.id);
  });
});

// =============================================================================
// Snapshot Immutability
// =============================================================================

describe("MultiBuffer - Snapshot", () => {
  test("snapshot is immutable after mutations", () => {
    const mb = createMultiBuffer();
    const buffer = createBuffer(createBufferId(), "A\nB\nC");
    mb.addExcerpt(buffer, excerptRange(0, 3));

    const snap1 = mb.snapshot();
    expect(snap1.lineCount).toBe(3);

    const buffer2 = createBuffer(createBufferId(), "X\nY");
    mb.addExcerpt(buffer2, excerptRange(0, 2));

    const snap2 = mb.snapshot();
    expect(snap1.lineCount).toBe(3); // unchanged
    expect(snap2.lineCount).toBe(5);
  });

  test("multiple snapshots coexist", () => {
    const mb = createMultiBuffer();
    const buf = createBuffer(createBufferId(), "A\nB\nC\nD\nE");

    mb.addExcerpt(buf, excerptRange(0, 2));
    const s1 = mb.snapshot();

    mb.addExcerpt(buf, excerptRange(2, 5));
    const s2 = mb.snapshot();

    expect(s1.lineCount).toBe(2);
    expect(s1.excerpts.length).toBe(1);
    expect(s2.lineCount).toBe(5);
    expect(s2.excerpts.length).toBe(2);
  });

  test.todo("anchors work with old snapshots", () => {});
});

// =============================================================================
// Batch Operations
// =============================================================================

describe("MultiBuffer - Batch Operations", () => {
  test("setExcerptsForBuffer replaces all excerpts for buffer", () => {
    const buf = createBuffer(createBufferId(), "Line 0\nLine 1\nLine 2\nLine 3");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 2)); // lines 0-1
    mb.addExcerpt(buf, excerptRange(2, 4)); // lines 2-3
    expect(mb.excerpts.length).toBe(2);

    // Replace with a single excerpt covering all lines
    const newIds = mb.setExcerptsForBuffer(buf, [excerptRange(0, 4)]);
    expect(newIds.length).toBe(1);
    expect(mb.excerpts.length).toBe(1);

    // The new excerpt should show all 4 lines
    expect(mb.lineCount).toBe(4);
    const lines = mb.lines(mbRow(0), mbRow(4));
    expect(lines[0]).toBe("Line 0");
    expect(lines[3]).toBe("Line 3");
  });

  test("setExcerptsForBuffer tracks replaced excerpts for anchor resolution", () => {
    const buf = createBuffer(createBufferId(), "Line 0\nLine 1\nLine 2\nLine 3");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 4)); // all 4 lines

    // Create anchor at row 2, col 3 (in "Line 2")
    const a = mb.createAnchor(mbPoint(2, 3), Bias.Right);
    expect(a).toBeDefined();
    if (!a) return;

    // Replace with two excerpts
    mb.setExcerptsForBuffer(buf, [
      excerptRange(0, 2), // lines 0-1
      excerptRange(2, 4), // lines 2-3
    ]);

    // Anchor should still resolve — it follows the replacement chain
    // The anchor was in "Line 2" col 3, which is now in the second new excerpt at row 2
    const resolved = mb.snapshot().resolveAnchor(a);
    expect(resolved).toBeDefined();
    if (!resolved) return;
    // Row 2 col 3 in buffer → second excerpt starts at mb row 2, offset 0 → mb row 2 col 3
    expectPoint(resolved, 2, 3);
  });

  test("setExcerptsForBuffer returns new excerpt IDs", () => {
    const buf = createBuffer(createBufferId(), "Line 0\nLine 1\nLine 2");
    const mb = createMultiBuffer();
    const oldId = mb.addExcerpt(buf, excerptRange(0, 3));

    const newIds = mb.setExcerptsForBuffer(buf, [
      excerptRange(0, 1),
      excerptRange(1, 3),
    ]);
    expect(newIds.length).toBe(2);
    // New IDs should be different from the old one
    for (const newId of newIds) {
      expect(
        newId.index === oldId.index && newId.generation === oldId.generation,
      ).toBe(false);
    }
  });

  test("setExcerptsForBuffer with empty array removes all", () => {
    const buf = createBuffer(createBufferId(), "Line 0\nLine 1");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 2));
    expect(mb.excerpts.length).toBe(1);

    const newIds = mb.setExcerptsForBuffer(buf, []);
    expect(newIds.length).toBe(0);
    expect(mb.excerpts.length).toBe(0);
    expect(mb.lineCount).toBe(0);
  });

  test("setExcerptsForBuffer preserves excerpts from other buffers", () => {
    const buf1 = createBuffer(createBufferId(), "Buffer 1");
    const buf2 = createBuffer(createBufferId(), "Buffer 2");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf1, excerptRange(0, 1));
    mb.addExcerpt(buf2, excerptRange(0, 1));
    expect(mb.excerpts.length).toBe(2);

    // Replace only buf1's excerpts
    mb.setExcerptsForBuffer(buf1, []);
    expect(mb.excerpts.length).toBe(1);
    // Remaining excerpt should be from buf2
    expect(mb.excerpts[0]?.bufferId).toBe(buf2.id);
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe("MultiBuffer - Edge Cases", () => {
  test("empty multibuffer operations", () => {
    const mb = createMultiBuffer();
    const snap = mb.snapshot();
    expect(snap.excerptAt(mbRow(0))).toBeUndefined();
    expect(snap.toBufferPoint(mbPoint(0, 0))).toBeUndefined();
    expect(snap.lines(mbRow(0), mbRow(10))).toEqual([]);
  });

  test("single empty excerpt", () => {
    const mb = createMultiBuffer();
    const buffer = createBuffer(createBufferId(), "A\nB\nC");
    mb.addExcerpt(buffer, excerptRange(2, 2)); // zero-length
    expect(mb.lineCount).toBe(0);
    expect(mb.excerpts.length).toBe(1);
  });

  test("excerpt with single line", () => {
    const mb = createMultiBuffer();
    const buffer = createBuffer(createBufferId(), "A\nB\nC");
    mb.addExcerpt(buffer, excerptRange(1, 2)); // just "B"

    const snap = mb.snapshot();
    expect(snap.lineCount).toBe(1);
    expect(snap.lines(mbRow(0), mbRow(1))).toEqual(["B"]);
  });

  test("excerpt at start of buffer", () => {
    const mb = createMultiBuffer();
    const buffer = createBuffer(createBufferId(), "A\nB\nC\nD\nE");
    mb.addExcerpt(buffer, excerptRange(0, 3));

    const snap = mb.snapshot();
    expect(snap.lines(mbRow(0), mbRow(3))).toEqual(["A", "B", "C"]);
  });

  test("excerpt at end of buffer", () => {
    const mb = createMultiBuffer();
    const buffer = createBuffer(createBufferId(), "A\nB\nC\nD\nE");
    mb.addExcerpt(buffer, excerptRange(3, 5));

    const snap = mb.snapshot();
    expect(snap.lines(mbRow(0), mbRow(2))).toEqual(["D", "E"]);
  });

  test("overlapping excerpt ranges from same buffer", () => {
    const mb = createMultiBuffer();
    const buffer = createBuffer(createBufferId(), "A\nB\nC\nD\nE");
    mb.addExcerpt(buffer, excerptRange(0, 3)); // A, B, C
    mb.addExcerpt(buffer, excerptRange(2, 5)); // C, D, E

    const snap = mb.snapshot();
    expect(snap.lineCount).toBe(6);
    expect(snap.lines(mbRow(0), mbRow(6))).toEqual([
      "A", "B", "C", "C", "D", "E",
    ]);
  });
});

// =============================================================================
// Performance
// =============================================================================

describe("MultiBuffer - Performance", () => {
  test("adding 100 excerpts completes in <10ms", () => {
    const mb = createMultiBuffer();
    const buffer = createBuffer(createBufferId(), generateText(1000));
    const { durationMs } = time(() => {
      for (let i = 0; i < 100; i++) {
        mb.addExcerpt(buffer, excerptRange(i * 10, i * 10 + 10));
      }
    });
    expect(durationMs).toBeLessThan(10);
  });

  test("excerptAt is O(log n) - binary search performance", () => {
    const mb = createMultiBuffer();
    const buffer = createBuffer(createBufferId(), generateText(10_000));
    for (let i = 0; i < 1000; i++) {
      mb.addExcerpt(buffer, excerptRange(i * 10, i * 10 + 10));
    }
    const snap = mb.snapshot();

    const early = benchmark(() => snap.excerptAt(mbRow(50)), 1000);
    const late = benchmark(() => snap.excerptAt(mbRow(9950)), 1000);

    expect(late.avgMs).toBeLessThan(early.avgMs * 3 + 0.001);
  });

  test("lines() fetches visible lines in <1ms", () => {
    const mb = createMultiBuffer();
    const buffer = createBuffer(createBufferId(), generateText(10_000));
    for (let i = 0; i < 100; i++) {
      mb.addExcerpt(buffer, excerptRange(i * 100, i * 100 + 100));
    }
    const snap = mb.snapshot();

    const { durationMs } = time(() => {
      snap.lines(mbRow(500), mbRow(550)); // 50 lines
    });
    expect(durationMs).toBeLessThan(1);
  });

  test.todo("anchor resolution is fast", () => {});

  test.todo("singleton optimization provides speedup", () => {});
});
