/**
 * Search functionality for the Editor.
 *
 * SearchController provides find/replace capabilities with anchor-based result
 * tracking that survives text edits. Results are stored as AnchorRanges so their
 * positions automatically adjust as the document changes.
 */

import { compareAnchors, createAnchorRange, resolveAnchorRange } from "../multibuffer/anchor.ts";
import type {
  AnchorRange,
  MultiBufferPoint,
  MultiBufferRow,
  MultiBufferSnapshot,
} from "../multibuffer/types.ts";
import { Bias } from "../multibuffer/types.ts";
import type { Editor } from "./editor.ts";

/**
 * Options for search behavior.
 */
export interface SearchOptions {
  /** Case-sensitive matching. Default: false */
  readonly caseSensitive?: boolean;
  /** Match whole words only. Default: false */
  readonly wholeWord?: boolean;
  /** Treat query as a regular expression. Default: false */
  readonly regex?: boolean;
}

/**
 * A single search result with its anchor range and matched text.
 */
export interface SearchResult {
  /** Anchor range that survives edits */
  readonly range: AnchorRange;
  /** The matched text at the time of the search */
  readonly matchedText: string;
}

/**
 * Read-only search state returned by SearchController.
 */
export interface SearchState {
  /** The query being searched for */
  readonly query: string;
  /** Search options */
  readonly options: SearchOptions;
  /** All matches found (sorted by position) */
  readonly results: readonly SearchResult[];
  /** Current active match index, or -1 if no matches */
  readonly activeIndex: number;
  /** Total number of matches */
  readonly count: number;
}

/**
 * Controller for find/replace operations on an Editor.
 *
 * Results are tracked using anchor ranges that survive text edits.
 * The controller automatically refreshes results when the underlying
 * text changes.
 *
 * @example
 * ```ts
 * const search = new SearchController(editor);
 * search.find("TODO");
 * search.next();      // Jump to first match
 * search.next();      // Jump to next match
 * search.replaceActive("DONE");
 * search.dispose();   // Clean up
 * ```
 */
export class SearchController {
  private readonly _editor: Editor;
  private _query = "";
  private _options: SearchOptions = {};
  private _results: SearchResult[] = [];
  private _activeIndex = -1;
  private _textChangeHandler: ((snap: MultiBufferSnapshot) => void) | null = null;
  private _disposed = false;

  constructor(editor: Editor) {
    this._editor = editor;
  }

  /** The underlying editor. */
  get editor(): Editor {
    return this._editor;
  }

  /** Current search state. */
  get state(): SearchState {
    return {
      query: this._query,
      options: { ...this._options },
      results: this._results,
      activeIndex: this._activeIndex,
      count: this._results.length,
    };
  }

  /** Whether there are any search results. */
  get hasResults(): boolean {
    return this._results.length > 0;
  }

  /** The currently active search result, or undefined if none. */
  get activeResult(): SearchResult | undefined {
    if (this._activeIndex < 0 || this._activeIndex >= this._results.length) {
      return undefined;
    }
    return this._results[this._activeIndex];
  }

  /**
   * Execute a search query. Returns the number of matches found.
   *
   * @param query - The search string or regex pattern
   * @param options - Search options (caseSensitive, wholeWord, regex)
   */
  find(query: string, options: SearchOptions = {}): number {
    this._ensureNotDisposed();

    this._query = query;
    this._options = { ...options };
    this._results = [];
    this._activeIndex = -1;

    if (!query) {
      this._unsubscribeFromTextChanges();
      return 0;
    }

    this._performSearch();
    this._subscribeToTextChanges();

    // Select the first result if any
    if (this._results.length > 0) {
      this._selectActiveResult();
    }

    return this._results.length;
  }

  /**
   * Clear the current search.
   */
  clear(): void {
    this._ensureNotDisposed();
    this._query = "";
    this._options = {};
    this._results = [];
    this._activeIndex = -1;
    this._unsubscribeFromTextChanges();
  }

  /**
   * Move to the next search result.
   * Wraps around to the first result after the last.
   * Selects the match in the editor.
   *
   * @returns true if navigation succeeded, false if no results
   */
  next(): boolean {
    this._ensureNotDisposed();
    if (this._results.length === 0) return false;

    this._activeIndex = (this._activeIndex + 1) % this._results.length;
    this._selectActiveResult();
    return true;
  }

