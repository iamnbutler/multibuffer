/**
 * Editor integration tests.
 *
 * Tests the Editor class as a command dispatcher — verifying that
 * dispatch() correctly updates cursor, selection, and buffer state.
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { Editor } from "../../src/editor/editor.ts";
import { createBuffer } from "../../src/multibuffer/buffer.ts";
import { createMultiBuffer } from "../../src/multibuffer/multibuffer.ts";
import type { MultiBuffer } from "../../src/multibuffer/types.ts";
import {
  createBufferId,
  excerptRange,
  expectPoint,
  mbPoint,
  mbRow,
  num,
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

// ─── Cursor Movement via dispatch ───────────────────────────────

describe("Editor - Cursor Movement", () => {
  test("initial cursor is at 0,0", () => {
    const { editor } = setup("Hello\nWorld");
    expectPoint(editor.cursor, 0, 0);
  });

  test("move right advances cursor", () => {
    const { editor } = setup("Hello");
    editor.dispatch({ type: "moveCursor", direction: "right", granularity: "character" });
    expectPoint(editor.cursor, 0, 1);
  });

  test("move right twice advances cursor twice", () => {
    const { editor } = setup("Hello");
    editor.dispatch({ type: "moveCursor", direction: "right", granularity: "character" });
    editor.dispatch({ type: "moveCursor", direction: "right", granularity: "character" });
    expectPoint(editor.cursor, 0, 2);
  });

  test("move left from middle of line", () => {
    const { editor } = setup("Hello");
    editor.setCursor(mbPoint(0, 3));
    editor.dispatch({ type: "moveCursor", direction: "left", granularity: "character" });
    expectPoint(editor.cursor, 0, 2);
  });

  test("move left at start stays put", () => {
    const { editor } = setup("Hello");
    editor.dispatch({ type: "moveCursor", direction: "left", granularity: "character" });
    expectPoint(editor.cursor, 0, 0);
  });

  test("move down from first line", () => {
    const { editor } = setup("Hello\nWorld");
    editor.dispatch({ type: "moveCursor", direction: "down", granularity: "character" });
    expectPoint(editor.cursor, 1, 0);
  });

  test("move down preserves column", () => {
    const { editor } = setup("Hello\nWorld");
    editor.setCursor(mbPoint(0, 3));
    editor.dispatch({ type: "moveCursor", direction: "down", granularity: "character" });
    expectPoint(editor.cursor, 1, 3);
  });

  test("move up from second line", () => {
    const { editor } = setup("Hello\nWorld");
    editor.setCursor(mbPoint(1, 2));
    editor.dispatch({ type: "moveCursor", direction: "up", granularity: "character" });
    expectPoint(editor.cursor, 0, 2);
  });

  test("move right wraps to next line", () => {
    const { editor } = setup("AB\nCD");
    editor.setCursor(mbPoint(0, 2));
    editor.dispatch({ type: "moveCursor", direction: "right", granularity: "character" });
    expectPoint(editor.cursor, 1, 0);
  });

  test("move left wraps to previous line", () => {
    const { editor } = setup("AB\nCD");
    editor.setCursor(mbPoint(1, 0));
    editor.dispatch({ type: "moveCursor", direction: "left", granularity: "character" });
    expectPoint(editor.cursor, 0, 2);
  });

  test("move to line start (Home)", () => {
    const { editor } = setup("Hello World");
    editor.setCursor(mbPoint(0, 7));
    editor.dispatch({ type: "moveCursor", direction: "left", granularity: "line" });
    expectPoint(editor.cursor, 0, 0);
  });

  test("move to line end (End)", () => {
    const { editor } = setup("Hello World");
    editor.setCursor(mbPoint(0, 3));
    editor.dispatch({ type: "moveCursor", direction: "right", granularity: "line" });
    expectPoint(editor.cursor, 0, 11);
  });

  test("move to buffer start", () => {
    const { editor } = setup("AAA\nBBB\nCCC");
    editor.setCursor(mbPoint(2, 2));
    editor.dispatch({ type: "moveCursor", direction: "left", granularity: "buffer" });
    expectPoint(editor.cursor, 0, 0);
  });

  test("move to buffer end", () => {
    const { editor } = setup("AAA\nBBB\nCCC");
    editor.dispatch({ type: "moveCursor", direction: "right", granularity: "buffer" });
    expectPoint(editor.cursor, 2, 3);
  });

  test("onChange fires on cursor move", () => {
    const { editor } = setup("Hello");
    let called = false;
    editor.onChange(() => { called = true; });
    editor.dispatch({ type: "moveCursor", direction: "right", granularity: "character" });
    expect(called).toBe(true);
  });
});

// ─── setCursor (click placement) ────────────────────────────────

describe("Editor - setCursor", () => {
  test("setCursor places cursor at given point", () => {
    const { editor } = setup("Hello\nWorld");
    editor.setCursor(mbPoint(1, 3));
    expectPoint(editor.cursor, 1, 3);
  });

  test("setCursor creates collapsed selection", () => {
    const { editor, mb } = setup("Hello\nWorld");
    editor.setCursor(mbPoint(0, 5));
    const sel = editor.selection;
    expect(sel).toBeDefined();

    const snap = mb.snapshot();
    if (sel) {
      const start = snap.resolveAnchor(sel.range.start);
      const end = snap.resolveAnchor(sel.range.end);
      if (start && end) {
        expectPoint(start, 0, 5);
        expectPoint(end, 0, 5);
      }
    }
  });

  test("setCursor fires onChange", () => {
    const { editor } = setup("Hello");
    let called = false;
    editor.onChange(() => { called = true; });
    editor.setCursor(mbPoint(0, 3));
    expect(called).toBe(true);
  });
});

// ─── Mouse Selection (drag, double-click, triple-click) ─────────

describe("Editor - extendSelectionTo (drag)", () => {
  test("drag from (0,0) to (0,5) selects 'Hello'", () => {
    const { editor, mb } = setup("Hello World");
    editor.setCursor(mbPoint(0, 0));
    editor.extendSelectionTo(mbPoint(0, 5));

    const snap = mb.snapshot();
    const sel = editor.selection;
    expect(sel).toBeDefined();
    if (!sel) return;

    const start = snap.resolveAnchor(sel.range.start);
    const end = snap.resolveAnchor(sel.range.end);
    if (start) expectPoint(start, 0, 0);
    if (end) expectPoint(end, 0, 5);
  });

  test("drag across lines", () => {
    const { editor, mb } = setup("Hello\nWorld");
    editor.setCursor(mbPoint(0, 3));
    editor.extendSelectionTo(mbPoint(1, 2));

    const snap = mb.snapshot();
    const sel = editor.selection;
    expect(sel).toBeDefined();
    if (!sel) return;

    const start = snap.resolveAnchor(sel.range.start);
    const end = snap.resolveAnchor(sel.range.end);
    if (start) expectPoint(start, 0, 3);
    if (end) expectPoint(end, 1, 2);
  });

  test("drag backward (right to left)", () => {
    const { editor, mb } = setup("Hello World");
    editor.setCursor(mbPoint(0, 8));
    editor.extendSelectionTo(mbPoint(0, 3));

    const snap = mb.snapshot();
    const sel = editor.selection;
    expect(sel).toBeDefined();
    if (!sel) return;

    const start = snap.resolveAnchor(sel.range.start);
    const end = snap.resolveAnchor(sel.range.end);
    if (start) expectPoint(start, 0, 3);
    if (end) expectPoint(end, 0, 8);
  });

  test("cursor follows head during drag", () => {
    const { editor } = setup("Hello World");
    editor.setCursor(mbPoint(0, 0));
    editor.extendSelectionTo(mbPoint(0, 5));
    expectPoint(editor.cursor, 0, 5);
  });

  test("continuing drag updates selection", () => {
    const { editor, mb } = setup("Hello World");
    editor.setCursor(mbPoint(0, 0));
    editor.extendSelectionTo(mbPoint(0, 3));
    editor.extendSelectionTo(mbPoint(0, 8));

    const snap = mb.snapshot();
    const sel = editor.selection;
    expect(sel).toBeDefined();
    if (!sel) return;

    const start = snap.resolveAnchor(sel.range.start);
    const end = snap.resolveAnchor(sel.range.end);
    if (start) expectPoint(start, 0, 0);
    if (end) expectPoint(end, 0, 8);
  });
});

describe("Editor - selectWordAt (double-click)", () => {
  test("double-click on word selects it", () => {
    const { editor, mb } = setup("Hello World");
    editor.selectWordAt(mbPoint(0, 2));

    const snap = mb.snapshot();
    const sel = editor.selection;
    expect(sel).toBeDefined();
    if (!sel) return;

    const start = snap.resolveAnchor(sel.range.start);
    const end = snap.resolveAnchor(sel.range.end);
    if (start) expectPoint(start, 0, 0);
    if (end) expectPoint(end, 0, 5);
  });

  test("double-click on second word", () => {
    const { editor, mb } = setup("Hello World");
    editor.selectWordAt(mbPoint(0, 8));

    const snap = mb.snapshot();
    const sel = editor.selection;
    expect(sel).toBeDefined();
    if (!sel) return;

    const start = snap.resolveAnchor(sel.range.start);
    const end = snap.resolveAnchor(sel.range.end);
    if (start) expectPoint(start, 0, 6);
    if (end) expectPoint(end, 0, 11);
  });

  test("double-click on space selects space", () => {
    const { editor, mb } = setup("Hello World");
    editor.selectWordAt(mbPoint(0, 5));

    const snap = mb.snapshot();
    const sel = editor.selection;
    expect(sel).toBeDefined();
    if (!sel) return;

    const start = snap.resolveAnchor(sel.range.start);
    const end = snap.resolveAnchor(sel.range.end);
    // Should select the whitespace run
    if (start) expectPoint(start, 0, 5);
    if (end) expectPoint(end, 0, 6);
  });
});

describe("Editor - selectLineAt (triple-click)", () => {
  test("triple-click selects entire line", () => {
    const { editor, mb } = setup("Hello\nWorld\nFoo");
    editor.selectLineAt(mbPoint(1, 2));

    const snap = mb.snapshot();
    const sel = editor.selection;
    expect(sel).toBeDefined();
    if (!sel) return;

    const start = snap.resolveAnchor(sel.range.start);
    const end = snap.resolveAnchor(sel.range.end);
    if (start) expectPoint(start, 1, 0);
    if (end) expectPoint(end, 1, 5);
  });

  test("triple-click on first line", () => {
    const { editor, mb } = setup("Hello\nWorld");
    editor.selectLineAt(mbPoint(0, 3));

    const snap = mb.snapshot();
    const sel = editor.selection;
    expect(sel).toBeDefined();
    if (!sel) return;

    const start = snap.resolveAnchor(sel.range.start);
    const end = snap.resolveAnchor(sel.range.end);
    if (start) expectPoint(start, 0, 0);
    if (end) expectPoint(end, 0, 5);
  });
});

// ─── Text Insertion ─────────────────────────────────────────────

describe("Editor - Text Insertion", () => {
  test("insert single character", () => {
    const { editor, mb } = setup("Hello");
    editor.dispatch({ type: "insertText", text: "X" });
    expect(getText(mb)).toBe("XHello");
    expectPoint(editor.cursor, 0, 1);
  });

  test("insert at cursor position", () => {
    const { editor, mb } = setup("Hello");
    editor.setCursor(mbPoint(0, 5));
    editor.dispatch({ type: "insertText", text: "!" });
    expect(getText(mb)).toBe("Hello!");
    expectPoint(editor.cursor, 0, 6);
  });

  test("insert in middle of line", () => {
    const { editor, mb } = setup("Hllo");
    editor.setCursor(mbPoint(0, 1));
    editor.dispatch({ type: "insertText", text: "e" });
    expect(getText(mb)).toBe("Hello");
    expectPoint(editor.cursor, 0, 2);
  });

  test("insert multi-character string", () => {
    const { editor, mb } = setup("Hello");
    editor.setCursor(mbPoint(0, 5));
    editor.dispatch({ type: "insertText", text: " World" });
    expect(getText(mb)).toBe("Hello World");
    expectPoint(editor.cursor, 0, 11);
  });

  test("insertNewline splits line", () => {
    const { editor, mb } = setup("HelloWorld");
    editor.setCursor(mbPoint(0, 5));
    editor.dispatch({ type: "insertNewline" });
    expect(getText(mb)).toBe("Hello\nWorld");
    expectPoint(editor.cursor, 1, 0);
  });

  test("insertTab inserts spaces", () => {
    const { editor, mb } = setup("Hello");
    editor.setCursor(mbPoint(0, 0));
    editor.dispatch({ type: "insertTab" });
    expect(getText(mb)).toBe("  Hello");
    expectPoint(editor.cursor, 0, 2);
  });

  test("insert replaces non-collapsed selection", () => {
    const { editor, mb } = setup("Hello World");
    editor.setCursor(mbPoint(0, 0));
    // Select "Hello"
    for (let i = 0; i < 5; i++) {
      editor.dispatch({ type: "extendSelection", direction: "right", granularity: "character" });
    }
    editor.dispatch({ type: "insertText", text: "Goodbye" });
    expect(getText(mb)).toBe("Goodbye World");
    expectPoint(editor.cursor, 0, 7);
  });
});

// ─── Delete Backward/Forward ────────────────────────────────────

describe("Editor - Delete Backward", () => {
  test("delete backward removes character before cursor", () => {
    const { editor, mb } = setup("Hello");
    editor.setCursor(mbPoint(0, 5));
    editor.dispatch({ type: "deleteBackward", granularity: "character" });
    expect(getText(mb)).toBe("Hell");
    expectPoint(editor.cursor, 0, 4);
  });

  test("delete backward at start does nothing", () => {
    const { editor, mb } = setup("Hello");
    editor.dispatch({ type: "deleteBackward", granularity: "character" });
    expect(getText(mb)).toBe("Hello");
    expectPoint(editor.cursor, 0, 0);
  });

  test("delete backward joins lines", () => {
    const { editor, mb } = setup("Hello\nWorld");
    editor.setCursor(mbPoint(1, 0));
    editor.dispatch({ type: "deleteBackward", granularity: "character" });
    expect(getText(mb)).toBe("HelloWorld");
    expectPoint(editor.cursor, 0, 5);
  });

  test("delete backward in middle of line", () => {
    const { editor, mb } = setup("Hello");
    editor.setCursor(mbPoint(0, 3));
    editor.dispatch({ type: "deleteBackward", granularity: "character" });
    expect(getText(mb)).toBe("Helo");
    expectPoint(editor.cursor, 0, 2);
  });

  test("delete backward deletes selection when active", () => {
    const { editor, mb } = setup("Hello World");
    editor.setCursor(mbPoint(0, 0));
    for (let i = 0; i < 5; i++) {
      editor.dispatch({ type: "extendSelection", direction: "right", granularity: "character" });
    }
    editor.dispatch({ type: "deleteBackward", granularity: "character" });
    expect(getText(mb)).toBe(" World");
    expectPoint(editor.cursor, 0, 0);
  });

  test("Cmd+Backspace deletes to line start", () => {
    const { editor, mb } = setup("Hello World");
    editor.setCursor(mbPoint(0, 7));
    editor.dispatch({ type: "deleteBackward", granularity: "line" });
    expect(getText(mb)).toBe("orld");
    expectPoint(editor.cursor, 0, 0);
  });

  test("Opt+Backspace deletes word backward", () => {
    const { editor, mb } = setup("Hello World");
    editor.setCursor(mbPoint(0, 11));
    editor.dispatch({ type: "deleteBackward", granularity: "word" });
    expect(getText(mb)).toBe("Hello ");
    expectPoint(editor.cursor, 0, 6);
  });
});

describe("Editor - Delete Forward", () => {
  test("delete forward removes character after cursor", () => {
    const { editor, mb } = setup("Hello");
    editor.dispatch({ type: "deleteForward", granularity: "character" });
    expect(getText(mb)).toBe("ello");
    expectPoint(editor.cursor, 0, 0);
  });

  test("delete forward at end does nothing", () => {
    const { editor, mb } = setup("Hello");
    editor.setCursor(mbPoint(0, 5));
    editor.dispatch({ type: "deleteForward", granularity: "character" });
    expect(getText(mb)).toBe("Hello");
    expectPoint(editor.cursor, 0, 5);
  });

  test("delete forward joins lines", () => {
    const { editor, mb } = setup("Hello\nWorld");
    editor.setCursor(mbPoint(0, 5));
    editor.dispatch({ type: "deleteForward", granularity: "character" });
    expect(getText(mb)).toBe("HelloWorld");
    expectPoint(editor.cursor, 0, 5);
  });
});

// ─── Delete Line ────────────────────────────────────────────────

describe("Editor - Delete Line", () => {
  test("delete line removes current line", () => {
    const { editor, mb } = setup("AAA\nBBB\nCCC");
    editor.setCursor(mbPoint(1, 1));
    editor.dispatch({ type: "deleteLine" });
    expect(getText(mb)).toBe("AAA\nCCC");
    expectPoint(editor.cursor, 1, 0);
  });

  test("delete first line", () => {
    const { editor, mb } = setup("AAA\nBBB\nCCC");
    editor.dispatch({ type: "deleteLine" });
    expect(getText(mb)).toBe("BBB\nCCC");
    expectPoint(editor.cursor, 0, 0);
  });

  test("delete last line", () => {
    const { editor, mb } = setup("AAA\nBBB\nCCC");
    editor.setCursor(mbPoint(2, 2));
    editor.dispatch({ type: "deleteLine" });
    expect(getText(mb)).toBe("AAA\nBBB");
    expectPoint(editor.cursor, 1, 0);
  });

  test("delete only line leaves empty buffer", () => {
    const { editor, mb } = setup("Hello");
    editor.dispatch({ type: "deleteLine" });
    expect(getText(mb)).toBe("");
    expectPoint(editor.cursor, 0, 0);
  });
});

// ─── Selection Extension ────────────────────────────────────────

describe("Editor - Selection Extension", () => {
  test("extend selection right", () => {
    const { editor, mb } = setup("Hello");
    editor.dispatch({ type: "extendSelection", direction: "right", granularity: "character" });
    const sel = editor.selection;
    expect(sel).toBeDefined();

    const snap = mb.snapshot();
    if (sel) {
      const start = snap.resolveAnchor(sel.range.start);
      const end = snap.resolveAnchor(sel.range.end);
      if (start) expectPoint(start, 0, 0);
      if (end) expectPoint(end, 0, 1);
    }
  });

  test("extend selection down across lines", () => {
    const { editor, mb } = setup("Hello\nWorld");
    editor.setCursor(mbPoint(0, 2));
    editor.dispatch({ type: "extendSelection", direction: "down", granularity: "character" });
    const sel = editor.selection;
    expect(sel).toBeDefined();

    const snap = mb.snapshot();
    if (sel) {
      const start = snap.resolveAnchor(sel.range.start);
      const end = snap.resolveAnchor(sel.range.end);
      if (start) expectPoint(start, 0, 2);
      if (end) expectPoint(end, 1, 2);
    }
  });

  test("moveCursor collapses non-collapsed selection (left)", () => {
    const { editor } = setup("Hello World");
    editor.setCursor(mbPoint(0, 3));
    // Extend selection right 3 times: selecting "lo "
    editor.dispatch({ type: "extendSelection", direction: "right", granularity: "character" });
    editor.dispatch({ type: "extendSelection", direction: "right", granularity: "character" });
    editor.dispatch({ type: "extendSelection", direction: "right", granularity: "character" });

    // Move left should collapse to selection start (0,3), not move from head
    editor.dispatch({ type: "moveCursor", direction: "left", granularity: "character" });
    expectPoint(editor.cursor, 0, 3);
  });

  test("moveCursor collapses non-collapsed selection (right)", () => {
    const { editor } = setup("Hello World");
    editor.setCursor(mbPoint(0, 3));
    editor.dispatch({ type: "extendSelection", direction: "right", granularity: "character" });
    editor.dispatch({ type: "extendSelection", direction: "right", granularity: "character" });

    // Move right should collapse to selection end (0,5), not move from head
    editor.dispatch({ type: "moveCursor", direction: "right", granularity: "character" });
    expectPoint(editor.cursor, 0, 5);
  });

  test("select all", () => {
    const { editor, mb } = setup("Hello\nWorld");
    editor.dispatch({ type: "selectAll" });
    const sel = editor.selection;
    expect(sel).toBeDefined();

    const snap = mb.snapshot();
    if (sel) {
      const start = snap.resolveAnchor(sel.range.start);
      const end = snap.resolveAnchor(sel.range.end);
      if (start) expectPoint(start, 0, 0);
      if (end) expectPoint(end, 1, 5);
    }
  });
});

// ─── Sequential Edits ───────────────────────────────────────────

describe("Editor - Sequential Edits", () => {
  test("type several characters in sequence", () => {
    const { editor, mb } = setup("");
    editor.dispatch({ type: "insertText", text: "H" });
    editor.dispatch({ type: "insertText", text: "i" });
    editor.dispatch({ type: "insertText", text: "!" });
    expect(getText(mb)).toBe("Hi!");
    expectPoint(editor.cursor, 0, 3);
  });

  test("type then delete", () => {
    const { editor, mb } = setup("");
    editor.dispatch({ type: "insertText", text: "Hello" });
    editor.dispatch({ type: "deleteBackward", granularity: "character" });
    expect(getText(mb)).toBe("Hell");
    expectPoint(editor.cursor, 0, 4);
  });

  test("type newline then type on new line", () => {
    const { editor, mb } = setup("");
    editor.dispatch({ type: "insertText", text: "Line 1" });
    editor.dispatch({ type: "insertNewline" });
    editor.dispatch({ type: "insertText", text: "Line 2" });
    expect(getText(mb)).toBe("Line 1\nLine 2");
    expectPoint(editor.cursor, 1, 6);
  });

  test("delete backward across newline", () => {
    const { editor, mb } = setup("Line 1\nLine 2");
    editor.setCursor(mbPoint(1, 0));
    editor.dispatch({ type: "deleteBackward", granularity: "character" });
    expect(getText(mb)).toBe("Line 1Line 2");
    expectPoint(editor.cursor, 0, 6);
  });

  test("select all then type replaces everything", () => {
    const { editor, mb } = setup("Old content");
    editor.dispatch({ type: "selectAll" });
    editor.dispatch({ type: "insertText", text: "New" });
    expect(getText(mb)).toBe("New");
    expectPoint(editor.cursor, 0, 3);
  });

  test("select all then delete clears buffer", () => {
    const { editor, mb } = setup("Hello World");
    editor.dispatch({ type: "selectAll" });
    editor.dispatch({ type: "deleteBackward", granularity: "character" });
    expect(getText(mb)).toBe("");
    expectPoint(editor.cursor, 0, 0);
  });
});

// ─── Multi-excerpt Editing ──────────────────────────────────────

describe("Editor - Multi-excerpt", () => {
  /** Create a multibuffer with two excerpts from different buffers. */
  function setupMulti() {
    const buf1 = createBuffer(createBufferId(), "Alpha\nBravo");
    const buf2 = createBuffer(createBufferId(), "Charlie\nDelta");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf1, excerptRange(0, 2), { hasTrailingNewline: true });
    mb.addExcerpt(buf2, excerptRange(0, 2));
    const editor = new Editor(mb);
    return { mb, editor };
  }

  test("cursor movement across excerpt boundary", () => {
    const { editor } = setupMulti();
    // Excerpt 1: row 0 = "Alpha", row 1 = "Bravo", row 2 = trailing newline
    // Excerpt 2: row 3 = "Charlie", row 4 = "Delta"
    editor.setCursor(mbPoint(1, 5));
    // Move down from "Bravo" (row 1) → trailing newline (row 2)
    editor.dispatch({ type: "moveCursor", direction: "down", granularity: "character" });
    // Should be on row 2 (trailing newline)
    expect(num(editor.cursor.row)).toBe(2);
    // Move down again → "Charlie" (row 3)
    editor.dispatch({ type: "moveCursor", direction: "down", granularity: "character" });
    expect(num(editor.cursor.row)).toBe(3);
  });

  test("typing in first excerpt does not affect second", () => {
    const { editor, mb } = setupMulti();
    editor.setCursor(mbPoint(0, 5));
    editor.dispatch({ type: "insertText", text: "!" });

    const snap = mb.snapshot();
    // First excerpt, first line
    expect(snap.lines(mbRow(0), mbRow(1))).toEqual(["Alpha!"]);
    // Second excerpt should still be intact — find it after the trailing newline
    // The exact row may shift if trailing newline row shifted
    const lastRow = snap.lineCount;
    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in test
    const lastLines = snap.lines((lastRow - 2) as import("../../src/multibuffer/types.ts").MultiBufferRow, lastRow as import("../../src/multibuffer/types.ts").MultiBufferRow);
    expect(lastLines).toEqual(["Charlie", "Delta"]);
  });
});

