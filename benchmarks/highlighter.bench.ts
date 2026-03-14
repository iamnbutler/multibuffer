/**
 * Highlighter benchmarks.
 *
 * NOTE: The Highlighter uses web-tree-sitter which requires WASM loading.
 * WASM cannot be loaded in the `bun run bench` harness (no browser/WASI
 * environment). These benchmarks therefore measure what CAN be benchmarked
 * synchronously:
 *
 * - `colorForNodeType` lookups (the hot path during token collection)
 * - `getLineTokens` on an unparsed buffer (early-return path)
 * - Token array generation (simulates _collectTokens output)
 *
 * Full parse and incremental-parse benchmarks require a WASM-capable
 * environment; run the test suite (`bun test`) for correctness validation
 * of incremental parsing.
 */

import type { Token } from "../src/renderer/highlighter.ts";
import { Highlighter } from "../src/renderer/highlighter.ts";
import { colorForNodeType } from "../src/renderer/theme.ts";
import type { BenchmarkSuite } from "./harness.ts";

/** Representative node types exercised during a TypeScript highlight pass. */
const NODE_TYPES = [
  "const",
  "let",
  "function",
  "return",
  "string_fragment",
  "number",
  "comment",
  "type_identifier",
  "property_identifier",
  "=",
  "(",
  "true",
  "this",
  "identifier", // falls through to "default"
];

/** Generate a realistic token array for a single line. */
function generateTokens(count: number): Token[] {
  const tokens: Token[] = [];
  let col = 0;
  for (let i = 0; i < count; i++) {
    const width = 4 + (i % 6); // variable token widths
    tokens.push({
      startColumn: col,
      endColumn: col + width,
      color: colorForNodeType(NODE_TYPES[i % NODE_TYPES.length] ?? "identifier"),
    });
    col += width + 1; // +1 gap
  }
  return tokens;
}

/** Generate a large TypeScript-like source string. */
function generateLargeSource(lines: number): string {
  return Array.from(
    { length: lines },
    (_, i) => `const variable${i}: number = ${i}; // line ${i}`,
  ).join("\n");
}

const highlighter = new Highlighter();

const largeSource1k = generateLargeSource(1000);
const largeSource10k = generateLargeSource(10_000);

export const highlighterBenchmarks: BenchmarkSuite = {
  name: "Highlighter Operations",
  benchmarks: [
    // ── colorForNodeType lookup ──────────────────────────────────
    {
      name: "colorForNodeType - keyword",
      iterations: 100_000,
      targetMs: 0.001,
      fn: () => {
        colorForNodeType("const");
      },
    },
    {
      name: "colorForNodeType - all categories (14 types)",
      iterations: 50_000,
      targetMs: 0.01,
      fn: () => {
        for (const t of NODE_TYPES) {
          colorForNodeType(t);
        }
      },
    },

    // ── getLineTokens early-return (no tree) ─────────────────────
    {
      name: "getLineTokens - unparsed buffer (early return)",
      iterations: 100_000,
      targetMs: 0.001,
      fn: () => {
        highlighter.getLineTokens("nonexistent", 0);
      },
    },

    // ── Token array generation (simulates _collectTokens output) ─
    {
      name: "Generate 10-token array (short line)",
      iterations: 50_000,
      targetMs: 0.005,
      fn: () => {
        generateTokens(10);
      },
    },
    {
      name: "Generate 50-token array (long line)",
      iterations: 10_000,
      targetMs: 0.02,
      fn: () => {
        generateTokens(50);
      },
    },

    // ── parseBuffer without WASM (no-op when parser is null) ─────
    // This measures the overhead of the parseBuffer code path when
    // tree-sitter is not initialized (guards + Map lookup).
    {
      name: "parseBuffer - no parser (guard overhead, 1K source)",
      iterations: 50_000,
      targetMs: 0.001,
      fn: () => {
        highlighter.parseBuffer("bench-noparse", largeSource1k);
      },
    },
    {
      name: "parseBuffer - no parser (guard overhead, 10K source)",
      iterations: 50_000,
      targetMs: 0.001,
      fn: () => {
        highlighter.parseBuffer("bench-noparse-10k", largeSource10k);
      },
    },
  ],
};
