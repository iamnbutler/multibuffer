/**
 * MultiFileDiff benchmarks.
 *
 * Measures the stats-computation phase of createMultiFileDiff(): for each
 * file, diff() is called eagerly to aggregate additions/deletions counts.
 * This phase always runs regardless of environment.
 *
 * Note: The DOM initialization phase (mountFiles, initializeFileDiff) is
 * gated on `typeof document !== "undefined"` and is not exercised here.
 * Those paths are covered by the browser-based e2e tests.
 */

import { createMultiFileDiff } from "../src/diff/multi-file.ts";
import type { FileDiffEntry } from "../src/diff/types.ts";
import type { BenchmarkSuite } from "./harness.ts";

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

function makeEntries(count: number, oldContent: string, newContent: string): FileDiffEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    filename: `src/file${i}.ts`,
    oldContent,
    newContent,
  }));
}

/** Shared stub container: DOM paths are gated on `typeof document !== "undefined"`, which is false in Bun. */
// biome-ignore lint/plugin/no-type-assertion: expect: mock HTMLElement for benchmarking without DOM
const benchContainer = {} as unknown as HTMLElement;

// Pre-built fixtures — created once, reused across iterations to avoid GC noise.
const small100 = generateLines(100);
const small100Modified = modifyEveryNth(small100, 20); // ~5 hunks

const medium1k = generateLines(1_000);
const medium1kScattered = modifyEveryNth(medium1k, 50); // ~20 hunks

const files5Small = makeEntries(5, small100, small100Modified);
const files20Small = makeEntries(20, small100, small100Modified);
const files100Small = makeEntries(100, small100, small100Modified);
const files10Medium = makeEntries(10, medium1k, medium1kScattered);
// Identical files hit diff()'s isEqual fast path — establishes a lower bound
// on stats-computation cost with no Myers diff traversal.
const files100Identical = makeEntries(100, small100, small100);

export const multiFileDiffBenchmarks: BenchmarkSuite = {
  name: "MultiFileDiff",
  benchmarks: [
    // --- Varying file counts, small files ---
    // Measures how stats-computation cost scales linearly with file count.
    {
      name: "createMultiFileDiff - 5 files × 100 lines",
      fn() {
        createMultiFileDiff({ files: files5Small, container: benchContainer }).dispose();
      },
      iterations: 500,
    },
    {
      name: "createMultiFileDiff - 20 files × 100 lines",
      fn() {
        createMultiFileDiff({ files: files20Small, container: benchContainer }).dispose();
      },
      iterations: 200,
    },
    {
      name: "createMultiFileDiff - 100 files × 100 lines",
      fn() {
        createMultiFileDiff({ files: files100Small, container: benchContainer }).dispose();
      },
      iterations: 50,
    },

    // --- Larger files ---
    // Measures diff() cost for medium-sized files (1K lines, ~20 hunks each).
    {
      name: "createMultiFileDiff - 10 files × 1K lines",
      fn() {
        createMultiFileDiff({ files: files10Medium, container: benchContainer }).dispose();
      },
      iterations: 50,
    },

    // --- Identical files (diff isEqual fast path) ---
    // Best-case scenario: diff() returns immediately with isEqual=true.
    // Reveals the fixed overhead of createMultiFileDiff() per file beyond diff cost.
    {
      name: "createMultiFileDiff - 100 identical files × 100 lines (isEqual fast path)",
      fn() {
        createMultiFileDiff({ files: files100Identical, container: benchContainer }).dispose();
      },
      iterations: 200,
    },
  ],
};
