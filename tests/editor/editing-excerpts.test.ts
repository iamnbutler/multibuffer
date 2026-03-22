/**
 * Tests for editing disjoint excerpts in a multibuffer.
 *
 * Verifies that edits in one excerpt do not corrupt another,
 * that row offsets update correctly after insertions and deletions,
 * and that cursor movement across excerpt boundaries works.
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { createBuffer } from "../../src/buffer/buffer.ts";
import { Editor } from "../../src/editor/editor.ts";
import { createMultiBuffer } from "../../src/multibuffer/multibuffer.ts";
import type { MultiBuffer, MultiBufferRow } from "../../src/multibuffer/types.ts";
import {
  createBufferId,
  excerptRange,
  mbPoint,
  num,
  resetCounters,
} from "../helpers.ts";

/** Read the full text content from the multibuffer snapshot. */
function getText(mb: MultiBuffer): string {
  const snap = mb.snapshot();
  // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in test
  const lines = snap.lines(0 as MultiBufferRow, snap.lineCount as MultiBufferRow);
  return lines.join("\n");
}

/**
 * Create a multibuffer with two excerpts from two different buffers.
 * Excerpt A gets a trailing newline so the two excerpts are visually separated.
 *
 * Layout:
 *   rows 0..N-1  = excerpt A content
 *   row  N       = trailing newline (empty line from excerpt A)
 *   rows N+1..M  = excerpt B content
 */
function setupTwoExcerpts(
  textA: string,
  textB: string,
): { mb: MultiBuffer; editor: Editor } {
  const bufA = createBuffer(createBufferId(), textA);
  const bufB = createBuffer(createBufferId(), textB);
  const mb = createMultiBuffer();
  mb.addExcerpt(bufA, excerptRange(0, textA.split("\n").length), { hasTrailingNewline: true });
  mb.addExcerpt(bufB, excerptRange(0, textB.split("\n").length));
  const editor = new Editor(mb);
  return { mb, editor };
}

/** Select from (startRow, startCol) to (endRow, endCol) via setCursor + extendSelectionTo. */
function _selectRange(
  editor: Editor,
  startRow: number,
  startCol: number,
  endRow: number,
  endCol: number,
): void {
  editor.setCursor(mbPoint(startRow, startCol));
  editor.extendSelectionTo(mbPoint(endRow, endCol));
}

beforeEach(() => {
  resetCounters();
});

// ─── Editing disjoint excerpts ──────────────────────────────────────

