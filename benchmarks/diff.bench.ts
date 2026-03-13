/**
 * Diff benchmarks.
 *
 * Measures diff algorithm performance across various scenarios:
 * - Small files with few changes
 * - Large files with scattered edits
 * - Complete rewrites (worst case for Myers)
 * - Unified diff view construction
 */

import { createBuffer } from "../src/buffer/buffer.ts";
import type { BufferId } from "../src/buffer/types.ts";
import { diff } from "../src/diff/diff.ts";
import { createUnifiedDiffMultiBuffer } from "../src/diff/multibuffer.ts";
import { createUnifiedDiff } from "../src/diff/unified.ts";
import type { BenchmarkSuite } from "./harness.ts";

// biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in benchmarks
const oldId = "old.ts" as BufferId;
// biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in benchmarks
const newId = "new.ts" as BufferId;

/** Generate a file with numbered lines. */
function generateLines(count: number): string {
  return Array.from({ length: count }, (_, i) =>
    `  const value${i} = compute(${i});`,
  ).join("\n");
}

/** Modify every Nth line of a text. */
function modifyEveryNth(text: string, n: number): string {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i += n) {
    lines[i] = `  const modified${i} = updated(${i}); // changed`;
  }
  return lines.join("\n");
}

/** Insert a line after every Nth line. */
function insertEveryNth(text: string, n: number): string {
  const lines = text.split("\n");
  const result: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    result.push(lines[i] ?? "");
    if (i % n === 0) {
      result.push(`  // inserted after line ${i}`);
    }
  }
  return result.join("\n");
}

/** Delete every Nth line. */
function deleteEveryNth(text: string, n: number): string {
  return text.split("\n").filter((_, i) => i % n !== 0).join("\n");
}

// --- Fixtures ---

const small100 = generateLines(100);
const small100Modified = modifyEveryNth(small100, 20);

const medium1k = generateLines(1_000);
const medium1kScattered = modifyEveryNth(medium1k, 50);
const medium1kInserted = insertEveryNth(medium1k, 100);
const medium1kDeleted = deleteEveryNth(medium1k, 100);

const large10k = generateLines(10_000);
const large10kFewChanges = modifyEveryNth(large10k, 2000);
const medium1kRewrite = generateLines(1_000).replace(/compute/g, "calculate");

export const diffBenchmarks: BenchmarkSuite = {
  name: "Diff",
  benchmarks: [
    {
      name: "diff - 100 lines, 5 changes",
      fn() {
        diff(small100, small100Modified);
      },
      iterations: 1000,
    },
    {
      name: "diff - 1K lines, scattered edits",
      fn() {
        diff(medium1k, medium1kScattered);
      },
      iterations: 100,
      targetMs: 5,
    },
    {
      name: "diff - 1K lines, insertions",
      fn() {
        diff(medium1k, medium1kInserted);
      },
      iterations: 100,
      targetMs: 5,
    },
    {
      name: "diff - 1K lines, deletions",
      fn() {
        diff(medium1k, medium1kDeleted);
      },
      iterations: 100,
      targetMs: 5,
    },
    {
      name: "diff - 10K lines, few changes",
      fn() {
        diff(large10k, large10kFewChanges);
      },
      iterations: 20,
      targetMs: 50,
    },
    {
      name: "diff - 1K lines, full rewrite (worst case)",
      fn() {
        diff(medium1k, medium1kRewrite);
      },
      iterations: 10,
      targetMs: 50,
    },
    {
      name: "diff - identical 1K lines (best case)",
      fn() {
        diff(medium1k, medium1k);
      },
      iterations: 100,
    },
    {
      name: "unified diff - 1K lines, scattered edits",
      fn() {
        createUnifiedDiff(oldId, medium1k, newId, medium1kScattered);
      },
      iterations: 100,
      targetMs: 10,
    },
    {
      name: "unified diff - 10K lines, few changes",
      fn() {
        createUnifiedDiff(oldId, large10k, newId, large10kFewChanges);
      },
      iterations: 20,
      targetMs: 50,
    },
    {
      name: "createUnifiedDiffMultiBuffer - 1K lines, scattered edits",
      fn() {
        const oldBuf = createBuffer(oldId, medium1k);
        const newBuf = createBuffer(newId, medium1kScattered);
        createUnifiedDiffMultiBuffer(oldBuf, newBuf);
      },
      iterations: 100,
      targetMs: 10,
    },
    {
      name: "createUnifiedDiffMultiBuffer - 10K lines, few changes",
      fn() {
        const oldBuf = createBuffer(oldId, large10k);
        const newBuf = createBuffer(newId, large10kFewChanges);
        createUnifiedDiffMultiBuffer(oldBuf, newBuf);
      },
      iterations: 10,
      targetMs: 100,
    },
  ],
};
