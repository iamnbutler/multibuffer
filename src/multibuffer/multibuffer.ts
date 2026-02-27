/**
 * MultiBuffer: a unified view over multiple excerpts from one or more buffers.
 *
 * Stores excerpts in a SlotMap (generational arena) for O(1) stale key detection.
 * Maintains an ordered list of excerpt IDs for display order.
 * Snapshots are immutable copies of the excerpt list + info.
 */

import { adjustOffset } from "./anchor.ts";
import { createExcerpt, toExcerptInfo } from "./excerpt.ts";
import { SlotMap } from "./slot_map.ts";
import type {
  Anchor,
  Bias,
  Buffer,
  BufferPoint,
  Excerpt,
  ExcerptBoundary,
  ExcerptId,
  ExcerptInfo,
  ExcerptRange,
  MultiBuffer,
  MultiBufferPoint,
  MultiBufferRow,
  MultiBufferSnapshot,
} from "./types.ts";

// =============================================================================
// Snapshot
// =============================================================================

class MultiBufferSnapshotImpl implements MultiBufferSnapshot {
  readonly lineCount: number;
  readonly excerpts: readonly ExcerptInfo[];
  private readonly _excerptData: readonly Excerpt[];
  private readonly _buffers: ReadonlyMap<string, Buffer>;

  constructor(
    excerpts: readonly ExcerptInfo[],
    excerptData: readonly Excerpt[],
    buffers: ReadonlyMap<string, Buffer>,
  ) {
    this.excerpts = excerpts;
    this._excerptData = excerptData;
    this._buffers = buffers;
    let total = 0;
    for (const e of excerpts) {
      total += e.endRow - e.startRow;
    }
    this.lineCount = total;
  }

  excerptAt(row: MultiBufferRow): ExcerptInfo | undefined {
    if (row < 0 || this.excerpts.length === 0) return undefined;

    // Binary search for the excerpt containing this row.
    let lo = 0;
    let hi = this.excerpts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const exc = this.excerpts[mid];
      if (exc && row >= exc.endRow) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }

