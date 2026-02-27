/**
 * Benchmark run history tracking.
 *
 * Appends results to benchmarks/history.jsonl keyed by git SHA.
 * Repeat runs on the same SHA replace the previous entry.
 */

import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { SuiteResult } from "./harness.ts";

export interface HistoryEntry {
  sha: string;
  timestamp: string;
  suites: SuiteResult[];
}

const HISTORY_PATH = join(import.meta.dir, "history.jsonl");

async function currentSha(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "HEAD"], { stdout: "pipe", stderr: "pipe" });
  await proc.exited;
  const out = await new Response(proc.stdout).text();
  return out.trim();
}

export async function saveHistory(suites: SuiteResult[]): Promise<void> {
  const sha = await currentSha();
  const entry: HistoryEntry = {
    sha,
    timestamp: new Date().toISOString(),
    suites,
  };

  let lines: string[] = [];
  if (existsSync(HISTORY_PATH)) {
    const raw = await readFile(HISTORY_PATH, "utf8");
    lines = raw
      .split("\n")
      .filter((l: string) => l.trim() !== "")
      // Replace any existing entry for this SHA
      .filter((l: string) => {
        try {
          return (JSON.parse(l) as HistoryEntry).sha !== sha;
        } catch {
          return true;
        }
      });
  }

  lines.push(JSON.stringify(entry));
  await writeFile(HISTORY_PATH, lines.join("\n") + "\n");
  console.log(`\nHistory saved → benchmarks/history.jsonl (sha: ${sha.slice(0, 8)})`);
}
