/**
 * Tile-based dirty region tracking for efficient partial redraws.
 *
 * Divides the viewport into fixed-height tiles (N lines each) and tracks
 * which tiles are dirty. Only dirty tiles need to be redrawn, significantly
 * reducing render cost for large files where edits are localized.
 *
 * Design:
 * - Tiles are identified by their start row (0, 10, 20, ... for 10-line tiles)
 * - Dirty tracking is done via a Set for O(1) lookup/insert
 * - Multiple invalidations per frame are automatically coalesced
 * - Scroll events mark newly visible tiles as dirty
 */

/**
 * Represents a tile in the viewport.
 * Tiles are fixed-height chunks of rows.
 */
export interface Tile {
  /** First row of the tile (inclusive) */
  readonly startRow: number;
  /** Last row of the tile (exclusive) */
  readonly endRow: number;
  /** Whether this tile needs to be redrawn */
  dirty: boolean;
}

/**
 * Reason for marking a tile dirty.
 * Useful for debugging and potential future optimizations.
 */
export type InvalidationReason =
  | "edit" // Text was inserted or deleted
  | "selection" // Selection changed
  | "scroll" // New tile entered viewport
  | "theme" // Theme changed
  | "resize" // Viewport resized
  | "initial"; // Initial render

/**
 * Options for creating a TileManager.
 */
export interface TileManagerOptions {
  /** Number of lines per tile (default: 10) */
  readonly linesPerTile?: number;
  /** Total number of lines in the document */
  readonly totalLines?: number;
}

/**
 * Manages tile-based dirty region tracking for efficient rendering.
 *
 * Usage:
 * 1. Create a TileManager with your desired tile size
 * 2. Call setViewport() when the viewport changes
 * 3. Call markDirty() when content changes
 * 4. Call getDirtyTiles() to get tiles that need redrawing
 * 5. Call clearDirty() after rendering
 */
export class TileManager {
  /** Default number of lines per tile */
  static readonly DEFAULT_LINES_PER_TILE = 10;

  private readonly _linesPerTile: number;
  private _totalLines: number;
  private _viewportStartRow: number;
  private _viewportEndRow: number;

  /** Set of dirty tile start rows */
  private readonly _dirtyTiles: Set<number>;

  /** Tracks if any invalidation happened this frame (for coalescing) */
  private _frameInvalidationCount: number;

  constructor(options: TileManagerOptions = {}) {
    this._linesPerTile = options.linesPerTile ?? TileManager.DEFAULT_LINES_PER_TILE;
    this._totalLines = options.totalLines ?? 0;
    this._viewportStartRow = 0;
    this._viewportEndRow = 0;
    this._dirtyTiles = new Set();
    this._frameInvalidationCount = 0;
  }

  /** Number of lines per tile */
  get linesPerTile(): number {
    return this._linesPerTile;
  }

  /** Total number of lines in the document */
  get totalLines(): number {
    return this._totalLines;
  }

  /** Current viewport start row */
  get viewportStartRow(): number {
    return this._viewportStartRow;
  }

  /** Current viewport end row */
  get viewportEndRow(): number {
    return this._viewportEndRow;
  }

  /** Number of dirty tiles */
  get dirtyCount(): number {
    return this._dirtyTiles.size;
  }

  /** Number of invalidations this frame (before clearDirty) */
  get frameInvalidationCount(): number {
    return this._frameInvalidationCount;
  }

  /**
   * Update the total number of lines in the document.
   * Call this when the document changes size.
   */
  setTotalLines(totalLines: number): void {
    this._totalLines = totalLines;
  }

  /**
   * Update the visible viewport range.
   * Automatically marks newly visible tiles as dirty.
   *
   * @param startRow First visible row (inclusive)
   * @param endRow Last visible row (exclusive)
   */
  setViewport(startRow: number, endRow: number): void {
    const prevStart = this._viewportStartRow;
    const prevEnd = this._viewportEndRow;

    this._viewportStartRow = startRow;
    this._viewportEndRow = endRow;

    // Mark newly visible tiles as dirty
    // Tiles that were not in the previous viewport need to be drawn
    if (prevStart !== startRow || prevEnd !== endRow) {
      this._markNewlyVisibleTilesDirty(prevStart, prevEnd, startRow, endRow);
    }
  }

