/**
 * Renderer pure-path benchmarks.
 *
 * Covers the CPU-bound computation inside the renderer that runs on every
 * keypress, scroll, and mouse-move event — without requiring a DOM environment.
 *
 * Key performance targets:
 * - computeSelectionRects: <1ms for 1K-line selection (viewport-sized)
 * - sliceTokensToRange: <0.01ms per segment (called once per visible segment)
 *
 * These functions are called on the critical render path:
 * - computeSelectionRects: every selection change (typed char, cursor move)
 * - sliceTokensToRange: every repaint of highlighted text
 *
 * Note: DomRenderer.render(), hitTest(), and renderCursor() require a DOM
 * environment. Those benchmarks live in the manual perf harness (playground).
 */

import { createBuffer } from "../src/buffer/buffer.ts";
import { createMultiBuffer } from "../src/multibuffer/multibuffer.ts";
import type { BufferId, BufferRow, ExcerptRange, MultiBufferRow } from "../src/multibuffer/types.ts";
import { computeSelectionRects } from "../src/renderer/dom.ts";
import type { Token } from "../src/renderer/highlighter.ts";
import { WrapMap } from "../src/renderer/wrap-map.ts";
import type { BenchmarkSuite } from "./harness.ts";

// biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in benchmarks
const id = "bench-renderer" as BufferId;

function generateText(lines: number, lineLen = 40): string {
  return Array.from(
    { length: lines },
    (_, i) => `Line ${i + 1}: ${"x".repeat(lineLen - 10)}`,
  ).join("\n");
}

function makeRange(lines: number): ExcerptRange {
  // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in benchmarks
  const start = { row: 0 as BufferRow, column: 0 };
  // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in benchmarks
  const end = { row: (lines - 1) as BufferRow, column: 0 };
  const span = { start, end };
  return { context: span, primary: span };
}

function makeSnapshot(lines: number, lineLen = 40) {
  const buf = createBuffer(id, generateText(lines, lineLen));
  const mb = createMultiBuffer();
  mb.addExcerpt(buf, makeRange(lines));
  return mb.snapshot();
}

const snap1k = makeSnapshot(1000);
const snap10k = makeSnapshot(10_000);
// Lines ~40 chars wide; wrap at 20 → each line wraps into 2 visual rows
const snap1kWrap = makeSnapshot(1000, 40);

// Pre-built WrapMaps to avoid re-construction overhead in per-benchmark fn
const wrapMap1k = new WrapMap(snap1k, 200);
const wrapMap1kWrap = new WrapMap(snap1kWrap, 20);

// Standard renderer measurements (typical code editor)
const lineHeight = 20;
const charWidth = 8;
const gutterWidth = 48;
const wrapWidth = 200;

// biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in benchmarks
const point = (row: number, col: number) => ({ row: row as MultiBufferRow, column: col });

/**
 * Generate a synthetic token list for a line of a given length.
 * Mimics real syntax-highlighted output: keyword, space, identifier, punctuation.
 */
function makeTokens(lineLen: number): Token[] {
  // Distribute tokens evenly across the line
  const segLen = Math.floor(lineLen / 4);
  return [
    { startColumn: 0, endColumn: segLen, color: "#569cd6" },              // keyword
    { startColumn: segLen, endColumn: segLen * 2, color: "#d4d4d4" },     // text
    { startColumn: segLen * 2, endColumn: segLen * 3, color: "#9cdcfe" }, // identifier
    { startColumn: segLen * 3, endColumn: lineLen, color: "#ce9178" },    // string
  ];
}

// Token list for a 40-char line
const tokens40 = makeTokens(40);
// Token list for a 200-char line (long lines stress sliceTokensToRange more)
const tokens200 = makeTokens(200);

/**
 * Inline implementation of sliceTokensToRange used in dom.ts.
 * Reproduced here because it is not exported; benchmarks the same computation
 * path exercised during every repaint of a wrapped segment.
 */
function sliceTokensToRange(tokens: Token[], segStart: number, segEnd: number): Token[] {
  const result: Token[] = [];
  for (const t of tokens) {
    if (t.endColumn <= segStart || t.startColumn >= segEnd) continue;
    result.push({
      startColumn: Math.max(0, t.startColumn - segStart),
      endColumn: Math.min(segEnd - segStart, t.endColumn - segStart),
      color: t.color,
    });
  }
  return result;
}

