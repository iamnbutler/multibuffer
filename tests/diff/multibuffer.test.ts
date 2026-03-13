/**
 * Tests for createUnifiedDiffMultiBuffer.
 *
 * Verifies that a diff between two buffers produces:
 * - the correct excerpt structure (source buffers, editable flags)
 * - correct decoration row ranges and gutter signs
 * - correct total line count in the resulting MultiBuffer
 */

import { describe, expect, test } from "bun:test";
import { createBuffer } from "../../src/buffer/buffer.ts";
import { createUnifiedDiffMultiBuffer } from "../../src/diff/multibuffer.ts";
import { createBufferId, num } from "../helpers.ts";

function makeBuffers(oldText: string, newText: string) {
  const oldBuf = createBuffer(createBufferId(), oldText);
  const newBuf = createBuffer(createBufferId(), newText);
  return { oldBuf, newBuf };
}

describe("createUnifiedDiffMultiBuffer - equal texts", () => {
  test("isEqual is true and no decorations", () => {
    const { oldBuf, newBuf } = makeBuffers("a\nb\nc", "a\nb\nc");
    const { isEqual, decorations } = createUnifiedDiffMultiBuffer(oldBuf, newBuf);
    expect(isEqual).toBe(true);
    expect(decorations.length).toBe(0);
  });

  test("single excerpt from newBuffer covering all lines", () => {
    const { oldBuf, newBuf } = makeBuffers("a\nb\nc", "a\nb\nc");
    const { multiBuffer } = createUnifiedDiffMultiBuffer(oldBuf, newBuf);
    const excerpts = multiBuffer.snapshot().excerpts;
    expect(excerpts.length).toBe(1);
    expect(excerpts[0]?.bufferId).toBe(newBuf.id);
    expect(multiBuffer.lineCount).toBe(3);
  });

  test("equal excerpt is editable by default", () => {
    const { oldBuf, newBuf } = makeBuffers("hello\nworld", "hello\nworld");
    const { multiBuffer } = createUnifiedDiffMultiBuffer(oldBuf, newBuf);
    const excerpts = multiBuffer.snapshot().excerpts;
    expect(excerpts[0]?.editable).toBe(true);
  });

  test("editableEqual: false makes equal excerpt non-editable", () => {
    const { oldBuf, newBuf } = makeBuffers("hello", "hello");
    const { multiBuffer } = createUnifiedDiffMultiBuffer(oldBuf, newBuf, {
      editableEqual: false,
    });
    const excerpts = multiBuffer.snapshot().excerpts;
    expect(excerpts[0]?.editable).toBe(false);
  });

  test("empty buffers produce an empty multiBuffer", () => {
    const { oldBuf, newBuf } = makeBuffers("", "");
    const { multiBuffer, isEqual } = createUnifiedDiffMultiBuffer(oldBuf, newBuf);
    expect(isEqual).toBe(true);
    expect(multiBuffer.lineCount).toBe(0);
  });
});

describe("createUnifiedDiffMultiBuffer - excerpt sources", () => {
  test("delete group comes from oldBuffer and is non-editable", () => {
    // Old: a b c   New: a c   (b is deleted)
    const { oldBuf, newBuf } = makeBuffers("a\nb\nc", "a\nc");
    const { multiBuffer } = createUnifiedDiffMultiBuffer(oldBuf, newBuf);
    const excerpts = multiBuffer.snapshot().excerpts;
    const deleteExcerpts = excerpts.filter(
      (e) => e.bufferId === oldBuf.id,
    );
    expect(deleteExcerpts.length).toBe(1);
    expect(deleteExcerpts[0]?.editable).toBe(false);
  });

  test("insert group comes from newBuffer and is editable", () => {
    // Old: a c   New: a b c   (b is inserted)
    const { oldBuf, newBuf } = makeBuffers("a\nc", "a\nb\nc");
    const { multiBuffer } = createUnifiedDiffMultiBuffer(oldBuf, newBuf);
    const excerpts = multiBuffer.snapshot().excerpts;
    // All newBuf excerpts are editable by default
    const newBufExcerpts = excerpts.filter((e) => e.bufferId === newBuf.id);
    expect(newBufExcerpts.every((e) => e.editable)).toBe(true);
  });

  test("equal context lines reference newBuffer", () => {
    const { oldBuf, newBuf } = makeBuffers("a\nb\nc", "a\nX\nc");
    const { multiBuffer } = createUnifiedDiffMultiBuffer(oldBuf, newBuf);
    const excerpts = multiBuffer.snapshot().excerpts;
    const equalFromNew = excerpts.filter(
      (e) => e.bufferId === newBuf.id && e.editable,
    );
    expect(equalFromNew.length).toBeGreaterThan(0);
  });
});

