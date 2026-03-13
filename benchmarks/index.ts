/**
 * Benchmark runner for multibuffer.
 *
 * Run with: bun run bench
 * Run with JSON output: bun run bench --json
 *
 * Target performance:
 * - Buffer operations: <1ms
 * - Viewport calculations: <1ms
 * - 100 excerpts: <10ms initialization
 */

import { bufferBenchmarks } from "./buffer.bench.ts";
import { diffBenchmarks } from "./diff.bench.ts";
import { diffControllerBenchmarks } from "./diff-controller.bench.ts";
import { editorBenchmarks } from "./editor.bench.ts";
import { type BenchmarkSuite, runBenchmarks } from "./harness.ts";
import { multibufferBenchmarks } from "./multibuffer.bench.ts";
import { viewportBenchmarks } from "./viewport.bench.ts";
import { wrapMapBenchmarks } from "./wrapmap.bench.ts";

const jsonMode = process.argv.includes("--json");

const suites: BenchmarkSuite[] = [
  bufferBenchmarks,
  multibufferBenchmarks,
  viewportBenchmarks,
  wrapMapBenchmarks,
  editorBenchmarks,
  diffBenchmarks,
  diffControllerBenchmarks,
];

if (!jsonMode) {
  console.log("=".repeat(60));
  console.log("Multibuffer Performance Benchmarks");
  console.log("=".repeat(60));
  console.log("");
}

const results = await runBenchmarks(suites, { silent: jsonMode });

if (jsonMode) {
  console.log(JSON.stringify(results));
}
