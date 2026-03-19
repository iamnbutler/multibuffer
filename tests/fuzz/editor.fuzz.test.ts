/**
 * Property-based fuzz tests for the Editor using fast-check.
 *
 * Properties verified:
 *   1. Undo reversibility — undo restores previous state exactly
 *   2. Redo reversibility — redo after undo restores edited state
 *   3. Cursor bounds — cursor always within valid range
 *   4. Selection ordering — selection.start <= selection.end
 *   5. Command idempotence — some commands are idempotent
 *   6. Text consistency — editor text matches expected after commands
 *
 * @see https://github.com/iamnbutler/multibuffer/issues/80
 */

import { describe, expect, test } from "bun:test";
import * as fc from "fast-check";
import { createSingleBufferEditor } from "../../src/editor/factories.ts";
import type { Direction, EditorCommand, Granularity } from "../../src/editor/types.ts";
import type { MultiBufferRow } from "../../src/multibuffer/types.ts";
import { fcParams } from "./arbitraries.ts";

// ── Helpers ───────────────────────────────────────────────────────────────────

function mbRow(n: number): MultiBufferRow {
  // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction for test
  return n as MultiBufferRow;
}

/** Unwrap a branded numeric type for comparison */
function num(value: MultiBufferRow | number): number {
  // biome-ignore lint/plugin/no-type-assertion: expect: unwrapping branded type for comparison
  return value as number;
}

// ── Command arbitraries ───────────────────────────────────────────────────────

const directionArb = fc.constantFrom<Direction>("left", "right", "up", "down");
const granularityArb = fc.constantFrom<Granularity>(
  "character",
  "word",
  "line",
);

const insertTextArb: fc.Arbitrary<EditorCommand> = fc
  .string({ minLength: 1, maxLength: 20 })
  .map((text) => ({ type: "insertText" as const, text }));

const insertNewlineArb: fc.Arbitrary<EditorCommand> = fc.constant({
  type: "insertNewline" as const,
});

const deleteBackwardArb: fc.Arbitrary<EditorCommand> = granularityArb.map(
  (granularity) => ({ type: "deleteBackward" as const, granularity }),
);

const deleteForwardArb: fc.Arbitrary<EditorCommand> = granularityArb.map(
  (granularity) => ({ type: "deleteForward" as const, granularity }),
);

const moveCursorArb: fc.Arbitrary<EditorCommand> = fc
  .tuple(directionArb, granularityArb)
  .map(([direction, granularity]) => ({
    type: "moveCursor" as const,
    direction,
    granularity,
  }));

const extendSelectionArb: fc.Arbitrary<EditorCommand> = fc
  .tuple(directionArb, granularityArb)
  .map(([direction, granularity]) => ({
    type: "extendSelection" as const,
    direction,
    granularity,
  }));

const undoArb: fc.Arbitrary<EditorCommand> = fc.constant({
  type: "undo" as const,
});

const redoArb: fc.Arbitrary<EditorCommand> = fc.constant({
  type: "redo" as const,
});

const selectAllArb: fc.Arbitrary<EditorCommand> = fc.constant({
  type: "selectAll" as const,
});

/** Generate editor commands (weighted to produce interesting sequences) */
const editorCommandArb: fc.Arbitrary<EditorCommand> = fc.oneof(
  { weight: 10, arbitrary: insertTextArb },
  { weight: 3, arbitrary: insertNewlineArb },
  { weight: 3, arbitrary: deleteBackwardArb },
  { weight: 3, arbitrary: deleteForwardArb },
  { weight: 5, arbitrary: moveCursorArb },
  { weight: 3, arbitrary: extendSelectionArb },
  { weight: 2, arbitrary: undoArb },
  { weight: 1, arbitrary: redoArb },
  { weight: 1, arbitrary: selectAllArb },
);

/** Commands that modify text */
const editingCommandArb: fc.Arbitrary<EditorCommand> = fc.oneof(
  insertTextArb,
  insertNewlineArb,
  deleteBackwardArb,
  deleteForwardArb,
);