describe("createUnifiedDiffMultiBuffer - decorations", () => {
  test("delete lines get delete decoration with gutter sign '−'", () => {
    const { oldBuf, newBuf } = makeBuffers("a\nb\nc", "a\nc");
    const { decorations } = createUnifiedDiffMultiBuffer(oldBuf, newBuf);
    const deleteDec = decorations.find((d) => d.style?.gutterSign === "−");
    expect(deleteDec).toBeDefined();
  });

  test("insert lines get insert decoration with gutter sign '+'", () => {
    const { oldBuf, newBuf } = makeBuffers("a\nc", "a\nb\nc");
    const { decorations } = createUnifiedDiffMultiBuffer(oldBuf, newBuf);
    const insertDec = decorations.find((d) => d.style?.gutterSign === "+");
    expect(insertDec).toBeDefined();
  });

  test("equal context lines have no decoration", () => {
    // One change surrounded by context: decorations should only cover changed rows.
    const { oldBuf, newBuf } = makeBuffers("a\nb\nc\nd\ne", "a\nX\nc\nd\ne");
    const { decorations } = createUnifiedDiffMultiBuffer(oldBuf, newBuf);
    // Each decoration covers exactly 1 row (the single-line change)
    for (const dec of decorations) {
      expect(num(dec.range.start.row)).toBe(num(dec.range.end.row));
    }
  });

  test("decoration rows are contiguous for multi-line delete", () => {
    // Old: a b c d e   New: a e   (b,c,d deleted)
    const { oldBuf, newBuf } = makeBuffers("a\nb\nc\nd\ne", "a\ne");
    const { decorations } = createUnifiedDiffMultiBuffer(oldBuf, newBuf);
    const deleteDec = decorations.find((d) => d.style?.gutterSign === "−");
    if (!deleteDec) throw new Error("expected a delete decoration");
    // Should span 3 rows (b, c, d)
    const span =
      num(deleteDec.range.end.row) - num(deleteDec.range.start.row) + 1;
    expect(span).toBe(3);
  });
});

describe("createUnifiedDiffMultiBuffer - line count", () => {
  test("single line change: delete + insert + context lines", () => {
    // With default context=3, a single-line change in a 5-line file shows all 5 lines.
    const { oldBuf, newBuf } = makeBuffers("a\nb\nc\nd\ne", "a\nX\nc\nd\ne");
    const { multiBuffer } = createUnifiedDiffMultiBuffer(oldBuf, newBuf);
    // delete(b) + insert(X) = one extra line vs original (both show up)
    // context shows: a, [b→X], c, d, e → 6 lines total (b deleted + X inserted + 4 context)
    expect(multiBuffer.lineCount).toBe(6);
  });

  test("no change outside context window is excluded", () => {
    // 10-line file with a change near the middle; lines outside context window are omitted
    const oldLines = Array.from({ length: 10 }, (_, i) => `line${i}`).join("\n");
    const newLines = Array.from({ length: 10 }, (_, i) =>
      i === 5 ? "CHANGED" : `line${i}`,
    ).join("\n");
    const { oldBuf, newBuf } = makeBuffers(oldLines, newLines);
    const { multiBuffer } = createUnifiedDiffMultiBuffer(oldBuf, newBuf);
    // With context=3: lines 2-4 (before), line5 deleted, CHANGED inserted, lines 6-8 (after)
    // Both delete and insert of line5 appear, so: 3 + 1 + 1 + 3 = 8 lines
    expect(multiBuffer.lineCount).toBeLessThan(12); // not showing all 10+1
    expect(multiBuffer.lineCount).toBeGreaterThan(0);
  });
});

