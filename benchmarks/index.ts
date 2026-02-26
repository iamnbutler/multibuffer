/**
 * Benchmark runner for multibuffer.
 *
 * Run with: bun run bench
 *
 * Target performance:
 * - Buffer operations: <1ms
 * - Viewport calculations: <1ms
 * - 100 excerpts: <10ms initialization
 */

import { runBenchmarks, type BenchmarkSuite } from "./harness.ts";
import { bufferBenchmarks } from "./buffer.bench.ts";
import { multibufferBenchmarks } from "./multibuffer.bench.ts";
import { viewportBenchmarks } from "./viewport.bench.ts";

const suites: BenchmarkSuite[] = [
  bufferBenchmarks,
  multibufferBenchmarks,
  viewportBenchmarks,
];

console.log("=".repeat(60));
console.log("Multibuffer Performance Benchmarks");
console.log("=".repeat(60));
console.log("");

runBenchmarks(suites);