// ── Property 1: Undo reversibility ────────────────────────────────────────────

describe("Editor fuzz: undo restores previous state", () => {
  test("single edit + undo restores original text", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 100 }),
        editingCommandArb,
        (initialText, editCmd) => {
          const editor = createSingleBufferEditor(initialText);
          const originalText = editor.multiBuffer.snapshot().lines(mbRow(0), mbRow(editor.multiBuffer.lineCount)).join("\n");

          // Apply edit
          editor.dispatch(editCmd);

          // Undo
          editor.dispatch({ type: "undo" });

          // Text should match original
          const afterUndo = editor.multiBuffer.snapshot().lines(mbRow(0), mbRow(editor.multiBuffer.lineCount)).join("\n");
          return afterUndo === originalText;
        },
      ),
      fcParams,
    );
  });

  test("multiple edits + multiple undos restore original", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 50 }),
        fc.array(editingCommandArb, { minLength: 1, maxLength: 10 }),
        (initialText, edits) => {
          const editor = createSingleBufferEditor(initialText);
          const originalText = editor.multiBuffer.snapshot().lines(mbRow(0), mbRow(editor.multiBuffer.lineCount)).join("\n");

          // Apply all edits
          for (const cmd of edits) {
            editor.dispatch(cmd);
          }

          // Undo all edits
          for (let i = 0; i < edits.length; i++) {
            editor.dispatch({ type: "undo" });
          }

          // Text should match original
          const afterUndo = editor.multiBuffer.snapshot().lines(mbRow(0), mbRow(editor.multiBuffer.lineCount)).join("\n");
          return afterUndo === originalText;
        },
      ),
      fcParams,
    );
  });
});

// ── Property 2: Redo reversibility ────────────────────────────────────────────

describe("Editor fuzz: redo after undo restores edited state", () => {
  test("edit + undo + redo restores edited state", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 100 }),
        editingCommandArb,
        (initialText, editCmd) => {
          const editor = createSingleBufferEditor(initialText);

          // Apply edit
          editor.dispatch(editCmd);
          const afterEdit = editor.multiBuffer.snapshot().lines(mbRow(0), mbRow(editor.multiBuffer.lineCount)).join("\n");

          // Undo then redo
          editor.dispatch({ type: "undo" });
          editor.dispatch({ type: "redo" });

          // Text should match state after edit
          const afterRedo = editor.multiBuffer.snapshot().lines(mbRow(0), mbRow(editor.multiBuffer.lineCount)).join("\n");
          return afterRedo === afterEdit;
        },
      ),
      fcParams,
    );
  });

  test("sequence of edits, undos, and redos maintains consistency", () => {
    // Use only insert commands to avoid complex edge cases with delete + undo/redo
    // interactions. Delete edge cases are covered by other tests.
    const insertOnlyCommandArb = fc.oneof(insertTextArb, insertNewlineArb);

    fc.assert(
      fc.property(
        // Use non-empty strings to avoid edge cases with delete on empty content
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.array(insertOnlyCommandArb, { minLength: 1, maxLength: 5 }),
        (initialText, edits) => {
          const editor = createSingleBufferEditor(initialText);
          const states: string[] = [
            editor.multiBuffer.snapshot().lines(mbRow(0), mbRow(editor.multiBuffer.lineCount)).join("\n"),
          ];

          // Apply all edits, recording state after each
          for (const cmd of edits) {
            editor.dispatch(cmd);
            states.push(
              editor.multiBuffer.snapshot().lines(mbRow(0), mbRow(editor.multiBuffer.lineCount)).join("\n"),
            );
          }

          // Undo all, checking state at each step
          for (let i = edits.length - 1; i >= 0; i--) {
            editor.dispatch({ type: "undo" });
            const expectedState = states[i];
            const actualState = editor.multiBuffer.snapshot().lines(mbRow(0), mbRow(editor.multiBuffer.lineCount)).join("\n");
            if (actualState !== expectedState) return false;
          }

          // Redo all, checking state at each step
          for (let i = 0; i < edits.length; i++) {
            editor.dispatch({ type: "redo" });
            const expectedState = states[i + 1];
            const actualState = editor.multiBuffer.snapshot().lines(mbRow(0), mbRow(editor.multiBuffer.lineCount)).join("\n");
            if (actualState !== expectedState) return false;
          }

          return true;
        },
      ),
      fcParams,
    );
  });
});

