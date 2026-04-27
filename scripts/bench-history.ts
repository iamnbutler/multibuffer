#!/usr/bin/env bun
/**
 * View benchmark history from the bench-data branch.
 *
 * Usage:
 *   bun scripts/bench-history.ts                   # Last 20 results (summary)
 *   bun scripts/bench-history.ts --sha <sha>        # Specific commit's results
 *   bun scripts/bench-history.ts -n 50             # Last 50 results
 *   bun scripts/bench-history.ts --compare <a> <b> # Compare two commits (regression check)
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

function fmtOrNA(v: number | null): string {
  return v !== null ? formatMs(v).padStart(8) : "N/A".padStart(8);
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

/** Build a flat map of benchmark name → avgMs for an entry. */
function buildBenchMap(entry: HistoryEntry): Map<string, number> {
  const map = new Map<string, number>();
  for (const suite of entry.suites) {
    for (const result of suite.results) {
      map.set(`${suite.suite}/${result.name}`, result.avgMs);
    }
  }
  return map;
}

/** Format a percent change with sign, e.g. "+12.3%" or "-5.1%". */
function fmtPct(pct: number): string {
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

/**
 * Compare two benchmark entries and print a regression/improvement report.
 *
 * A benchmark is a regression when avgMs increases by more than 5%.
 * A benchmark is an improvement when avgMs decreases by more than 5%.
 * Benchmarks within ±5% are considered unchanged (noise floor).
 */
function showComparison(baseEntry: HistoryEntry, headEntry: HistoryEntry): void {
  const NOISE_THRESHOLD = 0.05; // 5% noise floor

  const baseMap = buildBenchMap(baseEntry);
  const headMap = buildBenchMap(headEntry);

  const regressions: string[] = [];
  const improvements: string[] = [];
  const unchanged: string[] = [];
  const newBenches: string[] = [];
  const removedBenches: string[] = [];

  for (const [key, headMs] of headMap) {
    const baseMs = baseMap.get(key);
    if (baseMs === undefined) {
      newBenches.push(key);
      continue;
    }
    const pct = (headMs - baseMs) / baseMs;
    if (pct > NOISE_THRESHOLD) {
      regressions.push(`  ✗ ${key}\n    ${formatMs(baseMs)} → ${formatMs(headMs)} (${fmtPct(pct * 100)})`);
    } else if (pct < -NOISE_THRESHOLD) {
      improvements.push(`  ✓ ${key}\n    ${formatMs(baseMs)} → ${formatMs(headMs)} (${fmtPct(pct * 100)})`);
    } else {
      unchanged.push(`    ${key}`);
    }
  }

  for (const key of baseMap.keys()) {
    if (!headMap.has(key)) {
      removedBenches.push(key);
    }
  }

  console.log(`\nBenchmark Comparison`);
  console.log(`  base: ${baseEntry.sha.slice(0, 8)} (${baseEntry.timestamp.split("T")[0]})`);
  console.log(`  head: ${headEntry.sha.slice(0, 8)} (${headEntry.timestamp.split("T")[0]})`);
  console.log(`  noise floor: ±${(NOISE_THRESHOLD * 100).toFixed(0)}%\n`);

  if (regressions.length > 0) {
    console.log(`Regressions (${regressions.length}):`);
    for (const r of regressions) console.log(r);
    console.log("");
  }

  if (improvements.length > 0) {
    console.log(`Improvements (${improvements.length}):`);
    for (const imp of improvements) console.log(imp);
    console.log("");
  }

  if (newBenches.length > 0) {
    console.log(`New benchmarks (${newBenches.length}):`);
    for (const b of newBenches) console.log(`  + ${b}`);
    console.log("");
  }

  if (removedBenches.length > 0) {
    console.log(`Removed benchmarks (${removedBenches.length}):`);
    for (const b of removedBenches) console.log(`  - ${b}`);
    console.log("");
  }

  if (regressions.length === 0 && improvements.length === 0) {
    console.log(`No significant changes (all within ±${(NOISE_THRESHOLD * 100).toFixed(0)}% noise floor).`);
  }

  console.log(`Unchanged: ${unchanged.length} benchmarks`);
  console.log("");

  if (regressions.length > 0) {
    process.exit(1); // Signal regression to caller (e.g. CI)
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

  // --compare sha1 sha2: show diff between two commits
  const compareIndex = args.indexOf("--compare");
  if (compareIndex !== -1) {
    const baseSha = args[compareIndex + 1];
    const headSha = args[compareIndex + 2];
    if (!baseSha || !headSha) {
      console.error("Usage: --compare <base-sha> <head-sha>");
      process.exit(1);
    }
    const baseEntry = entries.find((e) => e.sha.startsWith(baseSha));
    const headEntry = entries.find((e) => e.sha.startsWith(headSha));
    if (!baseEntry) {
      console.error(`No benchmark found for base SHA: ${baseSha}`);
      process.exit(1);
    }
    if (!headEntry) {
      console.error(`No benchmark found for head SHA: ${headSha}`);
      process.exit(1);
    }
    showComparison(baseEntry, headEntry);
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
