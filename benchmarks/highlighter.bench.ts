/**
 * Highlighter benchmarks.
 *
 * Measures the actual tree-sitter parse performance:
 * - Full parse: fresh parse with no old tree
 * - Incremental parse: with old tree + TreeEdit descriptor after a small edit
 *
 * Uses async `setup` to load tree-sitter WASM (same paths as the test suite).
 */

import * as path from "node:path";
import type { TreeEdit } from "../src/renderer/highlighter.ts";
import { Highlighter } from "../src/renderer/highlighter.ts";
import type { BenchmarkSuite } from "./harness.ts";

const WASM_DIR = path.join(import.meta.dir, "../playground/wasm");

/** Generate a large TypeScript-like source string. */
function generateLargeSource(lines: number): string {
  return Array.from(
    { length: lines },
    (_, i) =>
      `const variable${i}: number = ${i}; // line ${i} with some extra text to be realistic`,
  ).join("\n");
}

/**
 * Generate nested TypeScript-like source.
 *
 * `generateLargeSource` emits flat top-level statements, i.e. maximum root
 * fanout — a shape that overstates per-row `getLineTokens` cost relative to
 * real code. Nested source is the honest case for the viewport benchmarks.
 */
function generateNestedSource(classes: number): string {
  return Array.from(
    { length: classes },
    (_, i) => `class Widget${i} {
  private items${i}: Map<string, number[]> = new Map();

  add${i}(key: string, value: number): void {
    if (!this.items${i}.has(key)) {
      this.items${i}.set(key, []);
    }
    this.items${i}.get(key)?.push(value);
  }

  total${i}(): number {
    let sum = 0;
    for (const [, values] of this.items${i}) {
      for (const v of values) {
        sum += v > ${i} ? v : 0;
      }
    }
    return sum;
  }
}`,
  ).join("\n\n");
}

const largeSource1k = generateLargeSource(1000);
const largeSource5k = generateLargeSource(5000);
const nestedSource = generateNestedSource(60); // ~1.3K lines
const flatSource4k = generateLargeSource(4000);

/** Renderers call getLineTokens once per visible row; 50 is a typical viewport. */
const VIEWPORT_ROWS = 50;
const nestedMidRow = Math.floor(nestedSource.split("\n").length / 2);
const flat4kMidRow = 2000;

/**
 * Build symmetric forward (const→let) and reverse (let→const) edit descriptors
 * for the midpoint of the source. Each direction is a valid incremental edit
 * so benchmarks can alternate without a full re-parse to restore state.
 */
function makeSymmetricEdits(source: string): {
  modified: string;
  forwardEdit: TreeEdit;
  reverseEdit: TreeEdit;
} {
  const lines = source.split("\n");
  const midLine = Math.floor(lines.length / 2);
  const linesBefore = lines.slice(0, midLine);
  const startIndex =
    linesBefore.reduce((sum, l) => sum + l.length + 1, 0); // +1 for "\n"

  const constLen = 5; // "const"
  const letLen = 3;   // "let"

  const modified =
    source.slice(0, startIndex) +
    "let" +
    source.slice(startIndex + constLen);

  // Forward: const → let
  const forwardEdit: TreeEdit = {
    startIndex,
    oldEndIndex: startIndex + constLen,
    newEndIndex: startIndex + letLen,
    startPosition: { row: midLine, column: 0 },
    oldEndPosition: { row: midLine, column: constLen },
    newEndPosition: { row: midLine, column: letLen },
  };

  // Reverse: let → const (the inverse operation)
  const reverseEdit: TreeEdit = {
    startIndex,
    oldEndIndex: startIndex + letLen,
    newEndIndex: startIndex + constLen,
    startPosition: { row: midLine, column: 0 },
    oldEndPosition: { row: midLine, column: letLen },
    newEndPosition: { row: midLine, column: constLen },
  };

  return { modified, forwardEdit, reverseEdit };
}

const edits1k = makeSymmetricEdits(largeSource1k);
const edits5k = makeSymmetricEdits(largeSource5k);

// Shared highlighter initialized by the first benchmark's setup
let highlighter: Highlighter;