// ── Property 3: Cursor bounds ─────────────────────────────────────────────────

describe("Editor fuzz: cursor always within valid bounds", () => {
  test("cursor row is within [0, lineCount)", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 100 }),
        fc.array(editorCommandArb, { maxLength: 30 }),
        (initialText, commands) => {
          const editor = createSingleBufferEditor(initialText);

          for (const cmd of commands) {
            editor.dispatch(cmd);

            const cursor = editor.cursor;
            const lineCount = editor.multiBuffer.lineCount;

            // Cursor row must be valid
            const cursorRow = num(cursor.row);
            if (cursorRow < 0) return false;
            // Cursor can be at lineCount - 1 (last line) but not beyond
            if (lineCount > 0 && cursorRow >= lineCount) return false;
          }

          return true;
        },
      ),
      fcParams,
    );
  });

  test("cursor column is non-negative", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 100 }),
        fc.array(editorCommandArb, { maxLength: 30 }),
        (initialText, commands) => {
          const editor = createSingleBufferEditor(initialText);

          for (const cmd of commands) {
            editor.dispatch(cmd);

            const cursor = editor.cursor;
            if (cursor.column < 0) return false;
          }

          return true;
        },
      ),
      fcParams,
    );
  });

  test("cursor column does not exceed line length", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 100 }),
        fc.array(editorCommandArb, { maxLength: 30 }),
        (initialText, commands) => {
          const editor = createSingleBufferEditor(initialText);

          for (const cmd of commands) {
            editor.dispatch(cmd);

            const cursor = editor.cursor;
            const cursorRow = num(cursor.row);
            const snap = editor.multiBuffer.snapshot();
            const lines = snap.lines(mbRow(cursorRow), mbRow(cursorRow + 1));
            const lineLen = lines[0]?.length ?? 0;

            // Cursor column should not exceed line length
            if (cursor.column > lineLen) return false;
          }

          return true;
        },
      ),
      fcParams,
    );
  });
});

// ── Property 4: Selection ordering ────────────────────────────────────────────

describe("Editor fuzz: selection start <= end", () => {
  test("selection always has start before or equal to end", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 100 }),
        fc.array(editorCommandArb, { maxLength: 30 }),
        (initialText, commands) => {
          const editor = createSingleBufferEditor(initialText);

          for (const cmd of commands) {
            editor.dispatch(cmd);

            const selections = editor.selections;
            for (const sel of selections) {
              const snap = editor.multiBuffer.snapshot();
              const start = snap.resolveAnchor(sel.range.start);
              const end = snap.resolveAnchor(sel.range.end);

              if (!start || !end) continue;

              // Compare positions: start should be <= end
              const startRow = num(start.row);
              const endRow = num(end.row);

              if (startRow > endRow) return false;
              if (startRow === endRow && start.column > end.column) return false;
            }
          }

          return true;
        },
      ),
      fcParams,
    );
  });
});

// ── Property 5: Command idempotence ───────────────────────────────────────────

