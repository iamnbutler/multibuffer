/**
 * WrapMap benchmarks.
 *
 * Key performance targets:
 * - WrapMap construction: <1ms for 1K lines (no wrap), <10ms for 10K lines
 * - Query operations: O(1) forward lookup, O(log n) reverse lookup
 *
 * The WrapMap is rebuilt on every edit and every window resize, so
 * construction cost directly impacts keypress latency.
 */

import { createBuffer } from "../src/multibuffer/buffer.ts";
import { createMultiBuffer } from "../src/multibuffer/multibuffer.ts";
import type { BufferId, BufferRow, ExcerptRange, MultiBufferRow } from "../src/multibuffer/types.ts";
import { WrapMap } from "../src/multibuffer_renderer/wrap-map.ts";
import type { BenchmarkSuite } from "./harness.ts";

function generateText(lines: number, lineLen = 30): string {
  return Array.from(
    { length: lines },
    (_, i) => `Line ${i + 1}: ${"x".repeat(lineLen - 10)}`,
  ).join("\n");
}

// biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in benchmarks
const id = "bench-wrapmap" as BufferId;

function makeRange(lines: number): ExcerptRange {
  // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in benchmarks
  const start = { row: 0 as BufferRow, column: 0 };
  // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in benchmarks
  const end = { row: (lines - 1) as BufferRow, column: 0 };
  const span = { start, end };
  return { context: span, primary: span };
}

function makeSnapshot(lines: number, lineLen = 30) {
  const buf = createBuffer(id, generateText(lines, lineLen));
  const mb = createMultiBuffer();
  mb.addExcerpt(buf, makeRange(lines));
  return mb.snapshot();
}

const snap1k = makeSnapshot(1000);
const snap10k = makeSnapshot(10_000);
// Lines ~40 chars wide; wrap at 20 → each line wraps into 2 visual rows
const snap1kWrap = makeSnapshot(1000, 40);

let wrapMap1k: WrapMap;

export const wrapMapBenchmarks: BenchmarkSuite = {
  name: "WrapMap Operations",
  benchmarks: [
    {
      name: "WrapMap construct - 1K lines, no wrap (wrapWidth=200)",
      iterations: 1000,
      targetMs: 1,
      fn: () => {
        new WrapMap(snap1k, 200);
      },
    },
    {
      name: "WrapMap construct - 1K lines, wrapping (wrapWidth=20)",
      iterations: 1000,
      targetMs: 2,
      fn: () => {
        new WrapMap(snap1kWrap, 20);
      },
    },
    {
      name: "WrapMap construct - 10K lines, no wrap (wrapWidth=200)",
      iterations: 100,
      targetMs: 10,
      fn: () => {
        new WrapMap(snap10k, 200);
      },
    },
    {
      name: "visualRowToBufferRow (O(log n), mid visual row)",
      iterations: 10000,
      targetMs: 0.01,
      setup: () => {
        wrapMap1k = new WrapMap(snap1k, 200);
      },
      fn: () => {
        const mid = Math.floor(wrapMap1k.totalVisualRows / 2);
        wrapMap1k.visualRowToBufferRow(mid);
      },
    },
    {
      name: "bufferRowToFirstVisualRow (O(1), mid buffer row)",
      iterations: 10000,
      targetMs: 0.001,
      fn: () => {
        // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in benchmarks
        wrapMap1k.bufferRowToFirstVisualRow(500 as MultiBufferRow);
      },
    },
    {
      name: "visualRowsForLine (O(1))",
      iterations: 10000,
      targetMs: 0.001,
      fn: () => {
        // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in benchmarks
        wrapMap1k.visualRowsForLine(500 as MultiBufferRow);
      },
    },
  ],
};
