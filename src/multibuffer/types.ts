/**
 * Core types for the multibuffer data model.
 *
 * Design principles:
 * - Fixed-height lines for O(1) position calculations
 * - Anchors survive edits (stable positions)
 * - Excerpts are views into buffers, not copies
 */

import type { SlotKey } from "./slot_map.ts";

// =============================================================================
// Primitive Types
// =============================================================================

/** Unique identifier for a buffer */
export type BufferId = string & { readonly __brand: "BufferId" };

/**
 * Unique identifier for an excerpt.
 * Generational index: stale IDs are detected in O(1) via generation mismatch.
 */
export type ExcerptId = SlotKey & { readonly __brand: "ExcerptId" };

/** Zero-based line number within a buffer */
export type BufferRow = number & { readonly __brand: "BufferRow" };

/** Zero-based line number within the multibuffer's unified view */
export type MultiBufferRow = number & { readonly __brand: "MultiBufferRow" };

/** Byte offset within a buffer */
export type BufferOffset = number & { readonly __brand: "BufferOffset" };

/** Byte offset within the multibuffer's unified view */
export type MultiBufferOffset = number & {
  readonly __brand: "MultiBufferOffset";
};

// =============================================================================
// Bias Type
// =============================================================================

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

// =============================================================================
// Position Types
// =============================================================================

/** A position within a buffer (row + column) */
export interface BufferPoint {
  readonly row: BufferRow;
  readonly column: number;
}

/** A position within the multibuffer's unified view */
export interface MultiBufferPoint {
  readonly row: MultiBufferRow;
  readonly column: number;
}

// =============================================================================
// Text Summary Types
// =============================================================================

/**
 * Aggregated metrics for a span of text.
 * Cached per-excerpt for O(1) lookups during position calculations.
 *
 * Used in the 3-layer position translation model:
 * MultiBuffer → Excerpt → Buffer
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

// =============================================================================
// Anchor Types
// =============================================================================

/**
 * A buffer-level anchor - stable position within a single buffer.
 * Survives text edits by tracking logical position relative to surrounding text.
 */
export interface BufferAnchor {
  /** Byte offset at time of creation */
  readonly offset: BufferOffset;
  /** Determines behavior when text is inserted at this position */
  readonly bias: Bias;
}

/**
 * An anchor within the multibuffer's coordinate space.
 * This is the primary anchor type for external use.
 *
 * Combines:
 * - excerptId: Which excerpt (survives excerpt replacement via replaced_excerpts map)
 * - textAnchor: Position within the buffer (survives text edits)
 *
 * Resolution flow:
 * 1. Follow replaced_excerpts chain to current excerpt ID
 * 2. Look up excerpt to get buffer reference
 * 3. Resolve textAnchor within buffer to get current offset
 * 4. Convert buffer position to multibuffer position
 */
export interface Anchor {
  readonly excerptId: ExcerptId;
  readonly textAnchor: BufferAnchor;
}

// =============================================================================
// Range Types
// =============================================================================

/** A range within a buffer */
export interface BufferRange {
  readonly start: BufferPoint;
  readonly end: BufferPoint;
}

/** A range within the multibuffer */
export interface MultiBufferRange {
  readonly start: MultiBufferPoint;
  readonly end: MultiBufferPoint;
}

/** An anchor-based range that survives edits */
export interface AnchorRange {
  readonly start: Anchor;
  readonly end: Anchor;
}

// =============================================================================
// Selection Types
// =============================================================================

/**
 * A selection is an anchor range with a "head" indicating cursor position.
 * The head can be at either end of the range depending on selection direction.
 */
export interface Selection {
  readonly range: AnchorRange;
  /** Which end of the range the cursor is at */
  readonly head: "start" | "end";
}

// =============================================================================
// Excerpt Types
// =============================================================================

/**
 * Range specification for creating an excerpt.
 * Context is the full visible range, primary is the highlighted portion.
 */
export interface ExcerptRange {
  /** The full range to display (includes context lines) */
  readonly context: BufferRange;
  /** The primary/highlighted range within the context */
  readonly primary: BufferRange;
}

/**
 * Internal excerpt state - includes runtime data.
 * This is what's stored in the MultiBuffer.
 */
export interface Excerpt {
  readonly id: ExcerptId;
  readonly bufferId: BufferId;
  /** Reference to buffer snapshot - NOT a copy of the text */
  readonly buffer: BufferSnapshot;
  /** Range within the buffer this excerpt displays */
  readonly range: ExcerptRange;
  /**
   * GOTCHA: Synthetic trailing newline flag.
   * When true, the excerpt has an added newline after its last line.
   * This affects position calculations - must subtract 1 from end position.
   */
  readonly hasTrailingNewline: boolean;
  /** Cached text summary for this excerpt */
  readonly textSummary: TextSummary;
}

/**
 * Public excerpt info - what's exposed to consumers.
 * Omits internal buffer reference.
 */
export interface ExcerptInfo {
  readonly id: ExcerptId;
  readonly bufferId: BufferId;
  readonly range: ExcerptRange;
  /** Starting row in the multibuffer's unified view */
  readonly startRow: MultiBufferRow;
  /** Ending row (exclusive) in the multibuffer's unified view */
  readonly endRow: MultiBufferRow;
  /** Whether this excerpt has a synthetic trailing newline */
  readonly hasTrailingNewline: boolean;
}

/**
 * Boundary between excerpts - used for rendering file headers.
 */
export interface ExcerptBoundary {
  /** The row where this boundary appears */
  readonly row: MultiBufferRow;
  /** Previous excerpt (undefined if this is the first) */
  readonly prev: ExcerptInfo | undefined;
  /** Next excerpt */
  readonly next: ExcerptInfo;
}

