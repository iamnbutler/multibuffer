/**
 * Tests for editor factory functions.
 */

import { describe, expect, test } from "bun:test";
import { createBuffer } from "../../src/buffer/buffer.ts";
import {
  createMultiBufferEditor,
  createSingleBufferEditor,
} from "../../src/editor/factories.ts";
import { createMultiBuffer } from "../../src/multibuffer/multibuffer.ts";
import { createBufferId, excerptRange, expectPoint, mbRow } from "../helpers.ts";

// ─── createSingleBufferEditor ────────────────────────────────────

describe("createSingleBufferEditor", () => {
  test("creates editor with correct text content", () => {
    const text = "hello\nworld";
    const editor = createSingleBufferEditor(text);
    const snap = editor.multiBuffer.snapshot();
    const lines = snap.lines(mbRow(0), mbRow(snap.lineCount));
    expect(lines.join("\n")).toBe(text);
  });

  test("cursor starts at (0, 0)", () => {
    const editor = createSingleBufferEditor("some text");
    expectPoint(editor.cursor, 0, 0);
  });

  test("works with empty string", () => {
    const editor = createSingleBufferEditor("");
    const snap = editor.multiBuffer.snapshot();
    expect(snap.lineCount).toBe(1);
    expectPoint(editor.cursor, 0, 0);
  });

  test("works with single line (no newline)", () => {
    const editor = createSingleBufferEditor("just one line");
    const snap = editor.multiBuffer.snapshot();
    const lines = snap.lines(mbRow(0), mbRow(snap.lineCount));
    expect(lines[0]).toBe("just one line");
    expect(snap.lineCount).toBe(1);
  });

  test("text mutations work after creation", () => {
    const editor = createSingleBufferEditor("hello");
    editor.dispatch({ type: "moveCursor", direction: "right", granularity: "character" });
    expectPoint(editor.cursor, 0, 1);
    editor.dispatch({ type: "insertText", text: "!" });
    const snap = editor.multiBuffer.snapshot();
    const lines = snap.lines(mbRow(0), mbRow(snap.lineCount));
    expect(lines[0]).toBe("h!ello");
  });

  test("multiple editors are independent (separate buffers)", () => {
    const editorA = createSingleBufferEditor("aaa");
    const editorB = createSingleBufferEditor("bbb");
    editorA.dispatch({ type: "insertText", text: "X" });
    const snapB = editorB.multiBuffer.snapshot();
    const lines = snapB.lines(mbRow(0), mbRow(snapB.lineCount));
    expect(lines[0]).toBe("bbb");
  });

  test("forwards readOnly option to the editor", () => {
    const editor = createSingleBufferEditor("hello", { readOnly: true });
    expect(editor.readOnly).toBe(true);
    // Text-mutating commands are ignored in read-only mode
    editor.dispatch({ type: "insertText", text: "X" });
    const snap = editor.multiBuffer.snapshot();
    const lines = snap.lines(mbRow(0), mbRow(snap.lineCount));
    expect(lines[0]).toBe("hello");
  });

  test("accepts empty options and undefined without error", () => {
    expect(() => createSingleBufferEditor("text", {})).not.toThrow();
    expect(() => createSingleBufferEditor("text", undefined)).not.toThrow();
  });
});

// ─── createMultiBufferEditor ─────────────────────────────────────

describe("createMultiBufferEditor", () => {
  test("wraps an existing MultiBuffer", () => {
    const buf = createBuffer(createBufferId(), "foo\nbar");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 2));
    const editor = createMultiBufferEditor(mb);
    expect(editor.multiBuffer).toBe(mb);
  });

  test("cursor starts at (0, 0)", () => {
    const buf = createBuffer(createBufferId(), "line1\nline2");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 2));
    const editor = createMultiBufferEditor(mb);
    expectPoint(editor.cursor, 0, 0);
  });

  test("dispatches commands correctly", () => {
    const buf = createBuffer(createBufferId(), "hello");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 1));
    const editor = createMultiBufferEditor(mb);
    editor.dispatch({ type: "moveCursor", direction: "right", granularity: "word" });
    expectPoint(editor.cursor, 0, 5);
  });

  test("forwards readOnly option to the editor", () => {
    const buf = createBuffer(createBufferId(), "hello");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 1));
    const editor = createMultiBufferEditor(mb, { readOnly: true });
    expect(editor.readOnly).toBe(true);
    editor.dispatch({ type: "insertText", text: "X" });
    const snap = editor.multiBuffer.snapshot();
    const lines = snap.lines(mbRow(0), mbRow(snap.lineCount));
    expect(lines[0]).toBe("hello");
  });

  test("accepts empty options and undefined without error", () => {
    const mb = createMultiBuffer();
    expect(() => createMultiBufferEditor(mb, {})).not.toThrow();
    expect(() => createMultiBufferEditor(mb, undefined)).not.toThrow();
  });
});