export const highlighterBenchmarks: BenchmarkSuite = {
  name: "Highlighter Operations",
  benchmarks: [
    // ── Full parse (1K lines) ───────────────────────────────────
    {
      name: "Full parse - 1K lines (no old tree)",
      iterations: 50,
      targetMs: 20,
      setup: async () => {
        highlighter = new Highlighter();
        await highlighter.init(
          path.join(WASM_DIR, "tree-sitter.wasm"),
          path.join(WASM_DIR, "tree-sitter-typescript.wasm"),
        );
      },
      fn: () => {
        // Parse with a unique bufferId each time so there is no cached old tree
        highlighter.parseBuffer(`full-1k-${Math.random()}`, largeSource1k);
      },
    },

    // ── Incremental parse (1K lines) ────────────────────────────
    {
      name: "Incremental parse - 1K lines (old tree + TreeEdit)",
      iterations: 200,
      targetMs: 10,
      setup: () => {
        // Seed the old tree with the original source
        highlighter.parseBuffer("incr-1k", largeSource1k);
      },
      fn: (() => {
        // Alternate between forward (const→let) and reverse (let→const) edits
        // so each fn call measures exactly one incremental parse.
        let isForward = true;
        return () => {
          if (isForward) {
            highlighter.parseBuffer(
              "incr-1k",
              edits1k.modified,
              edits1k.forwardEdit,
            );
          } else {
            highlighter.parseBuffer(
              "incr-1k",
              largeSource1k,
              edits1k.reverseEdit,
            );
          }
          isForward = !isForward;
        };
      })(),
    },

    // ── Full parse (5K lines) ───────────────────────────────────
    {
      name: "Full parse - 5K lines (no old tree)",
      iterations: 20,
      targetMs: 100,
      fn: () => {
        highlighter.parseBuffer(`full-5k-${Math.random()}`, largeSource5k);
      },
    },

    // ── Incremental parse (5K lines) ────────────────────────────
    {
      name: "Incremental parse - 5K lines (old tree + TreeEdit)",
      iterations: 100,
      targetMs: 50,
      setup: () => {
        highlighter.parseBuffer("incr-5k", largeSource5k);
      },
      fn: (() => {
        // Alternate between forward (const→let) and reverse (let→const) edits
        // so each fn call measures exactly one incremental parse.
        let isForward = true;
        return () => {
          if (isForward) {
            highlighter.parseBuffer(
              "incr-5k",
              edits5k.modified,
              edits5k.forwardEdit,
            );
          } else {
            highlighter.parseBuffer(
              "incr-5k",
              largeSource5k,
              edits5k.reverseEdit,
            );
          }
          isForward = !isForward;
        };
      })(),
    },

    // ── getLineTokens after parse (1K lines) ────────────────────
    {
      name: "getLineTokens - middle line of 1K-line buffer",
      iterations: 10_000,
      targetMs: 1,
      setup: () => {
        highlighter.parseBuffer("tokens-1k", largeSource1k);
      },
      fn: () => {
        highlighter.getLineTokens("tokens-1k", 500);
      },
    },

    // ── getLineTokens across a whole viewport ───────────────────
    // The single-row benchmark above measures one row of a *flat* fixture,
    // which is both the cheapest shape to prune and an unrepresentative one.
    // Renderers call getLineTokens once per visible row (dom.ts, canvas.ts,
    // webgpu.ts), so per-viewport cost is what actually lands in a frame.
    {
      name: "getLineTokens - 50-row viewport of nested source (~1.3K lines)",
      iterations: 200,
      targetMs: 2,
      setup: () => {
        highlighter.parseBuffer("viewport-nested", nestedSource);
      },
      fn: () => {
        let sink = 0;
        for (let r = nestedMidRow; r < nestedMidRow + VIEWPORT_ROWS; r++) {
          sink += highlighter.getLineTokens("viewport-nested", r).length;
        }
        if (sink < 0) throw new Error("unreachable");
      },
    },

    // Flat/generated source is the degenerate shape: root fanout grows with
    // document length, so this is where per-viewport cost scales with N.
    {
      name: "getLineTokens - 50-row viewport of flat 4K-line source",
      iterations: 50,
      targetMs: 5,
      setup: () => {
        highlighter.parseBuffer("viewport-flat4k", flatSource4k);
      },
      fn: () => {
        let sink = 0;
        for (let r = flat4kMidRow; r < flat4kMidRow + VIEWPORT_ROWS; r++) {
          sink += highlighter.getLineTokens("viewport-flat4k", r).length;
        }
        if (sink < 0) throw new Error("unreachable");
      },
    },
  ],
};
