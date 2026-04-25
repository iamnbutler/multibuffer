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
import { WrapMap } from "../renderer/wrap-map.ts";
import { type BracketMatch, findMatchingBracket } from "./bracket-match.ts";
import { isWordChar, moveCursor, moveCursorVisual, moveWordBoundary } from "./cursor.ts";
import {
  collapseSelection,
  isCollapsed,
  selectAll,
  selectionAtPoint,
} from "./selection.ts";
import type { Direction, EditorCommand, EditorEventMap, EditorOptions, Granularity } from "./types.ts";

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
  readonly selectionsBefore: readonly Selection[];
}

export class Editor {
  readonly multiBuffer: MultiBuffer;
  private _cursor: MultiBufferPoint;
  private _selections: Selection[] = [];
  // biome-ignore lint/suspicious/noExplicitAny: expect: event emitter internal storage uses any args for heterogeneous listener sets
  private _listeners: Map<keyof EditorEventMap, Set<(...args: any[]) => void>> = new Map();
  /** Incremented on every text mutation — used to detect textChange in dispatch(). */
  private _textVersion = 0;
  private _onCustomCommand: ((action: string) => void) | null = null;
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
  private _readOnly: boolean;
  private _bracketMatching: boolean;
  /**
   * Wrap width for visual line navigation. When > 0, vertical cursor
   * movement uses visual rows instead of buffer rows.
   */
  private _wrapWidth: number;
  /** Cached WrapMap for visual navigation; rebuilt when snapshot changes. */
  private _wrapMap: WrapMap | null = null;
  /** Snapshot version used to build the current _wrapMap (cache key). */
  private _wrapMapVersion = -1;

  constructor(multiBuffer: MultiBuffer, options?: EditorOptions) {
    this.multiBuffer = multiBuffer;
    this._readOnly = options?.readOnly ?? false;
    this._bracketMatching = options?.bracketMatching ?? false;
    this._wrapWidth = options?.wrapWidth ?? 0;
    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
    this._cursor = { row: 0 as MultiBufferRow, column: 0 };
    const initialSel = selectionAtPoint(multiBuffer, this._cursor);
    this._selections = initialSel ? [initialSel] : [];
  }

  /** Whether the editor is in read-only mode. */
  get readOnly(): boolean {
    return this._readOnly;
  }

  /** Toggle read-only mode at runtime. */
  setReadOnly(value: boolean): void {
    this._readOnly = value;
  }

  /** Current wrap width for visual line navigation. 0 = disabled. */
  get wrapWidth(): number {
    return this._wrapWidth;
  }

  /**
   * Set the wrap width for visual line navigation at runtime.
   * When > 0, vertical cursor movement uses visual rows instead of buffer rows.
   */
  setWrapWidth(value: number): void {
    if (this._wrapWidth !== value) {
      this._wrapWidth = value;
      this._wrapMap = null; // Invalidate cached WrapMap
      this._wrapMapVersion = -1;
    }
  }

  /**
   * Get the WrapMap for visual line navigation, rebuilding if necessary.
   * Returns null if wrapWidth is 0 (wrapping disabled).
   */
  private _getWrapMap(snap: MultiBufferSnapshot): WrapMap | null {
    if (this._wrapWidth <= 0) return null;
    // Rebuild if snapshot version changed
    if (this._wrapMap === null || this._wrapMapVersion !== snap.version) {
      this._wrapMap = new WrapMap(snap, this._wrapWidth);
      this._wrapMapVersion = snap.version;
    }
    return this._wrapMap;
  }

  /**
   * Returns the matching bracket pair for the character at the current cursor
   * position, or `null` if no bracket is at the cursor, no match is found, or
   * bracket matching is disabled (`bracketMatching: false` in EditorOptions).
   */
  get bracketMatch(): BracketMatch | null {
    if (!this._bracketMatching) return null;
    const snap = this.multiBuffer.snapshot();
    return findMatchingBracket(snap, this._cursor);
  }

  get cursor(): MultiBufferPoint {
    const primarySelection = this._selections[this._selections.length - 1];
    if (primarySelection) {
      // Fast path: selectionAtPoint() always uses the same anchor object for both
      // start and end (collapsed cursor). In that case _cursor is authoritative and
      // we can skip snapshot creation and anchor resolution entirely.
      if (primarySelection.range.start !== primarySelection.range.end) {
        const snap = this.multiBuffer.snapshot();
        // For non-collapsed selections, resolve the head anchor to get
        // the accurate cursor position after edits may have moved it
        if (!isCollapsed(snap, primarySelection)) {
          const head =
            primarySelection.head === "end"
              ? primarySelection.range.end
              : primarySelection.range.start;
          const resolved = snap.resolveAnchor(head);
          if (resolved) return resolved;
        }
      }
    }
    // For collapsed selections or no selection, use the directly-set cursor.
    // This avoids anchor resolution drift on non-anchored rows (e.g. trailing newlines).
    return this._cursor;
  }

  /**
   * The primary (most recently added) selection, or undefined if none.
   * For backward compatibility with single-selection code paths.
   */
  get selection(): Selection | undefined {
    return this._selections[this._selections.length - 1];
  }

  /**
   * All active selections. The last element is the "primary" selection
   * (most recently added). Empty array means no selections.
   */
  get selections(): readonly Selection[] {
    return this._selections;
  }

  /** Set cursor to a specific point (e.g. from mouse click). Clears multi-cursor. */
  setCursor(point: MultiBufferPoint): void {
    this._goalColumn = undefined;
    const snap = this.multiBuffer.snapshot();
    const clipped = snap.clipPoint(point, Bias.Left);
    const prevCursor = this._cursor;
    const prevSelections = this._selections;
    this._cursor = clipped;
    const newSel = selectionAtPoint(this.multiBuffer, clipped);
    this._selections = newSel ? [newSel] : [];
    if (!_pointsEqual(this._cursor, prevCursor)) {
      this._emit("cursorChange", this._cursor, prevCursor);
      this._emitBracketMatch(snap);
    }
    if (!_selectionsEqual(this._selections, prevSelections)) {
      this._emit("selectionChange", this._selections);
    }
    this._emit("change", { cursor: this._cursor, selections: this._selections });
  }

  /** Extend selection from current anchor to a new point (for mouse drag). */
  extendSelectionTo(point: MultiBufferPoint): void {
    this._goalColumn = undefined;
    const primarySelection = this._selections[this._selections.length - 1];
    if (!primarySelection) {
      this.setCursor(point);
      return;
    }

    const prevCursor = this._cursor;
    const prevSelections = this._selections;
    const snap = this.multiBuffer.snapshot();
    const clipped = snap.clipPoint(point, Bias.Left);

    // The anchor end is the non-head end of the current selection
    const anchorEnd =
      primarySelection.head === "end"
        ? primarySelection.range.start
        : primarySelection.range.end;
    const anchorPoint = snap.resolveAnchor(anchorEnd);
    if (!anchorPoint) return;

    const newHeadAnchor = this.multiBuffer.createAnchor(clipped, Bias.Right);
    if (!newHeadAnchor) return;

    // Determine ordering
    let newSelection: Selection;
    if (
      clipped.row < anchorPoint.row ||
      (clipped.row === anchorPoint.row && clipped.column <= anchorPoint.column)
    ) {
      newSelection = createSelection(
        createAnchorRange(newHeadAnchor, anchorEnd),
        "start",
      );
    } else {
      newSelection = createSelection(
        createAnchorRange(anchorEnd, newHeadAnchor),
        "end",
      );
    }
    // Replace primary selection, keep others
    this._selections = [...this._selections.slice(0, -1), newSelection];
    this._cursor = clipped;
    if (!_pointsEqual(this._cursor, prevCursor)) {
      this._emit("cursorChange", this._cursor, prevCursor);
      this._emitBracketMatch(snap);
    }
    if (!_selectionsEqual(this._selections, prevSelections)) {
      this._emit("selectionChange", this._selections);
    }
    this._emit("change", { cursor: this._cursor, selections: this._selections });
  }