    const found = this.excerpts[lo];
    if (found && row >= found.startRow && row < found.endRow) {
      return found;
    }
    return undefined;
  }

  toBufferPoint(
    point: MultiBufferPoint,
  ): { excerpt: ExcerptInfo; point: BufferPoint } | undefined {
    const info = this.excerptAt(point.row);
    if (!info) return undefined;

    const offsetInExcerpt = point.row - info.startRow;
    const bufferRow = info.range.context.start.row + offsetInExcerpt;
    return {
      excerpt: info,
      point: {
        // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
        row: bufferRow as import("./types.ts").BufferRow,
        column: point.column,
      },
    };
  }

  toMultiBufferPoint(
    excerptId: ExcerptId,
    point: BufferPoint,
  ): MultiBufferPoint | undefined {
    const info = this.excerpts.find(
      (e) => e.id.index === excerptId.index && e.id.generation === excerptId.generation,
    );
    if (!info) return undefined;

    const startBufferRow = info.range.context.start.row;
    const endBufferRow = info.range.context.end.row;
    if (point.row < startBufferRow || point.row >= endBufferRow) {
      return undefined;
    }

    const offsetInExcerpt = point.row - startBufferRow;
    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
    const mbRow = (info.startRow + offsetInExcerpt) as MultiBufferRow;
    return { row: mbRow, column: point.column };
  }

  lines(startRow: MultiBufferRow, endRow: MultiBufferRow): readonly string[] {
    const clampedEnd = Math.min(endRow, this.lineCount);
    if (startRow >= clampedEnd) return [];

    const result: string[] = [];
    for (let row = startRow; row < clampedEnd; row++) {
      const info = this.excerptAt(
        // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
        row as MultiBufferRow,
      );
      if (!info) continue;

      const offsetInExcerpt = row - info.startRow;
      const bufferRow = info.range.context.start.row + offsetInExcerpt;

      // Find the corresponding excerpt data to access the buffer snapshot.
      const data = this._excerptData.find(
        (e) => e.id.index === info.id.index && e.id.generation === info.id.generation,
      );
      if (data) {
        // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
        result.push(data.buffer.line(bufferRow as import("./types.ts").BufferRow));
      }
    }
    return result;
  }

  resolveAnchor(anchor: Anchor): MultiBufferPoint | undefined {
    // 1. Find the excerpt data and info
    const excerptData = this._excerptData.find(
      (e) =>
        e.id.index === anchor.excerptId.index &&
        e.id.generation === anchor.excerptId.generation,
    );
    if (!excerptData) return undefined;

    const info = this.excerpts.find(
      (e) =>
        e.id.index === anchor.excerptId.index &&
        e.id.generation === anchor.excerptId.generation,
    );
    if (!info) return undefined;

    // 2. Get the mutable buffer to replay edits since anchor creation
    // biome-ignore lint/plugin/no-type-assertion: expect: BufferId is branded string, Map key is string
    const buffer = this._buffers.get(excerptData.bufferId as string);
    if (!buffer) {
      // Fallback: resolve with original offset (no edit adjustment)
      const bufferPoint = excerptData.buffer.offsetToPoint(anchor.textAnchor.offset);
      return this._bufferPointToMbPoint(bufferPoint, excerptData, info);
    }

    // 3. Adjust offset through edits since anchor creation
    const edits = buffer.editsSince(anchor.textAnchor.version);
    const adjustedOffset = adjustOffset(
      anchor.textAnchor.offset,
      anchor.textAnchor.bias,
      edits,
    );

    // 4. Clamp to buffer bounds and convert to point
    const currentSnapshot = buffer.snapshot();
    const clampedOffset = currentSnapshot.clipOffset(
      adjustedOffset,
      anchor.textAnchor.bias,
    );
    const bufferPoint = currentSnapshot.offsetToPoint(clampedOffset);

    return this._bufferPointToMbPoint(bufferPoint, excerptData, info);
  }

  private _bufferPointToMbPoint(
    bufferPoint: BufferPoint,
    excerptData: Excerpt,
    info: ExcerptInfo,
  ): MultiBufferPoint | undefined {
    const startRow = excerptData.range.context.start.row;
    const endRow = excerptData.range.context.end.row;

    if (bufferPoint.row < startRow || bufferPoint.row >= endRow) {
      // Anchor drifted outside excerpt; clamp to boundary
      if (bufferPoint.row < startRow) {
        // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
        return { row: info.startRow as MultiBufferRow, column: 0 };
      }
      // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
      const mbRow = (info.endRow - 1) as MultiBufferRow;
      return { row: mbRow, column: 0 };
    }

    const offsetInExcerpt = bufferPoint.row - startRow;
    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
    const mbRow = (info.startRow + offsetInExcerpt) as MultiBufferRow;
    return { row: mbRow, column: bufferPoint.column };
  }

  clipPoint(point: MultiBufferPoint, _bias: Bias): MultiBufferPoint {
    if (this.lineCount === 0) {
      // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
      return { row: 0 as MultiBufferRow, column: 0 };
    }

    if (point.row >= this.lineCount) {
      // Past end → clamp to end of last line.
      const lastExcerpt = this.excerpts[this.excerpts.length - 1];
      if (!lastExcerpt) {
        // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
        return { row: 0 as MultiBufferRow, column: 0 };
      }
      // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
      const lastRow = (this.lineCount - 1) as MultiBufferRow;
      const data = this._excerptData.find(
        (e) =>
          e.id.index === lastExcerpt.id.index &&
          e.id.generation === lastExcerpt.id.generation,
      );
      if (data) {
        const bufferRow =
          lastExcerpt.range.context.end.row - 1;
        // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
        const lineLen = data.buffer.line(bufferRow as import("./types.ts").BufferRow).length;
        return { row: lastRow, column: lineLen };
      }
      return { row: lastRow, column: 0 };
    }

    if (point.row < 0) {
      // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
      return { row: 0 as MultiBufferRow, column: 0 };
    }

    // Valid row — clip column within the line.
    const info = this.excerptAt(point.row);
    if (!info) return point;

    const data = this._excerptData.find(
      (e) =>
        e.id.index === info.id.index && e.id.generation === info.id.generation,
    );
    if (!data) return point;

    const offsetInExcerpt = point.row - info.startRow;
    const bufferRow = info.range.context.start.row + offsetInExcerpt;
    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
    const lineLen = data.buffer.line(bufferRow as import("./types.ts").BufferRow).length;
    const col = Math.max(0, Math.min(point.column, lineLen));
    return { row: point.row, column: col };
  }

  excerptBoundaries(
    startRow: MultiBufferRow,
    endRow: MultiBufferRow,
  ): readonly ExcerptBoundary[] {
    const boundaries: ExcerptBoundary[] = [];
    for (let i = 0; i < this.excerpts.length; i++) {
      const info = this.excerpts[i];
      if (!info) continue;
      if (info.startRow >= endRow) break;
      if (info.startRow >= startRow) {
        const prev = i > 0 ? this.excerpts[i - 1] : undefined;
        boundaries.push({
          row: info.startRow,
          prev,
          next: info,
        });
      }
    }
    return boundaries;
  }
}

// =============================================================================
// MultiBuffer
// =============================================================================

