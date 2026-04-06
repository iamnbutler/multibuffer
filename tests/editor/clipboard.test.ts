/**
 * Clipboard operation tests: cut, paste, copy, and getSelectedText.
 *
 * Tests the editor's clipboard-related commands and text extraction methods.
 * Inspired by Zed's test_clipboard (crates/editor/src/editor_tests.rs).
 */

import { beforeEach, describe, expect, test } from "bun:test";
import type { Editor } from "../../src/editor/editor.ts";
import { createSingleBufferEditor } from "../../src/editor/factories.ts";
import { expectPoint, mbPoint, mbRow, resetCounters } from "../helpers.ts";

// Helper to get full text from editor's multibuffer
function getText(editor: Editor): string {
  const snap = editor.multiBuffer.snapshot();
  const lines = snap.lines(mbRow(0), mbRow(snap.lineCount));
  return lines.join("\n");
}

// Helper to create an editor with text
function setup(text: string): Editor {
  return createSingleBufferEditor(text);
}

// Helper to create a read-only editor with text
function setupReadOnly(text: string): Editor {
  return createSingleBufferEditor(text, { readOnly: true });
}

beforeEach(() => {
  resetCounters();
});

// ─── Cut ────────────────────────────────────────────────────────────

describe("Clipboard - cut", () => {
  test("with selection, removes selected text from buffer", () => {
    const editor = setup("Hello World");
    editor.setCursor(mbPoint(0, 0));
    // Select "Hello"
    for (let i = 0; i < 5; i++) {
      editor.dispatch({ type: "extendSelection", direction: "right", granularity: "character" });
    }
    editor.dispatch({ type: "cut" });
    expect(getText(editor)).toBe(" World");
  });

  test("without selection (collapsed), cuts the entire line", () => {
    const editor = setup("first\nsecond\nthird");
    editor.setCursor(mbPoint(1, 0));
    editor.dispatch({ type: "cut" });
    // "second\n" should be removed (deleteLine behavior)
    expect(getText(editor)).toBe("first\nthird");
  });

  test("cursor position after cut is at start of former selection", () => {
    const editor = setup("Hello World");
    editor.setCursor(mbPoint(0, 6));
    // Select "World"
    for (let i = 0; i < 5; i++) {
      editor.dispatch({ type: "extendSelection", direction: "right", granularity: "character" });
    }
    editor.dispatch({ type: "cut" });
    // Cursor should be at position 6 (start of what was selected)
    expectPoint(editor.cursor, 0, 6);
  });

  test("cut with multi-cursor removes all selected regions", () => {
    const editor = setup("aaa\nbbb\nccc");
    editor.setCursor(mbPoint(0, 0));
    editor.dispatch({ type: "extendSelection", direction: "right", granularity: "word" });
    editor.dispatch({ type: "addCursor", at: mbPoint(2, 0) });
    // Extend the new cursor's selection to cover "ccc"
    editor.dispatch({ type: "extendSelection", direction: "right", granularity: "word" });

    editor.dispatch({ type: "cut" });
    const text = getText(editor);
    // Both "aaa" and "ccc" should be removed
    expect(text).not.toContain("aaa");
    expect(text).not.toContain("ccc");
  });

  test("cut in read-only mode is no-op", () => {
    const editor = setupReadOnly("Hello World");
    editor.setCursor(mbPoint(0, 0));
    // Select "Hello"
    for (let i = 0; i < 5; i++) {
      editor.dispatch({ type: "extendSelection", direction: "right", granularity: "character" });
    }
    editor.dispatch({ type: "cut" });
    expect(getText(editor)).toBe("Hello World");
  });
});

// ─── Paste ──────────────────────────────────────────────────────────

