/**
 * DiffController benchmarks.
 *
 * Measures two distinct hot paths:
 * 1. reDiff() after a buffer edit — snapshot + diff + setExcerpts (the uncached path)
 * 2. reDiff() on unchanged buffers — version-cache fast path (O(1))
 *
 * Key measurements:
 * - How much does reDiff() cost after a real edit (varying file sizes and change counts)?
 * - How fast is the version-cache fast path for repeated reDiff() on stable diffs?
 */

import { createBuffer } from "../src/buffer/buffer.ts";
import type { BufferId, BufferOffset } from "../src/buffer/types.ts";
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
    // --- After-edit path (uncached) ---
    // Each iteration inserts a single character into newBuffer, bumping its
    // version and forcing a full diff + setExcerpts on the next reDiff() call.
    // This is the true hot path: what the user experiences on each keystroke.
    (() => {
      const oldBuf = createBuffer(oldId, medium1k);
      const newBuf = createBuffer(newId, medium1kScattered);
      const controller = createDiffController(oldBuf, newBuf);
      let toggle = false;
      return {
        name: "DiffController.reDiff() - 1K lines, after edit (~20 hunks)",
        fn() {
          // Alternate insert/delete of a single space to keep version changing
          // without drifting the diff result significantly.
          if (toggle) {
            // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in benchmarks
            newBuf.insert(0 as BufferOffset, " ");
          } else {
            // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in benchmarks
            newBuf.replace(0 as BufferOffset, 1 as BufferOffset, "");
          }
          toggle = !toggle;
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
      let toggle = false;
      return {
        name: "DiffController.reDiff() - 10K lines, after edit (~5 hunks)",
        fn() {
          if (toggle) {
            // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in benchmarks
            newBuf.insert(0 as BufferOffset, " ");
          } else {
            // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in benchmarks
            newBuf.replace(0 as BufferOffset, 1 as BufferOffset, "");
          }
          toggle = !toggle;
          controller.reDiff();
        },
        iterations: 20,
        targetMs: 50,
      };
    })(),

    // --- Version-cache fast path (no edit) ---
    // Buffers do not change between iterations; reDiff() hits the version-cache
    // and returns immediately. Measures the overhead of the O(1) fast path.
    (() => {
      const oldBuf = createBuffer(oldId, medium1k);
      const newBuf = createBuffer(newId, medium1kScattered);
      const controller = createDiffController(oldBuf, newBuf);
      // Prime the cache with one real reDiff first.
      controller.reDiff();
      return {
        name: "DiffController.reDiff() - 1K lines, version-cache hit (no edit)",
        fn() {
          controller.reDiff();
        },
        iterations: 500,
        targetMs: 1,
      };
    })(),

    // --- Convergence path after edit ---
    // Identical buffers: each iteration inserts then deletes a space so the diff
    // still resolves to isEqual, but the version cache is always invalidated.
    (() => {
      const text = medium1k;
      const oldBuf = createBuffer(oldId, text);
      const newBuf = createBuffer(newId, text);
      const controller = createDiffController(oldBuf, newBuf);
      let toggle = false;
      return {
        name: "DiffController.reDiff() - 1K lines, identical after edit (convergence)",
        fn() {
          if (toggle) {
            // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in benchmarks
            newBuf.insert(0 as BufferOffset, " ");
          } else {
            // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in benchmarks
            newBuf.replace(0 as BufferOffset, 1 as BufferOffset, "");
          }
          toggle = !toggle;
          controller.reDiff();
        },
        iterations: 200,
        targetMs: 5,
      };
    })(),
  ],
};