  /**
   * Move to the previous search result.
   * Wraps around to the last result before the first.
   * Selects the match in the editor.
   *
   * @returns true if navigation succeeded, false if no results
   */
  prev(): boolean {
    this._ensureNotDisposed();
    if (this._results.length === 0) return false;

    this._activeIndex =
      this._activeIndex <= 0
        ? this._results.length - 1
        : this._activeIndex - 1;
    this._selectActiveResult();
    return true;
  }

  /**
   * Jump to a specific result by index.
   * Selects the match in the editor.
   *
   * @param index - Zero-based index of the result
   * @returns true if navigation succeeded, false if index out of bounds
   */
  goTo(index: number): boolean {
    this._ensureNotDisposed();
    if (index < 0 || index >= this._results.length) return false;

    this._activeIndex = index;
    this._selectActiveResult();
    return true;
  }

  /**
   * Find the result nearest to the current cursor position and activate it.
   *
   * @returns true if a result was found, false if no results
   */
  findNearest(): boolean {
    this._ensureNotDisposed();
    if (this._results.length === 0) return false;

    const snap = this._editor.multiBuffer.snapshot();
    const cursor = this._editor.cursor;

    // Find the first result at or after the cursor
    let nearestIndex = 0;
    for (let i = 0; i < this._results.length; i++) {
      const result = this._results[i];
      if (!result) continue;
      const resolved = snap.resolveAnchor(result.range.start);
      if (!resolved) continue;

      if (
        resolved.row > cursor.row ||
        (resolved.row === cursor.row && resolved.column >= cursor.column)
      ) {
        nearestIndex = i;
        break;
      }
      // If we've passed the cursor, the previous result was closest
      if (i === this._results.length - 1) {
        nearestIndex = 0; // Wrap to first
      }
    }

    this._activeIndex = nearestIndex;
    this._selectActiveResult();
    return true;
  }

  /**
   * Replace the currently active match with the given text.
   *
   * @param replacement - The text to replace with
   * @returns true if replacement succeeded, false if no active match
   */
  replaceActive(replacement: string): boolean {
    this._ensureNotDisposed();
    const result = this.activeResult;
    if (!result) return false;

    const snap = this._editor.multiBuffer.snapshot();
    const resolved = resolveAnchorRange(snap, result.range);
    if (!resolved) return false;

    // Select the match and replace it
    this._editor.setCursor(resolved.start);
    this._editor.extendSelectionTo(resolved.end);
    this._editor.dispatch({ type: "insertText", text: replacement });

    // Results will be refreshed by the text change handler
    return true;
  }

  /**
   * Replace all matches with the given text.
   * Replaces from bottom to top to preserve positions.
   *
   * @param replacement - The text to replace with
   * @returns The number of replacements made
   */
  replaceAll(replacement: string): number {
    this._ensureNotDisposed();
    if (this._results.length === 0) return 0;

    // Temporarily unsubscribe to avoid repeated refresh during batch replace
    this._unsubscribeFromTextChanges();

    const snap = this._editor.multiBuffer.snapshot();
    const mb = this._editor.multiBuffer;

    // Resolve all anchor ranges to current positions
    const resolved: Array<{
      start: MultiBufferPoint;
      end: MultiBufferPoint;
    }> = [];
    for (const result of this._results) {
      const range = resolveAnchorRange(snap, result.range);
      if (range) {
        resolved.push(range);
      }
    }

    // Sort bottom-to-top so edits don't shift later positions
    resolved.sort((a, b) => {
      if (a.start.row !== b.start.row) return b.start.row - a.start.row;
      return b.start.column - a.start.column;
    });

    // Apply each replacement
    for (const range of resolved) {
      mb.edit(range.start, range.end, replacement);
    }

    const count = resolved.length;

    // Re-run search to update results
    this._performSearch();
    this._subscribeToTextChanges();

    return count;
  }

