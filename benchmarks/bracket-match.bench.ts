/**
 * Bracket-match benchmarks.
 *
 * `findMatchingBracket()` is called on every cursor event when bracket
 * matching is enabled, scanning up to MAX_SCAN_LINES (1000) in either
 * direction. These benchmarks measure the cost at different scan depths
 * to establish a baseline before any scan-loop optimisations.
 *
 * Scenarios:
 * - same-line: match on same line (minimum scan depth)
 * - 10/100/500 lines: match N lines away (proportional scan)
 * - no-match: no partner within MAX_SCAN_LINES (full 1000-line scan)
 * - no-bracket: cursor not on a bracket (instant early exit)
 */

import { createBuffer } from "../src/buffer/buffer.ts";
import { findMatchingBracket } from "../src/editor/bracket-match.ts";
import { createMultiBuffer } from "../src/multibuffer/multibuffer.ts";
import type { BufferId, BufferRow, MultiBufferRow, MultiBufferSnapshot } from "../src/multibuffer/types.ts";
import type { BenchmarkSuite } from "./harness.ts";

// biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in benchmarks
const benchId = "bench-bracket" as BufferId;

function makeSnapshot(lines: string[]): MultiBufferSnapshot {
  const text = lines.join("\n");
  const buf = createBuffer(benchId, text);
  const mb = createMultiBuffer();
  // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in benchmarks
  const start = { row: 0 as BufferRow, column: 0 };
  // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in benchmarks
  const end = { row: lines.length as BufferRow, column: 0 };
  mb.addExcerpt(buf, { context: { start, end }, primary: { start, end } });
  return mb.snapshot();
}

function generateLines(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `  line_${i}: some content here;`);
}

// ── Snapshots (initialised in setup) ──────────────────────────────────────

let snapSameLine: MultiBufferSnapshot;
let snapMatch10: MultiBufferSnapshot;
let snapMatch100: MultiBufferSnapshot;
let snapMatch500: MultiBufferSnapshot;
let snapNoMatch: MultiBufferSnapshot;
let snapNoBracket: MultiBufferSnapshot;

export const bracketMatchBenchmarks: BenchmarkSuite = {
  name: "Bracket match (findMatchingBracket scan depth)",
  benchmarks: [
    {
      // Match on the same line: scan terminates after a few characters.
      name: "same-line match",
      iterations: 10_000,
      targetMs: 1,
      setup: () => {
        // Line 500: { same-line content }
        const lines = generateLines(1001);
        lines[500] = "{ same-line content }";
        snapSameLine = makeSnapshot(lines);
      },
      fn: () => {
        // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in benchmarks
        findMatchingBracket(snapSameLine, { row: 500 as MultiBufferRow, column: 0 });
      },
    },
    {
      // Match 10 lines away: scan reads 10 × ~30 chars.
      name: "match 10 lines away",
      iterations: 5_000,
      targetMs: 1,
      setup: () => {
        const lines = generateLines(1001);
        lines[500] = "{";
        lines[510] = "}";
        snapMatch10 = makeSnapshot(lines);
      },
      fn: () => {
        // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in benchmarks
        findMatchingBracket(snapMatch10, { row: 500 as MultiBufferRow, column: 0 });
      },
    },
    {
      // Match 100 lines away: scan reads ~100 × 30 chars.
      name: "match 100 lines away",
      iterations: 2_000,
      targetMs: 1,
      setup: () => {
        const lines = generateLines(1001);
        lines[500] = "{";
        lines[600] = "}";
        snapMatch100 = makeSnapshot(lines);
      },
      fn: () => {
        // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in benchmarks
        findMatchingBracket(snapMatch100, { row: 500 as MultiBufferRow, column: 0 });
      },
    },
    {
      // Match 500 lines away: scans half the MAX_SCAN_LINES budget.
      name: "match 500 lines away",
      iterations: 1_000,
      targetMs: 1,
      setup: () => {
        const lines = generateLines(1001);
        lines[500] = "{";
        lines[1000] = "}";
        snapMatch500 = makeSnapshot(lines);
      },
      fn: () => {
        // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in benchmarks
        findMatchingBracket(snapMatch500, { row: 500 as MultiBufferRow, column: 0 });
      },
    },
    {
      // No matching bracket: exhausts the full MAX_SCAN_LINES (1000) budget.
      // Worst-case per cursor event when bracket matching is on.
      name: "no match (full 1000-line scan)",
      iterations: 500,
      targetMs: 5,
      setup: () => {
        // Open bracket at row 0 with no close bracket anywhere in 1000 lines.
        const lines = generateLines(1001);
        lines[0] = "{";
        snapNoMatch = makeSnapshot(lines);
      },
      fn: () => {
        // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in benchmarks
        findMatchingBracket(snapNoMatch, { row: 0 as MultiBufferRow, column: 0 });
      },
    },
    {
      // Cursor not on a bracket: early exit after one character lookup.
      name: "no bracket at cursor (early exit)",
      iterations: 50_000,
      targetMs: 1,
      setup: () => {
        const lines = generateLines(1001);
        snapNoBracket = makeSnapshot(lines);
      },
      fn: () => {
        // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in benchmarks
        findMatchingBracket(snapNoBracket, { row: 500 as MultiBufferRow, column: 5 });
      },
    },
  ],
};
