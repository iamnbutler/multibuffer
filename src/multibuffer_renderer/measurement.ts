/**
 * Pure viewport calculation functions.
 * All assume fixed-height lines for O(1) position math.
 */

import type { MultiBufferRow } from "../multibuffer/types.ts";
import type { Measurements, Viewport } from "./types.ts";

/** Calculate the visible row range from a scroll position. */
export function calculateVisibleRows(
  scrollTop: number,
  viewportHeight: number,
  lineHeight: number,
  totalLines: number,
): { startRow: MultiBufferRow; endRow: MultiBufferRow } {
  // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
  const startRow = Math.max(0, Math.floor(scrollTop / lineHeight)) as MultiBufferRow;
  const visibleLines = Math.ceil(viewportHeight / lineHeight) + 1;
  // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
  const endRow = Math.min(startRow + visibleLines, totalLines) as MultiBufferRow;
  return { startRow, endRow };
}

/** Total content height in pixels. */
export function calculateContentHeight(
  totalLines: number,
  lineHeight: number,
): number {
  return totalLines * lineHeight;
}

/** Convert a pixel Y coordinate to a row number. */
export function yToRow(y: number, lineHeight: number): MultiBufferRow {
  // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
  return Math.max(0, Math.floor(y / lineHeight)) as MultiBufferRow;
}

/** Convert a row number to a pixel Y coordinate. */
export function rowToY(row: MultiBufferRow, lineHeight: number): number {
  return row * lineHeight;
}

/** Build a Viewport from scroll state and measurements. */
export function createViewport(
  scrollTop: number,
  containerHeight: number,
  containerWidth: number,
  measurements: Measurements,
  totalLines: number,
): Viewport {
  const { startRow, endRow } = calculateVisibleRows(
    scrollTop,
    containerHeight,
    measurements.lineHeight,
    totalLines,
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