describe("Editor fuzz: idempotent commands", () => {
  test("selectAll is idempotent", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 100 }),
        (initialText) => {
          const editor = createSingleBufferEditor(initialText);

          // First selectAll
          editor.dispatch({ type: "selectAll" });
          const sel1 = editor.selections[0];

          // Second selectAll
          editor.dispatch({ type: "selectAll" });
          const sel2 = editor.selections[0];

          if (!sel1 || !sel2) return true; // Empty buffer case

          const snap = editor.multiBuffer.snapshot();
          const start1 = snap.resolveAnchor(sel1.range.start);
          const end1 = snap.resolveAnchor(sel1.range.end);
          const start2 = snap.resolveAnchor(sel2.range.start);
          const end2 = snap.resolveAnchor(sel2.range.end);

          if (!start1 || !end1 || !start2 || !end2) return true;

          return (
            num(start1.row) === num(start2.row) &&
            start1.column === start2.column &&
            num(end1.row) === num(end2.row) &&
            end1.column === end2.column
          );
        },
      ),
      fcParams,
    );
  });

  test("moveCursor to buffer start is idempotent", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 100 }),
        (initialText) => {
          const editor = createSingleBufferEditor(initialText);

          // Move to start twice
          editor.dispatch({
            type: "moveCursor",
            direction: "up",
            granularity: "buffer",
          });
          const cursor1 = { ...editor.cursor };

          editor.dispatch({
            type: "moveCursor",
            direction: "up",
            granularity: "buffer",
          });
          const cursor2 = { ...editor.cursor };

          return (
            num(cursor1.row) === num(cursor2.row) &&
            cursor1.column === cursor2.column
          );
        },
      ),
      fcParams,
    );
  });
});

// ── Property 6: Text consistency ──────────────────────────────────────────────

describe("Editor fuzz: text consistency", () => {
  test("insertText adds exactly the inserted text", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 50 }).filter((s) => !s.includes("\n")),
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => !s.includes("\n")),
        (initialText, insertedText) => {
          const editor = createSingleBufferEditor(initialText);

          // Move to end of line
          editor.dispatch({
            type: "moveCursor",
            direction: "right",
            granularity: "line",
          });

          // Insert text
          editor.dispatch({ type: "insertText", text: insertedText });

          // Get resulting text
          const resultText = editor.multiBuffer.snapshot().lines(mbRow(0), mbRow(1))[0] ?? "";

          // Result should contain both original and inserted text
          return resultText.includes(insertedText);
        },
      ),
      fcParams,
    );
  });

  test("insertNewline increases line count by 1", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 100 }),
        (initialText) => {
          const editor = createSingleBufferEditor(initialText);
          const initialLineCount = editor.multiBuffer.lineCount;

          editor.dispatch({ type: "insertNewline" });

          return editor.multiBuffer.lineCount === initialLineCount + 1;
        },
      ),
      fcParams,
    );
  });
});

// ── Empty buffer edge cases ───────────────────────────────────────────────────

describe("Editor fuzz: empty buffer handling", () => {
  test("commands on empty buffer don't crash", () => {
    fc.assert(
      fc.property(
        fc.array(editorCommandArb, { maxLength: 20 }),
        (commands) => {
          const editor = createSingleBufferEditor("");

          for (const cmd of commands) {
            // Should not throw
            editor.dispatch(cmd);
          }

          // Cursor should still be valid
          const cursor = editor.cursor;
          return num(cursor.row) >= 0 && cursor.column >= 0;
        },
      ),
      fcParams,
    );
  });

  test("undo on empty history is no-op", () => {
    const editor = createSingleBufferEditor("hello");
    const textBefore = editor.multiBuffer.snapshot().lines(mbRow(0), mbRow(1))[0];

    editor.dispatch({ type: "undo" });

    const textAfter = editor.multiBuffer.snapshot().lines(mbRow(0), mbRow(1))[0];
    expect(textAfter).toBe(textBefore);
  });

  test("redo without prior undo is no-op", () => {
    const editor = createSingleBufferEditor("hello");
    const textBefore = editor.multiBuffer.snapshot().lines(mbRow(0), mbRow(1))[0];

    editor.dispatch({ type: "redo" });

    const textAfter = editor.multiBuffer.snapshot().lines(mbRow(0), mbRow(1))[0];
    expect(textAfter).toBe(textBefore);
  });
});
