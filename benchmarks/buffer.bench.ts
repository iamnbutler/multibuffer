/**
 * Buffer benchmarks.
 *
 * Key performance targets:
 * - Buffer creation: <10ms for 10K lines
 * - Line access: O(1) - constant time regardless of line number
 * - Snapshot creation: O(1) - reference copy
 * - Position conversion: O(1) for row, O(k) for column where k = line length
 */

import type { BenchmarkSuite } from "./harness.ts";

// TODO: Import actual implementation once created
// import { createBuffer } from "../src/multibuffer/buffer.ts";

function generateText(lines: number): string {
  return Array.from(
    { length: lines },
    (_, i) => `Line ${i + 1}: Some text content here`
  ).join("\n");
}

// Placeholder - benchmarks will throw until implementation exists
const createBuffer = (_id: string, _text: string) => {
  throw new Error("Buffer not implemented");
};

export const bufferBenchmarks: BenchmarkSuite = {
  name: "Buffer Operations",
  benchmarks: [
    {
      name: "Create 1K line buffer",
      iterations: 100,
      targetMs: 1,
      fn: () => {
        const text = generateText(1000);
        createBuffer("test", text);
      },
    },
    {
      name: "Create 10K line buffer",
      iterations: 10,
      targetMs: 10,
      fn: () => {
        const text = generateText(10_000);
        createBuffer("test", text);
      },
    },
    // Uncomment when implementation exists:
    // {
    //   name: "Line access - early (row 10)",
    //   iterations: 10000,
    //   targetMs: 0.001, // 1µs
    //   setup: () => {
    //     buffer = createBuffer("test", generateText(10_000));
    //     snapshot = buffer.snapshot();
    //   },
    //   fn: () => {
    //     snapshot.line(10);
    //   },
    // },
    // {
    //   name: "Line access - middle (row 5000)",
    //   iterations: 10000,
    //   targetMs: 0.001, // Should be same as early - O(1)
    //   fn: () => {
    //     snapshot.line(5000);
    //   },
    // },
    // {
    //   name: "Line access - late (row 9990)",
    //   iterations: 10000,
    //   targetMs: 0.001, // Should be same as early - O(1)
    //   fn: () => {
    //     snapshot.line(9990);
    //   },
    // },
    // {
    //   name: "Snapshot creation (should be O(1))",
    //   iterations: 10000,
    //   targetMs: 0.001,
    //   fn: () => {
    //     buffer.snapshot();
    //   },
    // },
    // {
    //   name: "pointToOffset conversion",
    //   iterations: 10000,
    //   targetMs: 0.001,
    //   fn: () => {
    //     snapshot.pointToOffset({ row: 5000, column: 10 });
    //   },
    // },
    // {
    //   name: "offsetToPoint conversion",
    //   iterations: 10000,
    //   targetMs: 0.001,
    //   fn: () => {
    //     snapshot.offsetToPoint(50000);
    //   },
    // },
    // {
    //   name: "clipPoint",
    //   iterations: 10000,
    //   targetMs: 0.001,
    //   fn: () => {
    //     snapshot.clipPoint({ row: 10000, column: 1000 }, Bias.Right);
    //   },
    // },
    // {
    //   name: "Insert single character",
    //   iterations: 1000,
    //   targetMs: 0.1,
    //   fn: () => {
    //     buffer.insert(randomOffset, "X");
    //   },
    // },
    // {
    //   name: "Insert newline (creates new line)",
    //   iterations: 1000,
    //   targetMs: 0.1,
    //   fn: () => {
    //     buffer.insert(randomOffset, "\n");
    //   },
    // },
    // {
    //   name: "Delete single character",
    //   iterations: 1000,
    //   targetMs: 0.1,
    //   fn: () => {
    //     buffer.delete(randomOffset, randomOffset + 1);
    //   },
    // },
  ],
};