  /** Select the word at a point (for double-click). Clears multi-cursor. */
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

    const prevCursor = this._cursor;
    const prevSelections = this._selections;
    const newSel = createSelection(
      createAnchorRange(startAnchor, endAnchor),
      "end",
    );
    this._selections = [newSel];
    this._cursor = endPoint;
    if (!_pointsEqual(this._cursor, prevCursor)) {
      this._emit("cursorChange", this._cursor, prevCursor);
      this._emitBracketMatch(snap);
    }
    if (!_selectionsEqual(this._selections, prevSelections)) {
      this._emit("selectionChange", this._selections);
    }
    this._emit("change", { cursor: this._cursor, selections: this._selections });
  }

  /** Select the entire line at a point (for triple-click). Clears multi-cursor. */
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

    const prevCursor = this._cursor;
    const prevSelections = this._selections;
    const newSel = createSelection(
      createAnchorRange(startAnchor, endAnchor),
      "end",
    );
    this._selections = [newSel];
    this._cursor = endPoint;
    if (!_pointsEqual(this._cursor, prevCursor)) {
      this._emit("cursorChange", this._cursor, prevCursor);
      this._emitBracketMatch(snap);
    }
    if (!_selectionsEqual(this._selections, prevSelections)) {
      this._emit("selectionChange", this._selections);
    }
    this._emit("change", { cursor: this._cursor, selections: this._selections });
  }

  /** Subscribe to a granular editor event. */
  on<K extends keyof EditorEventMap>(event: K, cb: (...args: EditorEventMap[K]) => void): void {
    let set = this._listeners.get(event);
    if (!set) {
      set = new Set();
      this._listeners.set(event, set);
    }
    set.add(cb);
  }

  /** Unsubscribe from a granular editor event. */
  off<K extends keyof EditorEventMap>(event: K, cb: (...args: EditorEventMap[K]) => void): void {
    this._listeners.get(event)?.delete(cb);
  }

  private _emit<K extends keyof EditorEventMap>(event: K, ...args: EditorEventMap[K]): void {
    const set = this._listeners.get(event);
    if (!set || set.size === 0) return;
    // biome-ignore lint/suspicious/noExplicitAny: expect: typed event dispatch requires spreading EditorEventMap[K] tuple
    // biome-ignore lint/plugin/no-type-assertion: expect: typed event dispatch requires cast to spread args
    for (const cb of set) (cb as (...a: any[]) => void)(...(args as any[]));
  }

  /**
   * Emit bracketMatch event if bracket matching is enabled.
   * Called when cursor or text changes since bracket match state may have changed.
   */
  private _emitBracketMatch(snap: MultiBufferSnapshot): void {
    if (!this._bracketMatching) return;
    const match = findMatchingBracket(snap, this._cursor);
    this._emit("bracketMatch", match);
  }

  /** Set a callback to be notified when a custom command is dispatched. Pass null to remove. */
  onCustomCommand(cb: ((action: string) => void) | null): void {
    this._onCustomCommand = cb;
  }

  /**
   * Return the text content of all selections, joined by newlines.
   * Returns "" if all selections are collapsed or no selections exist.
   * Callers use this to populate the platform clipboard before dispatching `copy`.
   */
  getSelectedText(): string {
    if (this._selections.length === 0) return "";
    const snap = this.multiBuffer.snapshot();
    const texts: string[] = [];

    for (const sel of this._selections) {
      if (isCollapsed(snap, sel)) continue;
      const resolved = resolveAnchorRange(snap, sel.range);
      if (!resolved) continue;

      const { start, end } = resolved;
      // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic for row range
      const lines = snap.lines(start.row, (end.row + 1) as MultiBufferRow);
      if (lines.length === 0) continue;
      if (start.row === end.row) {
        texts.push((lines[0] ?? "").slice(start.column, end.column));
      } else {
        const firstLine = (lines[0] ?? "").slice(start.column);
        const lastLine = (lines[lines.length - 1] ?? "").slice(0, end.column);
        const middleLines = lines.slice(1, -1);
        texts.push([firstLine, ...middleLines, lastLine].join("\n"));
      }
    }

    return texts.join("\n");
  }

  /**
   * Return the text that `cut` will remove. If there are non-collapsed selections,
   * returns their selected text joined by newlines. Otherwise returns the full
   * current line (including its trailing newline when present) for each cursor.
   */
  getCutText(): string {
    const snap = this.multiBuffer.snapshot();
    const hasNonCollapsedSelection = this._selections.some(
      (sel) => !isCollapsed(snap, sel),
    );
    if (hasNonCollapsedSelection) {
      return this.getSelectedText();
    }
    // No non-collapsed selections — cut targets entire lines for each cursor
    // Collect unique rows (multiple cursors on same row should cut once)
    const rows = new Set<number>();
    for (const sel of this._selections) {
      const resolved = resolveAnchorRange(snap, sel.range);
      if (resolved) {
        rows.add(resolved.start.row);
      }
    }
    const sortedRows = [...rows].sort((a, b) => a - b);
    const texts: string[] = [];
    for (const row of sortedRows) {
      // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic for row range
      const lineText = snap.lines(row as MultiBufferRow, (row + 1) as MultiBufferRow)[0] ?? "";
      if (row + 1 < snap.lineCount) {
        texts.push(`${lineText}\n`);
      } else {
        texts.push(lineText);
      }
    }
    return texts.join("");
  }

  /** Execute a command. */
  dispatch(command: EditorCommand): void {
    // Read-only mode: silently ignore all text-mutating commands.
    if (this._readOnly && _isEditCommand(command.type)) return;

    const snap = this.multiBuffer.snapshot();
    const prevCursor = this._cursor;
    const prevSelections = this._selections;
    const prevTextVersion = this._textVersion;

    switch (command.type) {
      case "insertText":
        this._insertText(snap, command.text);
        break;
      case "insertNewline":
        this._insertText(snap, "\n");
        break;
      case "insertTab":
        // If there's a non-collapsed selection, indent the selected lines
        if (this._selections.some((sel) => !isCollapsed(snap, sel))) {
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
      case "addCursor":
        this._addCursor(snap, command.at);
        break;
      case "addCursorAbove":
        this._addCursorsVertical(snap, "up");
        break;
      case "addCursorBelow":
        this._addCursorsVertical(snap, "down");
        break;
      case "clearExtraCursors":
        this._clearExtraCursors();
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
      case "custom":
        this._onCustomCommand?.(command.action);
        return; // no state change, no onChange notification
    }

    // Emit granular events based on what actually changed
    const textChanged = this._textVersion !== prevTextVersion;
    const newSnap = textChanged ? this.multiBuffer.snapshot() : snap;
    const cursorChanged = !_pointsEqual(this._cursor, prevCursor);
    const selectionChanged = !_selectionsEqual(this._selections, prevSelections);

    if (textChanged) this._emit("textChange", newSnap);
    if (cursorChanged) this._emit("cursorChange", this._cursor, prevCursor);
    if (selectionChanged) this._emit("selectionChange", this._selections);
    // Emit bracketMatch when cursor or text changes (bracket at cursor may have changed)
    if (textChanged || cursorChanged) this._emitBracketMatch(newSnap);
    if (textChanged || cursorChanged || selectionChanged) {
      this._emit("change", { cursor: this._cursor, selections: this._selections });
    }
  }

  private _insertText(snap: MultiBufferSnapshot, text: string): void {
    this._goalColumn = undefined;

    if (this._selections.length === 0) return;

    // For single selection, use the original path that maintains all existing behavior
    if (this._selections.length === 1) {
      const primarySel = this._selections[0];
      if (!primarySel) return;

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

      if (!isCollapsed(snap, primarySel)) {
        // Replace selection with text
        const range = resolveAnchorRange(snap, primarySel.range);
        if (range) {
          if (!this._edit(snap, range.start, range.end, insertText)) return;
          const newSnap = this.multiBuffer.snapshot();
          const newCursor = this._advancePoint(range.start, insertText, newSnap);
          this._cursor = newCursor;
          const newSel = selectionAtPoint(this.multiBuffer, newCursor);
          this._selections = newSel ? [newSel] : [];
          return;
        }
      }

      // Insert at cursor
      const cursor = this.cursor;
      if (!this._edit(snap, cursor, cursor, insertText)) return;
      const newSnap = this.multiBuffer.snapshot();
      const newCursor = this._advancePoint(cursor, insertText, newSnap);
      this._cursor = newCursor;
      const newSel = selectionAtPoint(this.multiBuffer, newCursor);
      this._selections = newSel ? [newSel] : [];
      return;
    }

    // Multi-selection path: apply edits bottom-to-top
    const resolved = this._resolveSelectionsBottomUp(snap);
    if (resolved.length === 0) return;

    const edits: EditOp[] = [];
    const newSelections: Selection[] = [];
    let currentSnap = snap;

    for (const { start, end } of resolved) {
      // Check editability
      const startBuf = currentSnap.toBufferPoint(start);
      if (startBuf && !startBuf.excerpt.editable) continue;

      let insertText = text;
      if (text === "\n") {
        // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic for row range
        const lineText = currentSnap.lines(start.row, (start.row + 1) as MultiBufferRow)[0] ?? "";
        const match = lineText.match(/^( +)/);
        if (match?.[1]) {
          insertText = `\n${match[1]}`;
        }
      }

      const removedText = this._getTextInRange(currentSnap, start, end);
      edits.push({ editStart: start, removedText, insertedText: insertText });

      this.multiBuffer.edit(start, end, insertText);
      currentSnap = this.multiBuffer.snapshot();

      const newCursor = this._advancePoint(start, insertText, currentSnap);
      const newSel = selectionAtPoint(this.multiBuffer, newCursor);
      if (newSel) {
        newSelections.unshift(newSel);
      }
    }

    if (edits.length > 0) {
      this._undoStack.push({
        edits,
        cursorBefore: this._cursor,
        selectionsBefore: this._selections,
      });
      if (this._undoStack.length > Editor._MAX_HISTORY) {
        this._undoStack.shift();
      }
      this._redoStack = [];
      this._textVersion++;
    }

    this._selections = this._mergeSelections(newSelections, currentSnap);
    const primarySel = this._selections[this._selections.length - 1];
    if (primarySel) {
      const headAnchor = primarySel.head === "end" ? primarySel.range.end : primarySel.range.start;
      const resolvedHead = currentSnap.resolveAnchor(headAnchor);
      if (resolvedHead) this._cursor = resolvedHead;
    }
  }

  private _deleteBackward(snap: MultiBufferSnapshot, granularity: Granularity): void {
    this._goalColumn = undefined;
    if (this._selections.length === 0) return;

    // For single selection, use the original path
    if (this._selections.length === 1) {
      const primarySel = this._selections[0];
      if (!primarySel) return;

      if (!isCollapsed(snap, primarySel)) {
        const range = resolveAnchorRange(snap, primarySel.range);
        if (range) {
          if (!this._edit(snap, range.start, range.end, "")) return;
          this._cursor = range.start;
          const newSel = selectionAtPoint(this.multiBuffer, range.start);
          this._selections = newSel ? [newSel] : [];
        }
        return;
      }

      const cursor = this.cursor;
      // Special case: deleteBackward("line") at column 0 should join with previous line
      if (granularity === "line" && cursor.column === 0 && cursor.row > 0) {
        const target = moveCursor(snap, cursor, "left", "character");
        if (target.row !== cursor.row || target.column !== cursor.column) {
          if (!this._edit(snap, target, cursor, "")) return;
          this._cursor = target;
          const newSel = selectionAtPoint(this.multiBuffer, target);
          this._selections = newSel ? [newSel] : [];
        }
        return;
      }
      const target =
        granularity === "word"
          ? moveWordBoundary(snap, cursor, "left")
          : moveCursor(snap, cursor, "left", granularity);
      if (target.row !== cursor.row || target.column !== cursor.column) {
        if (!this._edit(snap, target, cursor, "")) return;
        this._cursor = target;
        const newSel = selectionAtPoint(this.multiBuffer, target);
        this._selections = newSel ? [newSel] : [];
      }
      return;
    }

    // Multi-selection path
    const deleteRanges: Array<{ start: MultiBufferPoint; end: MultiBufferPoint; index: number }> = [];
    for (let i = 0; i < this._selections.length; i++) {
      const sel = this._selections[i];
      if (!sel) continue;
      if (!isCollapsed(snap, sel)) {
        const range = resolveAnchorRange(snap, sel.range);
        if (range) {
          deleteRanges.push({ start: range.start, end: range.end, index: i });
        }
      } else {
        const headAnchor = sel.head === "end" ? sel.range.end : sel.range.start;
        const cursor = snap.resolveAnchor(headAnchor);
        if (cursor) {
          // Line-join: deleteBackward("line") at column 0 should join with previous line
          if (granularity === "line" && cursor.column === 0 && cursor.row > 0) {
            const target = moveCursor(snap, cursor, "left", "character");
            if (target.row !== cursor.row || target.column !== cursor.column) {
              deleteRanges.push({ start: target, end: cursor, index: i });
            }
          } else {
            const target =
              granularity === "word"
                ? moveWordBoundary(snap, cursor, "left")
                : moveCursor(snap, cursor, "left", granularity);
            if (target.row !== cursor.row || target.column !== cursor.column) {
              deleteRanges.push({ start: target, end: cursor, index: i });
            }
          }
        }
      }
    }

    if (deleteRanges.length === 0) return;

    deleteRanges.sort((a, b) => {
      if (b.start.row !== a.start.row) return b.start.row - a.start.row;
      return b.start.column - a.start.column;
    });

    const edits: EditOp[] = [];
    const newSelections: Selection[] = [];
    let currentSnap = snap;

    for (const { start, end } of deleteRanges) {
      const startBuf = currentSnap.toBufferPoint(start);
      if (startBuf && !startBuf.excerpt.editable) continue;

      const removedText = this._getTextInRange(currentSnap, start, end);
      edits.push({ editStart: start, removedText, insertedText: "" });

      this.multiBuffer.edit(start, end, "");
      currentSnap = this.multiBuffer.snapshot();

      const newSel = selectionAtPoint(this.multiBuffer, start);
      if (newSel) {
        newSelections.unshift(newSel);
      }
    }

    if (edits.length > 0) {
      this._undoStack.push({
        edits,
        cursorBefore: this._cursor,
        selectionsBefore: this._selections,
      });
      if (this._undoStack.length > Editor._MAX_HISTORY) {
        this._undoStack.shift();
      }
      this._redoStack = [];
      this._textVersion++;
    }

    if (edits.length > 0) {
      this._selections = this._mergeSelections(newSelections, currentSnap);
      const primarySel = this._selections[this._selections.length - 1];
      if (primarySel) {
        const headAnchor = primarySel.head === "end" ? primarySel.range.end : primarySel.range.start;
        const resolved = currentSnap.resolveAnchor(headAnchor);
        if (resolved) this._cursor = resolved;
      }
    }
  }

  private _deleteForward(snap: MultiBufferSnapshot, granularity: Granularity): void {
    this._goalColumn = undefined;
    if (this._selections.length === 0) return;

    // For single selection, use the original path
    if (this._selections.length === 1) {
      const primarySel = this._selections[0];
      if (!primarySel) return;

      if (!isCollapsed(snap, primarySel)) {
        const range = resolveAnchorRange(snap, primarySel.range);
        if (range) {
          if (!this._edit(snap, range.start, range.end, "")) return;
          this._cursor = range.start;
          const newSel = selectionAtPoint(this.multiBuffer, range.start);
          this._selections = newSel ? [newSel] : [];
        }
        return;
      }

      const cursor = this.cursor;
      const target =
        granularity === "word"
          ? moveWordBoundary(snap, cursor, "right")
          : moveCursor(snap, cursor, "right", granularity);
      if (target.row !== cursor.row || target.column !== cursor.column) {
        if (!this._edit(snap, cursor, target, "")) return;
        const newSel = selectionAtPoint(this.multiBuffer, cursor);
        this._selections = newSel ? [newSel] : [];
      }
      return;
    }

    // Multi-selection path
    const deleteRanges: Array<{ start: MultiBufferPoint; end: MultiBufferPoint; index: number }> = [];
    for (let i = 0; i < this._selections.length; i++) {
      const sel = this._selections[i];
      if (!sel) continue;
      if (!isCollapsed(snap, sel)) {
        const range = resolveAnchorRange(snap, sel.range);
        if (range) {
          deleteRanges.push({ start: range.start, end: range.end, index: i });
        }
      } else {
        const headAnchor = sel.head === "end" ? sel.range.end : sel.range.start;
        const cursor = snap.resolveAnchor(headAnchor);
        if (cursor) {
          const target =
            granularity === "word"
              ? moveWordBoundary(snap, cursor, "right")
              : moveCursor(snap, cursor, "right", granularity);
          if (target.row !== cursor.row || target.column !== cursor.column) {
            deleteRanges.push({ start: cursor, end: target, index: i });
          }
        }
      }
    }

    if (deleteRanges.length === 0) return;

    deleteRanges.sort((a, b) => {
      if (b.start.row !== a.start.row) return b.start.row - a.start.row;
      return b.start.column - a.start.column;
    });

    const edits: EditOp[] = [];
    const newSelections: Selection[] = [];
    let currentSnap = snap;

    for (const { start, end } of deleteRanges) {
      const startBuf = currentSnap.toBufferPoint(start);
      if (startBuf && !startBuf.excerpt.editable) continue;

      const removedText = this._getTextInRange(currentSnap, start, end);
      edits.push({ editStart: start, removedText, insertedText: "" });

      this.multiBuffer.edit(start, end, "");
      currentSnap = this.multiBuffer.snapshot();

      const newSel = selectionAtPoint(this.multiBuffer, start);
      if (newSel) {
        newSelections.unshift(newSel);
      }
    }

    if (edits.length > 0) {
      this._undoStack.push({
        edits,
        cursorBefore: this._cursor,
        selectionsBefore: this._selections,
      });
      if (this._undoStack.length > Editor._MAX_HISTORY) {
        this._undoStack.shift();
      }
      this._redoStack = [];
      this._textVersion++;
    }

    this._selections = this._mergeSelections(newSelections, currentSnap);
    const primarySel = this._selections[this._selections.length - 1];
    if (primarySel) {
      const headAnchor = primarySel.head === "end" ? primarySel.range.end : primarySel.range.start;
      const resolved = currentSnap.resolveAnchor(headAnchor);
      if (resolved) this._cursor = resolved;
    }
  }

  private _moveCursor(
    snap: MultiBufferSnapshot,
    direction: Direction,
    granularity: Granularity,
  ): void {
    if (this._selections.length === 0) return;

    const newSelections: Selection[] = [];
    const wrapMap = this._getWrapMap(snap);

    for (const sel of this._selections) {
      // If there's a non-collapsed selection and we're moving without shift,
      // collapse to the appropriate end first
      if (!isCollapsed(snap, sel)) {
        if (direction === "left" || direction === "up") {
          const start = snap.resolveAnchor(sel.range.start);
          if (start) {
            const newSel = selectionAtPoint(this.multiBuffer, start);
            if (newSel) newSelections.push(newSel);
          }
        } else {
          const end = snap.resolveAnchor(sel.range.end);
          if (end) {
            const newSel = selectionAtPoint(this.multiBuffer, end);
            if (newSel) newSelections.push(newSel);
          }
        }
        continue;
      }

      const headAnchor = sel.head === "end" ? sel.range.end : sel.range.start;
      const cursor = snap.resolveAnchor(headAnchor);
      if (!cursor) continue;

      let newCursor: MultiBufferPoint;

      if (direction === "up" || direction === "down") {
        if (wrapMap && granularity === "character") {
          newCursor = moveCursorVisual(snap, cursor, direction, granularity, wrapMap);
        } else {
          // Use goal column or cursor column
          const goalCol = this._goalColumn ?? cursor.column;
          const effectiveCursor: MultiBufferPoint = { row: cursor.row, column: goalCol };
          newCursor = moveCursor(snap, effectiveCursor, direction, granularity);
        }
      } else {
        newCursor = moveCursor(snap, cursor, direction, granularity);
      }

      const newSel = selectionAtPoint(this.multiBuffer, newCursor);
      if (newSel) newSelections.push(newSel);
    }

    // Handle goal column
    if (direction === "up" || direction === "down") {
      if (this._goalColumn === undefined) {
        this._goalColumn = this._cursor.column;
      }
    } else {
      this._goalColumn = undefined;
    }

    // Merge overlapping selections
    this._selections = this._mergeSelections(newSelections, snap);

    // Update primary cursor
    const primarySel = this._selections[this._selections.length - 1];
    if (primarySel) {
      const headAnchor = primarySel.head === "end" ? primarySel.range.end : primarySel.range.start;
      const resolved = snap.resolveAnchor(headAnchor);
      if (resolved) this._cursor = resolved;
    }
  }

  private _extendSelection(
    snap: MultiBufferSnapshot,
    direction: Direction,
    granularity: Granularity,
  ): void {
    if (this._selections.length === 0) return;

    const wrapMap = this._getWrapMap(snap);
    const newSelections: Selection[] = [];

    // For vertical movement, set goal column from primary cursor if not set
    if ((direction === "up" || direction === "down") && this._goalColumn === undefined) {
      this._goalColumn = this._cursor.column;
    }

    for (const sel of this._selections) {
      const headAnchor = sel.head === "end" ? sel.range.end : sel.range.start;
      const headPoint = snap.resolveAnchor(headAnchor);
      if (!headPoint) continue;

      let newHeadPoint: MultiBufferPoint;

      if (direction === "up" || direction === "down") {
        if (wrapMap && granularity === "character") {
          newHeadPoint = moveCursorVisual(snap, headPoint, direction, granularity, wrapMap);
        } else {
          const goalCol = this._goalColumn ?? headPoint.column;
          const effectiveHead: MultiBufferPoint = { row: headPoint.row, column: goalCol };
          newHeadPoint = moveCursor(snap, effectiveHead, direction, granularity);
        }
      } else {
        newHeadPoint = moveCursor(snap, headPoint, direction, granularity);
      }

      const newHeadAnchor = this.multiBuffer.createAnchor(newHeadPoint, Bias.Right);
      if (!newHeadAnchor) continue;

      // Keep the anchor end fixed and re-determine ordering
      const anchorEnd = sel.head === "end" ? sel.range.start : sel.range.end;
      const anchorPoint = snap.resolveAnchor(anchorEnd);
      if (!anchorPoint) continue;

      let newSel: Selection;
      if (
        newHeadPoint.row < anchorPoint.row ||
        (newHeadPoint.row === anchorPoint.row && newHeadPoint.column <= anchorPoint.column)
      ) {
        newSel = createSelection(createAnchorRange(newHeadAnchor, anchorEnd), "start");
      } else {
        newSel = createSelection(createAnchorRange(anchorEnd, newHeadAnchor), "end");
      }
      newSelections.push(newSel);
    }

    // Horizontal extend resets goal column
    if (direction === "left" || direction === "right") {
      this._goalColumn = undefined;
    }

    // Merge overlapping selections
    this._selections = this._mergeSelections(newSelections, snap);

    // Update primary cursor
    const primarySel = this._selections[this._selections.length - 1];
    if (primarySel) {
      const headAnchor = primarySel.head === "end" ? primarySel.range.end : primarySel.range.start;
      const resolved = snap.resolveAnchor(headAnchor);
      if (resolved) this._cursor = resolved;
    }
  }

  private _selectAll(snap: MultiBufferSnapshot): void {
    this._goalColumn = undefined;
    const sel = selectAll(snap, this.multiBuffer);
    if (sel) {
      // Select all clears multi-cursor to a single selection
      this._selections = [sel];
      const headAnchor = sel.head === "end" ? sel.range.end : sel.range.start;
      const resolved = snap.resolveAnchor(headAnchor);
      if (resolved) this._cursor = resolved;
    }
  }

  private _collapseSelection(snap: MultiBufferSnapshot, to: "start" | "end"): void {
    this._goalColumn = undefined;
    if (this._selections.length === 0) return;

    const newSelections: Selection[] = [];
    for (const sel of this._selections) {
      const collapsed = collapseSelection(snap, this.multiBuffer, sel, to);
      if (collapsed) {
        newSelections.push(collapsed);
      }
    }

    this._selections = this._mergeSelections(newSelections, snap);

    const primarySel = this._selections[this._selections.length - 1];
    if (primarySel) {
      const anchor = to === "start" ? primarySel.range.start : primarySel.range.end;
      const point = snap.resolveAnchor(anchor);
      if (point) this._cursor = point;
    }
  }

  private _deleteLine(snap: MultiBufferSnapshot): void {
    this._goalColumn = undefined;

    // Collect unique rows from all selections
    const rowSet = new Set<number>();
    for (const sel of this._selections) {
      const headAnchor = sel.head === "end" ? sel.range.end : sel.range.start;
      const point = snap.resolveAnchor(headAnchor);
      if (point) rowSet.add(point.row);
    }

    // Fallback: use primary cursor if no selections resolved
    if (rowSet.size === 0) {
      rowSet.add(this.cursor.row);
    }

    // Sort rows descending and delete bottom-to-top
    const rows = [...rowSet].sort((a, b) => b - a);

    const edits: EditOp[] = [];
    const newSelections: Selection[] = [];
    let currentSnap = snap;

    for (const rawRow of rows) {
      // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction from sorted row
      const row = rawRow as MultiBufferRow;
      const lineCount = currentSnap.lineCount;

      let deleteStart: MultiBufferPoint;
      let deleteEnd: MultiBufferPoint;
      let newCursorRow: MultiBufferRow;

      if (lineCount <= 1) {
        // Only line — delete everything
        // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
        const lastRow = Math.max(0, lineCount - 1) as MultiBufferRow;
        // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic
        const lastLineText = currentSnap.lines(lastRow, lineCount as MultiBufferRow);
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
        const prevLineText = currentSnap.lines(prevRow, row);
        const prevLen = prevLineText[0]?.length ?? 0;
        // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic
        const thisLineText = currentSnap.lines(row, lineCount as MultiBufferRow);
        const thisLen = thisLineText[0]?.length ?? 0;
        deleteStart = { row: prevRow, column: prevLen };
        deleteEnd = { row, column: thisLen };
        newCursorRow = prevRow;
      }

      // Check editability of both endpoints (range may span excerpt boundary)
      const startBuf = currentSnap.toBufferPoint(deleteStart);
      if (startBuf && !startBuf.excerpt.editable) continue;
      const endBuf = currentSnap.toBufferPoint(deleteEnd);
      if (endBuf && !endBuf.excerpt.editable) continue;

      const removedText = this._getTextInRange(currentSnap, deleteStart, deleteEnd);
      edits.push({ editStart: deleteStart, removedText, insertedText: "" });

      this.multiBuffer.edit(deleteStart, deleteEnd, "");
      currentSnap = this.multiBuffer.snapshot();

      const newCursor: MultiBufferPoint = { row: newCursorRow, column: 0 };
      const newSel = selectionAtPoint(this.multiBuffer, newCursor);
      if (newSel) {
        newSelections.unshift(newSel);
      }
    }

    if (edits.length > 0) {
      this._undoStack.push({
        edits,
        cursorBefore: this._cursor,
        selectionsBefore: this._selections,
      });
      if (this._undoStack.length > Editor._MAX_HISTORY) {
        this._undoStack.shift();
      }
      this._redoStack = [];
      this._textVersion++;
    }

    if (edits.length > 0) {
      this._selections = this._mergeSelections(newSelections, currentSnap);
      const primarySel = this._selections[this._selections.length - 1];
      if (primarySel) {
        const headAnchor = primarySel.head === "end" ? primarySel.range.end : primarySel.range.start;
        const resolved = currentSnap.resolveAnchor(headAnchor);
        if (resolved) this._cursor = resolved;
      }
    }
  }

  private _moveLine(snap: MultiBufferSnapshot, direction: "up" | "down"): void {
    this._goalColumn = undefined;

    // Collect unique cursor rows from all selections (cf. _deleteLine pattern)
    const rowSet = new Set<number>();
    const colMap = new Map<number, number>();
    for (const sel of this._selections) {
      const headAnchor = sel.head === "end" ? sel.range.end : sel.range.start;
      const point = snap.resolveAnchor(headAnchor);
      if (point) {
        rowSet.add(point.row);
        colMap.set(point.row, point.column);
      }
    }
    if (rowSet.size === 0) {
      rowSet.add(this.cursor.row);
      colMap.set(this.cursor.row, this.cursor.column);
    }

    const allRows = [...rowSet].sort((a, b) => a - b);

    // Group consecutive rows into blocks — consecutive rows move as a unit
    const blocks: number[][] = [];
    // biome-ignore lint/style/noNonNullAssertion: expect: allRows is non-empty (rowSet populated above)
    let currentBlock: number[] = [allRows[0]!];
    for (let i = 1; i < allRows.length; i++) {
      // biome-ignore lint/style/noNonNullAssertion: expect: i and i-1 are valid indices within allRows
      if (allRows[i]! === allRows[i - 1]! + 1) {
        // biome-ignore lint/style/noNonNullAssertion: expect: i is a valid index within allRows
        currentBlock.push(allRows[i]!);
      } else {
        blocks.push(currentBlock);
        // biome-ignore lint/style/noNonNullAssertion: expect: i is a valid index within allRows
        currentBlock = [allRows[i]!];
      }
    }
    blocks.push(currentBlock);

    // Filter out blocks at the boundary in the given direction
    const lineCount = snap.lineCount;
    const validBlocks = blocks.filter(
      // biome-ignore lint/style/noNonNullAssertion: expect: block is non-empty by construction above
      (block) => direction === "up" ? block[0]! > 0 : block[block.length - 1]! < lineCount - 1,
    );

    if (validBlocks.length === 0) return;

    // Descend for "down", ascend for "up" (moves are size-neutral so order is not
    // strictly required, but this matches natural visual ordering)
    const orderedBlocks = direction === "down" ? [...validBlocks].reverse() : validBlocks;

    const edits: EditOp[] = [];
    const newSelections: Selection[] = [];
    const movedRows = new Set<number>();
    let currentSnap = snap;

    for (const block of orderedBlocks) {
      // biome-ignore lint/style/noNonNullAssertion: expect: block is non-empty by construction
      // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction from sorted row
      const blockStart = block[0]! as MultiBufferRow;
      // biome-ignore lint/style/noNonNullAssertion: expect: block is non-empty by construction
      // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction from sorted row
      const blockEnd = block[block.length - 1]! as MultiBufferRow;

      if (direction === "down") {
        // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic
        const belowRow = (blockEnd + 1) as MultiBufferRow;
        if (belowRow >= currentSnap.lineCount) continue;
        // Don't swap across a trailing-newline separator row (excerpt boundary).
        const belowExcerpt = currentSnap.excerptAt(belowRow);
        if (belowExcerpt?.hasTrailingNewline && belowRow === belowExcerpt.endRow - 1) continue;

        // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic
        const fetchEnd = (belowRow + 1) as MultiBufferRow;
        const allLines = currentSnap.lines(blockStart, fetchEnd);
        const blockLines = allLines.slice(0, block.length);
        const belowLineText = allLines[block.length] ?? "";

        const blockText = blockLines.join("\n");
        const removedText = `${blockText}\n${belowLineText}`;
        const insertedText = `${belowLineText}\n${blockText}`;

        const editStart: MultiBufferPoint = { row: blockStart, column: 0 };
        const editEnd: MultiBufferPoint = { row: belowRow, column: belowLineText.length };

        const startBuf = currentSnap.toBufferPoint(editStart);
        if (startBuf && !startBuf.excerpt.editable) continue;
        const endBuf = currentSnap.toBufferPoint(editEnd);
        if (endBuf && !endBuf.excerpt.editable) continue;

        edits.push({ editStart, removedText, insertedText });
        this.multiBuffer.edit(editStart, editEnd, insertedText);
        currentSnap = this.multiBuffer.snapshot();

        // New cursor positions: each block row shifts down by 1
        for (const origRow of block) {
          movedRows.add(origRow);
          // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic
          const newRow = (origRow + 1) as MultiBufferRow;
          const col = colMap.get(origRow) ?? 0;
          const newCursor: MultiBufferPoint = { row: newRow, column: col };
          const newSel = selectionAtPoint(this.multiBuffer, newCursor);
          if (newSel) newSelections.unshift(newSel);
        }
      } else {
        // direction === "up"
        if (blockStart <= 0) continue;
        // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic
        const aboveRow = (blockStart - 1) as MultiBufferRow;
        // Don't swap across a trailing-newline separator row (excerpt boundary).
        const aboveExcerpt = currentSnap.excerptAt(aboveRow);
        if (aboveExcerpt?.hasTrailingNewline && aboveRow === aboveExcerpt.endRow - 1) continue;
        // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic
        const fetchEnd = (blockEnd + 1) as MultiBufferRow;
        const allLines = currentSnap.lines(aboveRow, fetchEnd);
        const aboveLineText = allLines[0] ?? "";
        const blockLines = allLines.slice(1);
        const lastBlockLine = blockLines[blockLines.length - 1] ?? "";

        const blockText = blockLines.join("\n");
        const removedText = `${aboveLineText}\n${blockText}`;
        const insertedText = `${blockText}\n${aboveLineText}`;

        const editStart: MultiBufferPoint = { row: aboveRow, column: 0 };
        const editEnd: MultiBufferPoint = { row: blockEnd, column: lastBlockLine.length };

        const startBuf = currentSnap.toBufferPoint(editStart);
        if (startBuf && !startBuf.excerpt.editable) continue;
        const endBuf = currentSnap.toBufferPoint(editEnd);
        if (endBuf && !endBuf.excerpt.editable) continue;

        edits.push({ editStart, removedText, insertedText });
        this.multiBuffer.edit(editStart, editEnd, insertedText);
        currentSnap = this.multiBuffer.snapshot();

        // New cursor positions: each block row shifts up by 1
        for (const origRow of block) {
          movedRows.add(origRow);
          // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic
          const newRow = (origRow - 1) as MultiBufferRow;
          const col = colMap.get(origRow) ?? 0;
          const newCursor: MultiBufferPoint = { row: newRow, column: col };
          const newSel = selectionAtPoint(this.multiBuffer, newCursor);
          if (newSel) newSelections.unshift(newSel);
        }
      }
    }

    if (edits.length === 0) return;

    // Preserve cursors that couldn't move (at boundary or in non-editable excerpt)
    for (const r of rowSet) {
      if (!movedRows.has(r)) {
        // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction from sorted row
        const stuckCursor: MultiBufferPoint = { row: r as MultiBufferRow, column: colMap.get(r) ?? 0 };
        const stuckSel = selectionAtPoint(this.multiBuffer, stuckCursor);
        if (stuckSel) newSelections.unshift(stuckSel);
      }
    }

    this._undoStack.push({
      edits,
      cursorBefore: this._cursor,
      selectionsBefore: this._selections,
    });
    if (this._undoStack.length > Editor._MAX_HISTORY) {
      this._undoStack.shift();
    }
    this._redoStack = [];
    this._textVersion++;

    this._selections = this._mergeSelections(newSelections, currentSnap);
    const primarySel = this._selections[this._selections.length - 1];
    if (primarySel) {
      const headAnchor = primarySel.head === "end" ? primarySel.range.end : primarySel.range.start;
      const resolved = currentSnap.resolveAnchor(headAnchor);
      if (resolved) this._cursor = resolved;
    }
  }

  private _duplicateLine(snap: MultiBufferSnapshot, direction: "up" | "down"): void {
    this._goalColumn = undefined;

    // Collect unique cursor rows from all selections (cf. _deleteLine pattern)
    const rowSet = new Set<number>();
    const colMap = new Map<number, number>();
    for (const sel of this._selections) {
      const headAnchor = sel.head === "end" ? sel.range.end : sel.range.start;
      const point = snap.resolveAnchor(headAnchor);
      if (point) {
        rowSet.add(point.row);
        colMap.set(point.row, point.column);
      }
    }
    if (rowSet.size === 0) {
      rowSet.add(this.cursor.row);
      colMap.set(this.cursor.row, this.cursor.column);
    }

    // Process descending (bottom-to-top) for both directions to avoid row-shift
    // interference: inserts at lower rows don't affect higher rows yet to process.
    const rows = [...rowSet].sort((a, b) => b - a);

    const edits: EditOp[] = [];
    const newSelections: Selection[] = [];
    let currentSnap = snap;

    for (const origRow of rows) {
      // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction from sorted row
      const row = origRow as MultiBufferRow;
      // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic
      const nextRowEnd = (origRow + 1) as MultiBufferRow;
      const lineText = currentSnap.lines(row, nextRowEnd)[0] ?? "";
      const col = colMap.get(origRow) ?? 0;

      if (direction === "down") {
        const insertPoint: MultiBufferPoint = { row, column: lineText.length };
        const startBuf = currentSnap.toBufferPoint(insertPoint);
        if (startBuf && !startBuf.excerpt.editable) continue;

        const insertedText = `\n${lineText}`;
        edits.push({ editStart: insertPoint, removedText: "", insertedText });
        this.multiBuffer.edit(insertPoint, insertPoint, insertedText);
        currentSnap = this.multiBuffer.snapshot();

        // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic
        const newRow = (origRow + 1) as MultiBufferRow;
        const newCursor: MultiBufferPoint = { row: newRow, column: col };
        const newSel = selectionAtPoint(this.multiBuffer, newCursor);
        if (newSel) newSelections.unshift(newSel);
      } else {
        // direction === "up": insert copy above; cursor stays at row (the copy)
        const insertPoint: MultiBufferPoint = { row, column: 0 };
        const startBuf = currentSnap.toBufferPoint(insertPoint);
        if (startBuf && !startBuf.excerpt.editable) continue;

        const insertedText = `${lineText}\n`;
        edits.push({ editStart: insertPoint, removedText: "", insertedText });
        this.multiBuffer.edit(insertPoint, insertPoint, insertedText);
        currentSnap = this.multiBuffer.snapshot();

        const newCursor: MultiBufferPoint = { row, column: col };
        const newSel = selectionAtPoint(this.multiBuffer, newCursor);
        if (newSel) newSelections.unshift(newSel);
      }
    }

    if (edits.length === 0) return;

    this._undoStack.push({
      edits,
      cursorBefore: this._cursor,
      selectionsBefore: this._selections,
    });
    if (this._undoStack.length > Editor._MAX_HISTORY) {
      this._undoStack.shift();
    }
    this._redoStack = [];
    this._textVersion++;

    this._selections = this._mergeSelections(newSelections, currentSnap);
    const primarySel = this._selections[this._selections.length - 1];
    if (primarySel) {
      const headAnchor = primarySel.head === "end" ? primarySel.range.end : primarySel.range.start;
      const resolved = currentSnap.resolveAnchor(headAnchor);
      if (resolved) this._cursor = resolved;
    }
  }

  private _insertLineBelow(snap: MultiBufferSnapshot): void {
    this._goalColumn = undefined;
    const cursor = this.cursor;
    const row = cursor.row;

    // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic
    const nextRowEnd = (row + 1) as MultiBufferRow;
    const currentLineText = snap.lines(row, nextRowEnd)[0] ?? "";

    // Inherit the current line's leading whitespace (matches Enter auto-indent)
    const indent = currentLineText.match(/^( +)/)?.[1] ?? "";

    const insertPoint: MultiBufferPoint = { row, column: currentLineText.length };
    if (!this._edit(snap, insertPoint, insertPoint, `\n${indent}`)) return;

    // Move cursor to the new line after any indentation
    // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic
    const newCursor: MultiBufferPoint = { row: (row + 1) as MultiBufferRow, column: indent.length };
    this._cursor = newCursor;
    const newSel = selectionAtPoint(this.multiBuffer, newCursor);
    this._selections = newSel ? [newSel] : [];
  }

  private _insertLineAbove(snap: MultiBufferSnapshot): void {
    this._goalColumn = undefined;
    const cursor = this.cursor;
    const row = cursor.row;

    // Inherit the current line's leading whitespace (consistent with Enter and insertLineBelow)
    // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic
    const currentLineText = snap.lines(row, (row + 1) as MultiBufferRow)[0] ?? "";
    const indent = currentLineText.match(/^( +)/)?.[1] ?? "";

    // Insert the indented blank line before the current line
    const insertPoint: MultiBufferPoint = { row, column: 0 };
    if (!this._edit(snap, insertPoint, insertPoint, `${indent}\n`)) return;

    // Cursor moves to the new blank line after any indentation
    const newCursor: MultiBufferPoint = { row, column: indent.length };
    this._cursor = newCursor;
    const newSel = selectionAtPoint(this.multiBuffer, newCursor);
    this._selections = newSel ? [newSel] : [];
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
    // Pass pre-fetched text to skip redundant snap.lines() call inside _getTextInRange.
    // Safe: rangeStart.column === 0 and rangeEnd.column === lastLineLen (full line), so
    // lines.join("\n") matches exactly what _getTextInRange would return.
    if (!this._edit(snap, rangeStart, rangeEnd, indented.join("\n"), lines.join("\n"))) return;

    // Place cursor at its shifted position
    const cursor = this.cursor;
    const newCursor: MultiBufferPoint = { row: cursor.row, column: cursor.column + 2 };
    const newSnap = this.multiBuffer.snapshot();
    this._cursor = newSnap.clipPoint(newCursor, Bias.Left);
    const newSel = selectionAtPoint(this.multiBuffer, this._cursor);
    this._selections = newSel ? [newSel] : [];
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

    // Check if any line actually has leading spaces to remove
    let anyChange = false;
    const dedented = lines.map((line) => {
      let spacesToRemove = 0;
      if (line.length > 0 && line[0] === " ") {
        spacesToRemove = 1;
        if (line.length > 1 && line[1] === " ") {
          spacesToRemove = 2;
        }
      }
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
    let spacesRemovedOnCursorLine = 0;
    if (cursorLine.length > 0 && cursorLine[0] === " ") {
      spacesRemovedOnCursorLine = 1;
      if (cursorLine.length > 1 && cursorLine[1] === " ") {
        spacesRemovedOnCursorLine = 2;
      }
    }

    // Pass pre-fetched text to skip redundant snap.lines() call inside _getTextInRange.
    if (!this._edit(snap, rangeStart, rangeEnd, dedented.join("\n"), lines.join("\n"))) return;

    // Adjust cursor column
    const newCol = Math.max(0, cursor.column - spacesRemovedOnCursorLine);
    const newCursor: MultiBufferPoint = { row: cursor.row, column: newCol };
    const newSnap = this.multiBuffer.snapshot();
    this._cursor = newSnap.clipPoint(newCursor, Bias.Left);
    const newSel = selectionAtPoint(this.multiBuffer, this._cursor);
    this._selections = newSel ? [newSel] : [];
  }

  /**
   * Determine the range of rows affected by the current selection or cursor.
   * Returns inclusive start and end rows.
   */
  private _affectedRows(snap: MultiBufferSnapshot): {
    startRow: MultiBufferRow;
    endRow: MultiBufferRow;
  } {
    // Collect all rows touched by any selection
    let minRow = this.cursor.row;
    let maxRow = this.cursor.row;
    for (const sel of this._selections) {
      if (!isCollapsed(snap, sel)) {
        const range = resolveAnchorRange(snap, sel.range);
        if (range) {
          // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic — Math.min/max strips the brand
          minRow = Math.min(minRow, range.start.row) as MultiBufferRow;
          // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic — Math.min/max strips the brand
          maxRow = Math.max(maxRow, range.end.row) as MultiBufferRow;
        }
      } else {
        const headAnchor = sel.head === "end" ? sel.range.end : sel.range.start;
        const resolved = snap.resolveAnchor(headAnchor);
        if (resolved) {
          // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic — Math.min/max strips the brand
          minRow = Math.min(minRow, resolved.row) as MultiBufferRow;
          // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic — Math.min/max strips the brand
          maxRow = Math.max(maxRow, resolved.row) as MultiBufferRow;
        }
      }
    }
    // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic
    return { startRow: minRow as MultiBufferRow, endRow: maxRow as MultiBufferRow };
  }

  private _cut(snap: MultiBufferSnapshot): void {
    const hasNonCollapsed = this._selections.some((sel) => !isCollapsed(snap, sel));
    if (hasNonCollapsed) {
      // Cut all non-collapsed selections, similar to delete
      this._deleteBackward(snap, "character");
      return;
    }
    // No non-collapsed selections — cut the entire line (same behavior as Cmd+X in VS Code)
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
   *
   * Returns false if the edit was rejected (e.g. targeting a non-editable excerpt).
   */
  private _edit(
    snap: MultiBufferSnapshot,
    start: MultiBufferPoint,
    end: MultiBufferPoint,
    newText: string,
    /** Pre-computed removed text. When provided, skips the `_getTextInRange` call for single-excerpt edits. */
    knownRemovedText?: string,
  ): boolean {
    const startBuf = snap.toBufferPoint(start);
    const endBuf = snap.toBufferPoint(end);

    // Reject edits that touch non-editable excerpts
    if (startBuf && !startBuf.excerpt.editable) return false;
    if (endBuf && !endBuf.excerpt.editable) return false;

    // Same excerpt (or same point) — single edit
    if (
      !startBuf || !endBuf ||
      (start.row === end.row && start.column === end.column) ||
      startBuf.excerpt.id.index === endBuf.excerpt.id.index
    ) {
      const removedText = knownRemovedText ?? this._getTextInRange(snap, start, end);
      this._undoStack.push({
        edits: [{ editStart: start, removedText, insertedText: newText }],
        cursorBefore: this._cursor,
        selectionsBefore: this._selections,
      });
      if (this._undoStack.length > Editor._MAX_HISTORY) {
        this._undoStack.shift();
      }
      this._redoStack = [];
      this.multiBuffer.edit(start, end, newText);
      this._textVersion++;
      return true;
    }

    // Cross-excerpt: reject if any spanned excerpt is non-editable
    for (const exc of snap.excerpts) {
      if (exc.startRow >= startBuf.excerpt.startRow && exc.startRow <= endBuf.excerpt.startRow) {
        if (!exc.editable) return false;
      }
    }

    // Cross-excerpt within same buffer: edit directly (handles boundary newlines)
    if (startBuf.excerpt.bufferId === endBuf.excerpt.bufferId) {
      const removedText = knownRemovedText ?? this._getTextInRange(snap, start, end);
      this._undoStack.push({
        edits: [{ editStart: start, removedText, insertedText: newText }],
        cursorBefore: this._cursor,
        selectionsBefore: this._selections,
      });
      if (this._undoStack.length > Editor._MAX_HISTORY) {
        this._undoStack.shift();
      }
      this._redoStack = [];
      this.multiBuffer.edit(start, end, newText);
      this._textVersion++;
      return true;
    }

    // Cross-excerpt across different buffers: split into per-excerpt edits, applied bottom-to-top
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
      selectionsBefore: this._selections,
    });
    if (this._undoStack.length > Editor._MAX_HISTORY) {
      this._undoStack.shift();
    }
    this._redoStack = [];
    this._textVersion++;
    return true;
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
    this._textVersion++;

    const inverse: HistoryEntry = {
      edits: inverseOps,
      cursorBefore: this._cursor,
      selectionsBefore: this._selections,
    };
    this._cursor = entry.cursorBefore;
    this._selections = [...entry.selectionsBefore];
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

  /**
   * Add a new cursor at a specific point. If the point overlaps with an
   * existing selection, this is a no-op.
   */
  private _addCursor(snap: MultiBufferSnapshot, point: MultiBufferPoint): void {
    const clipped = snap.clipPoint(point, Bias.Left);
    const newSel = selectionAtPoint(this.multiBuffer, clipped);
    if (!newSel) return;

    // Check if this point overlaps any existing selection
    for (const sel of this._selections) {
      const range = resolveAnchorRange(snap, sel.range);
      if (!range) continue;
      if (
        (clipped.row > range.start.row ||
          (clipped.row === range.start.row && clipped.column >= range.start.column)) &&
        (clipped.row < range.end.row ||
          (clipped.row === range.end.row && clipped.column <= range.end.column))
      ) {
        // Point is within an existing selection, don't add
        return;
      }
    }

    this._selections = [...this._selections, newSel];
    this._cursor = clipped;
  }

  /**
   * Add cursors one line above or below each existing cursor.
   */
  private _addCursorsVertical(snap: MultiBufferSnapshot, direction: "up" | "down"): void {
    const newSelections: Selection[] = [...this._selections];

    for (const sel of this._selections) {
      const headAnchor = sel.head === "end" ? sel.range.end : sel.range.start;
      const headPoint = snap.resolveAnchor(headAnchor);
      if (!headPoint) continue;

      // Move cursor in direction
      const newPoint = moveCursor(snap, headPoint, direction, "character");
      if (newPoint.row === headPoint.row) continue; // Couldn't move

      const newSel = selectionAtPoint(this.multiBuffer, newPoint);
      if (newSel) {
        newSelections.push(newSel);
      }
    }

    this._selections = this._mergeSelections(newSelections, snap);
    const primarySel = this._selections[this._selections.length - 1];
    if (primarySel) {
      const headAnchor = primarySel.head === "end" ? primarySel.range.end : primarySel.range.start;
      const resolved = snap.resolveAnchor(headAnchor);
      if (resolved) this._cursor = resolved;
    }
  }

  /**
   * Remove all cursors except the primary (last) one.
   */
  private _clearExtraCursors(): void {
    if (this._selections.length <= 1) return;
    const primarySel = this._selections[this._selections.length - 1];
    if (primarySel) {
      this._selections = [primarySel];
    }
  }

  /**
   * Resolve all selections to concrete points, sorted bottom-to-top for editing.
   * Returns array of { start, end, index } where index is original selection index.
   */
  private _resolveSelectionsBottomUp(
    snap: MultiBufferSnapshot,
  ): Array<{ start: MultiBufferPoint; end: MultiBufferPoint; index: number }> {
    const resolved: Array<{ start: MultiBufferPoint; end: MultiBufferPoint; index: number }> = [];

    for (let i = 0; i < this._selections.length; i++) {
      const sel = this._selections[i];
      if (!sel) continue;

      if (!isCollapsed(snap, sel)) {
        const range = resolveAnchorRange(snap, sel.range);
        if (range) {
          resolved.push({ start: range.start, end: range.end, index: i });
        }
      } else {
        const headAnchor = sel.head === "end" ? sel.range.end : sel.range.start;
        const point = snap.resolveAnchor(headAnchor);
        if (point) {
          resolved.push({ start: point, end: point, index: i });
        }
      }
    }

    // Sort bottom-to-top (higher row first, then higher column)
    resolved.sort((a, b) => {
      if (b.start.row !== a.start.row) return b.start.row - a.start.row;
      return b.start.column - a.start.column;
    });

    return resolved;
  }

  /**
   * Merge overlapping or adjacent selections.
   * Maintains the "primary" selection as the last element.
   */
  private _mergeSelections(selections: Selection[], snap: MultiBufferSnapshot): Selection[] {
    if (selections.length <= 1) return selections;

    // Resolve all selections to points
    const resolved: Array<{
      sel: Selection;
      start: MultiBufferPoint;
      end: MultiBufferPoint;
    }> = [];

    for (const sel of selections) {
      const range = resolveAnchorRange(snap, sel.range);
      if (range) {
        resolved.push({ sel, start: range.start, end: range.end });
      }
    }

    // Sort by start position
    resolved.sort((a, b) => {
      if (a.start.row !== b.start.row) return a.start.row - b.start.row;
      return a.start.column - b.start.column;
    });

    // Merge overlapping
    const merged: Selection[] = [];
    for (const r of resolved) {
      if (merged.length === 0) {
        merged.push(r.sel);
        continue;
      }

      const lastSel = merged[merged.length - 1];
      if (!lastSel) {
        merged.push(r.sel);
        continue;
      }

      const lastRange = resolveAnchorRange(snap, lastSel.range);
      if (!lastRange) {
        merged.push(r.sel);
        continue;
      }

      // Check overlap: new start <= last end
      if (
        r.start.row < lastRange.end.row ||
        (r.start.row === lastRange.end.row && r.start.column <= lastRange.end.column)
      ) {
        // Merge: use the selection that extends further
        if (
          r.end.row > lastRange.end.row ||
          (r.end.row === lastRange.end.row && r.end.column > lastRange.end.column)
        ) {
          // New selection extends further - create merged selection
          const mergedStart = this.multiBuffer.createAnchor(lastRange.start, Bias.Left);
          const mergedEnd = this.multiBuffer.createAnchor(r.end, Bias.Right);
          if (mergedStart && mergedEnd) {
            merged[merged.length - 1] = createSelection(
              createAnchorRange(mergedStart, mergedEnd),
              "end",
            );
          }
        }
        // Otherwise keep the existing one
      } else {
        // No overlap, add as new
        merged.push(r.sel);
      }
    }

    return merged;
  }
}

/** Returns true if two MultiBufferPoints are at the same row and column. */
function _pointsEqual(a: MultiBufferPoint, b: MultiBufferPoint): boolean {
  return a.row === b.row && a.column === b.column;
}

/** Returns true if two selection arrays are equal by reference (shallow comparison). */
function _selectionsEqual(a: readonly Selection[], b: readonly Selection[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Returns true for commands that mutate text or edit history.
 * Used by the read-only guard in Editor.dispatch().
 */
function _isEditCommand(type: EditorCommand["type"]): boolean {
  switch (type) {
    case "insertText":
    case "insertNewline":
    case "insertTab":
    case "indentLines":
    case "dedentLines":
    case "deleteBackward":
    case "deleteForward":
    case "deleteLine":
    case "moveLine":
    case "duplicateLine":
    case "insertLineBelow":
    case "insertLineAbove":
    case "cut":
    case "paste":
    case "undo":
    case "redo":
      return true;
    default:
      return false;
  }
}
