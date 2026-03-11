/**
 * Core types for single-buffer text storage.
 *
 * These types have no dependency on multibuffer concepts (excerpts, anchors).
 */

/** Unique identifier for a buffer */
export type BufferId = string & { readonly __brand: "BufferId" };

/** Zero-based line number within a buffer */
export type BufferRow = number & { readonly __brand: "BufferRow" };

/** UTF-16 code unit offset within a buffer */
export type BufferOffset = number & { readonly __brand: "BufferOffset" };

/**
 * Bias determines behavior at position boundaries.
 *
 * For anchors:
 * - Left: anchor stays to the left of inserted text
 * - Right: anchor moves to the right of inserted text
 *
 * For clipping:
 * - Left: clip to position before boundary
 * - Right: clip to position at/after boundary
 *
 * GOTCHA: Clipping MUST preserve bias. clip_point(Point(5,3), Bias.Right)
 * on a 2-char line must clip to end-of-line, preserving right bias.
 */
export const Bias = {
  Left: 0,
  Right: 1,
} as const;

export type Bias = (typeof Bias)[keyof typeof Bias];

/** A position within a buffer (row + column) */
export interface BufferPoint {
  readonly row: BufferRow;
  readonly column: number;
}

/** A range within a buffer */
export interface BufferRange {
  readonly start: BufferPoint;
  readonly end: BufferPoint;
}

/**
 * Aggregated metrics for a span of text.
 * Cached per-excerpt for O(1) lookups during position calculations.
 */
export interface TextSummary {
  /** Total number of lines (including partial last line) */
  readonly lines: number;
  /** Total byte count */
  readonly bytes: number;
  /** Length of the last line (for column calculations) */
  readonly lastLineLength: number;
  /** Total character count (may differ from bytes for unicode) */
  readonly chars: number;
}

/**
 * A single buffer edit, recorded for anchor offset adjustment.
 * All offsets are in pre-edit buffer coordinates.
 */
export interface EditEntry {
  /** UTF-16 code unit offset where the edit starts (in pre-edit buffer) */
  readonly offset: BufferOffset;
  /** Number of UTF-16 code units deleted at that offset */
  readonly deletedLength: number;
  /** Number of UTF-16 code units inserted at that offset */
  readonly insertedLength: number;
}

/**
 * Immutable snapshot of a buffer's state at a point in time.
 * Used for reading without mutation concerns.
 *
 * Snapshots survive buffer mutations - the original snapshot remains valid
 * while new snapshots reflect the new state.
 */
export interface BufferSnapshot {
  readonly id: BufferId;
  readonly lineCount: number;
  readonly textSummary: TextSummary;

  /** Get text of a specific line (without newline) */
  line(row: BufferRow): string;

  /** Get text for a range of lines [startRow, endRow) */
  lines(startRow: BufferRow, endRow: BufferRow): readonly string[];

  /** Get the full text */
  text(): string;

  /** Convert a point to a UTF-16 code unit offset */
  pointToOffset(point: BufferPoint): BufferOffset;

  /** Convert a UTF-16 code unit offset to a point */
  offsetToPoint(offset: BufferOffset): BufferPoint;

  /**
   * Clip a point to valid buffer bounds, respecting bias.
   *
   * GOTCHA: Must preserve bias semantics:
   * - Bias.Left: prefer position before boundary
   * - Bias.Right: prefer position at/after boundary
   */
  clipPoint(point: BufferPoint, bias: Bias): BufferPoint;

  /**
   * Clip an offset to valid buffer bounds, respecting bias.
   */
  clipOffset(offset: BufferOffset, bias: Bias): BufferOffset;

  /** The buffer version at the time this snapshot was taken */
  readonly version: number;
}

/**
 * A mutable buffer representing a single file's contents.
 */
export interface Buffer {
  readonly id: BufferId;

  /** Get an immutable snapshot of current state */
  snapshot(): BufferSnapshot;

  /** Insert text at a position */
  insert(offset: BufferOffset, text: string): void;

  /** Delete a range of text */
  delete(start: BufferOffset, end: BufferOffset): void;

  /** Replace a range with new text */
  replace(start: BufferOffset, end: BufferOffset, text: string): void;

  /** Monotonically increasing edit counter */
  readonly version: number;

  /** Return all edits since the given version */
  editsSince(version: number): readonly EditEntry[];
}
