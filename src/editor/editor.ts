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
  ExcerptInfo,
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

/** A single atomic edit within one excerpt/buffer. */
interface EditOp {
  readonly editStart: MultiBufferPoint;
  readonly removedText: string;
  readonly insertedText: string;
}

/**
 * A history entry for undo/redo. Contains one or more edit operations
 * stored in application order. Cross-excerpt edits produce multiple ops
 * (applied bottom-to-top so higher excerpts' rows aren't shifted).
 */
interface HistoryEntry {
  readonly edits: ReadonlyArray<EditOp>;
  readonly cursorBefore: MultiBufferPoint;
  readonly selectionBefore: Selection | undefined;
}

export class Editor {
  readonly multiBuffer: MultiBuffer;
  private _cursor: MultiBufferPoint;
  private _selection: Selection | undefined;
  private _onChange: (() => void) | null = null;
  private _undoStack: HistoryEntry[] = [];
  private _redoStack: HistoryEntry[] = [];
  private static readonly _MAX_HISTORY = 100;
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
    const clipped = snap.clipPoint(point, Bias.Left);

    // The anchor end is the non-head end of the current selection
    const anchorEnd =
      this._selection.head === "end"
        ? this._selection.range.start
        : this._selection.range.end;
    const anchorPoint = snap.resolveAnchor(anchorEnd);
    if (!anchorPoint) return;

    const newHeadAnchor = this.multiBuffer.createAnchor(clipped, Bias.Right);
    if (!newHeadAnchor) return;