  /**
   * Mark tiles as dirty that overlap with the given row range.
   *
   * @param startRow First affected row (inclusive)
   * @param endRow Last affected row (exclusive)
   * @param _reason Optional reason for the invalidation (for debugging)
   */
  markDirty(startRow: number, endRow: number, _reason?: InvalidationReason): void {
    if (startRow >= endRow) return;

    const tileStart = this._rowToTileStart(startRow);
    const tileEnd = this._rowToTileStart(endRow - 1);

    for (let tile = tileStart; tile <= tileEnd; tile += this._linesPerTile) {
      this._dirtyTiles.add(tile);
      this._frameInvalidationCount++;
    }
  }

  /**
   * Mark a single row as dirty.
   * Convenience method for single-character edits.
   */
  markRowDirty(row: number, _reason?: InvalidationReason): void {
    this.markDirty(row, row + 1, _reason);
  }

  /**
   * Mark all visible tiles as dirty.
   * Use this for theme changes, resize, or initial render.
   */
  markAllDirty(reason?: InvalidationReason): void {
    this.markDirty(this._viewportStartRow, this._viewportEndRow, reason);
  }

  /**
   * Mark the entire document as dirty.
   * Use this when the document content completely changes.
   */
  markDocumentDirty(reason?: InvalidationReason): void {
    this.markDirty(0, this._totalLines, reason);
  }

  /**
   * Check if a specific row is in a dirty tile.
   */
  isRowDirty(row: number): boolean {
    const tileStart = this._rowToTileStart(row);
    return this._dirtyTiles.has(tileStart);
  }

  /**
   * Check if a tile (identified by its start row) is dirty.
   */
  isTileDirty(tileStartRow: number): boolean {
    return this._dirtyTiles.has(tileStartRow);
  }

  /**
   * Get all dirty tiles that overlap with the current viewport.
   * Returns tiles sorted by start row.
   */
  getDirtyTiles(): Tile[] {
    const result: Tile[] = [];
    const viewportTileStart = this._rowToTileStart(this._viewportStartRow);
    const viewportTileEnd = this._rowToTileStart(this._viewportEndRow - 1);

    for (let tileStart = viewportTileStart; tileStart <= viewportTileEnd; tileStart += this._linesPerTile) {
      if (this._dirtyTiles.has(tileStart)) {
        result.push({
          startRow: tileStart,
          endRow: Math.min(tileStart + this._linesPerTile, this._totalLines),
          dirty: true,
        });
      }
    }

    return result;
  }

  /**
   * Get all tiles in the current viewport, with their dirty state.
   */
  getVisibleTiles(): Tile[] {
    const result: Tile[] = [];
    const viewportTileStart = this._rowToTileStart(this._viewportStartRow);
    const viewportTileEnd = this._rowToTileStart(Math.max(0, this._viewportEndRow - 1));

    for (let tileStart = viewportTileStart; tileStart <= viewportTileEnd; tileStart += this._linesPerTile) {
      result.push({
        startRow: tileStart,
        endRow: Math.min(tileStart + this._linesPerTile, this._totalLines),
        dirty: this._dirtyTiles.has(tileStart),
      });
    }

    return result;
  }

  /**
   * Clear the dirty flag for a specific tile.
   * Call this after rendering a tile.
   */
  clearTileDirty(tileStartRow: number): void {
    this._dirtyTiles.delete(tileStartRow);
  }

  /**
   * Clear all dirty flags.
   * Call this after a complete render pass.
   */
  clearDirty(): void {
    this._dirtyTiles.clear();
    this._frameInvalidationCount = 0;
  }

  /**
   * Calculate the start row of the tile containing the given row.
   */
  private _rowToTileStart(row: number): number {
    return Math.floor(row / this._linesPerTile) * this._linesPerTile;
  }

