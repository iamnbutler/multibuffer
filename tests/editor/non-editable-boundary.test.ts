/**
 * Tests for line commands whose affected row range crosses a non-editable
 * excerpt boundary.
 *
 * `tests/editor/non-editable.test.ts` covers the case where the cursor sits
 * *inside* a non-editable excerpt. It does not cover the case where an edit
 * legitimately *starts* in an editable excerpt and then extends into — or
 * straight across — a non-editable one. That is the shape `Editor._edit()`
 * guards with its second and third checks (end excerpt, and every spanned
 * excerpt), and it is currently untested.
 *
 * All excerpts here view the same buffer, because `MultiBuffer.edit()` declines
 * ranges that cross a buffer boundary — a shared buffer is the only way to
 * build a genuinely spanning edit.
 */

import { describe, expect, test } from "bun:test";
import { createBuffer } from "../../src/buffer/buffer.ts";
import type { BufferId, BufferRow } from "../../src/buffer/types.ts";
import { Editor } from "../../src/editor/editor.ts";
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

/** Rows 0-1 editable, rows 2-3 non-editable. */
function twoExcerpts() {
  const buf = createBuffer(bid("a.ts"), "  A0\n  A1\n  B0\n  B1\n");
  const mb = createMultiBuffer();
  mb.addExcerpt(buf, range(0, 2));
  mb.addExcerpt(buf, range(2, 4), { editable: false });
  const editor = new Editor(mb);
  const lines = () => mb.snapshot().lines(mbRow(0), mbRow(mb.lineCount));
  return { mb, editor, lines };
}

/** Rows 0-1 editable, row 2 NON-editable, rows 3-4 editable. */
function nonEditableInTheMiddle() {
  const buf = createBuffer(bid("a.ts"), "  L0\n  L1\n  L2\n  L3\n  L4\n");
  const mb = createMultiBuffer();
  mb.addExcerpt(buf, range(0, 2));
  mb.addExcerpt(buf, range(2, 3), { editable: false });
  mb.addExcerpt(buf, range(3, 5));
  const editor = new Editor(mb);
  const lines = () => mb.snapshot().lines(mbRow(0), mbRow(mb.lineCount));
  return { mb, editor, lines };
}

describe("line commands across a non-editable excerpt boundary", () => {
  test("indentLines rejects a selection ending in a non-editable excerpt", () => {
    const { editor, lines } = twoExcerpts();
    editor.setCursor({ row: mbRow(0), column: 0 });
    editor.extendSelectionTo({ row: mbRow(2), column: 1 });

    editor.dispatch({ type: "indentLines" });

    expect(lines()).toEqual(["  A0", "  A1", "  B0", "  B1"]);
  });

  test("dedentLines rejects a selection ending in a non-editable excerpt", () => {
    const { editor, lines } = twoExcerpts();
    editor.setCursor({ row: mbRow(0), column: 0 });
    editor.extendSelectionTo({ row: mbRow(2), column: 1 });

    editor.dispatch({ type: "dedentLines" });

    expect(lines()).toEqual(["  A0", "  A1", "  B0", "  B1"]);
  });

  test("moveLine rejects a swap whose partner row is non-editable", () => {
    const { editor, lines } = twoExcerpts();
    editor.setCursor({ row: mbRow(1), column: 0 });

    editor.dispatch({ type: "moveLine", direction: "down" });

    expect(lines()).toEqual(["  A0", "  A1", "  B0", "  B1"]);
  });

  test("moveLine rejects a multi-cursor block that spans a non-editable excerpt", () => {
    // Cursors on rows 1 and 2 form one contiguous block. Both of its endpoints
    // (row 1, and row 3 below it) are editable, but row 2 in between is not.
    const { editor, lines } = nonEditableInTheMiddle();
    editor.setCursor({ row: mbRow(1), column: 0 });
    editor.dispatch({ type: "addCursor", at: { row: mbRow(2), column: 0 } });

    editor.dispatch({ type: "moveLine", direction: "down" });

    expect(lines()).toEqual(["  L0", "  L1", "  L2", "  L3", "  L4"]);
  });

  test("indentLines rejects a selection spanning across a non-editable excerpt", () => {
    const { editor, lines } = nonEditableInTheMiddle();
    editor.setCursor({ row: mbRow(1), column: 0 });
    editor.extendSelectionTo({ row: mbRow(3), column: 1 });

    editor.dispatch({ type: "indentLines" });

    expect(lines()).toEqual(["  L0", "  L1", "  L2", "  L3", "  L4"]);
  });

  test("a cursor inside the non-editable excerpt leaves its own row alone", () => {
    const { editor, lines } = nonEditableInTheMiddle();
    editor.setCursor({ row: mbRow(2), column: 0 });

    editor.dispatch({ type: "indentLines" });

    expect(lines()).toEqual(["  L0", "  L1", "  L2", "  L3", "  L4"]);
  });
});
