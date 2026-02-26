/**
 * MultiBuffer benchmarks.
 *
 * Key performance targets from research:
 * - excerptAt: O(log n) via binary search
 * - Visible lines fetch: <1ms for viewport
 * - Anchor resolution: batch optimization via cursor reuse
 * - 100 excerpts: <10ms initialization
 */

import type { BenchmarkSuite } from "./harness.ts";

// TODO: Import actual implementation once created
// import { createMultiBuffer, createBuffer } from "../src/multibuffer/index.ts";

function generateText(lines: number): string {
  return Array.from(
    { length: lines },
    (_, i) => `Line ${i + 1}: Some text content here`
  ).join("\n");
}

export const multibufferBenchmarks: BenchmarkSuite = {
  name: "MultiBuffer Operations",
  benchmarks: [
    // Uncomment when implementation exists:
    // {
    //   name: "Add 100 excerpts",
    //   iterations: 100,
    //   targetMs: 10,
    //   fn: () => {
    //     const mb = createMultiBuffer();
    //     const buffer = createBuffer("test", generateText(1000));
    //     for (let i = 0; i < 100; i++) {
    //       mb.addExcerpt(buffer, {
    //         context: { start: { row: i * 10, column: 0 }, end: { row: (i + 1) * 10, column: 0 } },
    //         primary: { start: { row: i * 10, column: 0 }, end: { row: (i + 1) * 10, column: 0 } },
    //       });
    //     }
    //   },
    // },
    // {
    //   name: "excerptAt lookup (1000 excerpts) - should be O(log n)",
    //   iterations: 10000,
    //   targetMs: 0.01, // 10µs - binary search should be ~10 comparisons
    //   setup: () => {
    //     // Create multibuffer with 1000 excerpts
    //   },
    //   fn: () => {
    //     // Random lookup - should be consistent time regardless of position
    //     const row = Math.floor(Math.random() * totalRows);
    //     mb.excerptAt(row);
    //   },
    // },
    // {
    //   name: "excerptAt at different positions (verify O(log n))",
    //   iterations: 1000,
    //   targetMs: 0.01,
    //   fn: () => {
    //     // Lookup at start, middle, end - times should be similar
    //     mb.excerptAt(0);
    //     mb.excerptAt(totalRows / 2);
    //     mb.excerptAt(totalRows - 1);
    //   },
    // },
    // {
    //   name: "Fetch 50 lines (viewport)",
    //   iterations: 1000,
    //   targetMs: 1,
    //   fn: () => {
    //     const startRow = Math.floor(Math.random() * (totalRows - 50));
    //     mb.lines(startRow, startRow + 50);
    //   },
    // },
    // {
    //   name: "Position conversion - toBufferPoint",
    //   iterations: 10000,
    //   targetMs: 0.01,
    //   fn: () => {
    //     const row = Math.floor(Math.random() * totalRows);
    //     mb.toBufferPoint({ row, column: 5 });
    //   },
    // },
    // {
    //   name: "Anchor resolution - single",
    //   iterations: 10000,
    //   targetMs: 0.01,
    //   fn: () => {
    //     snapshot.resolveAnchor(anchor);
    //   },
    // },
    // {
    //   name: "Anchor resolution - batch 100 sorted",
    //   iterations: 100,
    //   targetMs: 1,
    //   fn: () => {
    //     // PERF: Batch should reuse cursor state
    //     // Sequential anchors use seek_forward (O(k)) not seek (O(log n))
    //     for (const anchor of sortedAnchors) {
    //       snapshot.resolveAnchor(anchor);
    //     }
    //   },
    // },
    // {
    //   name: "Singleton vs non-singleton comparison",
    //   iterations: 10000,
    //   targetMs: 0.001,
    //   fn: () => {
    //     // Singleton should be faster due to optimization
    //     singletonMb.excerptAt(randomRow);
    //   },
    // },
  ],
};
