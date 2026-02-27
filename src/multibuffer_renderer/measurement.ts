/**
 * Pure viewport calculation functions.
 * All assume fixed-height lines for O(1) position math.
 * Wrap-aware variants accept a WrapMap for soft-wrapped content.
 */

import type { MultiBufferRow } from "../multibuffer/types.ts";
import type { Measurements, Viewport } from "./types.ts";
import type { WrapMap } from "./wrap-map.ts";

/** Number of extra visual rows to render above and below the viewport. */
const OVERDRAW = 10;

/**
 * Calculate the visible buffer row range from a scroll position.
 * When a WrapMap is provided, accounts for soft-wrapped lines.
 */
export function calculateVisibleRows(
  scrollTop: number,
  viewportHeight: number,
  lineHeight: number,
  totalLines: number,
  wrapMap?: WrapMap,
): { startRow: MultiBufferRow; endRow: MultiBufferRow; startVisualRow: number; endVisualRow: number } {
  if (!wrapMap) {
    // No wrapping: visual row = buffer row
    const visibleStart = Math.floor(scrollTop / lineHeight);
    const visibleLines = Math.ceil(viewportHeight / lineHeight) + 1;
    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
    const startRow = Math.max(0, visibleStart - OVERDRAW) as MultiBufferRow;
    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
    const endRow = Math.min(visibleStart + visibleLines + OVERDRAW, totalLines) as MultiBufferRow;
    return { startRow, endRow, startVisualRow: startRow, endVisualRow: endRow };
  }

  // With wrapping: work in visual rows, then convert to buffer rows
  const totalVisualRows = wrapMap.totalVisualRows;
  const visibleStartVisual = Math.floor(scrollTop / lineHeight);
  const visibleLinesVisual = Math.ceil(viewportHeight / lineHeight) + 1;

  const startVisualRow = Math.max(0, visibleStartVisual - OVERDRAW);
  const endVisualRow = Math.min(visibleStartVisual + visibleLinesVisual + OVERDRAW, totalVisualRows);

  const { mbRow: startRow } = wrapMap.visualRowToBufferRow(startVisualRow);
  const endInfo = wrapMap.visualRowToBufferRow(Math.max(0, endVisualRow - 1));
  // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic
  const endRow = Math.min(endInfo.mbRow + 1, totalLines) as MultiBufferRow;

  return { startRow, endRow, startVisualRow, endVisualRow };
}

/** Total content height in pixels. */
export function calculateContentHeight(
  totalLines: number,
  lineHeight: number,
  wrapMap?: WrapMap,
): number {
  if (wrapMap) {
    return wrapMap.contentHeight(lineHeight);
  }
  return totalLines * lineHeight;
}

/** Convert a pixel Y coordinate to a visual row number. */
export function yToVisualRow(y: number, lineHeight: number): number {
  return Math.max(0, Math.floor(y / lineHeight));
}

/** Convert a pixel Y coordinate to a buffer row number. */
export function yToRow(y: number, lineHeight: number, wrapMap?: WrapMap): MultiBufferRow {
  const visualRow = yToVisualRow(y, lineHeight);
  if (wrapMap) {
    return wrapMap.visualRowToBufferRow(visualRow).mbRow;
  }
  // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
  return visualRow as MultiBufferRow;
}

/** Convert a buffer row to a pixel Y coordinate (top of first visual row). */
export function rowToY(row: MultiBufferRow, lineHeight: number, wrapMap?: WrapMap): number {
  if (wrapMap) {
    return wrapMap.bufferRowToFirstVisualRow(row) * lineHeight;
  }
  return row * lineHeight;
}

/** Build a Viewport from scroll state and measurements. */
export function createViewport(
  scrollTop: number,
  containerHeight: number,
  containerWidth: number,
  measurements: Measurements,
  totalLines: number,
  wrapMap?: WrapMap,
): Viewport {
  const { startRow, endRow } = calculateVisibleRows(
    scrollTop,
    containerHeight,
    measurements.lineHeight,
    totalLines,
    wrapMap,
  );
  return {
    startRow,
    endRow,
    scrollTop,
    height: containerHeight,
    width: containerWidth,
  };
}

/** Convert pixel X coordinate to a column number. */
export function xToColumn(
  x: number,
  measurements: Measurements,
): number {
  return Math.max(0, Math.floor((x - measurements.gutterWidth) / measurements.charWidth));
}
