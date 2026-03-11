/**
 * Tests for non-editable excerpt behavior.
 *
 * When an excerpt has editable: false, the editor should:
 * - Reject all text mutations targeting that excerpt
 * - Allow cursor movement through non-editable excerpts
 * - Allow selection across non-editable excerpts
 * - Allow copy from non-editable excerpts
 * - Reject cut/delete/paste that touch non-editable excerpts
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

describe("Non-editable excerpts", () => {
  test("editable defaults to true", () => {
    const buf = createBuffer(bid("a.ts"), "hello\nworld");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, range(0, 2));
    const info = mb.excerpts[0];
    if (!info) throw new Error("expected excerpt");
    expect(info.editable).toBe(true);
  });

  test("editable: false is stored on excerpt", () => {
    const buf = createBuffer(bid("a.ts"), "hello\nworld");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, range(0, 2), { editable: false });
    const info = mb.excerpts[0];
    if (!info) throw new Error("expected excerpt");
    expect(info.editable).toBe(false);
  });

  test("insertText rejected in non-editable excerpt", () => {
    const buf = createBuffer(bid("a.ts"), "hello\nworld");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, range(0, 2), { editable: false });
    const editor = new Editor(mb);

    editor.setCursor({ row: mbRow(0), column: 2 });
    editor.dispatch({ type: "insertText", text: "X" });

    // Text should be unchanged
    const lines = mb.snapshot().lines(mbRow(0), mbRow(2));
    expect(lines[0]).toBe("hello");
    expect(lines[1]).toBe("world");
  });

  test("insertNewline rejected in non-editable excerpt", () => {
    const buf = createBuffer(bid("a.ts"), "hello\nworld");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, range(0, 2), { editable: false });
    const editor = new Editor(mb);

    editor.setCursor({ row: mbRow(0), column: 2 });
    editor.dispatch({ type: "insertNewline" });

    expect(mb.lineCount).toBe(2);
  });

  test("deleteBackward rejected in non-editable excerpt", () => {
    const buf = createBuffer(bid("a.ts"), "hello\nworld");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, range(0, 2), { editable: false });
    const editor = new Editor(mb);

    editor.setCursor({ row: mbRow(0), column: 3 });
    editor.dispatch({ type: "deleteBackward", granularity: "character" });

    const lines = mb.snapshot().lines(mbRow(0), mbRow(1));
    expect(lines[0]).toBe("hello");
  });

  test("deleteForward rejected in non-editable excerpt", () => {
    const buf = createBuffer(bid("a.ts"), "hello\nworld");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, range(0, 2), { editable: false });
    const editor = new Editor(mb);

    editor.setCursor({ row: mbRow(0), column: 3 });
    editor.dispatch({ type: "deleteForward", granularity: "character" });

    const lines = mb.snapshot().lines(mbRow(0), mbRow(1));
    expect(lines[0]).toBe("hello");
  });

  test("deleteLine rejected in non-editable excerpt", () => {
    const buf = createBuffer(bid("a.ts"), "hello\nworld");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, range(0, 2), { editable: false });
    const editor = new Editor(mb);

    editor.setCursor({ row: mbRow(0), column: 0 });
    editor.dispatch({ type: "deleteLine" });

    expect(mb.lineCount).toBe(2);
  });

  test("cut rejected in non-editable excerpt", () => {
    const buf = createBuffer(bid("a.ts"), "hello\nworld");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, range(0, 2), { editable: false });
    const editor = new Editor(mb);

    editor.setCursor({ row: mbRow(0), column: 0 });
    editor.dispatch({ type: "cut" });

    expect(mb.lineCount).toBe(2);
  });

  test("cursor movement works through non-editable excerpts", () => {
    const buf = createBuffer(bid("a.ts"), "hello\nworld");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, range(0, 2), { editable: false });
    const editor = new Editor(mb);

    editor.setCursor({ row: mbRow(0), column: 0 });
    editor.dispatch({ type: "moveCursor", direction: "right", granularity: "character" });
    expect(editor.cursor.column).toBe(1);

    editor.dispatch({ type: "moveCursor", direction: "down", granularity: "line" });
    expect(editor.cursor.row).toBe(mbRow(1));
  });

  test("selection works across non-editable excerpts", () => {
    const buf = createBuffer(bid("a.ts"), "hello\nworld");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, range(0, 2), { editable: false });
    const editor = new Editor(mb);

    editor.setCursor({ row: mbRow(0), column: 0 });
    editor.dispatch({ type: "selectAll" });

    const text = editor.getSelectedText();
    expect(text).toBe("hello\nworld");
  });

  test("copy works from non-editable excerpt", () => {
    const buf = createBuffer(bid("a.ts"), "hello\nworld");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, range(0, 2), { editable: false });
    const editor = new Editor(mb);

    editor.setCursor({ row: mbRow(0), column: 0 });
    editor.dispatch({ type: "selectAll" });

    // copy is a no-op in the editor (clipboard handled externally),
    // but getSelectedText should still work
    expect(editor.getSelectedText()).toBe("hello\nworld");
    editor.dispatch({ type: "copy" });
    // Text unchanged after copy
    expect(mb.snapshot().lines(mbRow(0), mbRow(2))[0]).toBe("hello");
  });
});

describe("Mixed editable and non-editable excerpts", () => {
  function createMixedEditor() {
    const oldBuf = createBuffer(bid("old.ts"), "deleted line");
    const newBuf = createBuffer(bid("new.ts"), "inserted line");
    const mb = createMultiBuffer();
    mb.addExcerpt(oldBuf, range(0, 1), { editable: false, hasTrailingNewline: false });
    mb.addExcerpt(newBuf, range(0, 1), { editable: true, hasTrailingNewline: false });
    const editor = new Editor(mb);
    return { oldBuf, newBuf, mb, editor };
  }

  test("edit in editable excerpt succeeds", () => {
    const { mb, editor } = createMixedEditor();
    // Row 0 = non-editable "deleted line", Row 1 = editable "inserted line"
    editor.setCursor({ row: mbRow(1), column: 0 });
    editor.dispatch({ type: "insertText", text: "X" });

    const lines = mb.snapshot().lines(mbRow(0), mbRow(2));
    expect(lines[0]).toBe("deleted line");
    expect(lines[1]).toBe("Xinserted line");
  });

  test("edit in non-editable excerpt rejected", () => {
    const { mb, editor } = createMixedEditor();
    editor.setCursor({ row: mbRow(0), column: 0 });
    editor.dispatch({ type: "insertText", text: "X" });

    const lines = mb.snapshot().lines(mbRow(0), mbRow(2));
    expect(lines[0]).toBe("deleted line");
    expect(lines[1]).toBe("inserted line");
  });

  test("backspace at start of editable into non-editable is rejected", () => {
    const { mb, editor } = createMixedEditor();
    // Cursor at start of editable excerpt (row 1, col 0)
    // Backspace would try to delete into non-editable row 0
    editor.setCursor({ row: mbRow(1), column: 0 });
    editor.dispatch({ type: "deleteBackward", granularity: "character" });

    // Both lines unchanged
    expect(mb.lineCount).toBe(2);
    const lines = mb.snapshot().lines(mbRow(0), mbRow(2));
    expect(lines[0]).toBe("deleted line");
    expect(lines[1]).toBe("inserted line");
  });

  test("delete at end of non-editable into editable is rejected", () => {
    const { mb, editor } = createMixedEditor();
    // Cursor at end of non-editable excerpt
    editor.setCursor({ row: mbRow(0), column: 12 });
    editor.dispatch({ type: "deleteForward", granularity: "character" });

    expect(mb.lineCount).toBe(2);
  });

  test("cursor moves freely between editable and non-editable", () => {
    const { editor } = createMixedEditor();
    editor.setCursor({ row: mbRow(0), column: 0 });
    editor.dispatch({ type: "moveCursor", direction: "down", granularity: "line" });
    expect(editor.cursor.row).toBe(mbRow(1));

    editor.dispatch({ type: "moveCursor", direction: "up", granularity: "line" });
    expect(editor.cursor.row).toBe(mbRow(0));
  });

  test("selection spans both editable and non-editable", () => {
    const { editor } = createMixedEditor();
    editor.setCursor({ row: mbRow(0), column: 0 });
    editor.dispatch({ type: "selectAll" });
    expect(editor.getSelectedText()).toBe("deleted line\ninserted line");
  });

  test("cut with selection spanning non-editable is rejected", () => {
    const { mb, editor } = createMixedEditor();
    editor.setCursor({ row: mbRow(0), column: 0 });
    editor.dispatch({ type: "selectAll" });
    editor.dispatch({ type: "cut" });

    // Nothing should be deleted
    expect(mb.lineCount).toBe(2);
  });

  test("paste over selection spanning non-editable is rejected", () => {
    const { mb, editor } = createMixedEditor();
    editor.setCursor({ row: mbRow(0), column: 0 });
    editor.dispatch({ type: "selectAll" });
    editor.dispatch({ type: "paste", text: "replacement" });

    // Nothing should change
    expect(mb.lineCount).toBe(2);
    const lines = mb.snapshot().lines(mbRow(0), mbRow(2));
    expect(lines[0]).toBe("deleted line");
  });

  test("editable flag preserved after buffer edit", () => {
    const { mb, editor } = createMixedEditor();
    // Edit in the editable excerpt
    editor.setCursor({ row: mbRow(1), column: 0 });
    editor.dispatch({ type: "insertText", text: "Z" });

    // Both excerpts should retain their editable flags
    const excerpts = mb.excerpts;
    expect(excerpts[0]?.editable).toBe(false);
    expect(excerpts[1]?.editable).toBe(true);
  });

  test("undo works within editable excerpt", () => {
    const { mb, editor } = createMixedEditor();
    editor.setCursor({ row: mbRow(1), column: 0 });
    editor.dispatch({ type: "insertText", text: "Z" });

    let lines = mb.snapshot().lines(mbRow(1), mbRow(2));
    expect(lines[0]).toBe("Zinserted line");

    editor.dispatch({ type: "undo" });
    lines = mb.snapshot().lines(mbRow(1), mbRow(2));
    expect(lines[0]).toBe("inserted line");
  });
});

describe("Non-editable with trailing newline excerpts", () => {
  test("editable flag preserved through trailing newline boundary", () => {
    const oldBuf = createBuffer(bid("old.ts"), "old line 1\nold line 2");
    const newBuf = createBuffer(bid("new.ts"), "new line 1");
    const mb = createMultiBuffer();
    mb.addExcerpt(oldBuf, range(0, 2), { editable: false, hasTrailingNewline: true });
    mb.addExcerpt(newBuf, range(0, 1), { editable: true });

    // row 0: "old line 1" (non-editable)
    // row 1: "old line 2" (non-editable)
    // row 2: "" (trailing newline, non-editable)
    // row 3: "new line 1" (editable)

    const editor = new Editor(mb);

    // Can't edit in the non-editable excerpt
    editor.setCursor({ row: mbRow(0), column: 0 });
    editor.dispatch({ type: "insertText", text: "X" });
    expect(mb.snapshot().lines(mbRow(0), mbRow(1))[0]).toBe("old line 1");

    // Can edit in the editable excerpt
    editor.setCursor({ row: mbRow(3), column: 0 });
    editor.dispatch({ type: "insertText", text: "Y" });
    expect(mb.snapshot().lines(mbRow(3), mbRow(4))[0]).toBe("Ynew line 1");
  });
});
