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

export interface BenchmarkResult {
  name: string;
  iterations: number;
  totalMs: number;
  avgMs: number;
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
  const minMs = Math.min(...times);
  const maxMs = Math.max(...times);
  const opsPerSec = 1000 / avgMs;
  const passed = bench.targetMs === undefined || avgMs <= bench.targetMs;

  return {
    name: bench.name,
    iterations,
    totalMs,
    avgMs,
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
  const avgFormatted = result.avgMs < 0.01
    ? `${(result.avgMs * 1000).toFixed(2)}µs`
    : `${result.avgMs.toFixed(3)}ms`;

  return [
    `${status} ${result.name}`,
    `  avg: ${avgFormatted}${target}`,
    `  min: ${result.minMs.toFixed(3)}ms, max: ${result.maxMs.toFixed(3)}ms`,
    `  ops/sec: ${result.opsPerSec.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`,
    `  iterations: ${result.iterations}`,
  ].join("\n");
}

/**
 * Run all benchmark suites.
 */
export async function runBenchmarks(suites: BenchmarkSuite[]): Promise<void> {
  let totalPassed = 0;
  let totalFailed = 0;

  for (const suite of suites) {
    console.log(`\n## ${suite.name}\n`);

    for (const bench of suite.benchmarks) {
      try {
        const result = await runBenchmark(bench);
        console.log(formatResult(result));
        console.log("");

        if (result.passed) {
          totalPassed++;
        } else {
          totalFailed++;
        }
      } catch (error) {
        console.log(`✗ ${bench.name}`);
        console.log(`  ERROR: ${error}`);
        console.log("");
        totalFailed++;
      }
    }
  }

  console.log("=".repeat(60));
  console.log(`Results: ${totalPassed} passed, ${totalFailed} failed`);
  console.log("=".repeat(60));

  if (totalFailed > 0) {
    process.exit(1);
  }
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
