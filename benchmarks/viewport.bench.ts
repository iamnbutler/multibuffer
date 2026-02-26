/**
 * Viewport calculation benchmarks.
 *
 * These benchmarks validate the fixed-height line optimization.
 */

import type { BenchmarkSuite } from "./harness.ts";
import type { MultiBufferRow, Measurements, Viewport } from "../src/index.ts";

/**
 * Pure function: calculate visible row range from scroll position.
 * This is the core of our fixed-height optimization.
 */
function calculateVisibleRows(
  scrollTop: number,
  viewportHeight: number,
  lineHeight: number,
  totalLines: number
): { startRow: number; endRow: number } {
  const startRow = Math.floor(scrollTop / lineHeight);
  const visibleLines = Math.ceil(viewportHeight / lineHeight) + 1; // +1 for partial line
  const endRow = Math.min(startRow + visibleLines, totalLines);
  return { startRow, endRow };
}

/**
 * Calculate total content height.
 */
function calculateContentHeight(totalLines: number, lineHeight: number): number {
  return totalLines * lineHeight;
}

/**
 * Convert pixel Y to row number.
 */
function yToRow(y: number, lineHeight: number): number {
  return Math.floor(y / lineHeight);
}

/**
 * Convert row to pixel Y.
 */
function rowToY(row: number, lineHeight: number): number {
  return row * lineHeight;
}

export const viewportBenchmarks: BenchmarkSuite = {
  name: "Viewport Calculations (Fixed Height)",
  benchmarks: [
    {
      name: "Calculate visible rows",
      iterations: 100000,
      targetMs: 0.001, // 1µs - this should be nearly instant
      fn: () => {
        // Simulate scrolling through a 100K line document
        const totalLines = 100_000;
        const lineHeight = 20;
        const viewportHeight = 800;
        const scrollTop = Math.random() * (totalLines * lineHeight - viewportHeight);

        calculateVisibleRows(scrollTop, viewportHeight, lineHeight, totalLines);
      },
    },
    {
      name: "Y to row conversion",
      iterations: 100000,
      targetMs: 0.001,
      fn: () => {
        const lineHeight = 20;
        const y = Math.random() * 10000;
        yToRow(y, lineHeight);
      },
    },
    {
      name: "Row to Y conversion",
      iterations: 100000,
      targetMs: 0.001,
      fn: () => {
        const lineHeight = 20;
        const row = Math.floor(Math.random() * 100000);
        rowToY(row, lineHeight);
      },
    },
    {
      name: "Content height calculation",
      iterations: 100000,
      targetMs: 0.001,
      fn: () => {
        const totalLines = 100_000;
        const lineHeight = 20;
        calculateContentHeight(totalLines, lineHeight);
      },
    },
  ],
};
