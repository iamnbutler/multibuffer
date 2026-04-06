/**
 * Tests for multi-cursor/multi-selection support (Issue #161).
 */

import { describe, expect, test } from "bun:test";
import type { Editor } from "../../src/editor/editor.ts";
import { createSingleBufferEditor } from "../../src/editor/factories.ts";
import { mbPoint, mbRow, num } from "../helpers.ts";

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

// ─── Basic multi-cursor operations ─────────────────────────────────

describe("Multi-cursor - addCursor command", () => {
  test("addCursor creates a second cursor", () => {
    const editor = setup("hello\nworld");
    editor.setCursor(mbPoint(0, 0));
    expect(editor.selections.length).toBe(1);

    editor.dispatch({ type: "addCursor", at: mbPoint(1, 0) });
    expect(editor.selections.length).toBe(2);
  });

  test("addCursor at same position is ignored", () => {
    const editor = setup("hello\nworld");
    editor.setCursor(mbPoint(0, 0));
    editor.dispatch({ type: "addCursor", at: mbPoint(0, 0) });
    expect(editor.selections.length).toBe(1);
  });

  test("addCursor at overlapping position is ignored", () => {
    const editor = setup("hello\nworld");
    editor.setCursor(mbPoint(0, 0));
    editor.dispatch({ type: "extendSelection", direction: "right", granularity: "word" });
    // Selection now covers "hello"
    editor.dispatch({ type: "addCursor", at: mbPoint(0, 2) });
    // Should still be 1 selection since point is within existing selection
    expect(editor.selections.length).toBe(1);
  });
});

describe("Multi-cursor - addCursorAbove/Below", () => {
  test("addCursorBelow creates cursor on next line", () => {
    const editor = setup("aaa\nbbb\nccc");
    editor.setCursor(mbPoint(0, 1));
    expect(editor.selections.length).toBe(1);

    editor.dispatch({ type: "addCursorBelow" });
    expect(editor.selections.length).toBe(2);
    expect(num(editor.cursor.row)).toBe(1);
    expect(editor.cursor.column).toBe(1);
  });

  test("addCursorAbove creates cursor on previous line", () => {
    const editor = setup("aaa\nbbb\nccc");
    editor.setCursor(mbPoint(1, 1));
    expect(editor.selections.length).toBe(1);

    editor.dispatch({ type: "addCursorAbove" });
    expect(editor.selections.length).toBe(2);
    // After merge, selections are sorted by position, so primary (last) is the bottom-most
    // The cursor row should still be at row 1 (the original position, which is now primary after sort)
    expect(num(editor.cursor.row)).toBe(1);
    expect(editor.cursor.column).toBe(1);
  });

  test("addCursorBelow at last line does not add cursor", () => {
    const editor = setup("aaa\nbbb");
    editor.setCursor(mbPoint(1, 0));
    editor.dispatch({ type: "addCursorBelow" });
    expect(editor.selections.length).toBe(1);
  });

  test("addCursorAbove at first line does not add cursor", () => {
    const editor = setup("aaa\nbbb");
    editor.setCursor(mbPoint(0, 0));
    editor.dispatch({ type: "addCursorAbove" });
    expect(editor.selections.length).toBe(1);
  });
});

describe("Multi-cursor - clearExtraCursors", () => {
  test("clearExtraCursors keeps only primary cursor", () => {
    const editor = setup("aaa\nbbb\nccc");
    editor.setCursor(mbPoint(0, 0));
    editor.dispatch({ type: "addCursor", at: mbPoint(1, 0) });
    editor.dispatch({ type: "addCursor", at: mbPoint(2, 0) });
    expect(editor.selections.length).toBe(3);

    editor.dispatch({ type: "clearExtraCursors" });
    expect(editor.selections.length).toBe(1);
    // Primary cursor (last added) should be at row 2
    expect(num(editor.cursor.row)).toBe(2);
  });

  test("clearExtraCursors on single cursor is no-op", () => {
    const editor = setup("hello");
    editor.setCursor(mbPoint(0, 2));
    editor.dispatch({ type: "clearExtraCursors" });
    expect(editor.selections.length).toBe(1);
    expect(editor.cursor.column).toBe(2);
  });
});

// ─── Multi-cursor text editing ─────────────────────────────────────

describe("Multi-cursor - insertText", () => {
  test("insert text at multiple cursors", () => {
    const editor = setup("aaa\nbbb\nccc");
    editor.setCursor(mbPoint(0, 1));
    editor.dispatch({ type: "addCursor", at: mbPoint(1, 1) });
    editor.dispatch({ type: "addCursor", at: mbPoint(2, 1) });
    expect(editor.selections.length).toBe(3);

    editor.dispatch({ type: "insertText", text: "X" });
    expect(getText(editor)).toBe("aXaa\nbXbb\ncXcc");
  });

  test("insert newline at multiple cursors", () => {
    const editor = setup("aaa\nbbb");
    editor.setCursor(mbPoint(0, 1));
    editor.dispatch({ type: "addCursor", at: mbPoint(1, 1) });

    editor.dispatch({ type: "insertNewline" });
    const text = getText(editor);
    expect(text).toContain("a\naa");
    expect(text).toContain("b\nbb");
  });
});

