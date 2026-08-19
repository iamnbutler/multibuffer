/**
 * Buffer benchmarks.
 *
 * Key performance targets:
 * - Buffer creation: <1ms for 1K lines, <10ms for 10K lines
 * - Line access: O(1) - constant time regardless of line number
 * - Snapshot creation: fast reference copy
 * - Position conversion: O(1) pointToOffset, O(log n) offsetToPoint
 */

import { createBuffer } from "../src/buffer/buffer.ts";
import { Rope } from "../src/buffer/rope.ts";
import type { Buffer, BufferId, BufferOffset, BufferRow, BufferSnapshot } from "../src/multibuffer/types.ts";
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
let mutableBuf1k: Buffer;
let mutableBuf10k: Buffer;
let rope10k: Rope;
let lateOffset10k: number;
let midOffset10k: number;

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
      name: "pointToOffset - early (row 10)",
      iterations: 10000,
      targetMs: 0.001,
      fn: () => {
        // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
        snapshot10k.pointToOffset({ row: 10 as BufferRow, column: 10 });
      },
    },
    {
      name: "pointToOffset - mid (row 5000)",
      iterations: 10000,
      targetMs: 0.001,
      fn: () => {
        // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
        snapshot10k.pointToOffset({ row: 5000 as BufferRow, column: 10 });
      },
    },
    {
      name: "pointToOffset - late (row 9990)",
      iterations: 10000,
      targetMs: 0.001,
      fn: () => {
        // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
        snapshot10k.pointToOffset({ row: 9990 as BufferRow, column: 10 });
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
    {
      // Buffer creation excluded — measures insert + computeTextSummary only.
      // Critical path: called on every keystroke. Target: <0.2ms for 1K-line file.
      name: "Insert character - 1K buf (isolated)",
      iterations: 1000,
      targetMs: 0.2,
      setup: () => {
        mutableBuf1k = createBuffer(id, generateText(1000));
      },
      fn: () => {
        // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
        mutableBuf1k.insert(500 as BufferOffset, "X");
      },
    },
    {
      // Buffer creation excluded — measures insert + computeTextSummary only.
      // Critical path: called on every keystroke. Target: <1.5ms for 10K-line file.
      name: "Insert character - 10K buf (isolated)",
      iterations: 200,
      targetMs: 1.5,
      setup: () => {
        mutableBuf10k = createBuffer(id, generateText(10_000));
      },
      fn: () => {
        // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
        mutableBuf10k.insert(500 as BufferOffset, "X");
      },
    },
    {
      // 1-char slice is the surrogate-pair check pattern in BufferSnapshot.clipOffset.
      // Previous linear-chunk-walk made this O(n_chunks) at late offsets.
      name: "Rope.slice 1-char near end (clipOffset pattern)",
      iterations: 100_000,
      targetMs: 0.001,
      setup: () => {
        rope10k = Rope.from(generateText(10_000));
        lateOffset10k = rope10k.length - 100;
        midOffset10k = Math.floor(rope10k.length / 2);
      },
      fn: () => {
        rope10k.slice(lateOffset10k, lateOffset10k + 1);
      },
    },
    {
      name: "Rope.slice 1-char near middle",
      iterations: 100_000,
      targetMs: 0.001,
      fn: () => {
        rope10k.slice(midOffset10k, midOffset10k + 1);
      },
    },
    {
      name: "Rope.slice 1KB near middle",
      iterations: 100_000,
      targetMs: 0.01,
      fn: () => {
        rope10k.slice(midOffset10k, midOffset10k + 1024);
      },
    },
    {
      name: "lines() bulk - 50 lines (viewport slice)",
      iterations: 10000,
      targetMs: 0.01,
      fn: () => {
        // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
        snapshot10k.lines(5000 as BufferRow, 5050 as BufferRow);
      },
    },
    {
      name: "lines() bulk - all 10K lines (WrapMap build)",
      iterations: 100,
      targetMs: 5,
      fn: () => {
        // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
        snapshot10k.lines(0 as BufferRow, 10000 as BufferRow);
      },
    },
  ],
};
