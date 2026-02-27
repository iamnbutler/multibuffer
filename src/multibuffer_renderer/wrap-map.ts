/**
 * WrapMap: maps buffer rows ↔ visual rows for soft-wrapped text.
 *
 * Uses a prefix sum array for O(1) buffer-row → visual-row conversion
 * and binary search for O(log n) visual-row → buffer-row conversion.
 */

import type { MultiBufferRow, MultiBufferSnapshot } from "../multibuffer/types.ts";

/** Split a line into segments at a fixed character width. */
export function wrapLine(text: string, wrapWidth: number): string[] {
  if (wrapWidth <= 0 || text.length <= wrapWidth) {
    return [text];
  }
  const segments: string[] = [];
  for (let i = 0; i < text.length; i += wrapWidth) {
    segments.push(text.slice(i, i + wrapWidth));
  }
  return segments;
}

export class WrapMap {
  /** prefix[i] = total visual rows for buffer rows 0..i-1. prefix[0] = 0. */
  private _prefix: Uint32Array;
  private _wrapWidth: number;
  readonly totalVisualRows: number;

  constructor(snapshot: MultiBufferSnapshot, wrapWidth: number) {
    this._wrapWidth = wrapWidth;
    const lineCount = snapshot.lineCount;

    // Build prefix sum
    this._prefix = new Uint32Array(lineCount + 1);
    this._prefix[0] = 0;

    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction for iteration
    const startRow = 0 as MultiBufferRow;
    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction for iteration
    const endRow = lineCount as MultiBufferRow;
    const lines = snapshot.lines(startRow, endRow);

    for (let i = 0; i < lineCount; i++) {
      const line = lines[i] ?? "";
      const visualRows = this._visualRowsForLength(line.length);
      this._prefix[i + 1] = (this._prefix[i] ?? 0) + visualRows;
    }

    this.totalVisualRows = this._prefix[lineCount] ?? 0;
  }

  /** How many visual rows does a buffer row occupy? */
  visualRowsForLine(mbRow: MultiBufferRow): number {
    const next = this._prefix[mbRow + 1];
    const curr = this._prefix[mbRow];
    if (next === undefined || curr === undefined) return 1;
    return next - curr;
  }

  /** First visual row for a given buffer row. O(1). */
  bufferRowToFirstVisualRow(mbRow: MultiBufferRow): number {
    return this._prefix[mbRow] ?? 0;
  }

  /** Convert a visual row to { buffer row, segment index }. O(log n). */
  visualRowToBufferRow(visualRow: number): { mbRow: MultiBufferRow; segment: number } {
    // Binary search: find largest i where prefix[i] <= visualRow
    let lo = 0;
    let hi = this._prefix.length - 2; // last valid buffer row index
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((this._prefix[mid] ?? 0) <= visualRow) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    const segment = visualRow - (this._prefix[lo] ?? 0);
    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
    return { mbRow: lo as MultiBufferRow, segment };
  }

  /** Total content height in pixels. */
  contentHeight(lineHeight: number): number {
    return this.totalVisualRows * lineHeight;
  }

  get wrapWidth(): number {
    return this._wrapWidth;
  }

  private _visualRowsForLength(length: number): number {
    if (this._wrapWidth <= 0 || length <= this._wrapWidth) return 1;
    return Math.ceil(length / this._wrapWidth);
  }
}