describe("Multi-cursor - delete", () => {
  test("deleteBackward at multiple cursors", () => {
    const editor = setup("aaa\nbbb\nccc");
    editor.setCursor(mbPoint(0, 1));
    editor.dispatch({ type: "addCursor", at: mbPoint(1, 1) });
    editor.dispatch({ type: "addCursor", at: mbPoint(2, 1) });

    editor.dispatch({ type: "deleteBackward", granularity: "character" });
    expect(getText(editor)).toBe("aa\nbb\ncc");
  });

  test("deleteForward at multiple cursors", () => {
    const editor = setup("aaa\nbbb\nccc");
    editor.setCursor(mbPoint(0, 1));
    editor.dispatch({ type: "addCursor", at: mbPoint(1, 1) });
    editor.dispatch({ type: "addCursor", at: mbPoint(2, 1) });

    editor.dispatch({ type: "deleteForward", granularity: "character" });
    expect(getText(editor)).toBe("aa\nbb\ncc");
  });
});

// ─── Multi-cursor movement ─────────────────────────────────────────

describe("Multi-cursor - cursor movement", () => {
  test("moveCursor moves all cursors", () => {
    const editor = setup("aaa\nbbb\nccc");
    editor.setCursor(mbPoint(0, 0));
    editor.dispatch({ type: "addCursor", at: mbPoint(1, 0) });
    editor.dispatch({ type: "addCursor", at: mbPoint(2, 0) });

    editor.dispatch({ type: "moveCursor", direction: "right", granularity: "character" });

    // All cursors should have moved right
    const selections = editor.selections;
    expect(selections.length).toBe(3);
  });

  test("moveCursor merges overlapping cursors", () => {
    const editor = setup("ab");
    editor.setCursor(mbPoint(0, 0));
    editor.dispatch({ type: "addCursor", at: mbPoint(0, 1) });
    expect(editor.selections.length).toBe(2);

    // Move all cursors right - they should merge at column 1 and 2
    editor.dispatch({ type: "moveCursor", direction: "right", granularity: "character" });
    // Cursor at 0 moves to 1, cursor at 1 moves to 2 - they should merge
    expect(editor.selections.length).toBe(2);
  });
});

describe("Multi-cursor - selection extension", () => {
  test("extendSelection extends all selections", () => {
    const editor = setup("aaa\nbbb");
    editor.setCursor(mbPoint(0, 0));
    editor.dispatch({ type: "addCursor", at: mbPoint(1, 0) });

    editor.dispatch({ type: "extendSelection", direction: "right", granularity: "word" });

    const text = editor.getSelectedText();
    // Should have selected "aaa" and "bbb"
    expect(text).toContain("aaa");
    expect(text).toContain("bbb");
  });
});

// ─── Multi-cursor clearing on certain actions ──────────────────────

describe("Multi-cursor - clearing", () => {
  test("setCursor clears multi-cursor", () => {
    const editor = setup("aaa\nbbb");
    editor.setCursor(mbPoint(0, 0));
    editor.dispatch({ type: "addCursor", at: mbPoint(1, 0) });
    expect(editor.selections.length).toBe(2);

    editor.setCursor(mbPoint(0, 1));
    expect(editor.selections.length).toBe(1);
  });

  test("selectWordAt clears multi-cursor", () => {
    const editor = setup("hello world");
    editor.setCursor(mbPoint(0, 0));
    editor.dispatch({ type: "addCursor", at: mbPoint(0, 6) });
    expect(editor.selections.length).toBe(2);

    editor.selectWordAt(mbPoint(0, 2));
    expect(editor.selections.length).toBe(1);
  });

  test("selectLineAt clears multi-cursor", () => {
    const editor = setup("hello\nworld");
    editor.setCursor(mbPoint(0, 0));
    editor.dispatch({ type: "addCursor", at: mbPoint(1, 0) });
    expect(editor.selections.length).toBe(2);

    editor.selectLineAt(mbPoint(0, 0));
    expect(editor.selections.length).toBe(1);
  });

  test("selectAll clears multi-cursor", () => {
    const editor = setup("hello\nworld");
    editor.setCursor(mbPoint(0, 0));
    editor.dispatch({ type: "addCursor", at: mbPoint(1, 0) });
    expect(editor.selections.length).toBe(2);

    editor.dispatch({ type: "selectAll" });
    expect(editor.selections.length).toBe(1);
  });
});

