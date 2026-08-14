/**
 * Tests for insertTab, indentLines, and dedentLines commands.
 *
 * TDD — tests written before implementation is complete; some may fail.
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { createBuffer } from "../../src/buffer/buffer.ts";
import { Editor } from "../../src/editor/editor.ts";
import { createMultiBuffer } from "../../src/multibuffer/multibuffer.ts";
import type { MultiBuffer } from "../../src/multibuffer/types.ts";
import {
  createBufferId,
  excerptRange,
  expectPoint,
  mbPoint,
  mbRow,
  resetCounters,
} from "../helpers.ts";

/** Create an editor backed by a single full-file buffer. */
function setup(text: string): { mb: MultiBuffer; editor: Editor } {
  const buf = createBuffer(createBufferId(), text);
  const mb = createMultiBuffer();
  mb.addExcerpt(buf, excerptRange(0, text.split("\n").length));
  const editor = new Editor(mb);
  return { mb, editor };
}

/**
 * Create an editor backed by three separate excerpts, each from its own buffer
 * and each followed by a trailing newline.
 *
 * Layout for `["A", "B", "C"]` with 3 lines per excerpt:
 *   rows 0-2 = A, row 3 = blank, rows 4-6 = B, row 7 = blank, rows 8-10 = C
 */
function setupThreeExcerpts(texts: readonly string[]): { mb: MultiBuffer; editor: Editor } {
  const mb = createMultiBuffer();
  for (const text of texts) {
    const buf = createBuffer(createBufferId(), text);
    mb.addExcerpt(buf, excerptRange(0, text.split("\n").length), { hasTrailingNewline: true });
  }
  const editor = new Editor(mb);
  return { mb, editor };
}

/** Read the full text content from the multibuffer snapshot. */
function getText(mb: MultiBuffer): string {
  const snap = mb.snapshot();
  // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in test
  const lines = snap.lines(0 as import("../../src/multibuffer/types.ts").MultiBufferRow, snap.lineCount as import("../../src/multibuffer/types.ts").MultiBufferRow);
  return lines.join("\n");
}

beforeEach(() => {
  resetCounters();
});

// ─── insertTab ──────────────────────────────────────────────────────

describe("insertTab", () => {
  test("inserts 2 spaces at cursor when selection is collapsed", () => {
    const { mb, editor } = setup("hello\nworld");
    editor.setCursor(mbPoint(0, 0));
    editor.dispatch({ type: "insertTab" });
    expect(getText(mb)).toBe("  hello\nworld");
  });

  test("cursor advances by 2 columns", () => {
    const { editor } = setup("hello\nworld");
    editor.setCursor(mbPoint(0, 0));
    editor.dispatch({ type: "insertTab" });
    expectPoint(editor.cursor, 0, 2);
  });

  test("inserts 2 spaces in the middle of a line", () => {
    const { mb, editor } = setup("hello");
    editor.setCursor(mbPoint(0, 3));
    editor.dispatch({ type: "insertTab" });
    expect(getText(mb)).toBe("hel  lo");
    expectPoint(editor.cursor, 0, 5);
  });

  test("with non-collapsed selection, indents all selected lines instead", () => {
    const { mb, editor } = setup("one\ntwo\nthree");
    // Select from row 0, col 1 to row 1, col 2 — covers lines 0 and 1
    editor.setCursor(mbPoint(0, 1));
    editor.extendSelectionTo(mbPoint(1, 2));
    editor.dispatch({ type: "insertTab" });
    // Both lines should be indented by 2 spaces; line 2 untouched
    expect(getText(mb)).toBe("  one\n  two\nthree");
  });

  test("with multi-cursor (all collapsed), inserts tab at each cursor", () => {
    const { mb, editor } = setup("aaa\nbbb\nccc");
    editor.setCursor(mbPoint(0, 1));
    editor.dispatch({ type: "addCursor", at: mbPoint(2, 1) });
    editor.dispatch({ type: "insertTab" });
    // Each collapsed cursor should insert 2 spaces at its position
    expect(getText(mb)).toBe("a  aa\nbbb\nc  cc");
  });
});

// ─── indentLines ────────────────────────────────────────────────────

