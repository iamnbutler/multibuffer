/**
 * Types for the multibuffer data model.
 *
 * Buffer-level types are re-exported from ../buffer/types.ts so that
 * existing imports from "./types.ts" keep working throughout the codebase.
 */

import type {
  BufferId,
  BufferOffset,
  BufferPoint,
  BufferRange,
  BufferRow,
  BufferSnapshot,
  TextSummary,
} from "../buffer/types.ts";
import type { SlotKey } from "./slot_map.ts";

// Re-export all buffer types for backward compatibility
export type {
  Buffer,
  BufferId,
  BufferOffset,
  BufferPoint,
  BufferRange,
  BufferRow,
  BufferSnapshot,
  EditEntry,
  TextSummary,
} from "../buffer/types.ts";
// Bias is both a type and a value (const enum pattern)
export { Bias } from "../buffer/types.ts";

/**
 * Unique identifier for an excerpt.
 * Generational index: stale IDs are detected in O(1) via generation mismatch.
 */
export type ExcerptId = SlotKey & { readonly __brand: "ExcerptId" };

/** Zero-based line number within the multibuffer's unified view */
export type MultiBufferRow = number & { readonly __brand: "MultiBufferRow" };

/** UTF-16 code unit offset within the multibuffer's unified view */
export type MultiBufferOffset = number & {
  readonly __brand: "MultiBufferOffset";
};

/** A position within the multibuffer's unified view */
export interface MultiBufferPoint {
  readonly row: MultiBufferRow;
  readonly column: number;
}

/** A range within the multibuffer */
export interface MultiBufferRange {
  readonly start: MultiBufferPoint;
  readonly end: MultiBufferPoint;
}

/**
 * A buffer-level anchor - stable position within a single buffer.
 * Survives text edits by tracking logical position relative to surrounding text.
 */
export interface BufferAnchor {
  readonly offset: BufferOffset;
  readonly bias: import("../buffer/types.ts").Bias;
  readonly version: number;
}

/**
 * An anchor within the multibuffer's coordinate space.
 */
export interface Anchor {
  readonly excerptId: ExcerptId;
  readonly textAnchor: BufferAnchor;
}

/** An anchor-based range that survives edits */
export interface AnchorRange {
  readonly start: Anchor;
  readonly end: Anchor;
}

/**
 * A selection is an anchor range with a "head" indicating cursor position.
 */
export interface Selection {
  readonly range: AnchorRange;
  readonly head: "start" | "end";
}

/**
 * Range specification for creating an excerpt.
 */
export interface ExcerptRange {
  readonly context: BufferRange;
  readonly primary: BufferRange;
}

/**
 * Internal excerpt state - includes runtime data.
 */
export interface Excerpt {
  readonly id: ExcerptId;
  readonly bufferId: BufferId;
  readonly buffer: BufferSnapshot;
  readonly range: ExcerptRange;
  readonly hasTrailingNewline: boolean;
  readonly editable: boolean;
  readonly textSummary: TextSummary;
}

/**
 * Public excerpt info - what's exposed to consumers.
 */
export interface ExcerptInfo {
  readonly id: ExcerptId;
  readonly bufferId: BufferId;
  readonly range: ExcerptRange;
  readonly startRow: MultiBufferRow;
  readonly endRow: MultiBufferRow;
  readonly hasTrailingNewline: boolean;
  readonly editable: boolean;
}

/**
 * Boundary between excerpts - used for rendering file headers.
 */
export interface ExcerptBoundary {
  readonly row: MultiBufferRow;
  readonly prev: ExcerptInfo | undefined;
  readonly next: ExcerptInfo;
}

/**
 * Immutable snapshot of multibuffer state.
 */
