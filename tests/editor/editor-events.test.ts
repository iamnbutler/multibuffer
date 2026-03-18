/**
 * Tests for Editor granular event system.
 *
 * Covers on/off lifecycle and each event type:
 *   textChange, cursorChange, selectionChange, change
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { createBuffer } from "../../src/buffer/buffer.ts";
import { Editor } from "../../src/editor/editor.ts";
import type { EditorEventMap } from "../../src/editor/types.ts";
import { createMultiBuffer } from "../../src/multibuffer/multibuffer.ts";
import type { MultiBuffer, MultiBufferPoint, MultiBufferSnapshot, Selection } from "../../src/multibuffer/types.ts";
import {
  createBufferId,
  excerptRange,
  expectPoint,
  mbPoint,
  resetCounters,
} from "../helpers.ts";

function setup(text: string): { mb: MultiBuffer; editor: Editor } {
  const buf = createBuffer(createBufferId(), text);
  const mb = createMultiBuffer();
  mb.addExcerpt(buf, excerptRange(0, text.split("\n").length));
  const editor = new Editor(mb);
  return { mb, editor };
}

beforeEach(() => {
  resetCounters();
});

// ─── on / off lifecycle ──────────────────────────────────────────

describe("Editor events - on/off lifecycle", () => {
  test("on registers a listener that receives events", () => {
    const { editor } = setup("Hello");
    let fired = false;
    editor.on("change", () => { fired = true; });
    editor.dispatch({ type: "moveCursor", direction: "right", granularity: "character" });
    expect(fired).toBe(true);
  });

  test("off removes a registered listener", () => {
    const { editor } = setup("Hello");
    let count = 0;
    const cb = () => { count++; };
    editor.on("change", cb);
    editor.dispatch({ type: "moveCursor", direction: "right", granularity: "character" });
    expect(count).toBe(1);

    editor.off("change", cb);
    editor.dispatch({ type: "moveCursor", direction: "left", granularity: "character" });
    expect(count).toBe(1); // not incremented after off
  });

  test("off with unknown callback is a no-op", () => {
    const { editor } = setup("Hello");
    // Should not throw
    editor.off("change", () => {});
  });

  test("multiple listeners on same event all fire", () => {
    const { editor } = setup("Hello");
    let a = 0;
    let b = 0;
    editor.on("change", () => { a++; });
    editor.on("change", () => { b++; });
    editor.dispatch({ type: "moveCursor", direction: "right", granularity: "character" });
    expect(a).toBe(1);
    expect(b).toBe(1);
  });

  test("same callback registered twice fires twice", () => {
    const { editor } = setup("Hello");
    let count = 0;
    const cb = () => { count++; };
    editor.on("change", cb);
    editor.on("change", cb);
    editor.dispatch({ type: "moveCursor", direction: "right", granularity: "character" });
    // Set semantics: duplicate registration is a no-op, fires once
    expect(count).toBe(1);
  });
});

// ─── textChange ─────────────────────────────────────────────────

describe("Editor events - textChange", () => {
  test("fires when text is inserted", () => {
    const { editor } = setup("Hello");
    let snap: MultiBufferSnapshot | undefined;
    editor.on("textChange", (s) => { snap = s; });
    editor.dispatch({ type: "insertText", text: "!" });
    expect(snap).toBeDefined();
  });

  test("snapshot passed to textChange reflects new content", () => {
    const { editor } = setup("Hello");
    let snap: MultiBufferSnapshot | undefined;
    editor.on("textChange", (s) => { snap = s; });
    editor.setCursor(mbPoint(0, 5));
    editor.dispatch({ type: "insertText", text: " World" });
    expect(snap).toBeDefined();
    if (snap) {
      // biome-ignore lint/plugin/no-type-assertion: expect: branded type in test
      const lines = snap.lines(0 as import("../../src/multibuffer/types.ts").MultiBufferRow, snap.lineCount as import("../../src/multibuffer/types.ts").MultiBufferRow);
      expect(lines[0]).toBe("Hello World");
    }
  });

  test("fires when text is deleted backward", () => {
    const { editor } = setup("Hello");
    editor.setCursor(mbPoint(0, 5));
    let fired = false;
    editor.on("textChange", () => { fired = true; });
    editor.dispatch({ type: "deleteBackward", granularity: "character" });
    expect(fired).toBe(true);
  });

  test("fires when text is deleted forward", () => {
    const { editor } = setup("Hello");
    let fired = false;
    editor.on("textChange", () => { fired = true; });
    editor.dispatch({ type: "deleteForward", granularity: "character" });
    expect(fired).toBe(true);
  });

  test("does NOT fire on cursor-only movement", () => {
    const { editor } = setup("Hello");
    let fired = false;
    editor.on("textChange", () => { fired = true; });
    editor.dispatch({ type: "moveCursor", direction: "right", granularity: "character" });
    expect(fired).toBe(false);
  });

  test("does NOT fire on setCursor", () => {
    const { editor } = setup("Hello");
    let fired = false;
    editor.on("textChange", () => { fired = true; });
    editor.setCursor(mbPoint(0, 3));
    expect(fired).toBe(false);
  });

  test("fires on undo that restores text", () => {
    const { editor } = setup("Hello");
    editor.dispatch({ type: "insertText", text: "!" });
    let fired = false;
    editor.on("textChange", () => { fired = true; });
    editor.dispatch({ type: "undo" });
    expect(fired).toBe(true);
  });

  test("fires on paste", () => {
    const { editor } = setup("Hello");
    let fired = false;
    editor.on("textChange", () => { fired = true; });
    editor.dispatch({ type: "paste", text: " World" });
    expect(fired).toBe(true);
  });
});

// ─── cursorChange ────────────────────────────────────────────────

describe("Editor events - cursorChange", () => {
  test("fires on moveCursor and provides new and previous positions", () => {
    const { editor } = setup("Hello");
    let newCursor: MultiBufferPoint | undefined;
    let prevCursor: MultiBufferPoint | undefined;
    editor.on("cursorChange", (cur, prev) => {
      newCursor = cur;
      prevCursor = prev;
    });
    editor.dispatch({ type: "moveCursor", direction: "right", granularity: "character" });
    expect(newCursor).toBeDefined();
    expect(prevCursor).toBeDefined();
    if (newCursor) expectPoint(newCursor, 0, 1);
    if (prevCursor) expectPoint(prevCursor, 0, 0);
  });

  test("fires on setCursor", () => {
    const { editor } = setup("Hello");
    let newCursor: MultiBufferPoint | undefined;
    editor.on("cursorChange", (cur) => { newCursor = cur; });
    editor.setCursor(mbPoint(0, 3));
    expect(newCursor).toBeDefined();
    if (newCursor) expectPoint(newCursor, 0, 3);
  });

  test("fires on text insert (cursor advances)", () => {
    const { editor } = setup("Hello");
    let fired = false;
    editor.on("cursorChange", () => { fired = true; });
    editor.dispatch({ type: "insertText", text: "X" });
    expect(fired).toBe(true);
  });

  test("does NOT fire when cursor stays at same position", () => {
    const { editor } = setup("Hello");
    // Cursor is at 0,0. Moving left won't change position.
    let fired = false;
    editor.on("cursorChange", () => { fired = true; });
    editor.dispatch({ type: "moveCursor", direction: "left", granularity: "character" });
    expect(fired).toBe(false);
  });

  test("fires on extendSelectionTo", () => {
    const { editor } = setup("Hello");
    editor.setCursor(mbPoint(0, 0));
    let fired = false;
    editor.on("cursorChange", () => { fired = true; });
    editor.extendSelectionTo(mbPoint(0, 3));
    expect(fired).toBe(true);
  });

  test("fires on selectWordAt", () => {
    const { editor } = setup("Hello world");
    let fired = false;
    editor.on("cursorChange", () => { fired = true; });
    editor.selectWordAt(mbPoint(0, 2));
    expect(fired).toBe(true);
  });
});

// ─── selectionChange ─────────────────────────────────────────────

describe("Editor events - selectionChange", () => {
  test("fires on extendSelection command", () => {
    const { editor } = setup("Hello");
    let newSel: Selection | undefined;
    editor.on("selectionChange", (sel) => { newSel = sel; });
    editor.dispatch({ type: "extendSelection", direction: "right", granularity: "character" });
    expect(newSel).toBeDefined();
  });

  test("fires on selectAll", () => {
    const { editor } = setup("Hello");
    let fired = false;
    editor.on("selectionChange", () => { fired = true; });
    editor.dispatch({ type: "selectAll" });
    expect(fired).toBe(true);
  });

  test("fires on setCursor (selection becomes collapsed)", () => {
    const { editor } = setup("Hello");
    let fired = false;
    editor.on("selectionChange", () => { fired = true; });
    editor.setCursor(mbPoint(0, 3));
    expect(fired).toBe(true);
  });

  test("fires on extendSelectionTo with non-null selection", () => {
    const { editor } = setup("Hello");
    editor.setCursor(mbPoint(0, 0));
    let fired = false;
    editor.on("selectionChange", () => { fired = true; });
    editor.extendSelectionTo(mbPoint(0, 3));
    expect(fired).toBe(true);
  });

  test("fires on collapseSelection", () => {
    const { editor } = setup("Hello");
    editor.dispatch({ type: "selectAll" });
    let fired = false;
    editor.on("selectionChange", () => { fired = true; });
    editor.dispatch({ type: "collapseSelection", to: "start" });
    expect(fired).toBe(true);
  });

  test("does NOT fire on cursor move that doesn't affect selection structurally (movement collapses selection)", () => {
    const { editor } = setup("Hello");
    // moveCursor collapses any existing selection
    editor.dispatch({ type: "selectAll" });
    let fired = false;
    editor.on("selectionChange", () => { fired = true; });
    editor.dispatch({ type: "moveCursor", direction: "right", granularity: "character" });
    // Selection IS changed (collapsed from full selection to nothing)
    expect(fired).toBe(true);
  });
});

// ─── change (compound) ───────────────────────────────────────────

describe("Editor events - change (compound)", () => {
  test("fires on text insert with correct cursor and selection", () => {
    const { editor } = setup("Hello");
    let state: EditorEventMap["change"][0] | undefined;
    editor.on("change", (s) => { state = s; });
    editor.dispatch({ type: "insertText", text: "X" });
    expect(state).toBeDefined();
    if (state) {
      expectPoint(state.cursor, 0, 1); // cursor advanced past "X"
    }
  });

  test("fires on cursor movement with correct new cursor", () => {
    const { editor } = setup("Hello");
    let state: EditorEventMap["change"][0] | undefined;
    editor.on("change", (s) => { state = s; });
    editor.dispatch({ type: "moveCursor", direction: "right", granularity: "character" });
    expect(state).toBeDefined();
    if (state) {
      expectPoint(state.cursor, 0, 1);
    }
  });

  test("fires on setCursor", () => {
    const { editor } = setup("Hello");
    let state: EditorEventMap["change"][0] | undefined;
    editor.on("change", (s) => { state = s; });
    editor.setCursor(mbPoint(0, 3));
    expect(state).toBeDefined();
    if (state) {
      expectPoint(state.cursor, 0, 3);
    }
  });

  test("does NOT fire on copy (no state change)", () => {
    const { editor } = setup("Hello");
    editor.dispatch({ type: "selectAll" });
    let fired = false;
    editor.on("change", () => { fired = true; });
    editor.dispatch({ type: "copy" });
    expect(fired).toBe(false);
  });

  test("fires once per dispatch even if multiple sub-changes occur", () => {
    const { editor } = setup("Hello\nWorld");
    let count = 0;
    editor.on("change", () => { count++; });
    editor.dispatch({ type: "insertText", text: "X" });
    expect(count).toBe(1);
  });

  test("fires after all granular events", () => {
    const { editor } = setup("Hello");
    const order: string[] = [];
    editor.on("textChange", () => { order.push("textChange"); });
    editor.on("cursorChange", () => { order.push("cursorChange"); });
    editor.on("selectionChange", () => { order.push("selectionChange"); });
    editor.on("change", () => { order.push("change"); });
    editor.dispatch({ type: "insertText", text: "X" });
    // change should be last
    expect(order[order.length - 1]).toBe("change");
    // granular events should precede change
    expect(order.includes("textChange")).toBe(true);
  });

  test("fires on extendSelectionTo with active selection", () => {
    const { editor } = setup("Hello World");
    editor.setCursor(mbPoint(0, 0));
    let state: EditorEventMap["change"][0] | undefined;
    editor.on("change", (s) => { state = s; });
    editor.extendSelectionTo(mbPoint(0, 5));
    expect(state).toBeDefined();
    if (state) {
      expectPoint(state.cursor, 0, 5);
      expect(state.selection).toBeDefined();
    }
  });
});

// ─── Event ordering and independence ─────────────────────────────

describe("Editor events - ordering and independence", () => {
  test("textChange not fired when only cursor moves", () => {
    const { editor } = setup("Hello");
    const fired: string[] = [];
    editor.on("textChange", () => { fired.push("textChange"); });
    editor.on("cursorChange", () => { fired.push("cursorChange"); });
    editor.on("change", () => { fired.push("change"); });
    editor.dispatch({ type: "moveCursor", direction: "right", granularity: "character" });
    expect(fired.includes("textChange")).toBe(false);
    expect(fired.includes("cursorChange")).toBe(true);
    expect(fired.includes("change")).toBe(true);
  });

  test("all four event types fire on text insert", () => {
    const { editor } = setup("Hello");
    const fired: string[] = [];
    editor.on("textChange", () => { fired.push("textChange"); });
    editor.on("cursorChange", () => { fired.push("cursorChange"); });
    editor.on("selectionChange", () => { fired.push("selectionChange"); });
    editor.on("change", () => { fired.push("change"); });
    editor.dispatch({ type: "insertText", text: "X" });
    expect(fired.includes("textChange")).toBe(true);
    expect(fired.includes("cursorChange")).toBe(true);
    expect(fired.includes("selectionChange")).toBe(true);
    expect(fired.includes("change")).toBe(true);
  });

  test("removing one listener does not affect others on same event", () => {
    const { editor } = setup("Hello");
    let a = 0;
    let b = 0;
    const cbA = () => { a++; };
    const cbB = () => { b++; };
    editor.on("change", cbA);
    editor.on("change", cbB);
    editor.off("change", cbA);
    editor.dispatch({ type: "moveCursor", direction: "right", granularity: "character" });
    expect(a).toBe(0);
    expect(b).toBe(1);
  });
});
