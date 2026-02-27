/**
 * Buffer benchmarks.
 *
 * Key performance targets:
 * - Buffer creation: <1ms for 1K lines, <10ms for 10K lines
 * - Line access: O(1) - constant time regardless of line number
 * - Snapshot creation: fast reference copy
 * - Position conversion: O(1) pointToOffset, O(log n) offsetToPoint
 */

import { createBuffer } from "../src/multibuffer/buffer.ts";
import type { BufferId, BufferOffset, BufferRow, BufferSnapshot } from "../src/multibuffer/types.ts";
import { Bias } from "../src/multibuffer/types.ts";
import type { BenchmarkSuite } from "./harness.ts";

function generateText(lines: number): string {
  return Array.from(
    { length: lines },
    (_, i) => `Line ${i + 1}: Some text content here`,
  ).join("\n");
}

// biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in benchmarks
const id = "bench-buffer" as BufferId;

let snapshot10k: BufferSnapshot;

export const bufferBenchmarks: BenchmarkSuite = {
  name: "Buffer Operations",
  benchmarks: [
    {
      name: "Create 1K line buffer",
      iterations: 100,
      targetMs: 1,
      fn: () => {
        createBuffer(id, generateText(1000));
      },
    },
    {
      name: "Create 10K line buffer",
      iterations: 10,
      targetMs: 10,
      fn: () => {
        createBuffer(id, generateText(10_000));
      },
    },
    {
      name: "Line access - early (row 10)",
      iterations: 10000,
      targetMs: 0.001,
      setup: () => {
        snapshot10k = createBuffer(id, generateText(10_000)).snapshot();
      },
      fn: () => {
        // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
        snapshot10k.line(10 as BufferRow);
      },
    },
    {
      name: "Line access - middle (row 5000)",
      iterations: 10000,
      targetMs: 0.001,
      fn: () => {
        // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
        snapshot10k.line(5000 as BufferRow);
      },
    },
    {
      name: "Line access - late (row 9990)",
      iterations: 10000,
      targetMs: 0.001,
      fn: () => {
        // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
        snapshot10k.line(9990 as BufferRow);
      },
    },
    {
      name: "Snapshot creation",
      iterations: 100,
      targetMs: 1,
      setup: () => {
        snapshot10k = createBuffer(id, generateText(10_000)).snapshot();
      },
      fn: () => {
        // Snapshot copies line array — measure the cost
        const buf = createBuffer(id, generateText(1000));
        buf.snapshot();
      },
    },
    {
      name: "pointToOffset (O(1) via prefix sum)",
      iterations: 10000,
      targetMs: 0.001,
      fn: () => {
        // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
        snapshot10k.pointToOffset({ row: 5000 as BufferRow, column: 10 });
      },
    },
    {
      name: "offsetToPoint (O(log n) binary search)",
      iterations: 10000,
      targetMs: 0.001,
      fn: () => {
        // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
        snapshot10k.offsetToPoint(200000 as BufferOffset);
      },
    },
    {
      name: "clipPoint",
      iterations: 10000,
      targetMs: 0.001,
      fn: () => {
        // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
        snapshot10k.clipPoint({ row: 15000 as BufferRow, column: 1000 }, Bias.Right);
      },
    },
    {
      name: "Insert single character (1K buffer)",
      iterations: 1000,
      targetMs: 0.5,
      fn: () => {
        const buf = createBuffer(id, generateText(1000));
        // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
        buf.insert(500 as BufferOffset, "X");
      },
    },
    {
      name: "Delete range (1K buffer)",
      iterations: 1000,
      targetMs: 0.5,
      fn: () => {
        const buf = createBuffer(id, generateText(1000));
        // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
        buf.delete(500 as BufferOffset, 510 as BufferOffset);
      },
    },
  ],
};