describe("indentLines", () => {
  test("adds 2 spaces to start of current line", () => {
    const { mb, editor } = setup("hello\nworld");
    editor.setCursor(mbPoint(0, 3));
    editor.dispatch({ type: "indentLines" });
    expect(getText(mb)).toBe("  hello\nworld");
  });

  test("cursor column shifts right by 2", () => {
    const { editor } = setup("hello\nworld");
    editor.setCursor(mbPoint(0, 3));
    editor.dispatch({ type: "indentLines" });
    expectPoint(editor.cursor, 0, 5);
  });

  test("indents all lines in selection range", () => {
    const { mb, editor } = setup("one\ntwo\nthree");
    // Select across lines 0 and 1
    editor.setCursor(mbPoint(0, 0));
    editor.extendSelectionTo(mbPoint(1, 3));
    editor.dispatch({ type: "indentLines" });
    expect(getText(mb)).toBe("  one\n  two\nthree");
  });

  test("with non-adjacent multi-cursor, only touched rows are indented", () => {
    const { mb, editor } = setup("aaa\nbbb\nccc");
    editor.setCursor(mbPoint(0, 0));
    editor.dispatch({ type: "addCursor", at: mbPoint(2, 0) });
    editor.dispatch({ type: "indentLines" });
    // Only rows 0 and 2 have cursors; row 1 must not be indented
    expect(getText(mb)).toBe("  aaa\nbbb\n  ccc");
  });

  test("non-adjacent multi-cursor: all cursor positions shift right by 2", () => {
    const { editor } = setup("aaa\nbbb\nccc");
    editor.setCursor(mbPoint(0, 1));
    editor.dispatch({ type: "addCursor", at: mbPoint(2, 1) });
    editor.dispatch({ type: "indentLines" });
    expectPoint(editor.cursor, 2, 3);
  });

  test("indenting in one excerpt does not affect other excerpts", () => {
    // Set up two excerpts in a multibuffer
    const buf1 = createBuffer(createBufferId(), "alpha\nbeta");
    const buf2 = createBuffer(createBufferId(), "gamma\ndelta");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf1, excerptRange(0, 2));
    mb.addExcerpt(buf2, excerptRange(0, 2));
    const editor = new Editor(mb);

    // Place cursor on first line (excerpt 1) and indent
    editor.setCursor(mbPoint(0, 0));
    editor.dispatch({ type: "indentLines" });

    const snap = mb.snapshot();
    const lines = snap.lines(mbRow(0), mbRow(snap.lineCount));
    // First excerpt's first line should be indented
    expect(lines[0]).toBe("  alpha");
    // Second excerpt should be untouched
    // Find the "gamma" line (may be at index 2 or 3 depending on excerpt separator rows)
    const gammaLine = lines.find((l) => l.includes("gamma"));
    expect(gammaLine).toBe("gamma");
  });

  test("indenting already-indented line adds another level", () => {
    const { mb, editor } = setup("  hello");
    editor.setCursor(mbPoint(0, 2));
    editor.dispatch({ type: "indentLines" });
    expect(getText(mb)).toBe("    hello");
    expectPoint(editor.cursor, 0, 4);
  });
});

// ─── dedentLines ────────────────────────────────────────────────────

