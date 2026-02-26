/**
 * Core types for the multibuffer data model.
 *
 * Design principles:
 * - Fixed-height lines for O(1) position calculations
 * - Anchors survive edits (stable positions)
 * - Excerpts are views into buffers, not copies
 */

// =============================================================================
// Primitive Types
// =============================================================================

/** Unique identifier for a buffer */
export type BufferId = string & { readonly __brand: "BufferId" };

/** Unique identifier for an excerpt */
export type ExcerptId = string & { readonly __brand: "ExcerptId" };

/** Zero-based line number within a buffer */
export type BufferRow = number & { readonly __brand: "BufferRow" };

/** Zero-based line number within the multibuffer's unified view */
export type MultiBufferRow = number & { readonly __brand: "MultiBufferRow" };

/** Byte offset within a buffer */
export type BufferOffset = number & { readonly __brand: "BufferOffset" };

/** Byte offset within the multibuffer's unified view */
export type MultiBufferOffset = number & { readonly __brand: "MultiBufferOffset" };

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
// Anchor Types
// =============================================================================

/**
 * Bias determines how an anchor behaves when text is inserted at its position.
 * - Left: anchor stays to the left of inserted text
 * - Right: anchor moves to the right of inserted text
 */
export type Bias = "left" | "right";

/**
 * An anchor is a stable position within a buffer that survives edits.
 * When text is inserted or deleted around an anchor, it adjusts to maintain
 * its logical position relative to surrounding text.
 */
export interface Anchor {
  readonly bufferId: BufferId;
  readonly offset: BufferOffset;
  readonly bias: Bias;
}

/**
 * An anchor within the multibuffer's coordinate space.
 * Combines excerpt identity with buffer-relative anchor.
 */
export interface MultiBufferAnchor {
  readonly excerptId: ExcerptId;
  readonly anchor: Anchor;
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
 * An excerpt is a contiguous range of lines from a buffer,
 * displayed as part of a multibuffer.
 */
export interface ExcerptRange {
  /** The full range to display (includes context lines) */
  readonly context: BufferRange;
  /** The primary/highlighted range within the context */
  readonly primary: BufferRange;
}

/**
 * Metadata for an excerpt within a multibuffer.
 */
export interface ExcerptInfo {
  readonly id: ExcerptId;
  readonly bufferId: BufferId;
  readonly range: ExcerptRange;
  /** Starting row in the multibuffer's unified view */
  readonly startRow: MultiBufferRow;
  /** Ending row (exclusive) in the multibuffer's unified view */
  readonly endRow: MultiBufferRow;
}

// =============================================================================
// Buffer Types
// =============================================================================

/**
 * Immutable snapshot of a buffer's state at a point in time.
 * Used for reading without holding locks.
 */
export interface BufferSnapshot {
  readonly id: BufferId;
  readonly lineCount: number;

  /** Get text of a specific line (without newline) */
  line(row: BufferRow): string;

  /** Get text for a range of lines */
  lines(startRow: BufferRow, endRow: BufferRow): readonly string[];

  /** Get the full text */
  text(): string;

  /** Convert a point to a byte offset */
  pointToOffset(point: BufferPoint): BufferOffset;

  /** Convert a byte offset to a point */
  offsetToPoint(offset: BufferOffset): BufferPoint;
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
 * A multibuffer presents multiple excerpts from one or more buffers
 * as a single unified scrollable view.
 */
export interface MultiBuffer {
  /** Total line count across all excerpts */
  readonly lineCount: number;

  /** All excerpts in display order */
  readonly excerpts: readonly ExcerptInfo[];

  /** Add an excerpt from a buffer */
  addExcerpt(bufferId: BufferId, range: ExcerptRange): ExcerptId;

  /** Remove an excerpt */
  removeExcerpt(excerptId: ExcerptId): void;

  /** Get the excerpt containing a multibuffer row */
  excerptAt(row: MultiBufferRow): ExcerptInfo | undefined;

  /** Convert multibuffer position to buffer position */
  toBufferPoint(point: MultiBufferPoint): { excerpt: ExcerptInfo; point: BufferPoint } | undefined;

  /** Convert buffer position to multibuffer position */
  toMultiBufferPoint(excerptId: ExcerptId, point: BufferPoint): MultiBufferPoint | undefined;

  /** Get visible lines for a row range */
  lines(startRow: MultiBufferRow, endRow: MultiBufferRow): readonly string[];
}

// =============================================================================
// Factory Functions (type definitions only)
// =============================================================================

export type CreateBufferId = () => BufferId;
export type CreateExcerptId = () => ExcerptId;
export type AsBufferRow = (n: number) => BufferRow;
export type AsMultiBufferRow = (n: number) => MultiBufferRow;
export type AsBufferOffset = (n: number) => BufferOffset;
export type AsMultiBufferOffset = (n: number) => MultiBufferOffset;