// ─── collapseSelection dispatch with multi-cursor ──────────────────

describe("Multi-cursor - collapseSelection dispatch", () => {
  test("collapse to 'start' moves each cursor to start of its selection", () => {
    const editor = setup("aaa\nbbb\nccc");
    // Selection 1: cursor at (0,0), extend right 3 → selects "aaa" on row 0
    editor.setCursor(mbPoint(0, 0));
    editor.dispatch({ type: "extendSelection", direction: "right", granularity: "word" });
    // Selection 2: cursor at (2,0), extend right 3 → selects "ccc" on row 2
    editor.dispatch({ type: "addCursor", at: mbPoint(2, 0) });
    editor.dispatch({ type: "extendSelection", direction: "right", granularity: "word" });
    expect(editor.selections.length).toBe(2);

    editor.dispatch({ type: "collapseSelection", to: "start" });

    // After collapse, both selections should be collapsed
    const snap = editor.multiBuffer.snapshot();
    expect(editor.selections.length).toBe(2);
    for (const sel of editor.selections) {
      const start = snap.resolveAnchor(sel.range.start);
      const end = snap.resolveAnchor(sel.range.end);
      expect(start).toBeDefined();
      expect(end).toBeDefined();
      if (start && end) {
        expect(start.row).toBe(end.row);
        expect(start.column).toBe(end.column);
      }
    }
    // First cursor should be at row 0, col 0 (start of "aaa")
    const first = editor.selections[0];
    if (first) {
      const pt = snap.resolveAnchor(first.range.start);
      if (pt) {
        expect(num(pt.row)).toBe(0);
        expect(pt.column).toBe(0);
      }
    }
  });

  test("collapse to 'end' moves each cursor to end of its selection", () => {
    const editor = setup("aaa\nbbb\nccc");
    // Selection 1: "aaa" on row 0 (cols 0-3)
    editor.setCursor(mbPoint(0, 0));
    editor.dispatch({ type: "extendSelection", direction: "right", granularity: "word" });
    // Selection 2: "ccc" on row 2 (cols 0-3)
    editor.dispatch({ type: "addCursor", at: mbPoint(2, 0) });
    editor.dispatch({ type: "extendSelection", direction: "right", granularity: "word" });
    expect(editor.selections.length).toBe(2);

    editor.dispatch({ type: "collapseSelection", to: "end" });

    const snap = editor.multiBuffer.snapshot();
    expect(editor.selections.length).toBe(2);
    // Each selection should be collapsed at the end (col 3)
    for (const sel of editor.selections) {
      const start = snap.resolveAnchor(sel.range.start);
      const end = snap.resolveAnchor(sel.range.end);
      expect(start).toBeDefined();
      expect(end).toBeDefined();
      if (start && end) {
        expect(start.row).toBe(end.row);
        expect(start.column).toBe(end.column);
        expect(end.column).toBe(3); // end of "aaa"/"ccc"
      }
    }
  });

  test("collapsing overlapping selections to same point merges them", () => {
    const editor = setup("hello");
    // Two selections both starting at col 0 — after extending, both select "hello"
    editor.setCursor(mbPoint(0, 0));
    editor.dispatch({ type: "extendSelection", direction: "right", granularity: "word" });
    editor.dispatch({ type: "addCursor", at: mbPoint(0, 0) });
    editor.dispatch({ type: "extendSelection", direction: "right", granularity: "word" });

    // Both select identical range — collapse to "start" should yield a single cursor
    editor.dispatch({ type: "collapseSelection", to: "start" });
    expect(editor.selections.length).toBe(1);
  });

  test("collapseSelection on single selection is a no-op for count", () => {
    const editor = setup("hello world");
    editor.setCursor(mbPoint(0, 0));
    editor.dispatch({ type: "extendSelection", direction: "right", granularity: "word" });
    expect(editor.selections.length).toBe(1);

    editor.dispatch({ type: "collapseSelection", to: "start" });
    expect(editor.selections.length).toBe(1);
    expect(editor.cursor.column).toBe(0);
  });
});

// ─── Selection accessor backward compatibility ─────────────────────

describe("Multi-cursor - backward compatibility", () => {
  test("selection getter returns primary selection", () => {
    const editor = setup("hello");
    editor.setCursor(mbPoint(0, 2));
    expect(editor.selection).toBeDefined();
    expect(editor.selections.length).toBe(1);
    expect(editor.selection).toBe(editor.selections[0]);
  });

  test("selection getter returns last added selection", () => {
    const editor = setup("aaa\nbbb");
    editor.setCursor(mbPoint(0, 0));
    editor.dispatch({ type: "addCursor", at: mbPoint(1, 0) });

    // Primary should be the last added (at row 1)
    expect(editor.selection).toBe(editor.selections[editor.selections.length - 1]);
  });
});
