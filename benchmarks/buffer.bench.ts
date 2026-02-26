/**
 * Buffer benchmarks.
 *
 * These benchmarks will fail until the Buffer implementation exists.
 */

import type { BenchmarkSuite } from "./harness.ts";

// TODO: Import actual implementation once created
// import { createBuffer } from "../src/multibuffer/buffer.ts";

function generateText(lines: number): string {
  return Array.from({ length: lines }, (_, i) => `Line ${i + 1}: Some text content here`).join("\n");
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
    // {
    //   name: "Line access (random)",
    //   iterations: 10000,
    //   targetMs: 0.01, // 10µs
    //   setup: () => {
    //     // Setup buffer
    //   },
    //   fn: () => {
    //     // Access random line
    //   },
    // },
    // {
    //   name: "Insert single character",
    //   iterations: 10000,
    //   targetMs: 0.1,
    //   fn: () => {
    //     // Insert at random position
    //   },
    // },
    // {
    //   name: "Delete single line",
    //   iterations: 1000,
    //   targetMs: 0.5,
    //   fn: () => {
    //     // Delete a line
    //   },
    // },
  ],
};
