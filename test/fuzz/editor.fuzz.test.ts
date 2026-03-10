/**
 * Fuzz tests for the Editor.
 *
 * Properties tested:
 * - Undo/redo reversibility
 * - Cursor always within valid bounds
 * - Selection ordering
 */

import { describe, it, expect } from "bun:test";
import * as fc from "fast-check";
import { Editor } from "../../src/editor/editor.ts";
import { createBuffer } from "../../src/multibuffer/buffer.ts";
import { createMultiBuffer } from "../../src/multibuffer/multibuffer.ts";
import type { BufferId, BufferRow, MultiBufferRow } from "../../src/multibuffer/types.ts";
import { editingCommandArb, navigationCommandArb, editorCommandArb, multilineTextArb, NUM_RUNS } from "./arbitraries.ts";

function makeBufferId(): BufferId {
  // biome-ignore lint/plugin/no-type-assertion: expect: test helper for branded type
  return `test-${Math.random().toString(36).slice(2)}` as BufferId;
}

function createTestEditor(text: string): Editor {
  const buffer = createBuffer(makeBufferId(), text);
  const mb = createMultiBuffer();
  mb.addExcerpt(buffer, {
    context: {
      // biome-ignore lint/plugin/no-type-assertion: expect: test helper
      start: { row: 0 as BufferRow, column: 0 },
      // biome-ignore lint/plugin/no-type-assertion: expect: test helper
      end: { row: buffer.snapshot().lineCount as BufferRow, column: 0 },
    },
    primary: {
      // biome-ignore lint/plugin/no-type-assertion: expect: test helper
      start: { row: 0 as BufferRow, column: 0 },
      // biome-ignore lint/plugin/no-type-assertion: expect: test helper
      end: { row: buffer.snapshot().lineCount as BufferRow, column: 0 },
    },
  });
  return new Editor(mb);
}

