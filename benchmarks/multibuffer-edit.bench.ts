/**
 * MultiBuffer edit-path benchmarks.
 *
 * Every edit to a buffer refreshes *every* excerpt drawn from that buffer
 * (`_refreshExcerptsForBuffer`), so per-excerpt work sits directly on the
 * keystroke path. The existing multibuffer suite covers construction, lookup
 * and anchor resolution, but never times an edit — this file fills that gap.
 *
 * Both a plain character insert (line count unchanged) and a newline insert
 * (line count changed) are measured, because optimisations that key off "did
 * this edit move the line count" help only the former.
 *
 * Target: keypress to model update <1ms (see CLAUDE.md).
 */

import { createBuffer } from "../src/buffer/buffer.ts";
import { createMultiBuffer } from "../src/multibuffer/multibuffer.ts";
import type {
  BufferId,
  BufferPoint,
  BufferRow,
  ExcerptRange,
  ExcerptSpec,
  MultiBuffer,
  MultiBufferPoint,
  MultiBufferRow,
} from "../src/multibuffer/types.ts";
import type { BenchmarkSuite } from "./harness.ts";

const ROWS_PER_EXCERPT = 10;

function point(row: number, col: number): BufferPoint {
  // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
  return { row: row as BufferRow, column: col };
}

function mbPoint(row: number, col: number): MultiBufferPoint {
  // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
  return { row: row as MultiBufferRow, column: col };
}

function range(startRow: number, endRow: number): ExcerptRange {
  const context = { start: point(startRow, 0), end: point(endRow, 0) };
  return { context, primary: context };
}

function generateText(lines: number): string {
  return Array.from(
    { length: lines },
    (_, i) => `Line ${i + 1}: Some text content here`,
  ).join("\n");
}

/** A multibuffer of `n` adjacent excerpts, all drawn from one buffer. */
function buildMultiBuffer(n: number): MultiBuffer {
  // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
  const bufferId = `edit-bench-${n}` as BufferId;
  const buffer = createBuffer(
    bufferId,
    generateText(n * ROWS_PER_EXCERPT + 50),
  );
  const mb = createMultiBuffer();
  const specs: ExcerptSpec[] = [];
  for (let i = 0; i < n; i++) {
    specs.push({
      buffer,
      range: range(i * ROWS_PER_EXCERPT, (i + 1) * ROWS_PER_EXCERPT),
    });
  }
  mb.addExcerpts(specs);
  return mb;
}

let mbEdit100: MultiBuffer;
let mbEdit500: MultiBuffer;
let mbNewline100: MultiBuffer;
let mbNewline500: MultiBuffer;

export const multibufferEditBenchmarks: BenchmarkSuite = {
  name: "MultiBuffer Edit Path",
  benchmarks: [
    {
      name: "Single-char insert (100 excerpts)",
      setup: () => {
        mbEdit100 = buildMultiBuffer(100);
      },
      fn: () => {
        mbEdit100.edit(mbPoint(0, 0), mbPoint(0, 0), "x");
      },
      iterations: 300,
      targetMs: 1,
    },
    {
      name: "Single-char insert (500 excerpts)",
      setup: () => {
        mbEdit500 = buildMultiBuffer(500);
      },
      fn: () => {
        mbEdit500.edit(mbPoint(0, 0), mbPoint(0, 0), "x");
      },
      iterations: 300,
      targetMs: 1,
    },
    {
      name: "Newline insert, line count changes (100 excerpts)",
      setup: () => {
        mbNewline100 = buildMultiBuffer(100);
      },
      fn: () => {
        mbNewline100.edit(mbPoint(0, 0), mbPoint(0, 0), "\n");
      },
      iterations: 200,
      targetMs: 1,
    },
    {
      name: "Newline insert, line count changes (500 excerpts)",
      setup: () => {
        mbNewline500 = buildMultiBuffer(500);
      },
      fn: () => {
        mbNewline500.edit(mbPoint(0, 0), mbPoint(0, 0), "\n");
      },
      iterations: 200,
      targetMs: 1,
    },
    {
      name: "Build 500 excerpts from one buffer",
      fn: () => {
        buildMultiBuffer(500);
      },
      iterations: 30,
    },
  ],
};
