/**
 * Undo/redo integration tests.
 *
 * Verifies that dispatch("undo") and dispatch("redo") correctly restore
 * text content, cursor positions, and selection state after edits.
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
  resetCounters,
} from "../helpers.ts";

/** Create a multibuffer with a single excerpt containing the given text. */
function setup(text: string): { mb: MultiBuffer; editor: Editor } {
  const buf = createBuffer(createBufferId(), text);
  const mb = createMultiBuffer();
  mb.addExcerpt(buf, excerptRange(0, text.split("\n").length));
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

// ─── Undo ───────────────────────────────────────────────────────

describe("Undo", () => {
  test("undo after insert restores previous text", () => {
    const { editor, mb } = setup("Hello");
    editor.setCursor(mbPoint(0, 5));
    editor.dispatch({ type: "insertText", text: " World" });
    expect(getText(mb)).toBe("Hello World");

    editor.dispatch({ type: "undo" });
    expect(getText(mb)).toBe("Hello");
  });

  test("undo after insert restores cursor position", () => {
    const { editor } = setup("Hello");
    editor.setCursor(mbPoint(0, 5));
    expectPoint(editor.cursor, 0, 5);

    editor.dispatch({ type: "insertText", text: "!" });
    expectPoint(editor.cursor, 0, 6);

    editor.dispatch({ type: "undo" });
    expectPoint(editor.cursor, 0, 5);
  });

  test("undo after delete restores deleted text", () => {
    const { editor, mb } = setup("Hello");
    editor.setCursor(mbPoint(0, 5));
    editor.dispatch({ type: "deleteBackward", granularity: "character" });
    expect(getText(mb)).toBe("Hell");

    editor.dispatch({ type: "undo" });
    expect(getText(mb)).toBe("Hello");
  });

  test("undo after delete restores cursor position", () => {
    const { editor } = setup("Hello");
    editor.setCursor(mbPoint(0, 5));
    editor.dispatch({ type: "deleteBackward", granularity: "character" });
    expectPoint(editor.cursor, 0, 4);

    editor.dispatch({ type: "undo" });
    expectPoint(editor.cursor, 0, 5);
  });

  test("multiple undos step back through edit history", () => {
    const { editor, mb } = setup("A");
    editor.setCursor(mbPoint(0, 1));

    editor.dispatch({ type: "insertText", text: "B" });
    expect(getText(mb)).toBe("AB");

    editor.dispatch({ type: "insertText", text: "C" });
    expect(getText(mb)).toBe("ABC");

    editor.dispatch({ type: "insertText", text: "D" });
    expect(getText(mb)).toBe("ABCD");

    editor.dispatch({ type: "undo" });
    expect(getText(mb)).toBe("ABC");

    editor.dispatch({ type: "undo" });
    expect(getText(mb)).toBe("AB");

    editor.dispatch({ type: "undo" });
    expect(getText(mb)).toBe("A");
  });

  test("undo at empty history is no-op", () => {
    const { editor, mb } = setup("Hello");
    editor.setCursor(mbPoint(0, 3));

    editor.dispatch({ type: "undo" });
    expect(getText(mb)).toBe("Hello");
    expectPoint(editor.cursor, 0, 3);
  });

  test("undo after deleteLine restores the line", () => {
    const { editor, mb } = setup("Line 1\nLine 2\nLine 3");
    editor.setCursor(mbPoint(1, 0));

    editor.dispatch({ type: "deleteLine" });
    expect(getText(mb)).toBe("Line 1\nLine 3");

    editor.dispatch({ type: "undo" });
    expect(getText(mb)).toBe("Line 1\nLine 2\nLine 3");
  });

  test("undo after moveLine restores original line order", () => {
    const { editor, mb } = setup("AAA\nBBB\nCCC");
    editor.setCursor(mbPoint(0, 0));

    editor.dispatch({ type: "moveLine", direction: "down" });
    expect(getText(mb)).toBe("BBB\nAAA\nCCC");

    editor.dispatch({ type: "undo" });
    expect(getText(mb)).toBe("AAA\nBBB\nCCC");
  });

  test("undo after duplicateLine removes the duplicate", () => {
    const { editor, mb } = setup("AAA\nBBB");
    editor.setCursor(mbPoint(0, 0));

    editor.dispatch({ type: "duplicateLine", direction: "down" });
    expect(getText(mb)).toBe("AAA\nAAA\nBBB");

    editor.dispatch({ type: "undo" });
    expect(getText(mb)).toBe("AAA\nBBB");
  });

  test("undo after indentLines removes the indent", () => {
    const { editor, mb } = setup("Hello\nWorld");
    editor.setCursor(mbPoint(0, 0));

    editor.dispatch({ type: "indentLines" });
    expect(getText(mb)).toBe("  Hello\nWorld");

    editor.dispatch({ type: "undo" });
    expect(getText(mb)).toBe("Hello\nWorld");
  });

  test("undo after cut restores the cut text", () => {
    const { editor, mb } = setup("Line 1\nLine 2\nLine 3");
    editor.setCursor(mbPoint(1, 0));

    // cut with no selection cuts the entire line (like Cmd+X)
    editor.dispatch({ type: "cut" });
    expect(getText(mb)).toBe("Line 1\nLine 3");

    editor.dispatch({ type: "undo" });
    expect(getText(mb)).toBe("Line 1\nLine 2\nLine 3");
  });
});

// ─── Redo ───────────────────────────────────────────────────────

describe("Redo", () => {
  test("redo after undo restores the undone edit", () => {
    const { editor, mb } = setup("Hello");
    editor.setCursor(mbPoint(0, 5));
    editor.dispatch({ type: "insertText", text: " World" });
    expect(getText(mb)).toBe("Hello World");

    editor.dispatch({ type: "undo" });
    expect(getText(mb)).toBe("Hello");

    editor.dispatch({ type: "redo" });
    expect(getText(mb)).toBe("Hello World");
  });

  test("redo restores cursor position", () => {
    const { editor } = setup("Hello");
    editor.setCursor(mbPoint(0, 5));

    editor.dispatch({ type: "insertText", text: "!" });
    expectPoint(editor.cursor, 0, 6);

    editor.dispatch({ type: "undo" });
    expectPoint(editor.cursor, 0, 5);

    editor.dispatch({ type: "redo" });
    expectPoint(editor.cursor, 0, 6);
  });

  test("multiple redos step forward through history", () => {
    const { editor, mb } = setup("A");
    editor.setCursor(mbPoint(0, 1));

    editor.dispatch({ type: "insertText", text: "B" });
    editor.dispatch({ type: "insertText", text: "C" });
    editor.dispatch({ type: "insertText", text: "D" });
    expect(getText(mb)).toBe("ABCD");

    // Undo all three
    editor.dispatch({ type: "undo" });
    editor.dispatch({ type: "undo" });
    editor.dispatch({ type: "undo" });
    expect(getText(mb)).toBe("A");

    // Redo one at a time
    editor.dispatch({ type: "redo" });
    expect(getText(mb)).toBe("AB");

    editor.dispatch({ type: "redo" });
    expect(getText(mb)).toBe("ABC");

    editor.dispatch({ type: "redo" });
    expect(getText(mb)).toBe("ABCD");
  });

  test("redo at end of history is no-op", () => {
    const { editor, mb } = setup("Hello");
    editor.setCursor(mbPoint(0, 5));
    editor.dispatch({ type: "insertText", text: "!" });
    expect(getText(mb)).toBe("Hello!");

    // No undo has been done — redo should do nothing
    editor.dispatch({ type: "redo" });
    expect(getText(mb)).toBe("Hello!");
    expectPoint(editor.cursor, 0, 6);
  });

  test("new edit after undo clears redo stack", () => {
    const { editor, mb } = setup("Hello");
    editor.setCursor(mbPoint(0, 5));

    editor.dispatch({ type: "insertText", text: " World" });
    expect(getText(mb)).toBe("Hello World");

    editor.dispatch({ type: "undo" });
    expect(getText(mb)).toBe("Hello");

    // New edit should clear the redo stack
    editor.dispatch({ type: "insertText", text: "!" });
    expect(getText(mb)).toBe("Hello!");

    // Redo should be a no-op now
    editor.dispatch({ type: "redo" });
    expect(getText(mb)).toBe("Hello!");
  });
});

// ─── Undo/redo with selections ──────────────────────────────────

describe("Undo/redo with selections", () => {
  test("undo restores selection state", () => {
    const { editor, mb } = setup("Hello World");
    editor.setCursor(mbPoint(0, 0));

    // Select "Hello" (extend right 5 times)
    for (let i = 0; i < 5; i++) {
      editor.dispatch({ type: "extendSelection", direction: "right", granularity: "character" });
    }

    const selBefore = editor.selection;
    expect(selBefore).toBeDefined();
    if (!selBefore) return;

    const snapBefore = mb.snapshot();
    const startBefore = snapBefore.resolveAnchor(selBefore.range.start);
    const endBefore = snapBefore.resolveAnchor(selBefore.range.end);
    if (startBefore) expectPoint(startBefore, 0, 0);
    if (endBefore) expectPoint(endBefore, 0, 5);

    // Replace selection with "Goodbye"
    editor.dispatch({ type: "insertText", text: "Goodbye" });
    expect(getText(mb)).toBe("Goodbye World");

    // Undo should restore the original text and the selection before the edit
    editor.dispatch({ type: "undo" });
    expect(getText(mb)).toBe("Hello World");

    // Cursor should be restored to where it was before the edit
    // (the cursorBefore stored on the undo entry)
    expectPoint(editor.cursor, 0, 5);
  });

  test("redo restores selection state", () => {
    const { editor, mb } = setup("Hello");
    editor.setCursor(mbPoint(0, 5));

    editor.dispatch({ type: "insertText", text: "!" });
    expect(getText(mb)).toBe("Hello!");
    expectPoint(editor.cursor, 0, 6);

    editor.dispatch({ type: "undo" });
    expect(getText(mb)).toBe("Hello");
    expectPoint(editor.cursor, 0, 5);

    editor.dispatch({ type: "redo" });
    expect(getText(mb)).toBe("Hello!");
    // After redo, cursor should be back where it was after the edit
    expectPoint(editor.cursor, 0, 6);
  });

  test("undo after replacing selection restores the selection and text", () => {
    const { editor, mb } = setup("123456");
    editor.setCursor(mbPoint(0, 1));

    // Select characters at positions 1-3 ("234")
    for (let i = 0; i < 3; i++) {
      editor.dispatch({ type: "extendSelection", direction: "right", granularity: "character" });
    }

    // Verify selection covers "234"
    const sel = editor.selection;
    expect(sel).toBeDefined();
    if (!sel) return;
    const snap1 = mb.snapshot();
    const start1 = snap1.resolveAnchor(sel.range.start);
    const end1 = snap1.resolveAnchor(sel.range.end);
    if (start1) expectPoint(start1, 0, 1);
    if (end1) expectPoint(end1, 0, 4);

    // Replace selection
    editor.dispatch({ type: "insertText", text: "cd" });
    expect(getText(mb)).toBe("1cd56");
    expectPoint(editor.cursor, 0, 3);

    // Undo: text and cursor position before the edit should be restored
    editor.dispatch({ type: "undo" });
    expect(getText(mb)).toBe("123456");
    // Cursor is restored to cursorBefore (which was at col 4, the head of the selection)
    expectPoint(editor.cursor, 0, 4);

    // Redo: the replacement should come back
    editor.dispatch({ type: "redo" });
    expect(getText(mb)).toBe("1cd56");
    expectPoint(editor.cursor, 0, 3);
  });
});
