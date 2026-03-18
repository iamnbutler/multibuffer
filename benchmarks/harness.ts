/**
 * Benchmark harness with timing, memory measurement, and reporting.
 */

export interface Benchmark {
  name: string;
  /** Setup function called once before iterations */
  setup?: () => void | Promise<void>;
  /** The function to benchmark */
  fn: () => void;
  /** Cleanup function called once after iterations */
  teardown?: () => void | Promise<void>;
  /** Number of iterations (default: 1000) */
  iterations?: number;
  /** Target max time in ms (benchmark fails if exceeded) */
  targetMs?: number;
}

export interface BenchmarkSuite {
  name: string;
  benchmarks: Benchmark[];
}

export interface SuiteResult {
  suite: string;
  results: BenchmarkResult[];
}

export interface BenchmarkResult {
  name: string;
  iterations: number;
  totalMs: number;
  avgMs: number;
  medianMs: number;
  p95Ms: number;
  minMs: number;
  maxMs: number;
  opsPerSec: number;
  targetMs?: number;
  passed: boolean;
}

/**
 * Run a single benchmark and return results.
 */
export async function runBenchmark(bench: Benchmark): Promise<BenchmarkResult> {
  const iterations = bench.iterations ?? 1000;
  const times: number[] = [];

  // Setup
  if (bench.setup) {
    await bench.setup();
  }

  // Warmup (10% of iterations, min 10)
  const warmupCount = Math.max(10, Math.floor(iterations * 0.1));
  for (let i = 0; i < warmupCount; i++) {
    bench.fn();
  }

  // Actual measurement
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    bench.fn();
    const end = performance.now();
    times.push(end - start);
  }

  // Teardown
  if (bench.teardown) {
    await bench.teardown();
  }

  // Calculate stats
  const totalMs = times.reduce((a, b) => a + b, 0);
  const avgMs = totalMs / iterations;
  const opsPerSec = 1000 / avgMs;
  const passed = bench.targetMs === undefined || avgMs <= bench.targetMs;

  // Sort once; reuse for min, max, median, and p95.
  // Using sorted[0]/sorted[n-1] instead of Math.min/max(...times) avoids a
  // redundant O(n) pass and the spread-argument stack-overflow risk for large
  // iteration counts.
  const sorted = times.slice().sort((a, b) => a - b);
  const minMs = sorted[0] ?? 0;
  const maxMs = sorted[sorted.length - 1] ?? 0;
  const medianMs = sorted[Math.floor(sorted.length * 0.5)] ?? avgMs;
  const p95Ms = sorted[Math.floor(sorted.length * 0.95)] ?? maxMs;

  return {
    name: bench.name,
    iterations,
    totalMs,
    avgMs,
    medianMs,
    p95Ms,
    minMs,
    maxMs,
    opsPerSec,
    targetMs: bench.targetMs,
    passed,
  };
}

/**
 * Format a benchmark result for display.
 */
export function formatResult(result: BenchmarkResult): string {
  const status = result.passed ? "✓" : "✗";
  const target = result.targetMs !== undefined ? ` (target: <${result.targetMs}ms)` : "";
  const fmtMs = (ms: number) =>
    ms < 0.01 ? `${(ms * 1000).toFixed(2)}µs` : `${ms.toFixed(3)}ms`;

  return [
    `${status} ${result.name}`,
    `  avg: ${fmtMs(result.avgMs)}  median: ${fmtMs(result.medianMs)}  p95: ${fmtMs(result.p95Ms)}${target}`,
    `  min: ${result.minMs.toFixed(3)}ms, max: ${result.maxMs.toFixed(3)}ms`,
    `  ops/sec: ${result.opsPerSec.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`,
    `  iterations: ${result.iterations}`,
  ].join("\n");
}

export interface RunOptions {
  silent?: boolean;
}

/**
 * Run all benchmark suites and return per-suite results.
 */
export async function runBenchmarks(
  suites: BenchmarkSuite[],
  options: RunOptions = {},
): Promise<SuiteResult[]> {
  const { silent = false } = options;
  let totalPassed = 0;
  let totalFailed = 0;
  const suiteResults: SuiteResult[] = [];

  for (const suite of suites) {
    if (!silent) {
      console.log(`\n## ${suite.name}\n`);
    }

    const results: BenchmarkResult[] = [];

    for (const bench of suite.benchmarks) {
      try {
        const result = await runBenchmark(bench);
        if (!silent) {
          console.log(formatResult(result));
          console.log("");
        }
        results.push(result);

        if (result.passed) {
          totalPassed++;
        } else {
          totalFailed++;
        }
      } catch (error) {
        if (!silent) {
          console.log(`✗ ${bench.name}`);
          console.log(`  ERROR: ${error}`);
          console.log("");
        }
        totalFailed++;
      }
    }

    suiteResults.push({ suite: suite.name, results });
  }

  if (!silent) {
    console.log("=".repeat(60));
    console.log(`Results: ${totalPassed} passed, ${totalFailed} failed`);
    console.log("=".repeat(60));

    // Only fail in interactive mode - CI records results regardless of pass/fail
    if (totalFailed > 0) {
      process.exitCode = 1;
    }
  }

  return suiteResults;
}

/**
 * Measure memory usage of a function.
 * Note: Bun's memory APIs are limited, this is a best-effort measurement.
 */
export function measureMemory<T>(fn: () => T): { result: T; heapUsedKb: number } {
  // Force GC if available
  if (typeof Bun !== "undefined" && "gc" in Bun) {
    // biome-ignore lint/suspicious/noExplicitAny: expect: Bun.gc() has no type declaration
    // biome-ignore lint/plugin/no-type-assertion: expect: Bun.gc() has no type declaration
    (Bun as any).gc();
  }

  const before = process.memoryUsage().heapUsed;
  const result = fn();
  const after = process.memoryUsage().heapUsed;

  return {
    result,
    heapUsedKb: (after - before) / 1024,
  };
}
