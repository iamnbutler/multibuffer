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

class MultiBufferSnapshotImpl implements MultiBufferSnapshot {
  readonly lineCount: number;
  readonly excerpts: readonly ExcerptInfo[];
  private readonly _excerptData: readonly Excerpt[];
  private readonly _buffers: ReadonlyMap<string, Buffer>;
  private readonly _replacedExcerpts: ReadonlyMap<string, ExcerptId>;

  constructor(
    excerpts: readonly ExcerptInfo[],
    excerptData: readonly Excerpt[],
    buffers: ReadonlyMap<string, Buffer>,
    replacedExcerpts: ReadonlyMap<string, ExcerptId>,
  ) {
    this.excerpts = excerpts;
    this._excerptData = excerptData;
    this._buffers = buffers;
    this._replacedExcerpts = replacedExcerpts;
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
    // 1. Follow replacement chain to find the current excerpt ID
    let currentId = anchor.excerptId;
    const maxChainLength = 100; // prevent infinite loops
    for (let i = 0; i < maxChainLength; i++) {
      const key = `${currentId.index}:${currentId.generation}`;
      const replacement = this._replacedExcerpts.get(key);
      if (!replacement) break;
      currentId = replacement;
    }

    // 2. Find the excerpt data
    const initialExcerpt = this._excerptData.find(
      (e) =>
        e.id.index === currentId.index &&
        e.id.generation === currentId.generation,
    );
    if (!initialExcerpt) return undefined;

    // 3. Get the mutable buffer to replay edits since anchor creation
    // biome-ignore lint/plugin/no-type-assertion: expect: BufferId is branded string, Map key is string
    const buffer = this._buffers.get(initialExcerpt.bufferId as string);

    // 4. Compute the adjusted buffer point
    let bufferPoint: BufferPoint;
    if (!buffer) {
      bufferPoint = initialExcerpt.buffer.offsetToPoint(anchor.textAnchor.offset);
    } else {
      const edits = buffer.editsSince(anchor.textAnchor.version);
      const adjustedOffset = adjustOffset(
        anchor.textAnchor.offset,
        anchor.textAnchor.bias,
        edits,
      );
      const currentSnapshot = buffer.snapshot();
      const clampedOffset = currentSnapshot.clipOffset(
        adjustedOffset,
        anchor.textAnchor.bias,
      );
      bufferPoint = currentSnapshot.offsetToPoint(clampedOffset);
    }

    // 5. Find the best excerpt for this buffer point.
    //    Start with the initial excerpt, but if the point falls outside its range,
    //    search other excerpts from the same buffer.
    const resolvedExcerpt = this._findExcerptForBufferPoint(
      bufferPoint,
      initialExcerpt,
    );

    const info = this.excerpts.find(
      (e) =>
        e.id.index === resolvedExcerpt.id.index &&
        e.id.generation === resolvedExcerpt.id.generation,
    );
    if (!info) return undefined;

    return this._bufferPointToMbPoint(bufferPoint, resolvedExcerpt, info);
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

  private _findExcerptForBufferPoint(
    bufferPoint: BufferPoint,
    initialExcerpt: Excerpt,
  ): Excerpt {
    const startRow = initialExcerpt.range.context.start.row;
    const endRow = initialExcerpt.range.context.end.row;
    if (bufferPoint.row >= startRow && bufferPoint.row < endRow) {
      return initialExcerpt;
    }

    // Search other excerpts from the same buffer
    // biome-ignore lint/plugin/no-type-assertion: expect: BufferId is branded string
    const bid = initialExcerpt.bufferId as string;
    for (const alt of this._excerptData) {
      // biome-ignore lint/plugin/no-type-assertion: expect: BufferId is branded string
      if ((alt.bufferId as string) !== bid) continue;
      const altStart = alt.range.context.start.row;
      const altEnd = alt.range.context.end.row;
      if (bufferPoint.row >= altStart && bufferPoint.row < altEnd) {
        return alt;
      }
    }

    // No matching excerpt found; return the initial one (will be clamped)
    return initialExcerpt;
  }

  clipPoint(point: MultiBufferPoint, bias: Bias): MultiBufferPoint {
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
    const bufferPoint = data.buffer.clipPoint(
      // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
      { row: bufferRow as import("./types.ts").BufferRow, column: point.column },
      bias,
    );
    return { row: point.row, column: bufferPoint.column };
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

class MultiBufferImpl implements MultiBuffer {
  private _excerpts = new SlotMap<Excerpt>();
  private _order: ExcerptId[] = [];
  private _cachedInfos: ExcerptInfo[] = [];
  private _cachedLineCount = 0;
  private _buffers = new Map<string, Buffer>();
  private _replacedExcerpts = new Map<string, ExcerptId>();

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
      this._replacedExcerpts,
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
    buffer: Buffer,
    ranges: readonly ExcerptRange[],
  ): readonly ExcerptId[] {
    // biome-ignore lint/plugin/no-type-assertion: expect: BufferId is branded string, Map key is string
    const bufferId = buffer.id as string;
    this._buffers.set(bufferId, buffer);

    // 1. Collect old excerpt IDs for this buffer
    const oldIds: ExcerptId[] = [];
    for (const id of this._order) {
      const exc = this._excerpts.get(id);
      // biome-ignore lint/plugin/no-type-assertion: expect: BufferId is branded string
      if (exc && (exc.bufferId as string) === bufferId) {
        oldIds.push(id);
      }
    }

    // 2. Remove old excerpts
    for (const id of oldIds) {
      this._excerpts.remove(id);
    }
    this._order = this._order.filter((id) => {
      const exc = this._excerpts.get(id);
      return exc !== undefined;
    });

    // 3. Add new excerpts
    const snapshot = buffer.snapshot();
    const newIds: ExcerptId[] = [];
    for (const range of ranges) {
      // biome-ignore lint/plugin/no-type-assertion: expect: SlotMap placeholder insert requires cast; immediately overwritten via set()
      const id = this._excerpts.insert(undefined as unknown as Excerpt) as unknown as ExcerptId;
      const excerpt = createExcerpt(id, snapshot, range, false);
      this._excerpts.set(id, excerpt);
      this._order.push(id);
      newIds.push(id);
    }

    // 4. Build replacement map: each old ID maps to the first new ID
    //    that covers the same buffer region (or the first new ID as fallback)
    if (newIds.length > 0) {
      for (const oldId of oldIds) {
        const key = `${oldId.index}:${oldId.generation}`;
        // biome-ignore lint/plugin/no-type-assertion: expect: newIds[0] is guaranteed non-undefined by length check
        this._replacedExcerpts.set(key, newIds[0] as ExcerptId);
      }
    }

    this._rebuildCache();
    return newIds;
  }

  expandExcerpt(
    excerptId: ExcerptId,
    linesBefore: number,
    linesAfter: number,
  ): void {
    const oldExcerpt = this._excerpts.get(excerptId);
    if (!oldExcerpt) return;

    // Get the mutable buffer to create a fresh snapshot
    // biome-ignore lint/plugin/no-type-assertion: expect: BufferId is branded string
    const buffer = this._buffers.get(oldExcerpt.bufferId as string);
    const snapshot = buffer ? buffer.snapshot() : oldExcerpt.buffer;

    // Compute new range, clamped to buffer bounds
    const oldStart = oldExcerpt.range.context.start.row;
    const oldEnd = oldExcerpt.range.context.end.row;
    // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic
    const newStart = Math.max(0, oldStart - linesBefore) as import("./types.ts").BufferRow;
    // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic
    const newEnd = Math.min(snapshot.lineCount, oldEnd + linesAfter) as import("./types.ts").BufferRow;

    const newRange: ExcerptRange = {
      context: {
        start: { row: newStart, column: 0 },
        end: { row: newEnd, column: 0 },
      },
      primary: oldExcerpt.range.primary,
    };

    const newExcerpt = createExcerpt(
      excerptId,
      snapshot,
      newRange,
      oldExcerpt.hasTrailingNewline,
    );
    this._excerpts.set(excerptId, newExcerpt);
    this._rebuildCache();
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

  edit(start: MultiBufferPoint, end: MultiBufferPoint, text: string): void {
    const snap = this.snapshot();

    // Convert start point to buffer coordinates
    const startBuf = snap.toBufferPoint(start);
    if (!startBuf) return;

    // For same-point edits (insert), reuse the same result
    const endBuf =
      start.row === end.row && start.column === end.column
        ? startBuf
        : snap.toBufferPoint(end);
    if (!endBuf) return;

    // Both points must be in the same buffer
    // biome-ignore lint/plugin/no-type-assertion: expect: BufferId is branded string
    if ((startBuf.excerpt.bufferId as string) !== (endBuf.excerpt.bufferId as string)) return;

    // Get the mutable buffer
    // biome-ignore lint/plugin/no-type-assertion: expect: BufferId is branded string
    const buffer = this._buffers.get(startBuf.excerpt.bufferId as string);
    if (!buffer) return;

    // Convert buffer points to offsets
    const bufSnap = buffer.snapshot();
    const startOffset = bufSnap.pointToOffset(startBuf.point);
    const endOffset = bufSnap.pointToOffset(endBuf.point);

    // Apply the edit
    if (text.length === 0) {
      buffer.delete(startOffset, endOffset);
    } else if (startOffset === endOffset) {
      buffer.insert(startOffset, text);
    } else {
      buffer.replace(startOffset, endOffset, text);
    }

    // Refresh all excerpts from this buffer with new snapshots
    this._refreshExcerptsForBuffer(buffer);
  }

  private _refreshExcerptsForBuffer(buffer: Buffer): void {
    const newSnap = buffer.snapshot();
    // biome-ignore lint/plugin/no-type-assertion: expect: BufferId is branded string
    const bid = buffer.id as string;

    for (const id of this._order) {
      const exc = this._excerpts.get(id);
      // biome-ignore lint/plugin/no-type-assertion: expect: BufferId is branded string
      if (!exc || (exc.bufferId as string) !== bid) continue;

      // Clamp excerpt range to new buffer bounds (edits may change line count)
      // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic for row clamping
      const clampedEndRow = Math.min(
        exc.range.context.end.row,
        newSnap.lineCount,
      ) as import("./types.ts").BufferRow;
      // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic for row clamping
      const clampedStartRow = Math.min(
        exc.range.context.start.row,
        clampedEndRow,
      ) as import("./types.ts").BufferRow;
      const clampedRange: ExcerptRange = {
        context: {
          start: { row: clampedStartRow, column: exc.range.context.start.column },
          end: { row: clampedEndRow, column: exc.range.context.end.column },
        },
        primary: exc.range.primary,
      };

      const refreshed = createExcerpt(id, newSnap, clampedRange, exc.hasTrailingNewline);
      this._excerpts.set(id, refreshed);
    }

    this._rebuildCache();
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

export function createMultiBuffer(): MultiBuffer {
  return new MultiBufferImpl();
}