// =============================================================================
// Buffer Types
// =============================================================================

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

  /** Convert a point to a byte offset */
  pointToOffset(point: BufferPoint): BufferOffset;

  /** Convert a byte offset to a point */
  offsetToPoint(offset: BufferOffset): BufferPoint;

  /**
   * Clip a point to valid buffer bounds, respecting bias.
   *
   * GOTCHA: Must preserve bias semantics:
   * - Bias.Left: prefer position before boundary
   * - Bias.Right: prefer position at/after boundary
   *
   * Example: clipPoint({row: 5, column: 10}, Bias.Right) on a 3-char line
   * should return {row: 5, column: 3} (end of line), not {row: 5, column: 2}
   */
  clipPoint(point: BufferPoint, bias: Bias): BufferPoint;

  /**
   * Clip an offset to valid buffer bounds, respecting bias.
   */
  clipOffset(offset: BufferOffset, bias: Bias): BufferOffset;
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
}

// =============================================================================
// MultiBuffer Types
// =============================================================================

/**
 * Immutable snapshot of multibuffer state.
 * Allows reading without mutation concerns.
 */
export interface MultiBufferSnapshot {
  /** Total line count across all excerpts */
  readonly lineCount: number;

  /** All excerpts in display order */
  readonly excerpts: readonly ExcerptInfo[];

  /** Get the excerpt containing a multibuffer row (binary search) */
  excerptAt(row: MultiBufferRow): ExcerptInfo | undefined;

  /** Convert multibuffer position to buffer position */
  toBufferPoint(
    point: MultiBufferPoint,
  ): { excerpt: ExcerptInfo; point: BufferPoint } | undefined;

  /** Convert buffer position to multibuffer position */
  toMultiBufferPoint(
    excerptId: ExcerptId,
    point: BufferPoint,
  ): MultiBufferPoint | undefined;

  /** Get lines for a row range [startRow, endRow) */
  lines(startRow: MultiBufferRow, endRow: MultiBufferRow): readonly string[];

  /** Resolve an anchor to its current position, or undefined if stale. */
  resolveAnchor(anchor: Anchor): MultiBufferPoint | undefined;

  /**
   * Clip a point to valid multibuffer bounds, respecting bias.
   */
  clipPoint(point: MultiBufferPoint, bias: Bias): MultiBufferPoint;

  /**
   * Get excerpt boundaries visible in a row range.
   * Used for rendering file headers between excerpts.
   */
  excerptBoundaries(
    startRow: MultiBufferRow,
    endRow: MultiBufferRow,
  ): readonly ExcerptBoundary[];
}

/**
 * A multibuffer presents multiple excerpts from one or more buffers
 * as a single unified scrollable view.
 */
export interface MultiBuffer {
  /** Total line count across all excerpts */
  readonly lineCount: number;

  /** All excerpts in display order */
  readonly excerpts: readonly ExcerptInfo[];

  /**
   * Optimization flag: true if this contains exactly one buffer and one excerpt.
   * When true, position conversion can skip tree traversal.
   *
   * GOTCHA: If this flag is wrong, ALL position lookups fail.
   * Must be maintained correctly on every add/remove.
   */
  readonly isSingleton: boolean;

  /** Get an immutable snapshot of current state */
  snapshot(): MultiBufferSnapshot;

  /**
   * Add an excerpt from a buffer.
   * Returns the new excerpt's ID (monotonically increasing, never reused).
   */
  addExcerpt(
    buffer: Buffer,
    range: ExcerptRange,
    options?: { hasTrailingNewline?: boolean },
  ): ExcerptId;

  /**
   * Remove an excerpt.
   * CRITICAL: Updates startRow for all subsequent excerpts.
   */
  removeExcerpt(excerptId: ExcerptId): void;

  /**
   * Replace all excerpts for a buffer path.
   * Batch operation that tracks replaced_excerpts for anchor survival.
   */
  setExcerptsForBuffer(
    buffer: Buffer,
    ranges: readonly ExcerptRange[],
  ): readonly ExcerptId[];

  /**
   * Expand an excerpt by adding context lines.
   * Must not exceed buffer bounds.
   */
  expandExcerpt(
    excerptId: ExcerptId,
    linesBefore: number,
    linesAfter: number,
  ): void;

  /**
   * Create an anchor at a position.
   */
  createAnchor(point: MultiBufferPoint, bias: Bias): Anchor | undefined;

  // Delegated to snapshot for convenience
  excerptAt(row: MultiBufferRow): ExcerptInfo | undefined;
  toBufferPoint(
    point: MultiBufferPoint,
  ): { excerpt: ExcerptInfo; point: BufferPoint } | undefined;
  toMultiBufferPoint(
    excerptId: ExcerptId,
    point: BufferPoint,
  ): MultiBufferPoint | undefined;
  lines(startRow: MultiBufferRow, endRow: MultiBufferRow): readonly string[];
}

// =============================================================================
// Internal State Types (for implementation)
// =============================================================================

/**
 * Internal state for MultiBuffer implementation.
 */
export interface MultiBufferState {
  /** Excerpt IDs in display order */
  excerptOrder: ExcerptId[];

  /** True when exactly one buffer and one excerpt */
  singleton: boolean;
}

// =============================================================================
// Factory Functions (type definitions only)
// =============================================================================

export type CreateBufferId = () => BufferId;
export type CreateBuffer = (id: BufferId, text: string) => Buffer;
export type CreateMultiBuffer = () => MultiBuffer;

// Branded type constructors
export type AsBufferRow = (n: number) => BufferRow;
export type AsMultiBufferRow = (n: number) => MultiBufferRow;
export type AsBufferOffset = (n: number) => BufferOffset;
export type AsMultiBufferOffset = (n: number) => MultiBufferOffset;