  /**
   * Resolve all results to current positions.
   * Useful for rendering match highlights.
   *
   * @returns Array of resolved ranges (undefined entries for stale anchors)
   */
  resolveResults(): Array<{ start: MultiBufferPoint; end: MultiBufferPoint } | undefined> {
    const snap = this._editor.multiBuffer.snapshot();
    return this._results.map((result) => resolveAnchorRange(snap, result.range));
  }

  /**
   * Resolve results visible in a viewport range.
   * More efficient than resolveResults() for large result sets.
   *
   * @param startRow - First visible row
   * @param endRow - Last visible row (exclusive)
   * @returns Array of resolved ranges for visible results
   */
  resolveResultsInViewport(
    startRow: MultiBufferRow,
    endRow: MultiBufferRow,
  ): Array<{ start: MultiBufferPoint; end: MultiBufferPoint; index: number }> {
    const snap = this._editor.multiBuffer.snapshot();
    const visible: Array<{ start: MultiBufferPoint; end: MultiBufferPoint; index: number }> = [];

    // Collect all start anchors for batch resolution
    const startAnchors = this._results.map((r) => r.range.start);
    const resolvedStarts = snap.resolveAnchorsInViewport(startAnchors, startRow, endRow);

    for (let i = 0; i < this._results.length; i++) {
      const startPoint = resolvedStarts[i];
      if (!startPoint) continue;

      const result = this._results[i];
      if (!result) continue;
      const endPoint = snap.resolveAnchor(result.range.end);
      if (!endPoint) continue;

      visible.push({ start: startPoint, end: endPoint, index: i });
    }

    return visible;
  }

