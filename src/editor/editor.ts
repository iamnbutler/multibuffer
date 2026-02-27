/**
 * Editor: the command dispatcher that ties cursor, selection, and editing together.
 * Receives EditorCommands and updates the multibuffer + cursor/selection state.
 */

import { resolveAnchorRange } from "../multibuffer/anchor.ts";
import type {
  MultiBuffer,
  MultiBufferPoint,
  MultiBufferRow,
  MultiBufferSnapshot,
  Selection,
} from "../multibuffer/types.ts";
import { moveCursor } from "./cursor.ts";
import {
  collapseSelection,
  extendSelection,
  isCollapsed,
  selectAll,
  selectionAtPoint,
} from "./selection.ts";
import type { EditorCommand } from "./types.ts";

export class Editor {
  readonly multiBuffer: MultiBuffer;
  private _cursor: MultiBufferPoint;
  private _selection: Selection | undefined;
  private _onChange: (() => void) | null = null;

  constructor(multiBuffer: MultiBuffer) {
    this.multiBuffer = multiBuffer;
    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
    this._cursor = { row: 0 as MultiBufferRow, column: 0 };
    this._selection = selectionAtPoint(multiBuffer, this._cursor);
  }

  get cursor(): MultiBufferPoint {
    if (this._selection) {
      const snap = this.multiBuffer.snapshot();
      const head =
        this._selection.head === "end"
          ? this._selection.range.end
          : this._selection.range.start;
      const resolved = snap.resolveAnchor(head);
      if (resolved) return resolved;
    }
    return this._cursor;
  }

  get selection(): Selection | undefined {
    return this._selection;
  }

  /** Set a callback to be notified after any state change. */
  onChange(cb: () => void): void {
    this._onChange = cb;
  }

  /** Execute a command. */
  dispatch(command: EditorCommand): void {
    const snap = this.multiBuffer.snapshot();

    switch (command.type) {
      case "insertText":
        this._insertText(snap, command.text);
        break;
      case "insertNewline":
        this._insertText(snap, "\n");
        break;
      case "insertTab":
        this._insertText(snap, "  ");
        break;
      case "deleteBackward":
        this._deleteBackward(snap, command.granularity);
        break;
      case "deleteForward":
        this._deleteForward(snap, command.granularity);
        break;
      case "moveCursor":
        this._moveCursor(snap, command.direction, command.granularity);
        break;
      case "extendSelection":
        this._extendSelection(snap, command.direction, command.granularity);
        break;
      case "selectAll":
        this._selectAll(snap);
        break;
      case "collapseSelection":
        this._collapseSelection(snap, command.to);
        break;
      case "undo":
      case "redo":
      case "copy":
      case "cut":
      case "paste":
        // TODO: implement
        break;
    }

    this._onChange?.();
  }

  private _insertText(snap: MultiBufferSnapshot, text: string): void {
    if (this._selection && !isCollapsed(snap, this._selection)) {
      // Replace selection with text
      const range = resolveAnchorRange(snap, this._selection.range);
      if (range) {
        this.multiBuffer.edit(range.start, range.end, text);
        // Place cursor at end of inserted text
        const newSnap = this.multiBuffer.snapshot();
        // Estimate new cursor position: start + text length
        const newCursor = this._advancePoint(range.start, text, newSnap);
        this._cursor = newCursor;
        this._selection = selectionAtPoint(this.multiBuffer, newCursor);
        return;
      }
    }

    // Insert at cursor
    const cursor = this.cursor;
    this.multiBuffer.edit(cursor, cursor, text);
    const newSnap = this.multiBuffer.snapshot();
    const newCursor = this._advancePoint(cursor, text, newSnap);
    this._cursor = newCursor;
    this._selection = selectionAtPoint(this.multiBuffer, newCursor);
  }

