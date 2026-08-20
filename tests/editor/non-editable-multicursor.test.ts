/**
 * A second cursor must not make a forbidden edit legal.
 *
 * With a single selection, an edit whose range starts in an editable excerpt and
 * ends inside a non-editable one is refused by `Editor._edit()`. The
 * multi-selection paths write through `multiBuffer.edit()` directly and checked
 * only the *start* of each range, so merely adding an unrelated cursor let the
 * same edit through and rewrote the non-editable excerpt.
 *
 * All excerpts view one shared buffer, because `MultiBuffer.edit()` declines
 * ranges that cross a buffer boundary — a shared buffer is the only way to build
 * a genuinely spanning edit.
 */

import { describe, expect, test } from "bun:test";
import { createBuffer } from "../../src/buffer/buffer.ts";
import type { BufferId, BufferRow } from "../../src/buffer/types.ts";
import { Editor } from "../../src/editor/editor.ts";
import type { EditorCommand } from "../../src/editor/types.ts";
import { createMultiBuffer } from "../../src/multibuffer/multibuffer.ts";
import type { MultiBufferRow } from "../../src/multibuffer/types.ts";

// biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in tests
const bid = (s: string) => s as BufferId;
// biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in tests
const mbRow = (n: number) => n as MultiBufferRow;
// biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in tests
const bRow = (n: number) => n as BufferRow;

function range(startRow: number, endRow: number) {
  const context = {
    start: { row: bRow(startRow), column: 0 },
    end: { row: bRow(endRow), column: 0 },
  };
  return { context, primary: context };
}

/** Rows 0-1 editable, rows 2-3 NON-editable, rows 4-5 editable. */
function threeExcerpts() {
  const buf = createBuffer(bid("a.ts"), "  L0\n  L1\n  L2\n  L3\n  L4\n  L5\n");
  const mb = createMultiBuffer();
  mb.addExcerpt(buf, range(0, 2));
  mb.addExcerpt(buf, range(2, 4), { editable: false });
  mb.addExcerpt(buf, range(4, 6));
  const editor = new Editor(mb);
  return {
    mb,
    editor,
    lines: () => mb.snapshot().lines(mbRow(0), mbRow(mb.lineCount)),
  };
}

/**
 * Selection from row 1 (editable) into row 2 (non-editable), plus one extra
 * cursor on row 5 — below the non-editable excerpt, so its own edit can never
 * shift those rows.
 */
function spanIntoReadOnlyWithExtraCursor(editor: Editor) {
  editor.setCursor({ row: mbRow(5), column: 0 });
  editor.dispatch({ type: "addCursor", at: { row: mbRow(1), column: 0 } });
  editor.extendSelectionTo({ row: mbRow(2), column: 2 });
}

describe("an extra cursor must not make a spanning edit legal", () => {
  const cases: Array<[string, EditorCommand]> = [
    ["insertText", { type: "insertText", text: "X" }],
    ["insertNewline", { type: "insertNewline" }],
    ["deleteBackward", { type: "deleteBackward", granularity: "character" }],
    ["deleteForward", { type: "deleteForward", granularity: "character" }],
    ["paste", { type: "paste", text: "X" }],
    ["cut", { type: "cut" }],
  ];

  for (const [name, action] of cases) {
    test(`${name} leaves the non-editable excerpt intact`, () => {
      const { editor, lines } = threeExcerpts();
      spanIntoReadOnlyWithExtraCursor(editor);

      editor.dispatch(action);

      // Rows 2 and 3 belong to the non-editable excerpt and must survive verbatim.
      const after = lines();
      expect(after).toContain("  L2");
      expect(after).toContain("  L3");
    });
  }

  test("the same edit with a single selection is refused outright", () => {
    const { editor, lines } = threeExcerpts();
    editor.setCursor({ row: mbRow(1), column: 0 });
    editor.extendSelectionTo({ row: mbRow(2), column: 2 });

    editor.dispatch({ type: "insertText", text: "X" });

    expect(lines()).toEqual(["  L0", "  L1", "  L2", "  L3", "  L4", "  L5"]);
  });
});
