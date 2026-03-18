/**
 * DiffController benchmarks.
 *
 * Measures the hot path exercised by live diff (re-diff on edit):
 * - `reDiff()` after a buffer edit: snapshot + diff + clearExcerpts + N×addExcerpt
 * - Convergence path: reDiff() when old and new texts are equal
 *
 * Key measurements:
 * - How much does `reDiff()` cost with varying file sizes and change counts?
 * - Is the clearExcerpts + N×addExcerpt step a bottleneck vs. the Myers diff?
 */

import { createBuffer } from "../src/buffer/buffer.ts";
import type { BufferId } from "../src/buffer/types.ts";
import { createDiffController } from "../src/diff/controller.ts";
import type { BenchmarkSuite } from "./harness.ts";

// biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in benchmarks
const oldId = "old.ts" as BufferId;
// biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in benchmarks
const newId = "new.ts" as BufferId;

function generateLines(count: number): string {
  return Array.from({ length: count }, (_, i) =>
    `  const value${i} = compute(${i});`,
  ).join("\n");
}

function modifyEveryNth(text: string, n: number): string {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i += n) {
    lines[i] = `  const modified${i} = updated(${i}); // changed`;
  }
  return lines.join("\n");
}

const medium1k = generateLines(1_000);
const medium1kScattered = modifyEveryNth(medium1k, 50); // ~20 hunks ≈ 60 excerpts per reDiff
const large10k = generateLines(10_000);
const large10kFewChanges = modifyEveryNth(large10k, 2000); // ~5 hunks ≈ 15 excerpts per reDiff

export const diffControllerBenchmarks: BenchmarkSuite = {
  name: "DiffController",
  benchmarks: [
    // --- reDiff() on unchanged buffers ---
    // Measures steady-state cost: snapshot + diff + clearExcerpts + N×addExcerpt.
    // Buffers do not change between iterations; diff result is stable.
    // This is the minimum cost of the convergence-detection path.
    (() => {
      const oldBuf = createBuffer(oldId, medium1k);
      const newBuf = createBuffer(newId, medium1kScattered);
      const controller = createDiffController(oldBuf, newBuf);
      return {
        name: "DiffController.reDiff() - 1K lines, scattered edits (~20 hunks)",
        fn() {
          controller.reDiff();
        },
        iterations: 100,
        targetMs: 10,
      };
    })(),

    (() => {
      const oldBuf = createBuffer(oldId, large10k);
      const newBuf = createBuffer(newId, large10kFewChanges);
      const controller = createDiffController(oldBuf, newBuf);
      return {
        name: "DiffController.reDiff() - 10K lines, few changes (~5 hunks)",
        fn() {
          controller.reDiff();
        },
        iterations: 20,
        targetMs: 50,
      };
    })(),

    // --- Convergence path ---
    // When old and new texts are identical, reDiff() hits the isEqual fast path:
    // clearExcerpts + 1 addExcerpt (the full-file equal excerpt). This isolates
    // the cost of snapshot + diff (identical-text fast path) + excerpt reset.
    (() => {
      const text = medium1k;
      const oldBuf = createBuffer(oldId, text);
      const newBuf = createBuffer(newId, text);
      const controller = createDiffController(oldBuf, newBuf);
      return {
        name: "DiffController.reDiff() - 1K lines, identical (convergence path)",
        fn() {
          controller.reDiff();
        },
        iterations: 200,
        targetMs: 5,
      };
    })(),
  ],
};
