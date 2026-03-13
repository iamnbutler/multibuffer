/**
 * Editor dispatch benchmarks.
 *
 * Measures the full keypress-to-model-update latency through Editor.dispatch().
 * This is the critical user-facing performance path.
 *
 * Key performance targets (from CLAUDE.md):
 * - Keypress to model update: <1ms
 *
 * Covers:
 * - insertText: single char typed (most common keypress)
 * - deleteBackward: backspace (second most common)
 * - moveCursor: cursor navigation without edit (no buffer mutation)
 * - insertNewline: Enter key with auto-indent
 */

import { createBuffer } from "../src/buffer/buffer.ts";
import { Editor } from "../src/editor/editor.ts";
import { createMultiBuffer } from "../src/multibuffer/multibuffer.ts";
import type { BufferId, BufferRow, ExcerptRange, MultiBufferRow } from "../src/multibuffer/types.ts";
import type { BenchmarkSuite } from "./harness.ts";

function generateText(lines: number): string {
  return Array.from(
    { length: lines },
    (_, i) => `Line ${i + 1}: Some text content here`,
  ).join("\n");
}

// biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in benchmarks
const bufferId = "bench-editor" as BufferId;

function makeEditor(lineCount: number): Editor {
  const text = generateText(lineCount);
  const buf = createBuffer(bufferId, text);
  const mb = createMultiBuffer();
  const lineRows = text.split("\n").length;
  // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in benchmarks
  const start = { row: 0 as BufferRow, column: 0 };
  // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in benchmarks
  const end = { row: lineRows as BufferRow, column: 0 };
  const excerptRange = { context: { start, end }, primary: { start, end } };
  mb.addExcerpt(buf, excerptRange);
  return new Editor(mb);
}

function makeIndentedEditor(lineCount: number, leadingSpaces: number): Editor {
  const indent = " ".repeat(leadingSpaces);
  const text = Array.from(
    { length: lineCount },
    (_, i) => `${indent}Line ${i + 1}: content`,
  ).join("\n");
  // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in benchmarks
  const buf = createBuffer("bench-indent" as BufferId, text);
  const mb = createMultiBuffer();
  const lineRows = text.split("\n").length;
  // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in benchmarks
  const start = { row: 0 as BufferRow, column: 0 };
  // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in benchmarks
  const end = { row: lineRows as BufferRow, column: 0 };
  const excerptRange = { context: { start, end }, primary: { start, end } };
  mb.addExcerpt(buf, excerptRange);
  return new Editor(mb);
}

let editorInsert1k: Editor;
let editorInsert10k: Editor;
let editorDelete1k: Editor;
let editorMove1k: Editor;
let editorNewline1k: Editor;
let editorInsert100excerpts: Editor;
let editorIndent1k: Editor;
let editorDedent1k: Editor;
let editorMoveLine1k: Editor;
let editorDuplicate1k: Editor;
let editorInsertBelow1k: Editor;
let editorInsertAbove1k: Editor;