  /**
   * Dispose the controller, removing event listeners.
   * The controller cannot be used after disposal.
   */
  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    this._unsubscribeFromTextChanges();
    this._results = [];
    this._activeIndex = -1;
  }

  /** Whether the controller has been disposed. */
  get disposed(): boolean {
    return this._disposed;
  }

  // ─── Internal Methods ─────────────────────────────────────────────

  private _ensureNotDisposed(): void {
    if (this._disposed) {
      throw new Error("SearchController has been disposed");
    }
  }

  private _performSearch(): void {
    const snap = this._editor.multiBuffer.snapshot();
    const mb = this._editor.multiBuffer;
    const fullText = this._getFullText(snap);

    if (!fullText || !this._query) {
      this._results = [];
      this._activeIndex = -1;
      return;
    }

    const matches = this._findMatches(fullText);
    const lineOffsets = this._computeLineOffsets(fullText);

    // Where the active match sat before the rebuild, so an edit elsewhere in
    // the document doesn't send the user back to the top of the results.
    const previousStart = this._activeStartPoint(snap);

    const built: Array<{ result: SearchResult; start: MultiBufferPoint }> = [];
    for (const match of matches) {
      const startPoint = this._offsetToPoint(match.start, lineOffsets, snap);
      const endPoint = this._offsetToPoint(match.end, lineOffsets, snap);

      if (!startPoint || !endPoint) continue;

      const startAnchor = mb.createAnchor(startPoint, Bias.Left);
      const endAnchor = mb.createAnchor(endPoint, Bias.Right);

      if (!startAnchor || !endAnchor) continue;

      built.push({
        result: {
          range: createAnchorRange(startAnchor, endAnchor),
          matchedText: match.text,
        },
        start: startPoint,
      });
    }

    // Sort by position
    built.sort((a, b) => compareAnchors(a.result.range.start, b.result.range.start));

    const results = built.map((entry) => entry.result);

    this._results = results;
    this._activeIndex = this._indexForActive(built, previousStart);
  }

  /**
   * Resolve the currently active match's start position, if there is one.
   * Returns undefined when no match is active, which is the case for a fresh
   * `find()` — it clears the index before searching.
   */
  private _activeStartPoint(snap: MultiBufferSnapshot): MultiBufferPoint | undefined {
    const active = this.activeResult;
    if (!active) return undefined;
    return snap.resolveAnchor(active.range.start);
  }

  /**
   * Pick the active index for a freshly rebuilt result set.
   *
   * Keeps the user on the match they were on. If the edit removed that match,
   * falls back to the first match at or after where it used to be. With no
   * previously active match, activates the first result as `find()` expects.
   *
   * Compares positions directly rather than trusting the array order, so it
   * stays correct regardless of how the results were sorted.
   */
  private _indexForActive(
    built: ReadonlyArray<{ result: SearchResult; start: MultiBufferPoint }>,
    previousStart: MultiBufferPoint | undefined,
  ): number {
    if (built.length === 0) return -1;
    if (!previousStart) return 0;

    let after = -1;
    let afterPoint: MultiBufferPoint | undefined;

    for (let i = 0; i < built.length; i++) {
      const entry = built[i];
      if (!entry) continue;
      const start = entry.start;

      // The same match survived the edit.
      if (start.row === previousStart.row && start.column === previousStart.column) {
        return i;
      }

      const isAfter =
        start.row > previousStart.row ||
        (start.row === previousStart.row && start.column > previousStart.column);
      if (!isAfter) continue;

      if (
        !afterPoint ||
        start.row < afterPoint.row ||
        (start.row === afterPoint.row && start.column < afterPoint.column)
      ) {
        after = i;
        afterPoint = start;
      }
    }

    // Every remaining match sits above the old position: wrap to the first.
    return after === -1 ? 0 : after;
  }

  private _getFullText(snap: MultiBufferSnapshot): string {
    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction for row range
    const lines = snap.lines(0 as MultiBufferRow, snap.lineCount as MultiBufferRow);
    return lines.join("\n");
  }

  private _findMatches(text: string): Array<{ start: number; end: number; text: string }> {
    const matches: Array<{ start: number; end: number; text: string }> = [];

    let pattern: RegExp;
    try {
      if (this._options.regex) {
        const flags = this._options.caseSensitive ? "g" : "gi";
        pattern = new RegExp(this._query, flags);
      } else {
        // Escape special regex characters for literal search
        const escaped = this._query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const flags = this._options.caseSensitive ? "g" : "gi";

        if (this._options.wholeWord) {
          pattern = new RegExp(`\\b${escaped}\\b`, flags);
        } else {
          pattern = new RegExp(escaped, flags);
        }
      }
    } catch {
      // Invalid regex - return no matches
      return [];
    }

    let match = pattern.exec(text);
    while (match !== null) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        text: match[0],
      });

      // Prevent infinite loop on zero-length matches
      if (match[0].length === 0) {
        pattern.lastIndex++;
      }
      match = pattern.exec(text);
    }

    return matches;
  }

  private _computeLineOffsets(text: string): number[] {
    const offsets: number[] = [0];
    for (let i = 0; i < text.length; i++) {
      if (text[i] === "\n") {
        offsets.push(i + 1);
      }
    }
    return offsets;
  }

  private _offsetToPoint(
    offset: number,
    lineOffsets: number[],
    snap: MultiBufferSnapshot,
  ): MultiBufferPoint | undefined {
    // Binary search for the line containing this offset
    let low = 0;
    let high = lineOffsets.length - 1;

    while (low < high) {
      const mid = Math.floor((low + high + 1) / 2);
      const lineStart = lineOffsets[mid];
      if (lineStart === undefined) break;
      if (lineStart <= offset) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }

    const lineStart = lineOffsets[low];
    if (lineStart === undefined) return undefined;

    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
    const row = low as MultiBufferRow;
    const column = offset - lineStart;

    // Validate the point is within bounds
    if (row >= snap.lineCount) return undefined;

    return { row, column };
  }

  private _selectActiveResult(): void {
    const result = this.activeResult;
    if (!result) return;

    const snap = this._editor.multiBuffer.snapshot();
    const resolved = resolveAnchorRange(snap, result.range);
    if (!resolved) return;

    this._editor.setCursor(resolved.start);
    this._editor.extendSelectionTo(resolved.end);
  }

  private _subscribeToTextChanges(): void {
    if (this._textChangeHandler) return;

    this._textChangeHandler = () => {
      // Re-run search to rebuild anchor-based results
      this._performSearch();
    };

    this._editor.on("textChange", this._textChangeHandler);
  }

  private _unsubscribeFromTextChanges(): void {
    if (!this._textChangeHandler) return;
    this._editor.off("textChange", this._textChangeHandler);
    this._textChangeHandler = null;
  }
}