// ─── keyEventToCommand ──────────────────────────────────────────
//
// All tests use macOS conventions (Cmd=meta, Opt=alt).
// In Bun on macOS, navigator.platform = "MacIntel" so isMac=true
// and the platform modifier = metaKey.

describe("keyEventToCommand", () => {
  let keyEventToCommand: typeof import("../../src/editor/input-handler.ts").keyEventToCommand;

  beforeEach(async () => {
    const mod = await import("../../src/editor/input-handler.ts");
    keyEventToCommand = mod.keyEventToCommand;
  });

  /** Create a minimal KeyboardEvent-like object for testing. */
  function key(
    keyName: string,
    opts: { meta?: boolean; ctrl?: boolean; shift?: boolean; alt?: boolean } = {},
  ) {
    // biome-ignore lint/plugin/no-type-assertion: expect: minimal KeyboardEvent stub for unit test
    return {
      key: keyName,
      metaKey: opts.meta ?? false,
      ctrlKey: opts.ctrl ?? false,
      shiftKey: opts.shift ?? false,
      altKey: opts.alt ?? false,
    } as unknown as KeyboardEvent;
  }

  // On macOS (Bun), isMac=true, so platform mod = metaKey.
  // We use meta: true for Cmd (platform mod) tests.

  // ── Basic arrow movement ──────────────────────────────────────

  test("ArrowRight → moveCursor right character", () => {
    const cmd = keyEventToCommand(key("ArrowRight"));
    expect(cmd).toEqual({ type: "moveCursor", direction: "right", granularity: "character" });
  });

  test("ArrowLeft → moveCursor left character", () => {
    const cmd = keyEventToCommand(key("ArrowLeft"));
    expect(cmd).toEqual({ type: "moveCursor", direction: "left", granularity: "character" });
  });

  test("ArrowDown → moveCursor down character", () => {
    const cmd = keyEventToCommand(key("ArrowDown"));
    expect(cmd).toEqual({ type: "moveCursor", direction: "down", granularity: "character" });
  });

  test("ArrowUp → moveCursor up character", () => {
    const cmd = keyEventToCommand(key("ArrowUp"));
    expect(cmd).toEqual({ type: "moveCursor", direction: "up", granularity: "character" });
  });

  // ── Cmd+Arrow = line/buffer (platform mod) ────────────────────

  test("Cmd+Left → moveCursor left line (line start)", () => {
    const cmd = keyEventToCommand(key("ArrowLeft", { meta: true }));
    expect(cmd).toEqual({ type: "moveCursor", direction: "left", granularity: "line" });
  });

  test("Cmd+Right → moveCursor right line (line end)", () => {
    const cmd = keyEventToCommand(key("ArrowRight", { meta: true }));
    expect(cmd).toEqual({ type: "moveCursor", direction: "right", granularity: "line" });
  });

  test("Cmd+Up → moveCursor up buffer (buffer start)", () => {
    const cmd = keyEventToCommand(key("ArrowUp", { meta: true }));
    expect(cmd).toEqual({ type: "moveCursor", direction: "up", granularity: "buffer" });
  });

  test("Cmd+Down → moveCursor down buffer (buffer end)", () => {
    const cmd = keyEventToCommand(key("ArrowDown", { meta: true }));
    expect(cmd).toEqual({ type: "moveCursor", direction: "down", granularity: "buffer" });
  });

  // ── Opt+Arrow = word (altKey) ─────────────────────────────────

  test("Opt+Left → moveCursor left word", () => {
    const cmd = keyEventToCommand(key("ArrowLeft", { alt: true }));
    expect(cmd).toEqual({ type: "moveCursor", direction: "left", granularity: "word" });
  });

  test("Opt+Right → moveCursor right word", () => {
    const cmd = keyEventToCommand(key("ArrowRight", { alt: true }));
    expect(cmd).toEqual({ type: "moveCursor", direction: "right", granularity: "word" });
  });

  // ── Shift+Arrow = extend selection ────────────────────────────

  test("Shift+Right → extendSelection right character", () => {
    const cmd = keyEventToCommand(key("ArrowRight", { shift: true }));
    expect(cmd).toEqual({ type: "extendSelection", direction: "right", granularity: "character" });
  });

  test("Shift+Left → extendSelection left character", () => {
    const cmd = keyEventToCommand(key("ArrowLeft", { shift: true }));
    expect(cmd).toEqual({ type: "extendSelection", direction: "left", granularity: "character" });
  });

  test("Shift+Down → extendSelection down character", () => {
    const cmd = keyEventToCommand(key("ArrowDown", { shift: true }));
    expect(cmd).toEqual({ type: "extendSelection", direction: "down", granularity: "character" });
  });

  test("Shift+Up → extendSelection up character", () => {
    const cmd = keyEventToCommand(key("ArrowUp", { shift: true }));
    expect(cmd).toEqual({ type: "extendSelection", direction: "up", granularity: "character" });
  });

  // ── Shift+Cmd+Arrow = extend to line/buffer ───────────────────

  test("Shift+Cmd+Left → extendSelection left line", () => {
    const cmd = keyEventToCommand(key("ArrowLeft", { shift: true, meta: true }));
    expect(cmd).toEqual({ type: "extendSelection", direction: "left", granularity: "line" });
  });

  test("Shift+Cmd+Right → extendSelection right line", () => {
    const cmd = keyEventToCommand(key("ArrowRight", { shift: true, meta: true }));
    expect(cmd).toEqual({ type: "extendSelection", direction: "right", granularity: "line" });
  });

  test("Shift+Cmd+Up → extendSelection up buffer", () => {
    const cmd = keyEventToCommand(key("ArrowUp", { shift: true, meta: true }));
    expect(cmd).toEqual({ type: "extendSelection", direction: "up", granularity: "buffer" });
  });

  test("Shift+Cmd+Down → extendSelection down buffer", () => {
    const cmd = keyEventToCommand(key("ArrowDown", { shift: true, meta: true }));
    expect(cmd).toEqual({ type: "extendSelection", direction: "down", granularity: "buffer" });
  });

  // ── Shift+Opt+Arrow = extend by word ──────────────────────────

  test("Shift+Opt+Left → extendSelection left word", () => {
    const cmd = keyEventToCommand(key("ArrowLeft", { shift: true, alt: true }));
    expect(cmd).toEqual({ type: "extendSelection", direction: "left", granularity: "word" });
  });

  test("Shift+Opt+Right → extendSelection right word", () => {
    const cmd = keyEventToCommand(key("ArrowRight", { shift: true, alt: true }));
    expect(cmd).toEqual({ type: "extendSelection", direction: "right", granularity: "word" });
  });

  // ── Deletion ──────────────────────────────────────────────────

  test("Backspace → deleteBackward character", () => {
    const cmd = keyEventToCommand(key("Backspace"));
    expect(cmd).toEqual({ type: "deleteBackward", granularity: "character" });
  });

  test("Opt+Backspace → deleteBackward word", () => {
    const cmd = keyEventToCommand(key("Backspace", { alt: true }));
    expect(cmd).toEqual({ type: "deleteBackward", granularity: "word" });
  });

  test("Cmd+Backspace → deleteBackward line", () => {
    const cmd = keyEventToCommand(key("Backspace", { meta: true }));
    expect(cmd).toEqual({ type: "deleteBackward", granularity: "line" });
  });

  test("Cmd+Shift+K → deleteLine", () => {
    const cmd = keyEventToCommand(key("k", { meta: true, shift: true }));
    expect(cmd).toEqual({ type: "deleteLine" });
  });

  test("Delete → deleteForward character", () => {
    const cmd = keyEventToCommand(key("Delete"));
    expect(cmd).toEqual({ type: "deleteForward", granularity: "character" });
  });

  test("Opt+Delete → deleteForward word", () => {
    const cmd = keyEventToCommand(key("Delete", { alt: true }));
    expect(cmd).toEqual({ type: "deleteForward", granularity: "word" });
  });

  // ── Text input ────────────────────────────────────────────────

  test("Enter → insertNewline", () => {
    const cmd = keyEventToCommand(key("Enter"));
    expect(cmd).toEqual({ type: "insertNewline" });
  });

  test("Tab → insertTab", () => {
    const cmd = keyEventToCommand(key("Tab"));
    expect(cmd).toEqual({ type: "insertTab" });
  });

  test("regular letter returns undefined (handled by input event)", () => {
    const cmd = keyEventToCommand(key("a"));
    expect(cmd).toBeUndefined();
  });

  // ── Shortcuts ─────────────────────────────────────────────────

  test("Cmd+A → selectAll", () => {
    const cmd = keyEventToCommand(key("a", { meta: true }));
    expect(cmd).toEqual({ type: "selectAll" });
  });

  test("Cmd+Z → undo", () => {
    const cmd = keyEventToCommand(key("z", { meta: true }));
    expect(cmd).toEqual({ type: "undo" });
  });

  test("Cmd+Shift+Z → redo", () => {
    const cmd = keyEventToCommand(key("z", { meta: true, shift: true }));
    expect(cmd).toEqual({ type: "redo" });
  });

  test("Cmd+C → copy", () => {
    const cmd = keyEventToCommand(key("c", { meta: true }));
    expect(cmd).toEqual({ type: "copy" });
  });

  test("Cmd+X → cut", () => {
    const cmd = keyEventToCommand(key("x", { meta: true }));
    expect(cmd).toEqual({ type: "cut" });
  });

  // ── Home/End ──────────────────────────────────────────────────

  test("Home → moveCursor left line", () => {
    const cmd = keyEventToCommand(key("Home"));
    expect(cmd).toEqual({ type: "moveCursor", direction: "left", granularity: "line" });
  });

  test("End → moveCursor right line", () => {
    const cmd = keyEventToCommand(key("End"));
    expect(cmd).toEqual({ type: "moveCursor", direction: "right", granularity: "line" });
  });

  test("PageUp → moveCursor up page", () => {
    const cmd = keyEventToCommand(key("PageUp"));
    expect(cmd).toEqual({ type: "moveCursor", direction: "up", granularity: "page" });
  });

  test("PageDown → moveCursor down page", () => {
    const cmd = keyEventToCommand(key("PageDown"));
    expect(cmd).toEqual({ type: "moveCursor", direction: "down", granularity: "page" });
  });
});