export const editorBenchmarks: BenchmarkSuite = {
  name: "Editor dispatch (keypress latency)",
  benchmarks: [
    {
      // Most common keypress: typing a character. Measures full dispatch path:
      // snapshot → resolveAnchor → _edit → buffer.insert → new snapshot → selectionAtPoint.
      name: "insertText - single char (1K buffer)",
      iterations: 1000,
      targetMs: 1,
      setup: () => {
        editorInsert1k = makeEditor(1000);
        // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in benchmarks
        editorInsert1k.setCursor({ row: 500 as MultiBufferRow, column: 10 });
      },
      fn: () => {
        editorInsert1k.dispatch({ type: "insertText", text: "a" });
      },
    },
    {
      // Large file: 10K buffer bottlenecks on rope insert (~1ms) — separate
      // backlog item (rope structural sharing). Editor overhead is ~0.12ms.
      name: "insertText - single char (10K buffer)",
      iterations: 500,
      targetMs: 2,
      setup: () => {
        editorInsert10k = makeEditor(10_000);
        // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in benchmarks
        editorInsert10k.setCursor({ row: 5000 as MultiBufferRow, column: 10 });
      },
      fn: () => {
        editorInsert10k.dispatch({ type: "insertText", text: "a" });
      },
    },
    {
      // Backspace: same hot path as insertText but deletes instead.
      name: "deleteBackward - char (1K buffer)",
      iterations: 1000,
      targetMs: 1,
      setup: () => {
        editorDelete1k = makeEditor(1000);
        // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in benchmarks
        editorDelete1k.setCursor({ row: 500 as MultiBufferRow, column: 32 });
      },
      fn: () => {
        editorDelete1k.dispatch({ type: "deleteBackward", granularity: "character" });
      },
    },
    {
      // Pure cursor navigation: no buffer mutation.
      // Should be significantly cheaper than edit operations.
      name: "moveCursor right - char (1K buffer)",
      iterations: 1000,
      targetMs: 1,
      setup: () => {
        editorMove1k = makeEditor(1000);
        // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in benchmarks
        editorMove1k.setCursor({ row: 500 as MultiBufferRow, column: 0 });
      },
      fn: () => {
        editorMove1k.dispatch({ type: "moveCursor", direction: "right", granularity: "character" });
      },
    },
    {
      // Enter key: insertText("\n") + auto-indent regex on current line.
      // Indented lines add regex match cost on top of insertText.
      name: "insertNewline with auto-indent (1K buffer, indented line)",
      iterations: 500,
      targetMs: 1,
      setup: () => {
        // Generate indented code to exercise auto-indent path
        const lines = Array.from(
          { length: 1000 },
          (_, i) => `  function f${i}() { return ${i}; }`,
        ).join("\n");
        const buf = createBuffer(bufferId, lines);
        const mb = createMultiBuffer();
        const lineRows = lines.split("\n").length;
        // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in benchmarks
        const start = { row: 0 as BufferRow, column: 0 };
        // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in benchmarks
        const end = { row: lineRows as BufferRow, column: 0 };
        const excerptRange = { context: { start, end }, primary: { start, end } };
        mb.addExcerpt(buf, excerptRange);
        editorNewline1k = new Editor(mb);
        // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in benchmarks
        editorNewline1k.setCursor({ row: 500 as MultiBufferRow, column: 30 });
      },
      fn: () => {
        editorNewline1k.dispatch({ type: "insertNewline" });
      },
    },
    {
      // Multi-excerpt editor: 100 excerpts of 10 lines each.
      // Measures the cost of insertText when snapshot.lines() and snapshot.clipPoint()
      // must look up excerpt data. With the lazy-cached index map, the O(n_excerpts)
      // Map construction in lines() is paid at most once per snapshot instead of
      // once per call; cursor getter skips snapshot entirely for collapsed cursors.
      name: "insertText - single char (100 excerpts × 10 lines)",
      iterations: 1000,
      targetMs: 1,
      setup: () => {
        const mb = createMultiBuffer();
        // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in benchmarks
        const buf = createBuffer("bench-multi" as BufferId, generateText(1000));
        for (let i = 0; i < 100; i++) {
          // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in benchmarks
          const start = { row: (i * 10) as BufferRow, column: 0 };
          // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in benchmarks
          const end = { row: ((i + 1) * 10) as BufferRow, column: 0 };
          const r: ExcerptRange = { context: { start, end }, primary: { start, end } };
          mb.addExcerpt(buf, r);
        }
        editorInsert100excerpts = new Editor(mb);
        // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in benchmarks
        editorInsert100excerpts.setCursor({ row: 500 as MultiBufferRow, column: 10 });
      },
      fn: () => {
        editorInsert100excerpts.dispatch({ type: "insertText", text: "a" });
      },
    },
    {
      // Indent cursor line (Tab / Cmd+]) — snap.lines() + buffer.insert() per keypress.
      // Lines accumulate 2 spaces per iteration; limit iterations to avoid line explosion.
      name: "indentLines - single line (1K buffer)",
      iterations: 50,
      targetMs: 1,
      setup: () => {
        editorIndent1k = makeEditor(1000);
        // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in benchmarks
        editorIndent1k.setCursor({ row: 500 as MultiBufferRow, column: 0 });
      },
      fn: () => {
        editorIndent1k.dispatch({ type: "indentLines" });
      },
    },
    {
      // Dedent cursor line (Shift+Tab / Cmd+[).
      // Realistic indentation: 100 leading spaces (enough for 50 iters × 2 spaces each).
      name: "dedentLines - single line (1K buffer, 100-space indent)",
      iterations: 50,
      targetMs: 1,
      setup: () => {
        // 100 leading spaces — enough for 50 dedent iters (+ 10% warmup = 5) × 2 = 110 removed
        editorDedent1k = makeIndentedEditor(1000, 110);
        // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in benchmarks
        editorDedent1k.setCursor({ row: 500 as MultiBufferRow, column: 0 });
      },
      fn: () => {
        editorDedent1k.dispatch({ type: "dedentLines" });
      },
    },
    {
      // Move cursor line down — 2× snap.lines() (combined into 1 after optimization) + _edit().
      // Cursor moves down with each iteration; limit to avoid buffer end bouncing issues.
      name: "moveLine down (1K buffer)",
      iterations: 100,
      targetMs: 1,
      setup: () => {
        editorMoveLine1k = makeEditor(1000);
        // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in benchmarks
        editorMoveLine1k.setCursor({ row: 500 as MultiBufferRow, column: 0 });
      },
      fn: () => {
        editorMoveLine1k.dispatch({ type: "moveLine", direction: "down" });
      },
    },
    {
      // Duplicate line below — snap.lines(1 row) + _edit() insertion.
      // Buffer grows by 1 line per iteration; limit iterations to avoid buffer explosion.
      name: "duplicateLine down (1K buffer)",
      iterations: 100,
      targetMs: 1,
      setup: () => {
        editorDuplicate1k = makeEditor(1000);
        // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in benchmarks
        editorDuplicate1k.setCursor({ row: 500 as MultiBufferRow, column: 0 });
      },
      fn: () => {
        editorDuplicate1k.dispatch({ type: "duplicateLine", direction: "down" });
      },
    },
    {
      // Insert blank line below cursor (Enter equivalent from non-eol position).
      // Buffer grows; limit iterations.
      name: "insertLineBelow (1K buffer)",
      iterations: 100,
      targetMs: 1,
      setup: () => {
        editorInsertBelow1k = makeEditor(1000);
        // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in benchmarks
        editorInsertBelow1k.setCursor({ row: 500 as MultiBufferRow, column: 0 });
      },
      fn: () => {
        editorInsertBelow1k.dispatch({ type: "insertLineBelow" });
      },
    },
    {
      // Insert blank line above cursor.
      // Buffer grows; limit iterations.
      name: "insertLineAbove (1K buffer)",
      iterations: 100,
      targetMs: 1,
      setup: () => {
        editorInsertAbove1k = makeEditor(1000);
        // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in benchmarks
        editorInsertAbove1k.setCursor({ row: 500 as MultiBufferRow, column: 0 });
      },
      fn: () => {
        editorInsertAbove1k.dispatch({ type: "insertLineAbove" });
      },
    },
  ],
};
