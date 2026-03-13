#!/usr/bin/env bun
/**
 * View benchmark history from the bench-data branch.
 *
 * Usage:
 *   bun scripts/bench-history.ts          # Last 20 results (summary)
 *   bun scripts/bench-history.ts --sha <sha>  # Specific commit's results
 *   bun scripts/bench-history.ts -n 50    # Last 50 results
 */

interface BenchmarkResult {
  name: string;
  avgMs: number;
  targetMs?: number;
  passed: boolean;
  opsPerSec: number;
}

interface SuiteResult {
  suite: string;
  results: BenchmarkResult[];
}

interface HistoryEntry {
  sha: string;
  timestamp: string;
  suites: SuiteResult[];
}

async function fetchHistory(): Promise<HistoryEntry[]> {
  const proc = Bun.spawn(
    ["git", "show", "origin/bench-data:history.jsonl"],
    { stdout: "pipe", stderr: "pipe" },
  );
  await proc.exited;
  const text = await new Response(proc.stdout).text();

  return text
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as HistoryEntry);
}

function formatMs(ms: number): string {
  if (ms < 0.01) return `${(ms * 1000).toFixed(2)}µs`;
  if (ms < 1) return `${ms.toFixed(3)}ms`;
  return `${ms.toFixed(1)}ms`;
}

function showSummary(entries: HistoryEntry[], count: number): void {
  const recent = entries.slice(-count).reverse();

  console.log(`\nBenchmark History (last ${recent.length} runs)\n`);
  console.log(
    "SHA      | Date       | Pass | Fail | Keypress | Diff 1K | Buffer 1K | WrapMap",
  );
  console.log("-".repeat(84));

  for (const entry of recent) {
    const date = entry.timestamp.split("T")[0];
    let passed = 0;
    let failed = 0;
    let keypressAvg: number | null = null;
    let diffAvg: number | null = null;
    let bufferAvg: number | null = null;
    let viewportAvg: number | null = null;

    for (const suite of entry.suites) {
      for (const result of suite.results) {
        if (result.passed) passed++;
        else failed++;

        // Look for keypress latency benchmark
        if (result.name.includes("insertText") && result.name.includes("1K")) {
          keypressAvg = result.avgMs;
        }
        // Look for diff benchmark (1K scattered)
        if (result.name.includes("diff") && result.name.includes("1K") && result.name.includes("scattered")) {
          diffAvg = result.avgMs;
        }
        // Look for buffer edit benchmark
        if (result.name.includes("Insert single character") && result.name.includes("1K")) {
          bufferAvg = result.avgMs;
        }
        // Look for WrapMap construction benchmark
        if (result.name.includes("WrapMap construct") && result.name.includes("1K") && result.name.includes("no wrap")) {
          viewportAvg = result.avgMs;
        }
      }
    }

    const fmtOrNA = (v: number | null) => (v !== null ? formatMs(v).padStart(8) : "     N/A");
    const status = failed === 0 ? "✓" : "✗";

    console.log(
      `${entry.sha.slice(0, 8)} | ${date} | ${String(passed).padStart(4)} | ${String(failed).padStart(4)} |${fmtOrNA(keypressAvg)} |${fmtOrNA(diffAvg)} |${fmtOrNA(bufferAvg)} |${fmtOrNA(viewportAvg)} ${status}`,
    );
  }

  console.log("");
}

function showDetails(entry: HistoryEntry): void {
  console.log(`\nBenchmark Results for ${entry.sha.slice(0, 8)}`);
  console.log(`Timestamp: ${entry.timestamp}\n`);

  for (const suite of entry.suites) {
    console.log(`## ${suite.suite}\n`);

    for (const result of suite.results) {
      const status = result.passed ? "✓" : "✗";
      const target = result.targetMs ? ` (target: <${result.targetMs}ms)` : "";
      console.log(`${status} ${result.name}`);
      console.log(`  avg: ${formatMs(result.avgMs)}${target}`);
      console.log(`  ops/sec: ${result.opsPerSec.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`);
      console.log("");
    }
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Fetch latest bench-data
  const fetchProc = Bun.spawn(["git", "fetch", "origin", "bench-data"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  await fetchProc.exited;

  const entries = await fetchHistory();

  if (entries.length === 0) {
    console.log("No benchmark history found.");
    return;
  }

  // Parse args
  const shaIndex = args.indexOf("--sha");
  const shaArg = shaIndex !== -1 ? args[shaIndex + 1] : undefined;
  if (shaArg) {
    const entry = entries.find((e) => e.sha.startsWith(shaArg));

    if (!entry) {
      console.error(`No benchmark found for SHA: ${shaArg}`);
      process.exit(1);
    }

    showDetails(entry);
    return;
  }

  // Check for -n flag
  let count = 20;
  const nIndex = args.indexOf("-n");
  const nArg = nIndex !== -1 ? args[nIndex + 1] : undefined;
  if (nArg) {
    count = parseInt(nArg, 10) || 20;
  }

  showSummary(entries, count);
}

main();