class MultiBufferImpl implements MultiBuffer {
  private _excerpts = new SlotMap<Excerpt>();
  private _order: ExcerptId[] = [];
  private _cachedInfos: ExcerptInfo[] = [];
  private _cachedLineCount = 0;
  private _buffers = new Map<string, Buffer>();

  get lineCount(): number {
    return this._cachedLineCount;
  }

  get excerpts(): readonly ExcerptInfo[] {
    return this._cachedInfos;
  }

  get isSingleton(): boolean {
    return this._order.length === 1;
  }

  snapshot(): MultiBufferSnapshot {
    // Copy excerpt data for immutability.
    const excerptData: Excerpt[] = [];
    for (const id of this._order) {
      const exc = this._excerpts.get(id);
      if (exc) excerptData.push(exc);
    }
    return new MultiBufferSnapshotImpl(
      this._cachedInfos.slice(),
      excerptData,
      this._buffers,
    );
  }

  addExcerpt(
    buffer: Buffer,
    range: ExcerptRange,
    options?: { hasTrailingNewline?: boolean },
  ): ExcerptId {
    // biome-ignore lint/plugin/no-type-assertion: expect: BufferId is branded string, Map key is string
    this._buffers.set(buffer.id as string, buffer);
    const snapshot = buffer.snapshot();
    const hasTrailing = options?.hasTrailingNewline ?? false;
    // Insert a placeholder to allocate the slot and get the key.
    // biome-ignore lint/plugin/no-type-assertion: expect: SlotMap placeholder insert requires cast; immediately overwritten via set()
    const id = this._excerpts.insert(undefined as unknown as Excerpt) as unknown as ExcerptId;
    // Build the excerpt with its own ID, then set the real value.
    const excerpt = createExcerpt(id, snapshot, range, hasTrailing);
    this._excerpts.set(id, excerpt);
    this._order.push(id);
    this._rebuildCache();
    return id;
  }

  removeExcerpt(excerptId: ExcerptId): void {
    this._excerpts.remove(excerptId);
    this._order = this._order.filter(
      (id) => id.index !== excerptId.index || id.generation !== excerptId.generation,
    );
    this._rebuildCache();
  }

  setExcerptsForBuffer(
    _buffer: Buffer,
    _ranges: readonly ExcerptRange[],
  ): readonly ExcerptId[] {
    // TODO: implement batch replacement with anchor tracking
    return [];
  }

  expandExcerpt(
    _excerptId: ExcerptId,
    _linesBefore: number,
    _linesAfter: number,
  ): void {
    // TODO: implement excerpt expansion
  }

  createAnchor(
    point: MultiBufferPoint,
    bias: Bias,
  ): Anchor | undefined {
    const snap = this.snapshot();
    const bufResult = snap.toBufferPoint(point);
    if (!bufResult) return undefined;

    // Find the internal excerpt data to access the buffer snapshot
    const excerpt = this._excerpts.get(bufResult.excerpt.id);
    if (!excerpt) return undefined;

    const bufferOffset = excerpt.buffer.pointToOffset(bufResult.point);

    // Get the buffer's current version for anchor tracking
    // biome-ignore lint/plugin/no-type-assertion: expect: BufferId is branded string, Map key is string
    const buffer = this._buffers.get(excerpt.bufferId as string);
    const version = buffer?.version ?? excerpt.buffer.version;

    return {
      excerptId: bufResult.excerpt.id,
      textAnchor: {
        offset: bufferOffset,
        bias,
        version,
      },
    };
  }

  excerptAt(row: MultiBufferRow): ExcerptInfo | undefined {
    return this.snapshot().excerptAt(row);
  }

  toBufferPoint(
    point: MultiBufferPoint,
  ): { excerpt: ExcerptInfo; point: BufferPoint } | undefined {
    return this.snapshot().toBufferPoint(point);
  }

  toMultiBufferPoint(
    excerptId: ExcerptId,
    point: BufferPoint,
  ): MultiBufferPoint | undefined {
    return this.snapshot().toMultiBufferPoint(excerptId, point);
  }

  lines(startRow: MultiBufferRow, endRow: MultiBufferRow): readonly string[] {
    return this.snapshot().lines(startRow, endRow);
  }

  /** Rebuild the cached ExcerptInfo array and line count. */
  private _rebuildCache(): void {
    const infos: ExcerptInfo[] = [];
    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
    let currentRow = 0 as MultiBufferRow;
    for (const id of this._order) {
      const exc = this._excerpts.get(id);
      if (!exc) continue;
      const info = toExcerptInfo(exc, currentRow);
      infos.push(info);
      // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
      currentRow = info.endRow as MultiBufferRow;
    }
    this._cachedInfos = infos;
    this._cachedLineCount = currentRow;
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createMultiBuffer(): MultiBuffer {
  return new MultiBufferImpl();
}