  private _deleteBackward(snap: MultiBufferSnapshot, granularity: import("./types.ts").Granularity): void {
    if (this._selection && !isCollapsed(snap, this._selection)) {
      // Delete selection
      const range = resolveAnchorRange(snap, this._selection.range);
      if (range) {
        this.multiBuffer.edit(range.start, range.end, "");
        this._cursor = range.start;
        this._selection = selectionAtPoint(this.multiBuffer, range.start);
      }
      return;
    }

    // Delete backward from cursor
    const cursor = this.cursor;
    const deleteGranularity = granularity === "word" ? "word" : "character" as const;
    const target = moveCursor(snap, cursor, "left", deleteGranularity);
    if (target.row !== cursor.row || target.column !== cursor.column) {
      this.multiBuffer.edit(target, cursor, "");
      this._cursor = target;
      this._selection = selectionAtPoint(this.multiBuffer, target);
    }
  }

  private _deleteForward(snap: MultiBufferSnapshot, granularity: import("./types.ts").Granularity): void {
    if (this._selection && !isCollapsed(snap, this._selection)) {
      const range = resolveAnchorRange(snap, this._selection.range);
      if (range) {
        this.multiBuffer.edit(range.start, range.end, "");
        this._cursor = range.start;
        this._selection = selectionAtPoint(this.multiBuffer, range.start);
      }
      return;
    }

    const cursor = this.cursor;
    const fwdGranularity = granularity === "word" ? "word" : "character" as const;
    const target = moveCursor(snap, cursor, "right", fwdGranularity);
    if (target.row !== cursor.row || target.column !== cursor.column) {
      this.multiBuffer.edit(cursor, target, "");
      // Cursor stays in place
      this._selection = selectionAtPoint(this.multiBuffer, cursor);
    }
  }

  private _moveCursor(
    snap: MultiBufferSnapshot,
    direction: "left" | "right" | "up" | "down",
    granularity: import("./types.ts").Granularity,
  ): void {
    // If there's a non-collapsed selection and we're moving without shift,
    // collapse to the appropriate end first
    if (this._selection && !isCollapsed(snap, this._selection)) {
      if (direction === "left" || direction === "up") {
        const start = snap.resolveAnchor(this._selection.range.start);
        if (start) {
          this._cursor = start;
          this._selection = selectionAtPoint(this.multiBuffer, start);
          return;
        }
      } else {
        const end = snap.resolveAnchor(this._selection.range.end);
        if (end) {
          this._cursor = end;
          this._selection = selectionAtPoint(this.multiBuffer, end);
          return;
        }
      }
    }

    const cursor = this.cursor;
    const newCursor = moveCursor(snap, cursor, direction, granularity);
    this._cursor = newCursor;
    this._selection = selectionAtPoint(this.multiBuffer, newCursor);
  }

  private _extendSelection(
    snap: MultiBufferSnapshot,
    direction: "left" | "right" | "up" | "down",
    granularity: import("./types.ts").Granularity,
  ): void {
    if (!this._selection) return;
    const extended = extendSelection(
      snap,
      this.multiBuffer,
      this._selection,
      direction,
      granularity,
    );
    if (extended) {
      this._selection = extended;
    }
  }

  private _selectAll(snap: MultiBufferSnapshot): void {
    const sel = selectAll(snap, this.multiBuffer);
    if (sel) {
      this._selection = sel;
    }
  }

  private _collapseSelection(snap: MultiBufferSnapshot, to: "start" | "end"): void {
    if (!this._selection) return;
    const collapsed = collapseSelection(snap, this.multiBuffer, this._selection, to);
    if (collapsed) {
      this._selection = collapsed;
      const anchor =
        to === "start" ? collapsed.range.start : collapsed.range.end;
      const point = snap.resolveAnchor(anchor);
      if (point) this._cursor = point;
    }
  }

  /**
   * Compute where the cursor should be after inserting text at a point.
   */
  private _advancePoint(
    start: MultiBufferPoint,
    text: string,
    _snap: MultiBufferSnapshot,
  ): MultiBufferPoint {
    if (text.length === 0) return start;

    const lines = text.split("\n");
    if (lines.length === 1) {
      // Same row, column advances
      return { row: start.row, column: start.column + text.length };
    }
    // Multi-line: row advances, column is length of last line
    // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic
    const newRow = (start.row + lines.length - 1) as MultiBufferRow;
    const lastLine = lines[lines.length - 1] ?? "";
    return { row: newRow, column: lastLine.length };
  }
}