describe("Clipboard - paste", () => {
  test("inserts text at cursor position", () => {
    const editor = setup("Hello");
    editor.setCursor(mbPoint(0, 5));
    editor.dispatch({ type: "paste", text: " World" });
    expect(getText(editor)).toBe("Hello World");
  });

  test("replaces existing selection with pasted text", () => {
    const editor = setup("Hello World");
    editor.setCursor(mbPoint(0, 0));
    // Select "Hello"
    for (let i = 0; i < 5; i++) {
      editor.dispatch({ type: "extendSelection", direction: "right", granularity: "character" });
    }
    editor.dispatch({ type: "paste", text: "Goodbye" });
    expect(getText(editor)).toBe("Goodbye World");
  });

  test("paste multiline text inserts multiple lines", () => {
    const editor = setup("AB");
    editor.setCursor(mbPoint(0, 1));
    editor.dispatch({ type: "paste", text: "X\nY\nZ" });
    expect(getText(editor)).toBe("AX\nY\nZB");
  });

  test("cursor ends up at end of pasted text", () => {
    const editor = setup("AB");
    editor.setCursor(mbPoint(0, 1));
    editor.dispatch({ type: "paste", text: "XY" });
    // After pasting "XY" at position 1, cursor should be at col 3
    expectPoint(editor.cursor, 0, 3);
  });

  test("cursor after multiline paste is at end of pasted text", () => {
    const editor = setup("AB");
    editor.setCursor(mbPoint(0, 1));
    editor.dispatch({ type: "paste", text: "X\nY" });
    // "X\nY" inserted at col 1: result is "AX\nYB", cursor at end of "Y" = row 1, col 1
    expectPoint(editor.cursor, 1, 1);
  });

  test("paste with multi-cursor inserts at each position", () => {
    const editor = setup("aaa\nbbb\nccc");
    editor.setCursor(mbPoint(0, 1));
    editor.dispatch({ type: "addCursor", at: mbPoint(1, 1) });
    editor.dispatch({ type: "addCursor", at: mbPoint(2, 1) });

    editor.dispatch({ type: "paste", text: "X" });
    expect(getText(editor)).toBe("aXaa\nbXbb\ncXcc");
  });

  test("paste in read-only mode is no-op", () => {
    const editor = setupReadOnly("Hello");
    editor.setCursor(mbPoint(0, 5));
    editor.dispatch({ type: "paste", text: " World" });
    expect(getText(editor)).toBe("Hello");
  });
});

// ─── getSelectedText ────────────────────────────────────────────────

describe("Clipboard - getSelectedText", () => {
  test("returns selected text when selection is active", () => {
    const editor = setup("Hello World");
    editor.setCursor(mbPoint(0, 0));
    // Select "Hello"
    for (let i = 0; i < 5; i++) {
      editor.dispatch({ type: "extendSelection", direction: "right", granularity: "character" });
    }
    expect(editor.getSelectedText()).toBe("Hello");
  });

  test("returns empty string when selection is collapsed", () => {
    const editor = setup("Hello World");
    editor.setCursor(mbPoint(0, 3));
    expect(editor.getSelectedText()).toBe("");
  });

  test("with multi-cursor, returns all selections joined by newlines", () => {
    const editor = setup("aaa\nbbb\nccc");
    editor.setCursor(mbPoint(0, 0));
    editor.dispatch({ type: "extendSelection", direction: "right", granularity: "word" });
    editor.dispatch({ type: "addCursor", at: mbPoint(2, 0) });
    editor.dispatch({ type: "extendSelection", direction: "right", granularity: "word" });

    const text = editor.getSelectedText();
    // Should contain text from both selections
    expect(text).toContain("aaa");
    expect(text).toContain("ccc");
  });

  test("returns multiline selected text across lines", () => {
    const editor = setup("Hello\nWorld");
    editor.setCursor(mbPoint(0, 0));
    editor.dispatch({ type: "selectAll" });
    expect(editor.getSelectedText()).toBe("Hello\nWorld");
  });

  test("returns partial line selection", () => {
    const editor = setup("Hello World");
    editor.setCursor(mbPoint(0, 6));
    // Select "World"
    for (let i = 0; i < 5; i++) {
      editor.dispatch({ type: "extendSelection", direction: "right", granularity: "character" });
    }
    expect(editor.getSelectedText()).toBe("World");
  });
});

// ─── Copy (no-op in core) ───────────────────────────────────────────