describe("Editing disjoint excerpts", () => {
  // With textA = "aaa\nbbb" and textB = "ccc\nddd":
  //   row 0: "aaa"   (excerpt A)
  //   row 1: "bbb"   (excerpt A)
  //   row 2: ""      (trailing newline from excerpt A)
  //   row 3: "ccc"   (excerpt B)
  //   row 4: "ddd"   (excerpt B)

  test("insert text in first excerpt does not change second excerpt's text", () => {
    const { mb, editor } = setupTwoExcerpts("aaa\nbbb", "ccc\nddd");
    expect(getText(mb)).toBe("aaa\nbbb\n\nccc\nddd");

    // Insert at start of first excerpt
    editor.setCursor(mbPoint(0, 0));
    editor.dispatch({ type: "insertText", text: "X" });

    const snap = mb.snapshot();
    // First excerpt should be modified
    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in test
    const firstLine = snap.lines(0 as MultiBufferRow, 1 as MultiBufferRow)[0];
    expect(firstLine).toBe("Xaaa");

    // Second excerpt should be unchanged
    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in test
    const excerptBLines = snap.lines(3 as MultiBufferRow, 5 as MultiBufferRow);
    expect(excerptBLines[0]).toBe("ccc");
    expect(excerptBLines[1]).toBe("ddd");
  });

  test("insert text in second excerpt does not change first excerpt's text", () => {
    const { mb, editor } = setupTwoExcerpts("aaa\nbbb", "ccc\nddd");

    // Insert at start of second excerpt (row 3)
    editor.setCursor(mbPoint(3, 0));
    editor.dispatch({ type: "insertText", text: "Y" });

    const snap = mb.snapshot();
    // First excerpt should be unchanged
    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in test
    const excerptALines = snap.lines(0 as MultiBufferRow, 2 as MultiBufferRow);
    expect(excerptALines[0]).toBe("aaa");
    expect(excerptALines[1]).toBe("bbb");

    // Second excerpt should be modified
    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in test
    const excerptBFirstLine = snap.lines(3 as MultiBufferRow, 4 as MultiBufferRow)[0];
    expect(excerptBFirstLine).toBe("Yccc");
  });

  test("delete in first excerpt updates row offsets of second excerpt correctly", () => {
    const { mb, editor } = setupTwoExcerpts("aaa\nbbb", "ccc\nddd");
    // Delete the newline between "aaa" and "bbb" to join them into one line
    editor.setCursor(mbPoint(0, 3));
    editor.dispatch({ type: "deleteForward", granularity: "character" });

    // After joining: excerpt A is now 1 line "aaabbb" + trailing newline
    // Excerpt B should still be "ccc\nddd"
    const text = getText(mb);
    expect(text).toContain("aaabbb");
    expect(text).toContain("ccc");
    expect(text).toContain("ddd");

    // Verify excerpt B text is intact
    const snap = mb.snapshot();
    const excerpts = snap.excerpts;
    const excB = excerpts[excerpts.length - 1];
    if (!excB) throw new Error("expected excerpt B");
    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in test
    const excBLines = snap.lines(excB.startRow as MultiBufferRow, excB.endRow as MultiBufferRow);
    expect(excBLines[0]).toBe("ccc");
    expect(excBLines[1]).toBe("ddd");
  });

  test("newline in first excerpt shifts second excerpt's start row", () => {
    const { mb, editor } = setupTwoExcerpts("aaa", "bbb");
    // Initial layout: row 0="aaa", row 1="" (trailing), row 2="bbb"
    const snapBefore = mb.snapshot();
    const excBBefore = snapBefore.excerpts[snapBefore.excerpts.length - 1];
    if (!excBBefore) throw new Error("expected excerpt B");
    const startRowBefore = num(excBBefore.startRow);

    // Insert a newline in the first excerpt, adding a row
    editor.setCursor(mbPoint(0, 1));
    editor.dispatch({ type: "insertNewline" });

    const snapAfter = mb.snapshot();
    const excBAfter = snapAfter.excerpts[snapAfter.excerpts.length - 1];
    if (!excBAfter) throw new Error("expected excerpt B");
    const startRowAfter = num(excBAfter.startRow);

    // Excerpt B's start row should have increased by 1
    expect(startRowAfter).toBe(startRowBefore + 1);
  });

  test("cursor can move from first excerpt into second excerpt", () => {
    const { editor } = setupTwoExcerpts("aaa", "bbb");
    // row 0="aaa", row 1="" (trailing newline), row 2="bbb"
    editor.setCursor(mbPoint(0, 0));

    // Cursor movement skips trailing newline rows, so moving down
    // from row 0 should jump directly to row 2 (excerpt B)
    editor.dispatch({ type: "moveCursor", direction: "down", granularity: "line" });
    expect(num(editor.cursor.row)).toBe(2);

    // Cursor should now be in excerpt B's row
    const snap = editor.multiBuffer.snapshot();
    const excB = snap.excerptAt(editor.cursor.row);
    expect(excB).toBeDefined();
  });

  test("cursor movement across excerpt boundary skips trailing newline rows", () => {
    const { editor } = setupTwoExcerpts("aaa\nbbb", "ccc\nddd");
    // row 0="aaa", row 1="bbb", row 2="" (trailing newline), row 3="ccc", row 4="ddd"

    // Start at last content row of excerpt A
    editor.setCursor(mbPoint(1, 2));

    // Moving down from row 1 should skip the trailing newline (row 2)
    // and land on the first row of excerpt B (row 3)
    editor.dispatch({ type: "moveCursor", direction: "down", granularity: "line" });
    expect(num(editor.cursor.row)).toBe(3); // first row of excerpt B

    // Moving back up should skip the trailing newline (row 2)
    // and land on the last content row of excerpt A (row 1)
    editor.dispatch({ type: "moveCursor", direction: "up", granularity: "line" });
    expect(num(editor.cursor.row)).toBe(1); // last content row of excerpt A
  });
});