export interface MultiBufferSnapshot {
  readonly lineCount: number;
  readonly excerpts: readonly ExcerptInfo[];
  /** Globally unique version; same version implies same content. Increments on every mutation across all MultiBuffer instances. */
  readonly version: number;
  excerptAt(row: MultiBufferRow): ExcerptInfo | undefined;
  toBufferPoint(
    point: MultiBufferPoint,
  ): { excerpt: ExcerptInfo; point: BufferPoint } | undefined;
  toMultiBufferPoint(
    excerptId: ExcerptId,
    point: BufferPoint,
  ): MultiBufferPoint | undefined;
  lines(startRow: MultiBufferRow, endRow: MultiBufferRow): readonly string[];
  resolveAnchor(anchor: Anchor): MultiBufferPoint | undefined;
  resolveAnchors(anchors: readonly Anchor[]): (MultiBufferPoint | undefined)[];
  /**
   * Resolve anchors that are visible within a viewport row range.
   * Anchors whose excerpt doesn't overlap [startRow, endRow) return undefined
   * without doing the expensive resolution work (edit replay, offset adjustment).
   * Returns same-length array as input to preserve index correspondence.
   */
  resolveAnchorsInViewport(
    anchors: readonly Anchor[],
    startRow: MultiBufferRow,
    endRow: MultiBufferRow,
  ): (MultiBufferPoint | undefined)[];
  clipPoint(point: MultiBufferPoint, bias: import("../buffer/types.ts").Bias): MultiBufferPoint;
  excerptBoundaries(
    startRow: MultiBufferRow,
    endRow: MultiBufferRow,
  ): readonly ExcerptBoundary[];
}

/**
 * Specification for creating a single excerpt in a batch operation.
 */
export interface ExcerptSpec {
  readonly buffer: import("../buffer/types.ts").Buffer;
  readonly range: ExcerptRange;
  readonly options?: { hasTrailingNewline?: boolean; editable?: boolean };
}

/**
 * A multibuffer presents multiple excerpts from one or more buffers
 * as a single unified scrollable view.
 */
export interface MultiBuffer {
  readonly lineCount: number;
  readonly excerpts: readonly ExcerptInfo[];
  readonly isSingleton: boolean;
  snapshot(): MultiBufferSnapshot;
  addExcerpt(
    buffer: import("../buffer/types.ts").Buffer,
    range: ExcerptRange,
    options?: { hasTrailingNewline?: boolean; editable?: boolean },
  ): ExcerptId;
  addExcerpts(specs: readonly ExcerptSpec[]): readonly ExcerptId[];
  removeExcerpt(excerptId: ExcerptId): void;
  clearExcerpts(): readonly ExcerptId[];
  /**
   * Replace all excerpts atomically with a single cache rebuild.
   * More efficient than clearExcerpts() + N×addExcerpt() when adding
   * excerpts from multiple buffers at once (e.g. in DiffController.reDiff()).
   */
  setExcerpts(
    entries: ReadonlyArray<{
      buffer: import("../buffer/types.ts").Buffer;
      range: ExcerptRange;
      options?: { hasTrailingNewline?: boolean; editable?: boolean };
    }>,
  ): readonly ExcerptId[];
  setExcerptsForBuffer(
    buffer: import("../buffer/types.ts").Buffer,
    ranges: readonly ExcerptRange[],
  ): readonly ExcerptId[];
  expandExcerpt(
    excerptId: ExcerptId,
    linesBefore: number,
    linesAfter: number,
  ): void;
  /**
   * Move an excerpt to a new position in display order.
   * `insertBefore` is the ID of the excerpt before which `id` will be inserted.
   * Pass `undefined` to move to the end. No-op if `id` is not found.
   * If `insertBefore` is not found, the excerpt is appended to the end.
   */
  moveExcerpt(id: ExcerptId, insertBefore: ExcerptId | undefined): void;
  createAnchor(point: MultiBufferPoint, bias: import("../buffer/types.ts").Bias): Anchor | undefined;
  edit(start: MultiBufferPoint, end: MultiBufferPoint, text: string): void;
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

/**
 * Internal state for MultiBuffer implementation.
 */
export interface MultiBufferState {
  excerptOrder: ExcerptId[];
  singleton: boolean;
}

export type CreateBufferId = () => BufferId;
export type CreateBuffer = (id: BufferId, text: string) => import("../buffer/types.ts").Buffer;
export type CreateMultiBuffer = () => MultiBuffer;

export type AsBufferRow = (n: number) => BufferRow;
export type AsMultiBufferRow = (n: number) => MultiBufferRow;
export type AsBufferOffset = (n: number) => BufferOffset;
export type AsMultiBufferOffset = (n: number) => MultiBufferOffset;