describe("dedentLines", () => {
  test("removes 2 spaces from start of line with 2+ leading spaces", () => {
    const { mb, editor } = setup("  hello\nworld");
    editor.setCursor(mbPoint(0, 4));
    editor.dispatch({ type: "dedentLines" });
    expect(getText(mb)).toBe("hello\nworld");
  });

  test("removes only available spaces if fewer than 2", () => {
    const { mb, editor } = setup(" hello");
    editor.setCursor(mbPoint(0, 3));
    editor.dispatch({ type: "dedentLines" });
    expect(getText(mb)).toBe("hello");
  });

  test("no-op on line with no leading spaces", () => {
    const { mb, editor } = setup("hello\nworld");
    editor.setCursor(mbPoint(0, 3));
    editor.dispatch({ type: "dedentLines" });
    expect(getText(mb)).toBe("hello\nworld");
    expectPoint(editor.cursor, 0, 3);
  });

  test("cursor column shifts left by amount removed (2 spaces)", () => {
    const { editor } = setup("  hello");
    editor.setCursor(mbPoint(0, 4));
    editor.dispatch({ type: "dedentLines" });
    expectPoint(editor.cursor, 0, 2);
  });

  test("cursor column shifts left by amount removed (1 space)", () => {
    const { editor } = setup(" hello");
    editor.setCursor(mbPoint(0, 3));
    editor.dispatch({ type: "dedentLines" });
    expectPoint(editor.cursor, 0, 2);
  });

  test("cursor does not go below column 0", () => {
    const { editor } = setup("  hello");
    editor.setCursor(mbPoint(0, 1));
    editor.dispatch({ type: "dedentLines" });
    expectPoint(editor.cursor, 0, 0);
  });

  test("dedents all lines in selection range", () => {
    const { mb, editor } = setup("  one\n  two\nthree");
    // Select across lines 0 and 1
    editor.setCursor(mbPoint(0, 0));
    editor.extendSelectionTo(mbPoint(1, 4));
    editor.dispatch({ type: "dedentLines" });
    expect(getText(mb)).toBe("one\ntwo\nthree");
  });

  test("with multi-cursor on different lines", () => {
    const { mb, editor } = setup("  aaa\nbbb\n  ccc");
    editor.setCursor(mbPoint(0, 2));
    editor.dispatch({ type: "addCursor", at: mbPoint(2, 2) });
    editor.dispatch({ type: "dedentLines" });
    // Lines 0 and 2 should be dedented; line 1 (no leading spaces) untouched
    expect(getText(mb)).toBe("aaa\nbbb\nccc");
  });

  test("non-adjacent multi-cursor skips indented rows with no cursor", () => {
    const { mb, editor } = setup("  aaa\n  bbb\n  ccc");
    editor.setCursor(mbPoint(0, 2));
    editor.dispatch({ type: "addCursor", at: mbPoint(2, 2) });
    editor.dispatch({ type: "dedentLines" });
    // Row 1 has leading spaces but no cursor — must remain indented
    expect(getText(mb)).toBe("aaa\n  bbb\nccc");
  });

  test("non-adjacent multi-cursor: each cursor shifts left by its line's removed spaces", () => {
    const { editor } = setup("  aaa\nbbb\n  ccc");
    editor.setCursor(mbPoint(0, 3));
    editor.dispatch({ type: "addCursor", at: mbPoint(2, 3) });
    editor.dispatch({ type: "dedentLines" });
    expectPoint(editor.cursor, 2, 1);
  });
});

// ─── Multi-excerpt regression ───────────────────────────────────────
//
// Spanning the rows between the outermost cursors is not merely an
// over-indent when the span crosses excerpt boundaries: the single edit
// rewrites the excerpt separators too, which inserts spurious blank rows
// and detaches trailing content. These cases lock down the boundary.

describe("indentLines/dedentLines across excerpts", () => {
  test("one cursor per excerpt indents only those rows and preserves separators", () => {
    const { mb, editor } = setupThreeExcerpts(["A0\nA1\nA2", "B0\nB1\nB2", "C0\nC1\nC2"]);
    editor.setCursor(mbPoint(0, 0));
    editor.dispatch({ type: "addCursor", at: mbPoint(4, 0) });
    editor.dispatch({ type: "addCursor", at: mbPoint(8, 0) });
    expect(editor.selections.length).toBe(3);

    editor.dispatch({ type: "indentLines" });

    // Only the three cursor rows gain indentation. Every separator row stays a
    // single blank line and no rows are added.
    expect(getText(mb)).toBe("  A0\nA1\nA2\n\n  B0\nB1\nB2\n\n  C0\nC1\nC2\n");
    expect(editor.selections.length).toBe(3);
  });

  test("one cursor per excerpt dedents only those rows and preserves separators", () => {
    const { mb, editor } = setupThreeExcerpts(["  A0\n  A1\nA2", "  B0\nB1\nB2", "  C0\nC1\nC2"]);
    editor.setCursor(mbPoint(0, 2));
    editor.dispatch({ type: "addCursor", at: mbPoint(4, 2) });
    editor.dispatch({ type: "addCursor", at: mbPoint(8, 2) });
    expect(editor.selections.length).toBe(3);

    editor.dispatch({ type: "dedentLines" });

    // Row 1 ("  A1") is indented but has no cursor, so it must keep its indent.
    expect(getText(mb)).toBe("A0\n  A1\nA2\n\nB0\nB1\nB2\n\nC0\nC1\nC2\n");
    expect(editor.selections.length).toBe(3);
  });

  test("adjacent cursors either side of an excerpt boundary do not merge excerpts", () => {
    const { mb, editor } = setupThreeExcerpts(["A0\nA1\nA2", "B0\nB1\nB2"]);
    // Row 2 is the last row of excerpt A; row 4 is the first row of excerpt B.
    editor.setCursor(mbPoint(2, 0));
    editor.dispatch({ type: "addCursor", at: mbPoint(4, 0) });

    editor.dispatch({ type: "indentLines" });

    // The blank separator at row 3 must survive un-indented and un-duplicated.
    expect(getText(mb)).toBe("A0\nA1\n  A2\n\n  B0\nB1\nB2\n");
  });
});