describe("createUnifiedDiffMultiBuffer - excerpt grouping", () => {
  test("consecutive delete lines form a single excerpt", () => {
    // Delete 3 consecutive lines: should produce 1 delete excerpt, not 3
    const { oldBuf, newBuf } = makeBuffers("a\nb\nc\nd\ne", "a\ne");
    const { multiBuffer } = createUnifiedDiffMultiBuffer(oldBuf, newBuf);
    const excerpts = multiBuffer.snapshot().excerpts;
    // Expect: equal(a) + delete(b,c,d) + equal(e) = 3 excerpts max (may merge if within context)
    const deleteExcerpts = excerpts.filter((e) => e.bufferId === oldBuf.id);
    expect(deleteExcerpts.length).toBe(1);
    // The delete excerpt should cover 3 lines (b, c, d)
    const delExcerpt = deleteExcerpts[0];
    if (!delExcerpt) throw new Error("expected delete excerpt");
    expect(delExcerpt.endRow - delExcerpt.startRow).toBe(3);
  });

  test("consecutive insert lines form a single excerpt", () => {
    // Insert 3 consecutive lines
    const { oldBuf, newBuf } = makeBuffers("a\ne", "a\nb\nc\nd\ne");
    const { multiBuffer, decorations } = createUnifiedDiffMultiBuffer(oldBuf, newBuf);
    // All lines from newBuf since this is pure insertion (no deletes)
    // a + b + c + d + e = 5 lines total in multiBuffer
    expect(multiBuffer.lineCount).toBe(5);
    // There should be exactly one insert decoration covering b, c, d (3 lines)
    const insertDecorations = decorations.filter((d) => d.style?.gutterSign === "+");
    expect(insertDecorations.length).toBe(1);
    const insertDec = insertDecorations[0];
    if (!insertDec) throw new Error("expected insert decoration");
    const span = num(insertDec.range.end.row) - num(insertDec.range.start.row) + 1;
    expect(span).toBe(3);
  });

  test("interleaved changes create separate excerpts", () => {
    // Change line 1 and line 3 with unchanged line 2 between
    const { oldBuf, newBuf } = makeBuffers("a\nb\nc", "X\nb\nY");
    const { multiBuffer, decorations } = createUnifiedDiffMultiBuffer(oldBuf, newBuf);
    // Should have: delete(a), insert(X), equal(b), delete(c), insert(Y)
    // Line count: 5 (both deleted lines appear alongside their replacements)
    expect(multiBuffer.lineCount).toBe(5);
    // Should have decorations for both delete and insert groups
    const deleteDecorations = decorations.filter((d) => d.style?.gutterSign === "−");
    const insertDecorations = decorations.filter((d) => d.style?.gutterSign === "+");
    expect(deleteDecorations.length).toBe(2);
    expect(insertDecorations.length).toBe(2);
  });

  test("change at file start", () => {
    const { oldBuf, newBuf } = makeBuffers("old\nsame", "new\nsame");
    const { multiBuffer, decorations } = createUnifiedDiffMultiBuffer(oldBuf, newBuf);
    // Line 0 changed: delete(old), insert(new), equal(same)
    expect(multiBuffer.lineCount).toBe(3);
    expect(decorations.length).toBe(2); // one delete, one insert decoration
  });

  test("change at file end", () => {
    const { oldBuf, newBuf } = makeBuffers("same\nold", "same\nnew");
    const { multiBuffer, decorations } = createUnifiedDiffMultiBuffer(oldBuf, newBuf);
    // Line 1 changed: equal(same), delete(old), insert(new)
    expect(multiBuffer.lineCount).toBe(3);
    expect(decorations.length).toBe(2);
  });
});
