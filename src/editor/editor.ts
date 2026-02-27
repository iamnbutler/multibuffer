/**
 * Editor: the command dispatcher that ties cursor, selection, and editing together.
 * Receives EditorCommands and updates the multibuffer + cursor/selection state.
 */

import {
  createAnchorRange,
  createSelection,
  resolveAnchorRange,
} from "../multibuffer/anchor.ts";
import type {
  MultiBuffer,
  MultiBufferPoint,
  MultiBufferRow,
  MultiBufferSnapshot,
  Selection,
} from "../multibuffer/types.ts";
import { Bias } from "../multibuffer/types.ts";
import { isWordChar, moveCursor } from "./cursor.ts";
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
  /**
   * Remembered column for vertical navigation.
   * Set when vertical movement begins; cleared by horizontal movement or edits.
   * Allows the cursor to return to its original column after passing through
   * shorter lines (e.g. col 10 → col 3 on short line → col 10 on next long line).
   */
  private _goalColumn: number | undefined = undefined;

  constructor(multiBuffer: MultiBuffer) {
    this.multiBuffer = multiBuffer;
    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
    this._cursor = { row: 0 as MultiBufferRow, column: 0 };
    this._selection = selectionAtPoint(multiBuffer, this._cursor);
  }

  get cursor(): MultiBufferPoint {
    if (this._selection) {
      const snap = this.multiBuffer.snapshot();
      // For non-collapsed selections, resolve the head anchor to get
      // the accurate cursor position after edits may have moved it
      if (!isCollapsed(snap, this._selection)) {
        const head =
          this._selection.head === "end"
            ? this._selection.range.end
            : this._selection.range.start;
        const resolved = snap.resolveAnchor(head);
        if (resolved) return resolved;
      }
    }
    // For collapsed selections or no selection, use the directly-set cursor.
    // This avoids anchor resolution drift on non-anchored rows (e.g. trailing newlines).
    return this._cursor;
  }

  get selection(): Selection | undefined {
    return this._selection;
  }

  /** Set cursor to a specific point (e.g. from mouse click). */
  setCursor(point: MultiBufferPoint): void {
    this._goalColumn = undefined;
    const snap = this.multiBuffer.snapshot();
    const clipped = snap.clipPoint(point, Bias.Left);
    this._cursor = clipped;
    this._selection = selectionAtPoint(this.multiBuffer, clipped);
    this._onChange?.();
  }

  /** Extend selection from current anchor to a new point (for mouse drag). */
  extendSelectionTo(point: MultiBufferPoint): void {
    this._goalColumn = undefined;
    if (!this._selection) {
      this.setCursor(point);
      return;
    }

    const snap = this.multiBuffer.snapshot();

    // The anchor end is the non-head end of the current selection
    const anchorEnd =
      this._selection.head === "end"
        ? this._selection.range.start
        : this._selection.range.end;
    const anchorPoint = snap.resolveAnchor(anchorEnd);
    if (!anchorPoint) return;

    const newHeadAnchor = this.multiBuffer.createAnchor(point, Bias.Right);
    if (!newHeadAnchor) return;

    // Determine ordering
    if (
      point.row < anchorPoint.row ||
      (point.row === anchorPoint.row && point.column <= anchorPoint.column)
    ) {
      this._selection = createSelection(
        createAnchorRange(newHeadAnchor, anchorEnd),
        "start",
      );
    } else {
      this._selection = createSelection(
        createAnchorRange(anchorEnd, newHeadAnchor),
        "end",
      );
    }
    this._cursor = point;
    this._onChange?.();
  }

  /** Select the word at a point (for double-click). */
  selectWordAt(point: MultiBufferPoint): void {
    this._goalColumn = undefined;
    const snap = this.multiBuffer.snapshot();
    // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic
    const nextRow = Math.min(point.row + 1, snap.lineCount) as MultiBufferRow;
    const lineText = snap.lines(point.row, nextRow)[0] ?? "";
    const col = point.column;

    // Find word boundaries
    let wordStart = col;
    let wordEnd = col;

    if (col < lineText.length && isWordChar(lineText.charCodeAt(col))) {
      // On a word character — expand to word boundaries
      while (wordStart > 0 && isWordChar(lineText.charCodeAt(wordStart - 1)))
        wordStart--;
      while (wordEnd < lineText.length && isWordChar(lineText.charCodeAt(wordEnd)))
        wordEnd++;
    } else {
      // On non-word (whitespace/punctuation) — expand to non-word boundaries
      while (wordStart > 0 && !isWordChar(lineText.charCodeAt(wordStart - 1)))
        wordStart--;
      while (wordEnd < lineText.length && !isWordChar(lineText.charCodeAt(wordEnd)))
        wordEnd++;
      // If we backed into word chars, reset start
      if (wordStart < col && isWordChar(lineText.charCodeAt(wordStart))) {
        wordStart = col;
      }
    }

    const startPoint: MultiBufferPoint = { row: point.row, column: wordStart };
    const endPoint: MultiBufferPoint = { row: point.row, column: wordEnd };

    const startAnchor = this.multiBuffer.createAnchor(startPoint, Bias.Left);
    const endAnchor = this.multiBuffer.createAnchor(endPoint, Bias.Right);
    if (!startAnchor || !endAnchor) return;

    this._selection = createSelection(
      createAnchorRange(startAnchor, endAnchor),
      "end",
    );
    this._cursor = endPoint;
    this._onChange?.();
  }

  /** Select the entire line at a point (for triple-click). */
  selectLineAt(point: MultiBufferPoint): void {
    this._goalColumn = undefined;
    const snap = this.multiBuffer.snapshot();
    // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic
    const nextRow = Math.min(point.row + 1, snap.lineCount) as MultiBufferRow;
    const lineText = snap.lines(point.row, nextRow)[0] ?? "";

    const startPoint: MultiBufferPoint = { row: point.row, column: 0 };
    const endPoint: MultiBufferPoint = { row: point.row, column: lineText.length };

    const startAnchor = this.multiBuffer.createAnchor(startPoint, Bias.Left);
    const endAnchor = this.multiBuffer.createAnchor(endPoint, Bias.Right);
    if (!startAnchor || !endAnchor) return;

    this._selection = createSelection(
      createAnchorRange(startAnchor, endAnchor),
      "end",
    );
    this._cursor = endPoint;
    this._onChange?.();
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
      case "deleteLine":
        this._deleteLine(snap);
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
    this._goalColumn = undefined;
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
    this._goalColumn = undefined;
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
    const target = moveCursor(snap, cursor, "left", granularity);
    if (target.row !== cursor.row || target.column !== cursor.column) {
      this.multiBuffer.edit(target, cursor, "");
      this._cursor = target;
      this._selection = selectionAtPoint(this.multiBuffer, target);
    }
  }

  private _deleteForward(snap: MultiBufferSnapshot, granularity: import("./types.ts").Granularity): void {
    this._goalColumn = undefined;
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
    const target = moveCursor(snap, cursor, "right", granularity);
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
          this._goalColumn = undefined;
          this._cursor = start;
          this._selection = selectionAtPoint(this.multiBuffer, start);
          return;
        }
      } else {
        const end = snap.resolveAnchor(this._selection.range.end);
        if (end) {
          this._goalColumn = undefined;
          this._cursor = end;
          this._selection = selectionAtPoint(this.multiBuffer, end);
          return;
        }
      }
    }

    const cursor = this.cursor;
    let newCursor: MultiBufferPoint;

    if (direction === "up" || direction === "down") {
      // Save the goal column on the first vertical move, then use it to
      // maintain the intended column across lines of varying lengths.
      if (this._goalColumn === undefined) {
        this._goalColumn = cursor.column;
      }
      const effectiveCursor: MultiBufferPoint = { row: cursor.row, column: this._goalColumn ?? cursor.column };
      newCursor = moveCursor(snap, effectiveCursor, direction, granularity);
    } else {
      // Horizontal move — discard the goal column
      this._goalColumn = undefined;
      newCursor = moveCursor(snap, cursor, direction, granularity);
    }

    this._cursor = newCursor;
    this._selection = selectionAtPoint(this.multiBuffer, newCursor);
  }

  private _extendSelection(
    snap: MultiBufferSnapshot,
    direction: "left" | "right" | "up" | "down",
    granularity: import("./types.ts").Granularity,
  ): void {
    if (!this._selection) return;

    if (direction === "up" || direction === "down") {
      // Resolve the current head position
      const headAnchor =
        this._selection.head === "end"
          ? this._selection.range.end
          : this._selection.range.start;
      const headPoint = snap.resolveAnchor(headAnchor);
      if (!headPoint) return;

      // Save goal column on the first vertical extend
      if (this._goalColumn === undefined) {
        this._goalColumn = headPoint.column;
      }

      // Move the head using goal column as the intended column
      const effectiveHead: MultiBufferPoint = { row: headPoint.row, column: this._goalColumn ?? headPoint.column };
      const newHeadPoint = moveCursor(snap, effectiveHead, direction, granularity);
      const newHeadAnchor = this.multiBuffer.createAnchor(newHeadPoint, Bias.Right);
      if (!newHeadAnchor) return;

      // Keep the anchor end fixed and re-determine ordering
      const anchorEnd =
        this._selection.head === "end"
          ? this._selection.range.start
          : this._selection.range.end;
      const anchorPoint = snap.resolveAnchor(anchorEnd);
      if (!anchorPoint) return;

      if (
        newHeadPoint.row < anchorPoint.row ||
        (newHeadPoint.row === anchorPoint.row &&
          newHeadPoint.column <= anchorPoint.column)
      ) {
        this._selection = createSelection(
          createAnchorRange(newHeadAnchor, anchorEnd),
          "start",
        );
      } else {
        this._selection = createSelection(
          createAnchorRange(anchorEnd, newHeadAnchor),
          "end",
        );
      }
      this._cursor = newHeadPoint;
    } else {
      // Horizontal extend resets goal column
      this._goalColumn = undefined;
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
  }

  private _selectAll(snap: MultiBufferSnapshot): void {
    this._goalColumn = undefined;
    const sel = selectAll(snap, this.multiBuffer);
    if (sel) {
      this._selection = sel;
    }
  }

  private _collapseSelection(snap: MultiBufferSnapshot, to: "start" | "end"): void {
    this._goalColumn = undefined;
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

  private _deleteLine(snap: MultiBufferSnapshot): void {
    this._goalColumn = undefined;
    const cursor = this.cursor;
    const row = cursor.row;
    const lineCount = snap.lineCount;

    let deleteStart: MultiBufferPoint;
    let deleteEnd: MultiBufferPoint;
    let newCursorRow: MultiBufferRow;

    if (lineCount <= 1) {
      // Only line — delete everything
      // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
      const lastRow = Math.max(0, lineCount - 1) as MultiBufferRow;
      // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic
      const lastLineText = snap.lines(lastRow, lineCount as MultiBufferRow);
      const lastCol = lastLineText[0]?.length ?? 0;
      // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
      deleteStart = { row: 0 as MultiBufferRow, column: 0 };
      deleteEnd = { row: lastRow, column: lastCol };
      // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
      newCursorRow = 0 as MultiBufferRow;
    } else if (row + 1 < lineCount) {
      // Not the last line — delete from start of this line to start of next
      deleteStart = { row, column: 0 };
      // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic
      deleteEnd = { row: (row + 1) as MultiBufferRow, column: 0 };
      newCursorRow = row;
    } else {
      // Last line — delete from end of previous line (the newline) to end of this line
      // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic
      const prevRow = (row - 1) as MultiBufferRow;
      const prevLineText = snap.lines(prevRow, row);
      const prevLen = prevLineText[0]?.length ?? 0;
      // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic
      const thisLineText = snap.lines(row, lineCount as MultiBufferRow);
      const thisLen = thisLineText[0]?.length ?? 0;
      deleteStart = { row: prevRow, column: prevLen };
      deleteEnd = { row, column: thisLen };
      newCursorRow = prevRow;
    }

    this.multiBuffer.edit(deleteStart, deleteEnd, "");
    const newCursor: MultiBufferPoint = { row: newCursorRow, column: 0 };
    this._cursor = newCursor;
    this._selection = selectionAtPoint(this.multiBuffer, newCursor);
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