// ─── Goal Column ──────────────────────────────────────────────────

describe("Editor - Goal Column", () => {
  test("goal column preserved across short line when moving down", () => {
    const { editor } = setup("AAAAA\nBB\nCCCCC");
    editor.setCursor(mbPoint(0, 4));
    editor.dispatch({ type: "moveCursor", direction: "down", granularity: "character" });
    expectPoint(editor.cursor, 1, 2); // clamped to "BB" length
    editor.dispatch({ type: "moveCursor", direction: "down", granularity: "character" });
    expectPoint(editor.cursor, 2, 4); // restored to goal column 4
  });

  test("goal column resets on horizontal move", () => {
    const { editor } = setup("AAAAA\nBB\nCCCCC");
    editor.setCursor(mbPoint(0, 4));
    editor.dispatch({ type: "moveCursor", direction: "down", granularity: "character" });
    expectPoint(editor.cursor, 1, 2); // clamped
    editor.dispatch({ type: "moveCursor", direction: "left", granularity: "character" });
    expectPoint(editor.cursor, 1, 1); // horizontal move, goal column reset
    editor.dispatch({ type: "moveCursor", direction: "down", granularity: "character" });
    expectPoint(editor.cursor, 2, 1); // col 1, not the old goal col 4
  });

  test("goal column resets on text insertion", () => {
    const { editor } = setup("AAAAA\nBB\nCCCCC");
    editor.setCursor(mbPoint(0, 4));
    editor.dispatch({ type: "moveCursor", direction: "down", granularity: "character" });
    expectPoint(editor.cursor, 1, 2); // clamped to "BB"
    editor.dispatch({ type: "insertText", text: "X" }); // inserts at (1,2) → cursor at (1,3), resets goal
    editor.dispatch({ type: "moveCursor", direction: "down", granularity: "character" });
    expectPoint(editor.cursor, 2, 3); // col 3, not old goal col 4
  });

  test("goal column preserved moving up through short line", () => {
    const { editor } = setup("CCCCC\nBB\nAAAAA");
    editor.setCursor(mbPoint(2, 4));
    editor.dispatch({ type: "moveCursor", direction: "up", granularity: "character" });
    expectPoint(editor.cursor, 1, 2); // clamped to "BB"
    editor.dispatch({ type: "moveCursor", direction: "up", granularity: "character" });
    expectPoint(editor.cursor, 0, 4); // restored to goal column 4
  });

  test("extend selection preserves goal column vertically", () => {
    const { editor } = setup("AAAAA\nBB\nCCCCC");
    editor.setCursor(mbPoint(0, 4));
    editor.dispatch({ type: "extendSelection", direction: "down", granularity: "character" });
    // head moves to (1, 2) — clamped
    editor.dispatch({ type: "extendSelection", direction: "down", granularity: "character" });
    // head should be at (2, 4) — goal column restored
    const snap = editor.multiBuffer.snapshot();
    const sel = editor.selection;
    expect(sel).toBeDefined();
    if (!sel) return;
    const end = snap.resolveAnchor(sel.range.end);
    expect(end).toBeDefined();
    if (!end) return;
    expect(num(end.row)).toBe(2);
    expect(end.column).toBe(4);
  });
});
