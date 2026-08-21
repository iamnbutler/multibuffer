/**
 * Undo must restore the selection, not just the text and the cursor.
 *
 * `HistoryEntry.selectionsBefore` is meant to record where the selection *was*
 * before an edit. Recording live anchors cannot do that: anchors track the
 * document through the edit, so by the time the entry is undone they denote a
 * position the selection never occupied. `cursorBefore` avoids this by storing
 * a plain point, which is why the cursor restores correctly while the
 * selection does not.
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { createBuffer } from "../../src/buffer/buffer.ts";
import { Editor } from "../../src/editor/editor.ts";
import { createMultiBuffer } from "../../src/multibuffer/multibuffer.ts";
import type { MultiBuffer, MultiBufferRow } from "../../src/multibuffer/types.ts";
import { createBufferId, excerptRange, mbPoint, resetCounters } from "../helpers.ts";

function setup(text: string): { mb: MultiBuffer; editor: Editor } {
  const buf = createBuffer(createBufferId(), text);
  const mb = createMultiBuffer();
  mb.addExcerpt(buf, excerptRange(0, text.split("\n").length));
  return { mb, editor: new Editor(mb) };
}

function getText(mb: MultiBuffer): string {
  const snap = mb.snapshot();
  // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in test
  const start = 0 as MultiBufferRow;
  // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in test
  const end = snap.lineCount as MultiBufferRow;
  return snap.lines(start, end).join("\n");
}

/** Resolve every selection to `startRow:startCol-endRow:endCol` strings. */
function selectionSpans(mb: MultiBuffer, editor: Editor): string[] {
  const snap = mb.snapshot();
  return editor.selections.map((sel) => {
    const start = snap.resolveAnchor(sel.range.start);
    const end = snap.resolveAnchor(sel.range.end);
    if (!start || !end) return "unresolved";
    return `${start.row}:${start.column}-${end.row}:${end.column}`;
  });
}

/** Select `count` characters to the right of `at`. */
function select(editor: Editor, at: { row: number; column: number }, count: number): void {
  editor.setCursor(mbPoint(at.row, at.column));
  for (let i = 0; i < count; i++) {
    editor.dispatch({ type: "extendSelection", direction: "right", granularity: "character" });
  }
}

beforeEach(() => {
  resetCounters();
});

describe("undo restores the selection range", () => {
  const TEXT = "  alpha beta\ngamma delta\nlast line\n";

  // Each of these edits leaves the selection collapsed or displaced after undo
  // on unfixed code, while the text and cursor come back correctly.
  const cases: ReadonlyArray<{ name: string; command: Parameters<Editor["dispatch"]>[0] }> = [
    { name: "deleteForward", command: { type: "deleteForward", granularity: "character" } },
    { name: "deleteBackward", command: { type: "deleteBackward", granularity: "character" } },
    { name: "deleteLine", command: { type: "deleteLine" } },
    { name: "cut", command: { type: "cut" } },
    { name: "indentLines", command: { type: "indentLines" } },
  ];

  for (const { name, command } of cases) {
    test(`${name} then undo restores text, cursor and selection`, () => {
      const { mb, editor } = setup(TEXT);
      select(editor, { row: 1, column: 2 }, 4);

      const textBefore = getText(mb);
      const cursorBefore = editor.cursor;
      const spansBefore = selectionSpans(mb, editor);
      expect(spansBefore).toEqual(["1:2-1:6"]);

      editor.dispatch(command);
      expect(getText(mb)).not.toBe(textBefore);

      editor.dispatch({ type: "undo" });

      expect(getText(mb)).toBe(textBefore);
      expect(editor.cursor).toEqual(cursorBefore);
      // This is the assertion that fails without the fix.
      expect(selectionSpans(mb, editor)).toEqual(spansBefore);
    });
  }

  test("undo restores a multi-cursor selection set", () => {
    const { mb, editor } = setup(TEXT);
    select(editor, { row: 0, column: 2 }, 3);
    editor.dispatch({ type: "addCursorBelow" });

    const spansBefore = selectionSpans(mb, editor);
    expect(spansBefore.length).toBe(2);
    const textBefore = getText(mb);

    editor.dispatch({ type: "deleteForward", granularity: "character" });
    editor.dispatch({ type: "undo" });

    expect(getText(mb)).toBe(textBefore);
    expect(selectionSpans(mb, editor)).toEqual(spansBefore);
  });

  test("redo re-applies the post-edit selection", () => {
    const { mb, editor } = setup(TEXT);
    select(editor, { row: 1, column: 2 }, 4);

    editor.dispatch({ type: "deleteForward", granularity: "character" });
    const textAfterEdit = getText(mb);
    const spansAfterEdit = selectionSpans(mb, editor);

    editor.dispatch({ type: "undo" });
    editor.dispatch({ type: "redo" });

    expect(getText(mb)).toBe(textAfterEdit);
    expect(selectionSpans(mb, editor)).toEqual(spansAfterEdit);
  });
});
