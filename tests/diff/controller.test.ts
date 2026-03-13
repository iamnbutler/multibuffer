/**
 * DiffController tests - written BEFORE implementation.
 *
 * DiffController manages a diff view between two buffers with:
 * - Re-diff on edit (triggered via notifyChange or reDiff)
 * - Debounced updates to avoid excessive recomputation
 * - Decoration updates for visual styling
 * - Subscriber notifications
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createBuffer } from "../../src/buffer/buffer.ts";
import type { Buffer } from "../../src/buffer/types.ts";
import { createDiffController } from "../../src/diff/controller.ts";
import { createBufferId, resetCounters } from "../helpers.ts";

/** Helper to edit buffer text at a point (row, col) */
function editBuffer(
  buffer: Buffer,
  startRow: number,
  startCol: number,
  endRow: number,
  endCol: number,
  newText: string,
): void {
  const snap = buffer.snapshot();
  // biome-ignore lint/plugin/no-type-assertion: expect: branded type for test helper
  const start = snap.pointToOffset({ row: startRow, column: startCol } as { row: import("../../src/buffer/types.ts").BufferRow; column: number });
  // biome-ignore lint/plugin/no-type-assertion: expect: branded type for test helper
  const end = snap.pointToOffset({ row: endRow, column: endCol } as { row: import("../../src/buffer/types.ts").BufferRow; column: number });
  buffer.replace(start, end, newText);
}

beforeEach(() => {
  resetCounters();
});

describe("DiffController creation", () => {
  test("creates controller with old and new buffers", () => {
    const oldBuffer = createBuffer(createBufferId(), "a\nb\nc\n");
    const newBuffer = createBuffer(createBufferId(), "a\nX\nc\n");

    const controller = createDiffController(oldBuffer, newBuffer);

    expect(controller.oldBuffer).toBe(oldBuffer);
    expect(controller.newBuffer).toBe(newBuffer);
    expect(controller.multiBuffer).toBeDefined();
  });

  test("initial decorations reflect diff state", () => {
    const oldBuffer = createBuffer(createBufferId(), "a\nb\nc\n");
    const newBuffer = createBuffer(createBufferId(), "a\nX\nc\n");

    const controller = createDiffController(oldBuffer, newBuffer);

    // Should have decorations for delete and insert lines
    expect(controller.decorations.length).toBeGreaterThan(0);
  });

  test("isEqual is true when buffers match", () => {
    const oldBuffer = createBuffer(createBufferId(), "same\ntext\n");
    const newBuffer = createBuffer(createBufferId(), "same\ntext\n");

    const controller = createDiffController(oldBuffer, newBuffer);

    expect(controller.isEqual).toBe(true);
  });

  test("isEqual is false when buffers differ", () => {
    const oldBuffer = createBuffer(createBufferId(), "old\n");
    const newBuffer = createBuffer(createBufferId(), "new\n");

    const controller = createDiffController(oldBuffer, newBuffer);

    expect(controller.isEqual).toBe(false);
  });
});

describe("reDiff", () => {
  test("updates multiBuffer after buffer edit", () => {
    const oldBuffer = createBuffer(createBufferId(), "a\nb\nc\n");
    const newBuffer = createBuffer(createBufferId(), "a\nb\nc\n");

    const controller = createDiffController(oldBuffer, newBuffer);
    expect(controller.isEqual).toBe(true);

    // Edit new buffer to create a difference
    editBuffer(newBuffer, 1, 0, 1, 1, "X");

    // Manually trigger re-diff
    const isEqual = controller.reDiff();

    expect(isEqual).toBe(false);
    expect(controller.isEqual).toBe(false);
    expect(controller.decorations.length).toBeGreaterThan(0);
  });

  test("convergence: edit to match old collapses delete+insert", () => {
    const oldBuffer = createBuffer(createBufferId(), "foo\n");
    const newBuffer = createBuffer(createBufferId(), "bar\n");

    const controller = createDiffController(oldBuffer, newBuffer);
    expect(controller.isEqual).toBe(false);
    const initialLineCount = controller.multiBuffer.lineCount;

    // Edit to match old buffer
    editBuffer(newBuffer, 0, 0, 0, 3, "foo");

    controller.reDiff();

    expect(controller.isEqual).toBe(true);
    expect(controller.multiBuffer.lineCount).toBeLessThan(initialLineCount);
  });

  test("divergence: edit equal line creates new delete+insert", () => {
    const oldBuffer = createBuffer(createBufferId(), "same\n");
    const newBuffer = createBuffer(createBufferId(), "same\n");

    const controller = createDiffController(oldBuffer, newBuffer);
    expect(controller.isEqual).toBe(true);
    const initialLineCount = controller.multiBuffer.lineCount;

    // Edit to differ from old buffer
    editBuffer(newBuffer, 0, 0, 0, 4, "diff");

    controller.reDiff();

    expect(controller.isEqual).toBe(false);
    expect(controller.multiBuffer.lineCount).toBeGreaterThan(initialLineCount);
  });
});