describe("Clipboard - copy (no-op in core)", () => {
  test("copy command does not mutate buffer", () => {
    const editor = setup("Hello World");
    editor.setCursor(mbPoint(0, 0));
    // Select "Hello"
    for (let i = 0; i < 5; i++) {
      editor.dispatch({ type: "extendSelection", direction: "right", granularity: "character" });
    }
    editor.dispatch({ type: "copy" });
    expect(getText(editor)).toBe("Hello World");
  });

  test("copy command does not move cursor", () => {
    const editor = setup("Hello World");
    editor.setCursor(mbPoint(0, 3));
    editor.dispatch({ type: "copy" });
    expectPoint(editor.cursor, 0, 3);
  });

  test("copy with selection does not alter selection", () => {
    const editor = setup("Hello World");
    editor.setCursor(mbPoint(0, 0));
    for (let i = 0; i < 5; i++) {
      editor.dispatch({ type: "extendSelection", direction: "right", granularity: "character" });
    }
    const selBefore = editor.getSelectedText();
    editor.dispatch({ type: "copy" });
    const selAfter = editor.getSelectedText();
    expect(selAfter).toBe(selBefore);
  });

  test("copy in read-only mode does not throw", () => {
    const editor = setupReadOnly("Hello World");
    editor.setCursor(mbPoint(0, 0));
    for (let i = 0; i < 5; i++) {
      editor.dispatch({ type: "extendSelection", direction: "right", granularity: "character" });
    }
    // copy is not an edit command, so it should work in read-only mode
    expect(() => editor.dispatch({ type: "copy" })).not.toThrow();
    expect(getText(editor)).toBe("Hello World");
  });
});

// ─── getCutText ─────────────────────────────────────────────────────

describe("Clipboard - getCutText", () => {
  test("returns selected text when selection is non-collapsed", () => {
    const editor = setup("Hello World");
    editor.setCursor(mbPoint(0, 0));
    for (let i = 0; i < 5; i++) {
      editor.dispatch({ type: "extendSelection", direction: "right", granularity: "character" });
    }
    expect(editor.getCutText()).toBe("Hello");
  });

  test("returns full line with newline when selection is collapsed", () => {
    const editor = setup("first\nsecond\nthird");
    editor.setCursor(mbPoint(1, 0));
    // Collapsed cursor on "second" line — getCutText should return "second\n"
    expect(editor.getCutText()).toBe("second\n");
  });

  test("returns last line without trailing newline when cursor on last line", () => {
    const editor = setup("first\nsecond");
    editor.setCursor(mbPoint(1, 0));
    expect(editor.getCutText()).toBe("second");
  });
});

// ─── getCutText — multi-cursor ──────────────────────────────────────

describe("Clipboard - getCutText multi-cursor", () => {
  test("two collapsed cursors on different lines returns both lines", () => {
    const editor = setup("first\nsecond\nthird");
    editor.setCursor(mbPoint(0, 2));
    editor.dispatch({ type: "addCursor", at: mbPoint(2, 1) });
    expect(editor.selections.length).toBe(2);
    // Both cursors collapsed — getCutText returns "first\n" + "third" (no trailing newline on last)
    expect(editor.getCutText()).toBe("first\nthird");
  });

  test("two collapsed cursors on same line deduplicates the row", () => {
    const editor = setup("hello\nworld");
    editor.setCursor(mbPoint(0, 0));
    editor.dispatch({ type: "addCursor", at: mbPoint(0, 3) });
    // Both cursors on row 0 — getCutText should return "hello\n" once
    expect(editor.getCutText()).toBe("hello\n");
  });

  test("three collapsed cursors on non-last, non-last, last lines", () => {
    const editor = setup("aaa\nbbb\nccc");
    editor.setCursor(mbPoint(0, 0));
    editor.dispatch({ type: "addCursor", at: mbPoint(1, 0) });
    editor.dispatch({ type: "addCursor", at: mbPoint(2, 0) });
    expect(editor.selections.length).toBe(3);
    // rows 0 and 1 get \n appended; row 2 (last line) does not
    expect(editor.getCutText()).toBe("aaa\nbbb\nccc");
  });

  test("at least one non-collapsed selection — uses getSelectedText, skips collapsed", () => {
    const editor = setup("aaa\nbbb\nccc");
    // Cursor 1: extend to select "aaa" on row 0 (non-collapsed)
    editor.setCursor(mbPoint(0, 0));
    editor.dispatch({ type: "extendSelection", direction: "right", granularity: "word" });
    // Cursor 2: collapsed at row 2 — addCursor creates a collapsed cursor
    editor.dispatch({ type: "addCursor", at: mbPoint(2, 0) });
    expect(editor.selections.length).toBe(2);
    // hasNonCollapsedSelection is true (cursor 1 is non-collapsed)
    // → getCutText delegates to getSelectedText
    // getSelectedText skips collapsed selections (cursor 2), so only "aaa" is returned
    expect(editor.getCutText()).toBe("aaa");
  });
});