// ─── Multi-cursor across excerpts ───────────────────────────────────

describe("Multi-cursor across excerpts", () => {
  test("place cursors in different excerpts, insert text — each excerpt edited independently", () => {
    const { mb, editor } = setupTwoExcerpts("aaa\nbbb", "ccc\nddd");
    // row 0="aaa", row 1="bbb", row 2="" (trailing), row 3="ccc", row 4="ddd"

    // Place cursor in excerpt A
    editor.setCursor(mbPoint(0, 0));
    // Add cursor in excerpt B
    editor.dispatch({ type: "addCursor", at: mbPoint(3, 0) });
    expect(editor.selections.length).toBe(2);

    // Insert text — should be applied at both cursor positions
    editor.dispatch({ type: "insertText", text: "X" });

    const text = getText(mb);
    // Excerpt A's first line should have X inserted
    expect(text).toContain("Xaaa");
    // Excerpt B's first line should have X inserted
    expect(text).toContain("Xccc");
    // Lines that weren't targeted should remain unchanged
    expect(text).toContain("bbb");
    expect(text).toContain("ddd");
  });

  test("delete with cursors in different excerpts", () => {
    const { mb, editor } = setupTwoExcerpts("aaa\nbbb", "ccc\nddd");
    // Place cursor after first character of excerpt A's first line
    editor.setCursor(mbPoint(0, 1));
    // Add cursor after first character of excerpt B's first line
    editor.dispatch({ type: "addCursor", at: mbPoint(3, 1) });
    expect(editor.selections.length).toBe(2);

    // Delete backward — should remove one character from each position
    editor.dispatch({ type: "deleteBackward", granularity: "character" });

    const text = getText(mb);
    // "aaa" -> "aa" (deleted 'a' at col 0)
    expect(text).toContain("aa");
    // "ccc" -> "cc" (deleted 'c' at col 0)
    expect(text).toContain("cc");
    // Other lines unchanged
    expect(text).toContain("bbb");
    expect(text).toContain("ddd");
  });
});

// ─── Undo in multi-excerpt context ──────────────────────────────────

describe("Undo in multi-excerpt context", () => {
  test("undo after editing in one excerpt restores that excerpt only", () => {
    const { mb, editor } = setupTwoExcerpts("aaa\nbbb", "ccc\nddd");
    const originalText = getText(mb);

    // Edit only in excerpt A
    editor.setCursor(mbPoint(0, 3));
    editor.dispatch({ type: "insertText", text: "ZZZ" });
    expect(getText(mb)).not.toBe(originalText);

    // Verify excerpt B is untouched before undo
    const snap = mb.snapshot();
    const excerpts = snap.excerpts;
    const excB = excerpts[excerpts.length - 1];
    if (!excB) throw new Error("expected excerpt B");
    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in test
    const excBLines = snap.lines(excB.startRow as MultiBufferRow, excB.endRow as MultiBufferRow);
    expect(excBLines[0]).toBe("ccc");
    expect(excBLines[1]).toBe("ddd");

    // Undo should restore excerpt A only
    editor.dispatch({ type: "undo" });
    expect(getText(mb)).toBe(originalText);

    // Verify excerpt B is still untouched after undo
    const snapAfter = mb.snapshot();
    const excerptsAfter = snapAfter.excerpts;
    const excBAfter = excerptsAfter[excerptsAfter.length - 1];
    if (!excBAfter) throw new Error("expected excerpt B");
    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in test
    const excBLinesAfter = snapAfter.lines(excBAfter.startRow as MultiBufferRow, excBAfter.endRow as MultiBufferRow);
    expect(excBLinesAfter[0]).toBe("ccc");
    expect(excBLinesAfter[1]).toBe("ddd");
  });
});