describe("notifyChange with debounce", () => {
  let controller: ReturnType<typeof createDiffController>;

  afterEach(() => {
    controller?.dispose();
  });

  test("notifyChange schedules debounced re-diff", async () => {
    const oldBuffer = createBuffer(createBufferId(), "a\n");
    const newBuffer = createBuffer(createBufferId(), "a\n");

    controller = createDiffController(oldBuffer, newBuffer, { debounceMs: 50 });
    expect(controller.isEqual).toBe(true);

    // Edit and notify
    editBuffer(newBuffer, 0, 0, 0, 1, "X");
    controller.notifyChange();

    // Should not update immediately
    expect(controller.isEqual).toBe(true);

    // Wait for debounce
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(controller.isEqual).toBe(false);
  });

  test("multiple rapid notifyChange calls debounce to single re-diff", async () => {
    const oldBuffer = createBuffer(createBufferId(), "aaa\n");
    const newBuffer = createBuffer(createBufferId(), "aaa\n");

    let updateCount = 0;
    controller = createDiffController(oldBuffer, newBuffer, { debounceMs: 50 });
    controller.onUpdate(() => {
      updateCount++;
    });

    // Multiple rapid edits
    editBuffer(newBuffer, 0, 0, 0, 1, "X");
    controller.notifyChange();
    editBuffer(newBuffer, 0, 1, 0, 2, "Y");
    controller.notifyChange();
    editBuffer(newBuffer, 0, 2, 0, 3, "Z");
    controller.notifyChange();

    // Wait for debounce
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Should have only updated once
    expect(updateCount).toBe(1);
  });
});

describe("onUpdate subscription", () => {
  let controller: ReturnType<typeof createDiffController>;

  afterEach(() => {
    controller?.dispose();
  });

  test("subscribers notified after re-diff", () => {
    const oldBuffer = createBuffer(createBufferId(), "a\n");
    const newBuffer = createBuffer(createBufferId(), "b\n");

    controller = createDiffController(oldBuffer, newBuffer);

    let notified = false;
    // biome-ignore lint/plugin/no-unknown-type: expect: test verification only cares that decorations are defined
    let receivedDecorations: unknown;
    controller.onUpdate((decorations) => {
      notified = true;
      receivedDecorations = decorations;
    });

    // Edit and re-diff
    editBuffer(newBuffer, 0, 0, 0, 1, "a");
    controller.reDiff();

    expect(notified).toBe(true);
    expect(receivedDecorations).toBeDefined();
  });

  test("unsubscribe stops notifications", () => {
    const oldBuffer = createBuffer(createBufferId(), "a\n");
    const newBuffer = createBuffer(createBufferId(), "a\n");

    controller = createDiffController(oldBuffer, newBuffer);

    let notifyCount = 0;
    const unsubscribe = controller.onUpdate(() => {
      notifyCount++;
    });

    controller.reDiff();
    expect(notifyCount).toBe(1);

    unsubscribe();

    controller.reDiff();
    expect(notifyCount).toBe(1); // No additional notification
  });
});

describe("dispose", () => {
  test("cancels pending debounced re-diff", async () => {
    const oldBuffer = createBuffer(createBufferId(), "a\n");
    const newBuffer = createBuffer(createBufferId(), "a\n");

    const controller = createDiffController(oldBuffer, newBuffer, { debounceMs: 50 });

    editBuffer(newBuffer, 0, 0, 0, 1, "X");
    controller.notifyChange();

    // Dispose before debounce fires
    controller.dispose();

    // Wait past debounce time
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Should still be equal (re-diff never ran)
    expect(controller.isEqual).toBe(true);
  });
});

describe("Editor backspace in diff view", () => {
  test("backspace at start of insert line merges with previous equal line", async () => {
    // Scenario: old has "A\nC\n", new has "A\nB\nC\n" (B inserted between A and C)
    const oldBuffer = createBuffer(createBufferId(), "A\nC\n");
    const newBuffer = createBuffer(createBufferId(), "A\nB\nC\n");

    // Use context=1 to include adjacent equal lines
    const controller = createDiffController(oldBuffer, newBuffer, { context: 1 });
    const mb = controller.multiBuffer;

    // Diff result (with context=0):
    // Row 0: equal "A" (new row 0)
    // Row 1: insert "B" (new row 1)
    // Row 2: equal "C" (new row 2)
    expect(mb.lineCount).toBe(3);
    expect(controller.isEqual).toBe(false);

    // Verify the structure
    const snap = mb.snapshot();
    // biome-ignore lint/plugin/no-type-assertion: expect: branded type for test
    const lines = snap.lines(0 as import("../../src/multibuffer/types.ts").MultiBufferRow, 3 as import("../../src/multibuffer/types.ts").MultiBufferRow);
    expect(lines).toEqual(["A", "B", "C"]);

    // Now simulate backspace at start of row 1 (the insert line "B")
    // This should delete the newline at end of row 0, merging "A" and "B" into "AB"
    const { Editor } = await import("../../src/editor/editor.ts");
    const editor = new Editor(mb);

    // Position cursor at start of row 1 (the insert line)
    // biome-ignore lint/plugin/no-type-assertion: expect: branded type for test
    editor.setCursor({ row: 1 as import("../../src/multibuffer/types.ts").MultiBufferRow, column: 0 });

    // Dispatch backspace
    editor.dispatch({ type: "deleteBackward", granularity: "character" });

    // The edit should have been applied - newBuffer should now be "AB\nC\n"
    expect(newBuffer.snapshot().text()).toBe("AB\nC\n");
  });
});