export const rendererBenchmarks: BenchmarkSuite = {
  name: "Renderer Pure-Path",
  benchmarks: [
    // ─── computeSelectionRects ────────────────────────────────────────────────
    {
      name: "computeSelectionRects - single-line selection, no wrap",
      iterations: 10000,
      targetMs: 0.05,
      fn: () => {
        computeSelectionRects(
          point(100, 5),
          point(100, 20),
          snap1k,
          lineHeight,
          charWidth,
          gutterWidth,
          wrapWidth,
          wrapMap1k,
        );
      },
    },
    {
      name: "computeSelectionRects - 10-line selection, no wrap",
      iterations: 5000,
      targetMs: 0.1,
      fn: () => {
        computeSelectionRects(
          point(100, 5),
          point(110, 20),
          snap1k,
          lineHeight,
          charWidth,
          gutterWidth,
          wrapWidth,
          wrapMap1k,
        );
      },
    },
    {
      name: "computeSelectionRects - 100-line selection, no wrap",
      iterations: 1000,
      targetMs: 1,
      fn: () => {
        computeSelectionRects(
          point(100, 0),
          point(200, 0),
          snap1k,
          lineHeight,
          charWidth,
          gutterWidth,
          wrapWidth,
          wrapMap1k,
        );
      },
    },
    {
      name: "computeSelectionRects - 1K-line select-all, no wrap",
      iterations: 100,
      targetMs: 5,
      fn: () => {
        computeSelectionRects(
          point(0, 0),
          point(999, 30),
          snap1k,
          lineHeight,
          charWidth,
          gutterWidth,
          wrapWidth,
          wrapMap1k,
        );
      },
    },
    {
      name: "computeSelectionRects - 10-line selection, wrapping (wrapWidth=20)",
      iterations: 2000,
      targetMs: 0.5,
      fn: () => {
        computeSelectionRects(
          point(100, 5),
          point(110, 20),
          snap1kWrap,
          lineHeight,
          charWidth,
          gutterWidth,
          20, // wrap width in visual columns
          wrapMap1kWrap,
        );
      },
    },
    {
      name: "computeSelectionRects - 100-line selection, wrapping (wrapWidth=20)",
      iterations: 500,
      targetMs: 2,
      fn: () => {
        computeSelectionRects(
          point(100, 0),
          point(200, 0),
          snap1kWrap,
          lineHeight,
          charWidth,
          gutterWidth,
          20,
          wrapMap1kWrap,
        );
      },
    },
    // ─── sliceTokensToRange ───────────────────────────────────────────────────
    // Called once per visible segment per repaint; must be very cheap.
    {
      name: "sliceTokensToRange - 4 tokens, segment covering half line (40 chars)",
      iterations: 100000,
      targetMs: 0.005,
      fn: () => {
        sliceTokensToRange(tokens40, 10, 30);
      },
    },
    {
      name: "sliceTokensToRange - 4 tokens, segment at start (200 chars)",
      iterations: 100000,
      targetMs: 0.005,
      fn: () => {
        sliceTokensToRange(tokens200, 0, 50);
      },
    },
    // ─── WrapMap rebuild on resize ────────────────────────────────────────────
    // WrapMap is rebuilt on every window resize; the 10K case represents a large
    // document open in a resized window (the worst-case latency spike).
    {
      name: "WrapMap rebuild on viewport resize - 1K lines (no wrap → no wrap)",
      iterations: 500,
      targetMs: 1,
      fn: () => {
        new WrapMap(snap1k, 200);
      },
    },
    {
      name: "WrapMap rebuild on viewport resize - 10K lines (no wrap → no wrap)",
      iterations: 50,
      targetMs: 10,
      fn: () => {
        new WrapMap(snap10k, 200);
      },
    },
    // ─── Viewport calculation (scroll performance) ────────────────────────────
    // Large viewport scrolling: totalVisualRows changes with WrapMap;
    // bufferRowToFirstVisualRow is called for every line in the visible range.
    {
      name: "bufferRowToFirstVisualRow - scan 50-row viewport (no wrap)",
      iterations: 10000,
      targetMs: 0.05,
      fn: () => {
        for (let r = 475; r < 525; r++) {
          // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in benchmarks
          wrapMap1k.bufferRowToFirstVisualRow(r as MultiBufferRow);
        }
      },
    },
    {
      name: "bufferRowToFirstVisualRow - scan 50-row viewport (wrapping)",
      iterations: 10000,
      targetMs: 0.05,
      fn: () => {
        for (let r = 475; r < 525; r++) {
          // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in benchmarks
          wrapMap1kWrap.bufferRowToFirstVisualRow(r as MultiBufferRow);
        }
      },
    },
  ],
};