  /**
   * Mark tiles that are newly visible (entered the viewport) as dirty.
   */
  private _markNewlyVisibleTilesDirty(
    prevStart: number,
    prevEnd: number,
    newStart: number,
    newEnd: number,
  ): void {
    // Mark tiles that are in the new viewport but weren't in the old one
    const newTileStart = this._rowToTileStart(newStart);
    const newTileEnd = this._rowToTileStart(Math.max(0, newEnd - 1));
    const prevTileStart = this._rowToTileStart(prevStart);
    const prevTileEnd = this._rowToTileStart(Math.max(0, prevEnd - 1));

    for (let tile = newTileStart; tile <= newTileEnd; tile += this._linesPerTile) {
      // Only mark as dirty if this tile wasn't visible before
      if (tile < prevTileStart || tile > prevTileEnd) {
        this._dirtyTiles.add(tile);
        this._frameInvalidationCount++;
      }
    }
  }
}

/**
 * Create a TileManager with the given options.
 */
export function createTileManager(options: TileManagerOptions = {}): TileManager {
  return new TileManager(options);
}

/**
 * Helper to mark tiles dirty based on a text edit operation.
 * Handles the case where an edit might affect multiple rows
 * (e.g., inserting or deleting newlines).
 *
 * @param tileManager The TileManager to update
 * @param editRow The row where the edit occurred
 * @param oldLineCount Number of lines before the edit
 * @param newLineCount Number of lines after the edit
 */
export function markEditDirty(
  tileManager: TileManager,
  editRow: number,
  oldLineCount: number,
  newLineCount: number,
): void {
  const lineDelta = newLineCount - oldLineCount;

  if (lineDelta === 0) {
    // Single-line edit - only mark that row's tile
    tileManager.markRowDirty(editRow, "edit");
  } else if (lineDelta > 0) {
    // Lines were added - mark from edit point to end of new content
    // All content after the edit is shifted down
    tileManager.markDirty(editRow, tileManager.totalLines, "edit");
  } else {
    // Lines were deleted - mark from edit point to where old content ended
    // All content after the edit is shifted up
    tileManager.markDirty(editRow, tileManager.totalLines, "edit");
  }
}

/**
 * Helper to mark tiles dirty based on selection change.
 * Optimized to only mark tiles that are actually affected.
 *
 * @param tileManager The TileManager to update
 * @param oldStart Old selection start row (or undefined if no previous selection)
 * @param oldEnd Old selection end row (or undefined if no previous selection)
 * @param newStart New selection start row
 * @param newEnd New selection end row
 */
export function markSelectionDirty(
  tileManager: TileManager,
  oldStart: number | undefined,
  oldEnd: number | undefined,
  newStart: number,
  newEnd: number,
): void {
  // If there was no previous selection, mark the new selection
  if (oldStart === undefined || oldEnd === undefined) {
    tileManager.markDirty(newStart, newEnd + 1, "selection");
    return;
  }

  // Normalize ranges (ensure start <= end)
  const prevMin = Math.min(oldStart, oldEnd);
  const prevMax = Math.max(oldStart, oldEnd);
  const newMin = Math.min(newStart, newEnd);
  const newMax = Math.max(newStart, newEnd);

  // Mark the symmetric difference (rows that changed selection state)
  // This is more efficient than marking the union
  if (prevMin !== newMin || prevMax !== newMax) {
    // Mark rows that were selected but aren't anymore
    if (prevMin < newMin) {
      tileManager.markDirty(prevMin, Math.min(prevMax + 1, newMin), "selection");
    }
    if (prevMax > newMax) {
      tileManager.markDirty(Math.max(prevMin, newMax + 1), prevMax + 1, "selection");
    }
    // Mark rows that are newly selected
    if (newMin < prevMin) {
      tileManager.markDirty(newMin, Math.min(newMax + 1, prevMin), "selection");
    }
    if (newMax > prevMax) {
      tileManager.markDirty(Math.max(newMin, prevMax + 1), newMax + 1, "selection");
    }
  }
}