    // Determine ordering
    if (
      clipped.row < anchorPoint.row ||
      (clipped.row === anchorPoint.row && clipped.column <= anchorPoint.column)
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
    this._cursor = clipped;
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

    // Find word boundaries (Unicode-aware: handles CJK, Cyrillic, emoji, etc.)
    let wordStart = col;
    let wordEnd = col;

    /** Character at UTF-16 position pos, decoded as a full Unicode code point. */
    const charAt = (pos: number) =>
      String.fromCodePoint(lineText.codePointAt(pos) ?? 0);
    /** Number of UTF-16 code units occupied by the code point at pos (1 or 2). */
    const stride = (pos: number) =>
      (lineText.codePointAt(pos) ?? 0) > 0xffff ? 2 : 1;
    /**
     * UTF-16 offset at which the code point immediately before pos begins.
     * Returns pos-2 when pos-1 is a low surrogate and pos-2 is a high surrogate;
     * otherwise returns pos-1.
     */
    const prevStart = (pos: number) => {
      const lo = lineText.charCodeAt(pos - 1);
      if (lo >= 0xdc00 && lo <= 0xdfff && pos >= 2) {
        const hi = lineText.charCodeAt(pos - 2);
        if (hi >= 0xd800 && hi <= 0xdbff) return pos - 2;
      }
      return pos - 1;
    };

    if (col < lineText.length && isWordChar(charAt(col))) {
      // On a word character — expand to word boundaries
      while (wordStart > 0 && isWordChar(charAt(prevStart(wordStart))))
        wordStart = prevStart(wordStart);
      while (wordEnd < lineText.length && isWordChar(charAt(wordEnd)))
        wordEnd += stride(wordEnd);
    } else {
      // On non-word (whitespace/punctuation) — expand to non-word boundaries
      while (wordStart > 0 && !isWordChar(charAt(prevStart(wordStart))))
        wordStart = prevStart(wordStart);
      while (wordEnd < lineText.length && !isWordChar(charAt(wordEnd)))
        wordEnd += stride(wordEnd);
      // If we backed into word chars, reset start
      if (wordStart < col && isWordChar(charAt(wordStart))) {
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

  /**
   * Return the text content of the current selection, or "" if the
   * selection is collapsed or absent.  Callers use this to populate
   * the platform clipboard before dispatching `copy`.
   */
  getSelectedText(): string {
    if (!this._selection) return "";
    const snap = this.multiBuffer.snapshot();
    if (isCollapsed(snap, this._selection)) return "";
    const resolved = resolveAnchorRange(snap, this._selection.range);
    if (!resolved) return "";

    const { start, end } = resolved;
    // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic for row range
    const lines = snap.lines(start.row, (end.row + 1) as MultiBufferRow);
    if (lines.length === 0) return "";
    if (start.row === end.row) {
      return (lines[0] ?? "").slice(start.column, end.column);
    }
    const firstLine = (lines[0] ?? "").slice(start.column);
    const lastLine = (lines[lines.length - 1] ?? "").slice(0, end.column);
    const middleLines = lines.slice(1, -1);
    return [firstLine, ...middleLines, lastLine].join("\n");
  }

  /**
   * Return the text that `cut` will remove. If there's a selection,
   * returns the selected text. Otherwise returns the full current line
   * (including its trailing newline when present).
   */
  getCutText(): string {
    const snap = this.multiBuffer.snapshot();
    if (this._selection && !isCollapsed(snap, this._selection)) {
      return this.getSelectedText();
    }
    // No selection — cut targets the entire line
    const cursor = this.cursor;
    const row = cursor.row;
    // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic for row range
    const lineText = snap.lines(row, (row + 1) as MultiBufferRow)[0] ?? "";
    // Include the trailing newline if this isn't the last line
    if (row + 1 < snap.lineCount) {
      return `${lineText}\n`;
    }
    return lineText;
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
        // If there's a non-collapsed selection, indent the selected lines
        if (this._selection && !isCollapsed(snap, this._selection)) {
          this._indentLines(snap);
        } else {
          this._insertText(snap, "  ");
        }
        break;
      case "indentLines":
        this._indentLines(snap);
        break;
      case "dedentLines":
        this._dedentLines(snap);
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
      case "moveLine":
        this._moveLine(snap, command.direction);
        break;
      case "duplicateLine":
        this._duplicateLine(snap, command.direction);
        break;
      case "insertLineBelow":
        this._insertLineBelow(snap);
        break;
      case "insertLineAbove":
        this._insertLineAbove(snap);
        break;
      case "copy":
        // No-op in the core — callers read the selection via getSelectedText()
        // and write to the platform clipboard themselves.
        break;
      case "cut":
        this._cut(snap);
        break;
      case "paste":
        this._insertText(snap, command.text);
        break;
      case "undo": {
        const entry = this._undoStack.pop();
        if (entry) {
          this._redoStack.push(this._applyInverse(entry));
        }
        break;
      }
      case "redo": {
        const entry = this._redoStack.pop();
        if (entry) {
          this._undoStack.push(this._applyInverse(entry));
        }
        break;
      }
    }

    this._onChange?.();
  }

  private _insertText(snap: MultiBufferSnapshot, text: string): void {
    this._goalColumn = undefined;

    // Auto-indent: when inserting a newline, match the current line's indentation
    let insertText = text;
    if (text === "\n") {
      const cursor = this.cursor;
      // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic for row range
      const lineText = snap.lines(cursor.row, (cursor.row + 1) as MultiBufferRow)[0] ?? "";
      const match = lineText.match(/^( +)/);
      if (match?.[1]) {
        insertText = `\n${match[1]}`;
      }
    }

    if (this._selection && !isCollapsed(snap, this._selection)) {
      // Replace selection with text
      const range = resolveAnchorRange(snap, this._selection.range);
      if (range) {
        this._edit(snap, range.start, range.end, insertText);
        const newSnap = this.multiBuffer.snapshot();
        const newCursor = this._advancePoint(range.start, insertText, newSnap);
        this._cursor = newCursor;
        this._selection = selectionAtPoint(this.multiBuffer, newCursor);
        return;
      }
    }

    // Insert at cursor
    const cursor = this.cursor;
    this._edit(snap, cursor, cursor, insertText);
    const newSnap = this.multiBuffer.snapshot();
    const newCursor = this._advancePoint(cursor, insertText, newSnap);
    this._cursor = newCursor;
    this._selection = selectionAtPoint(this.multiBuffer, newCursor);
  }

  private _deleteBackward(snap: MultiBufferSnapshot, granularity: import("./types.ts").Granularity): void {
    this._goalColumn = undefined;
    if (this._selection && !isCollapsed(snap, this._selection)) {
      const range = resolveAnchorRange(snap, this._selection.range);
      if (range) {
        this._edit(snap, range.start, range.end, "");
        this._cursor = range.start;
        this._selection = selectionAtPoint(this.multiBuffer, range.start);
      }
      return;
    }

    const cursor = this.cursor;
    const target = moveCursor(snap, cursor, "left", granularity);
    if (target.row !== cursor.row || target.column !== cursor.column) {
      this._edit(snap, target, cursor, "");
      this._cursor = target;
      this._selection = selectionAtPoint(this.multiBuffer, target);
    }
  }

  private _deleteForward(snap: MultiBufferSnapshot, granularity: import("./types.ts").Granularity): void {
    this._goalColumn = undefined;
    if (this._selection && !isCollapsed(snap, this._selection)) {
      const range = resolveAnchorRange(snap, this._selection.range);
      if (range) {
        this._edit(snap, range.start, range.end, "");
        this._cursor = range.start;
        this._selection = selectionAtPoint(this.multiBuffer, range.start);
      }
      return;
    }

    const cursor = this.cursor;
    const target = moveCursor(snap, cursor, "right", granularity);
    if (target.row !== cursor.row || target.column !== cursor.column) {
      this._edit(snap, cursor, target, "");
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

    this._edit(snap, deleteStart, deleteEnd, "");
    const newCursor: MultiBufferPoint = { row: newCursorRow, column: 0 };
    this._cursor = newCursor;
    this._selection = selectionAtPoint(this.multiBuffer, newCursor);
  }

  private _moveLine(snap: MultiBufferSnapshot, direction: "up" | "down"): void {
    this._goalColumn = undefined;
    const cursor = this.cursor;
    const row = cursor.row;
    const lineCount = snap.lineCount;

    if (direction === "up" && row === 0) return;
    // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic
    const lastRow = (lineCount - 1) as MultiBufferRow;
    if (direction === "down" && row >= lastRow) return;

    // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic
    const nextRowEnd = (row + 1) as MultiBufferRow;
    const currentLineText = snap.lines(row, nextRowEnd)[0] ?? "";

    if (direction === "down") {
      // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic
      const belowRow = (row + 1) as MultiBufferRow;
      // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic
      const belowRowEnd = (belowRow + 1) as MultiBufferRow;
      const belowLineText = snap.lines(belowRow, belowRowEnd)[0] ?? "";

      const editStart: MultiBufferPoint = { row, column: 0 };
      const editEnd: MultiBufferPoint = { row: belowRow, column: belowLineText.length };
      this._edit(snap, editStart, editEnd, `${belowLineText}\n${currentLineText}`);

      const newCursor: MultiBufferPoint = { row: belowRow, column: cursor.column };
      this._cursor = newCursor;
      this._selection = selectionAtPoint(this.multiBuffer, newCursor);
    } else {
      // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic
      const aboveRow = (row - 1) as MultiBufferRow;
      const aboveLineText = snap.lines(aboveRow, row)[0] ?? "";

      const editStart: MultiBufferPoint = { row: aboveRow, column: 0 };
      const editEnd: MultiBufferPoint = { row, column: currentLineText.length };
      this._edit(snap, editStart, editEnd, `${currentLineText}\n${aboveLineText}`);

      const newCursor: MultiBufferPoint = { row: aboveRow, column: cursor.column };
      this._cursor = newCursor;
      this._selection = selectionAtPoint(this.multiBuffer, newCursor);
    }
  }

  private _duplicateLine(snap: MultiBufferSnapshot, direction: "up" | "down"): void {
    this._goalColumn = undefined;
    const cursor = this.cursor;
    const row = cursor.row;

    // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic
    const nextRowEnd = (row + 1) as MultiBufferRow;
    const currentLineText = snap.lines(row, nextRowEnd)[0] ?? "";

    if (direction === "down") {
      const insertPoint: MultiBufferPoint = { row, column: currentLineText.length };
      this._edit(snap, insertPoint, insertPoint, `\n${currentLineText}`);

      // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic
      const newCursor: MultiBufferPoint = { row: (row + 1) as MultiBufferRow, column: cursor.column };
      this._cursor = newCursor;
      this._selection = selectionAtPoint(this.multiBuffer, newCursor);
    } else {
      const insertPoint: MultiBufferPoint = { row, column: 0 };
      this._edit(snap, insertPoint, insertPoint, `${currentLineText}\n`);

      this._cursor = { row, column: cursor.column };
      this._selection = selectionAtPoint(this.multiBuffer, this._cursor);
    }
  }

  private _insertLineBelow(snap: MultiBufferSnapshot): void {
    this._goalColumn = undefined;
    const cursor = this.cursor;
    const row = cursor.row;

    // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic
    const nextRowEnd = (row + 1) as MultiBufferRow;
    const currentLineText = snap.lines(row, nextRowEnd)[0] ?? "";

    const insertPoint: MultiBufferPoint = { row, column: currentLineText.length };
    this._edit(snap, insertPoint, insertPoint, "\n");

    // Move cursor to the new empty line
    // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic
    const newCursor: MultiBufferPoint = { row: (row + 1) as MultiBufferRow, column: 0 };
    this._cursor = newCursor;
    this._selection = selectionAtPoint(this.multiBuffer, newCursor);
  }

  private _insertLineAbove(_snap: MultiBufferSnapshot): void {
    this._goalColumn = undefined;
    const cursor = this.cursor;
    const row = cursor.row;

    const insertPoint: MultiBufferPoint = { row, column: 0 };
    this._edit(_snap, insertPoint, insertPoint, "\n");

    // Cursor moves to the new blank line (at the original row position)
    const newCursor: MultiBufferPoint = { row, column: 0 };
    this._cursor = newCursor;
    this._selection = selectionAtPoint(this.multiBuffer, newCursor);
  }

  /**
   * Indent all lines touched by the current selection (or just the cursor line)
   * by prepending 2 spaces to each. Uses a single _edit() for atomic undo.
   */
  private _indentLines(snap: MultiBufferSnapshot): void {
    this._goalColumn = undefined;
    const { startRow, endRow } = this._affectedRows(snap);

    // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic for row range
    const lines = snap.lines(startRow, (endRow + 1) as MultiBufferRow);
    const indented = lines.map((line) => `  ${line}`);

    const rangeStart: MultiBufferPoint = { row: startRow, column: 0 };
    const lastLineLen = lines[lines.length - 1]?.length ?? 0;
    const rangeEnd: MultiBufferPoint = { row: endRow, column: lastLineLen };

    this._edit(snap, rangeStart, rangeEnd, indented.join("\n"));

    // Place cursor at its shifted position
    const cursor = this.cursor;
    const newCursor: MultiBufferPoint = { row: cursor.row, column: cursor.column + 2 };
    const newSnap = this.multiBuffer.snapshot();
    this._cursor = newSnap.clipPoint(newCursor, Bias.Left);
    this._selection = selectionAtPoint(this.multiBuffer, this._cursor);
  }

  /**
   * Dedent all lines touched by the current selection (or just the cursor line)
   * by removing up to 2 leading spaces from each. Uses a single _edit() for atomic undo.
   */
  private _dedentLines(snap: MultiBufferSnapshot): void {
    this._goalColumn = undefined;
    const { startRow, endRow } = this._affectedRows(snap);

    // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic for row range
    const lines = snap.lines(startRow, (endRow + 1) as MultiBufferRow);

    const leadingSpaces = (line: string): number => {
      if (line.startsWith("  ")) return 2;
      if (line.startsWith(" ")) return 1;
      return 0;
    };

    // Check if any line actually has leading spaces to remove
    let anyChange = false;
    const dedented = lines.map((line) => {
      const spacesToRemove = leadingSpaces(line);
      if (spacesToRemove > 0) anyChange = true;
      return line.slice(spacesToRemove);
    });

    if (!anyChange) return;

    const rangeStart: MultiBufferPoint = { row: startRow, column: 0 };
    const lastLineLen = lines[lines.length - 1]?.length ?? 0;
    const rangeEnd: MultiBufferPoint = { row: endRow, column: lastLineLen };

    // Figure out how many spaces were removed from the cursor's line
    const cursor = this.cursor;
    const cursorLineIndex = cursor.row - startRow;
    const cursorLine = lines[cursorLineIndex] ?? "";
    const spacesRemovedOnCursorLine = leadingSpaces(cursorLine);

    this._edit(snap, rangeStart, rangeEnd, dedented.join("\n"));

    // Adjust cursor column
    const newCol = Math.max(0, cursor.column - spacesRemovedOnCursorLine);
    const newCursor: MultiBufferPoint = { row: cursor.row, column: newCol };
    const newSnap = this.multiBuffer.snapshot();
    this._cursor = newSnap.clipPoint(newCursor, Bias.Left);
    this._selection = selectionAtPoint(this.multiBuffer, this._cursor);
  }

  /**
   * Determine the range of rows affected by the current selection or cursor.
   * Returns inclusive start and end rows.
   */
  private _affectedRows(snap: MultiBufferSnapshot): {
    startRow: MultiBufferRow;
    endRow: MultiBufferRow;
  } {
    if (this._selection && !isCollapsed(snap, this._selection)) {
      const range = resolveAnchorRange(snap, this._selection.range);
      if (range) {
        return { startRow: range.start.row, endRow: range.end.row };
      }
    }
    const cursor = this.cursor;
    return { startRow: cursor.row, endRow: cursor.row };
  }

  private _cut(snap: MultiBufferSnapshot): void {
    if (this._selection && !isCollapsed(snap, this._selection)) {
      const range = resolveAnchorRange(snap, this._selection.range);
      if (range) {
        this._edit(snap, range.start, range.end, "");
        this._cursor = range.start;
        this._selection = selectionAtPoint(this.multiBuffer, range.start);
      }
      return;
    }
    // No selection — cut the entire line (same behavior as Cmd+X in VS Code)
    this._deleteLine(snap);
  }

  /** Extract the text content between two multibuffer points. */
  private _getTextInRange(
    snap: MultiBufferSnapshot,
    start: MultiBufferPoint,
    end: MultiBufferPoint,
  ): string {
    if (start.row === end.row && start.column === end.column) return "";
    // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic for row range
    const lines = snap.lines(start.row, (end.row + 1) as MultiBufferRow);
    if (lines.length === 0) return "";
    if (start.row === end.row) {
      return (lines[0] ?? "").slice(start.column, end.column);
    }
    const firstLine = (lines[0] ?? "").slice(start.column);
    const lastLine = (lines[lines.length - 1] ?? "").slice(0, end.column);
    const middleLines = lines.slice(1, -1);
    return [firstLine, ...middleLines, lastLine].join("\n");
  }

  /**
   * Record an edit to the undo stack and apply it.
   * Handles cross-excerpt ranges by splitting into per-excerpt edits
   * applied bottom-to-top so that row numbers for higher excerpts
   * aren't shifted during processing.
   */
  private _edit(
    snap: MultiBufferSnapshot,
    start: MultiBufferPoint,
    end: MultiBufferPoint,
    newText: string,
  ): void {
    const startBuf = snap.toBufferPoint(start);
    const endBuf = snap.toBufferPoint(end);

    // Same excerpt (or same point) — single edit
    if (
      !startBuf || !endBuf ||
      (start.row === end.row && start.column === end.column) ||
      startBuf.excerpt.id.index === endBuf.excerpt.id.index
    ) {
      const removedText = this._getTextInRange(snap, start, end);
      this._undoStack.push({
        edits: [{ editStart: start, removedText, insertedText: newText }],
        cursorBefore: this._cursor,
        selectionBefore: this._selection,
      });
      if (this._undoStack.length > Editor._MAX_HISTORY) {
        this._undoStack.shift();
      }
      this._redoStack = [];
      this.multiBuffer.edit(start, end, newText);
      return;
    }

    // Cross-excerpt: split into per-excerpt edits, applied bottom-to-top
    const subEdits = this._splitCrossExcerptRange(snap, start, end, startBuf.excerpt, endBuf.excerpt, newText);
    const editOps: EditOp[] = [];

    // Apply bottom-to-top (subEdits is already in that order)
    for (const sub of subEdits) {
      const currentSnap = this.multiBuffer.snapshot();
      const removedText = this._getTextInRange(currentSnap, sub.start, sub.end);
      editOps.push({
        editStart: sub.start,
        removedText,
        insertedText: sub.text,
      });
      this.multiBuffer.edit(sub.start, sub.end, sub.text);
    }

    this._undoStack.push({
      edits: editOps,
      cursorBefore: this._cursor,
      selectionBefore: this._selection,
    });
    if (this._undoStack.length > Editor._MAX_HISTORY) {
      this._undoStack.shift();
    }
    this._redoStack = [];
  }

  /**
   * Split a cross-excerpt range into per-excerpt sub-edits.
   * Returns edits in bottom-to-top order (end excerpt first).
   * Only the top-most (start) excerpt receives the replacement text;
   * all others just delete their portion.
   */
  private _splitCrossExcerptRange(
    snap: MultiBufferSnapshot,
    start: MultiBufferPoint,
    end: MultiBufferPoint,
    startExcerpt: ExcerptInfo,
    endExcerpt: ExcerptInfo,
    newText: string,
  ): Array<{ start: MultiBufferPoint; end: MultiBufferPoint; text: string }> {
    const result: Array<{ start: MultiBufferPoint; end: MultiBufferPoint; text: string }> = [];

    // Collect all excerpts between start and end (inclusive)
    const spanned: ExcerptInfo[] = [];
    for (const exc of snap.excerpts) {
      if (exc.startRow >= startExcerpt.startRow && exc.startRow <= endExcerpt.startRow) {
        spanned.push(exc);
      }
    }

    // Process in reverse order (bottom-to-top)
    for (let i = spanned.length - 1; i >= 0; i--) {
      const exc = spanned[i];
      if (!exc) continue;

      // Last content row of this excerpt (exclude trailing newline)
      // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic for excerpt row bounds
      const excContentEnd = (exc.endRow - (exc.hasTrailingNewline ? 2 : 1)) as MultiBufferRow;
      // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic for row range
      const lastLineText = snap.lines(excContentEnd, (excContentEnd + 1) as MultiBufferRow)[0] ?? "";

      let subStart: MultiBufferPoint;
      let subEnd: MultiBufferPoint;

      if (exc === startExcerpt && exc === endExcerpt) {
        // Shouldn't happen (same-excerpt case handled above), but be safe
        subStart = start;
        subEnd = end;
      } else if (exc === endExcerpt) {
        // End excerpt: from its first content row to the selection end
        subStart = { row: exc.startRow, column: 0 };
        subEnd = end;
      } else if (exc === startExcerpt) {
        // Start excerpt: from selection start to end of content
        subStart = start;
        subEnd = { row: excContentEnd, column: lastLineText.length };
      } else {
        // Middle excerpt: delete all content
        subStart = { row: exc.startRow, column: 0 };
        subEnd = { row: excContentEnd, column: lastLineText.length };
      }

      // Only the start excerpt (last in our reverse iteration) gets the replacement text
      const text = exc === startExcerpt ? newText : "";
      result.push({ start: subStart, end: subEnd, text });
    }

    return result;
  }

  /**
   * Apply the inverse of a history entry. Returns the inverse entry
   * so the caller can push it onto the opposite stack.
   * Processes edits in reverse order — each inverse restores the state
   * to exactly when that edit was originally applied.
   */
  private _applyInverse(entry: HistoryEntry): HistoryEntry {
    const inverseOps: EditOp[] = [];

    // Apply inversions in reverse of application order
    for (let i = entry.edits.length - 1; i >= 0; i--) {
      const edit = entry.edits[i];
      if (!edit) continue;
      const snap = this.multiBuffer.snapshot();
      const currentEnd = this._advancePoint(edit.editStart, edit.insertedText, snap);
      inverseOps.push({
        editStart: edit.editStart,
        removedText: edit.insertedText,
        insertedText: edit.removedText,
      });
      this.multiBuffer.edit(edit.editStart, currentEnd, edit.removedText);
    }

    const inverse: HistoryEntry = {
      edits: inverseOps,
      cursorBefore: this._cursor,
      selectionBefore: this._selection,
    };
    this._cursor = entry.cursorBefore;
    this._selection = entry.selectionBefore;
    return inverse;
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