describe("Editor fuzz tests", () => {
  it("undo reverses single edit", () => {
    fc.assert(
      fc.property(
        multilineTextArb,
        fc.string({ maxLength: 50 }),
        (initial, toInsert) => {
          const editor = createTestEditor(initial);
          const textBefore = editor.multiBuffer.snapshot().lines(
            // biome-ignore lint/plugin/no-type-assertion: expect: test helper
            0 as MultiBufferRow,
            // biome-ignore lint/plugin/no-type-assertion: expect: test helper
            editor.multiBuffer.lineCount as MultiBufferRow,
          ).join("\n");

          editor.dispatch({ type: "insertText", text: toInsert });
          editor.dispatch({ type: "undo" });

          const textAfterUndo = editor.multiBuffer.snapshot().lines(
            // biome-ignore lint/plugin/no-type-assertion: expect: test helper
            0 as MultiBufferRow,
            // biome-ignore lint/plugin/no-type-assertion: expect: test helper
            editor.multiBuffer.lineCount as MultiBufferRow,
          ).join("\n");

          return textAfterUndo === textBefore;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("redo reverses undo", () => {
    fc.assert(
      fc.property(
        multilineTextArb,
        fc.string({ maxLength: 50 }),
        (initial, toInsert) => {
          const editor = createTestEditor(initial);

          editor.dispatch({ type: "insertText", text: toInsert });

          const textAfterEdit = editor.multiBuffer.snapshot().lines(
            // biome-ignore lint/plugin/no-type-assertion: expect: test helper
            0 as MultiBufferRow,
            // biome-ignore lint/plugin/no-type-assertion: expect: test helper
            editor.multiBuffer.lineCount as MultiBufferRow,
          ).join("\n");

          editor.dispatch({ type: "undo" });
          editor.dispatch({ type: "redo" });

          const textAfterRedo = editor.multiBuffer.snapshot().lines(
            // biome-ignore lint/plugin/no-type-assertion: expect: test helper
            0 as MultiBufferRow,
            // biome-ignore lint/plugin/no-type-assertion: expect: test helper
            editor.multiBuffer.lineCount as MultiBufferRow,
          ).join("\n");

          return textAfterRedo === textAfterEdit;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("multiple undo/redo cycles are reversible", () => {
    fc.assert(
      fc.property(
        multilineTextArb,
        fc.array(editingCommandArb, { minLength: 1, maxLength: 10 }),
        (initial, commands) => {
          const editor = createTestEditor(initial);

          // Apply all commands
          for (const cmd of commands) {
            editor.dispatch(cmd);
          }

          const textAfterEdits = editor.multiBuffer.snapshot().lines(
            // biome-ignore lint/plugin/no-type-assertion: expect: test helper
            0 as MultiBufferRow,
            // biome-ignore lint/plugin/no-type-assertion: expect: test helper
            editor.multiBuffer.lineCount as MultiBufferRow,
          ).join("\n");

          // Undo all
          for (let i = 0; i < commands.length; i++) {
            editor.dispatch({ type: "undo" });
          }

          // Redo all
          for (let i = 0; i < commands.length; i++) {
            editor.dispatch({ type: "redo" });
          }

          const textAfterRedos = editor.multiBuffer.snapshot().lines(
            // biome-ignore lint/plugin/no-type-assertion: expect: test helper
            0 as MultiBufferRow,
            // biome-ignore lint/plugin/no-type-assertion: expect: test helper
            editor.multiBuffer.lineCount as MultiBufferRow,
          ).join("\n");

          return textAfterRedos === textAfterEdits;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("cursor stays within valid bounds after any command sequence", () => {
    fc.assert(
      fc.property(
        multilineTextArb,
        fc.array(editorCommandArb, { maxLength: 30 }),
        (initial, commands) => {
          const editor = createTestEditor(initial);

          for (const cmd of commands) {
            editor.dispatch(cmd);

            const cursor = editor.cursor;
            const snap = editor.multiBuffer.snapshot();
            const lineCount = snap.lineCount;

            // Cursor row must be valid
            if (cursor.row < 0) return false;
            if (lineCount > 0 && cursor.row >= lineCount) return false;

            // Cursor column must be non-negative
            if (cursor.column < 0) return false;

            // Cursor column should not exceed line length
            // (though the editor may allow cursor at end of line)
            if (lineCount > 0) {
              const lines = snap.lines(
                cursor.row,
                // biome-ignore lint/plugin/no-type-assertion: expect: test helper
                Math.min(cursor.row + 1, lineCount) as MultiBufferRow,
              );
              const lineText = lines[0] ?? "";
              if (cursor.column > lineText.length) return false;
            }
          }

          return true;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("selection (when present) has ordered start <= end after resolving", () => {
    fc.assert(
      fc.property(
        multilineTextArb,
        fc.array(editorCommandArb, { maxLength: 20 }),
        (initial, commands) => {
          const editor = createTestEditor(initial);

          for (const cmd of commands) {
            editor.dispatch(cmd);
          }

          const selection = editor.selection;
          if (!selection) return true; // No selection is valid

          const snap = editor.multiBuffer.snapshot();
          const start = snap.resolveAnchor(selection.range.start);
          const end = snap.resolveAnchor(selection.range.end);

          if (!start || !end) return true; // Stale anchors are acceptable

          // Start should be <= end
          if (start.row > end.row) return false;
          if (start.row === end.row && start.column > end.column) return false;

          return true;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("navigation commands don't change text content", () => {
    fc.assert(
      fc.property(
        multilineTextArb,
        fc.array(navigationCommandArb, { maxLength: 30 }),
        (initial, commands) => {
          const editor = createTestEditor(initial);

          const textBefore = editor.multiBuffer.snapshot().lines(
            // biome-ignore lint/plugin/no-type-assertion: expect: test helper
            0 as MultiBufferRow,
            // biome-ignore lint/plugin/no-type-assertion: expect: test helper
            editor.multiBuffer.lineCount as MultiBufferRow,
          ).join("\n");

          for (const cmd of commands) {
            editor.dispatch(cmd);
          }

          const textAfter = editor.multiBuffer.snapshot().lines(
            // biome-ignore lint/plugin/no-type-assertion: expect: test helper
            0 as MultiBufferRow,
            // biome-ignore lint/plugin/no-type-assertion: expect: test helper
            editor.multiBuffer.lineCount as MultiBufferRow,
          ).join("\n");

          return textAfter === textBefore;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("delete backward at start of buffer is no-op", () => {
    fc.assert(
      fc.property(multilineTextArb, (initial) => {
        const editor = createTestEditor(initial);

        // Move cursor to start
        editor.setCursor({ row: 0 as MultiBufferRow, column: 0 });

        const textBefore = editor.multiBuffer.snapshot().lines(
          // biome-ignore lint/plugin/no-type-assertion: expect: test helper
          0 as MultiBufferRow,
          // biome-ignore lint/plugin/no-type-assertion: expect: test helper
          editor.multiBuffer.lineCount as MultiBufferRow,
        ).join("\n");

        editor.dispatch({ type: "deleteBackward", granularity: "character" });

        const textAfter = editor.multiBuffer.snapshot().lines(
          // biome-ignore lint/plugin/no-type-assertion: expect: test helper
          0 as MultiBufferRow,
          // biome-ignore lint/plugin/no-type-assertion: expect: test helper
          editor.multiBuffer.lineCount as MultiBufferRow,
        ).join("\n");

        return textAfter === textBefore;
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
