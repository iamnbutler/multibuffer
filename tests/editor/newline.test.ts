/**
 * Newline insertion tests.
 *
 * Tests insertNewline behavior: line splitting, cursor placement,
 * auto-indent preservation, selection replacement, and multi-cursor.
 */

import { describe, expect, test } from "bun:test";
import type { Editor } from "../../src/editor/editor.ts";
import { createSingleBufferEditor } from "../../src/editor/factories.ts";
import { expectPoint, mbPoint, mbRow, } from "../helpers.ts";

// Helper to get text from editor
function getText(editor: Editor): string {
  const snap = editor.multiBuffer.snapshot();
  const lines = snap.lines(mbRow(0), mbRow(snap.lineCount));
  return lines.join("\n");
}

// Helper to create an editor with text
function setup(text: string): Editor {
  return createSingleBufferEditor(text);
}

// Helper to get line count from editor
function lineCount(editor: Editor): number {
  return editor.multiBuffer.snapshot().lineCount;
}

// ─── Newline insertion ──────────────────────────────────────────────

describe("Newline insertion", () => {
  test("splits line at cursor position", () => {
    const editor = setup("HelloWorld");
    editor.setCursor(mbPoint(0, 5));
    editor.dispatch({ type: "insertNewline" });
    expect(getText(editor)).toBe("Hello\nWorld");
  });

  test("at beginning of line, inserts empty line above", () => {
    const editor = setup("Hello");
    editor.setCursor(mbPoint(0, 0));
    editor.dispatch({ type: "insertNewline" });
    expect(getText(editor)).toBe("\nHello");
  });

  test("at end of line, inserts empty line below", () => {
    const editor = setup("Hello");
    editor.setCursor(mbPoint(0, 5));
    editor.dispatch({ type: "insertNewline" });
    expect(getText(editor)).toBe("Hello\n");
  });

  test("cursor moves to start of new line", () => {
    const editor = setup("HelloWorld");
    editor.setCursor(mbPoint(0, 5));
    editor.dispatch({ type: "insertNewline" });
    expectPoint(editor.cursor, 1, 0);
  });

  test("with selection, replaces selection with newline", () => {
    const editor = setup("Hello World");
    editor.setCursor(mbPoint(0, 5));
    // Select " World"
    for (let i = 0; i < 6; i++) {
      editor.dispatch({ type: "extendSelection", direction: "right", granularity: "character" });
    }
    editor.dispatch({ type: "insertNewline" });
    expect(getText(editor)).toBe("Hello\n");
    expectPoint(editor.cursor, 1, 0);
  });
});

// ─── Newline auto-indent ────────────────────────────────────────────

describe("Newline auto-indent", () => {
  test("preserves indentation of current line", () => {
    const editor = setup("    hello");
    editor.setCursor(mbPoint(0, 9));
    editor.dispatch({ type: "insertNewline" });
    expect(getText(editor)).toBe("    hello\n    ");
    expectPoint(editor.cursor, 1, 4);
  });

  test("with no indentation, new line starts at column 0", () => {
    const editor = setup("hello");
    editor.setCursor(mbPoint(0, 5));
    editor.dispatch({ type: "insertNewline" });
    expect(getText(editor)).toBe("hello\n");
    expectPoint(editor.cursor, 1, 0);
  });

  test("with multi-cursor on differently indented lines, each gets correct indent", () => {
    // Line 0: no indent, Line 1: 2-space indent, Line 2: 4-space indent
    const editor = setup("aaa\n  bbb\n    ccc");
    editor.setCursor(mbPoint(0, 3));
    editor.dispatch({ type: "addCursor", at: mbPoint(1, 5) });
    editor.dispatch({ type: "addCursor", at: mbPoint(2, 7) });
    expect(editor.selections.length).toBe(3);

    editor.dispatch({ type: "insertNewline" });
    const text = getText(editor);
    // Line 0 "aaa" has no indent → newline should not add indent
    // Line 1 "  bbb" has 2-space indent → newline should add "  "
    // Line 2 "    ccc" has 4-space indent → newline should add "    "
    const lines = text.split("\n");
    // After inserting newlines:
    // "aaa" → "aaa\n"
    // "  bbb" → "  bbb\n  "
    // "    ccc" → "    ccc\n    "
    expect(lines[0]).toBe("aaa");
    expect(lines[1]).toBe("");        // no indent after unindented line
    expect(lines[2]).toBe("  bbb");
    expect(lines[3]).toBe("  ");      // 2-space indent preserved
    expect(lines[4]).toBe("    ccc");
    expect(lines[5]).toBe("    ");    // 4-space indent preserved
  });

  test("indentation preserved when splitting indented line in middle", () => {
    const editor = setup("    hello world");
    editor.setCursor(mbPoint(0, 10)); // between "hello " and "world"
    editor.dispatch({ type: "insertNewline" });
    expect(getText(editor)).toBe("    hello \n    world");
    expectPoint(editor.cursor, 1, 4);
  });
});

// ─── Newline with multi-cursor ──────────────────────────────────────

describe("Newline with multi-cursor", () => {
  test("inserts newline at each cursor position", () => {
    const editor = setup("aaa\nbbb");
    editor.setCursor(mbPoint(0, 1));
    editor.dispatch({ type: "addCursor", at: mbPoint(1, 1) });
    expect(editor.selections.length).toBe(2);

    editor.dispatch({ type: "insertNewline" });
    const text = getText(editor);
    expect(text).toContain("a\naa");
    expect(text).toContain("b\nbb");
  });

  test("all cursors advance to new lines", () => {
    const editor = setup("aaa\nbbb");
    editor.setCursor(mbPoint(0, 1));
    editor.dispatch({ type: "addCursor", at: mbPoint(1, 1) });

    editor.dispatch({ type: "insertNewline" });
    // Both cursors should be on new lines (the lines created by the newline insertions)
    const selections = editor.selections;
    expect(selections.length).toBe(2);
  });

  test("line count increases by number of cursors", () => {
    const editor = setup("aaa\nbbb\nccc");
    const initialLines = lineCount(editor);

    editor.setCursor(mbPoint(0, 1));
    editor.dispatch({ type: "addCursor", at: mbPoint(1, 1) });
    editor.dispatch({ type: "addCursor", at: mbPoint(2, 1) });
    expect(editor.selections.length).toBe(3);

    editor.dispatch({ type: "insertNewline" });
    expect(lineCount(editor)).toBe(initialLines + 3);
  });
});
