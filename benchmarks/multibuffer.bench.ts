/**
 * MultiBuffer benchmarks.
 *
 * Key performance targets:
 * - excerptAt: O(log n) via binary search
 * - Visible lines fetch: <1ms for viewport
 * - Position conversion: <0.01ms
 * - 100 excerpts: <10ms initialization
 * - Anchor resolution: <0.01ms single, <1ms batch 100
 */

import { createBuffer } from "../src/multibuffer/buffer.ts";
import { createMultiBuffer } from "../src/multibuffer/multibuffer.ts";
import type {
  Anchor,
  BufferId,
  BufferPoint,
  BufferRow,
  ExcerptRange,
  MultiBuffer,
  MultiBufferRow,
  MultiBufferSnapshot,
} from "../src/multibuffer/types.ts";
import { Bias } from "../src/multibuffer/types.ts";
import type { BenchmarkSuite } from "./harness.ts";

function generateText(lines: number): string {
  return Array.from(
    { length: lines },
    (_, i) => `Line ${i + 1}: Some text content here`,
  ).join("\n");
}

function point(row: number, col: number): BufferPoint {
  // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
  return { row: row as BufferRow, column: col };
}

function range(startRow: number, endRow: number): ExcerptRange {
  const context = { start: point(startRow, 0), end: point(endRow, 0) };
  return { context, primary: context };
}

// biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
const id = "bench-buffer" as BufferId;

let mb100: MultiBuffer;
let snap100: MultiBufferSnapshot;
let totalRows100: number;
let anchors: Anchor[];

export const multibufferBenchmarks: BenchmarkSuite = {
  name: "MultiBuffer Operations",
  benchmarks: [
    {
      name: "Add 100 excerpts",
      iterations: 100,
      targetMs: 10,
      fn: () => {
        const mb = createMultiBuffer();
        const buf = createBuffer(id, generateText(1000));
        for (let i = 0; i < 100; i++) {
          mb.addExcerpt(buf, range(i * 10, (i + 1) * 10));
        }
      },
    },
    {
      name: "excerptAt lookup (100 excerpts, random row)",
      iterations: 10000,
      targetMs: 0.01,
      setup: () => {
        mb100 = createMultiBuffer();
        const buf = createBuffer(id, generateText(1000));
        for (let i = 0; i < 100; i++) {
          mb100.addExcerpt(buf, range(i * 10, (i + 1) * 10));
        }
        snap100 = mb100.snapshot();
        totalRows100 = snap100.lineCount;
      },
      fn: () => {
        const row = Math.floor(Math.random() * totalRows100);
        // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
        snap100.excerptAt(row as MultiBufferRow);
      },
    },
    {
      name: "excerptAt at start/middle/end (verify O(log n))",
      iterations: 10000,
      targetMs: 0.01,
      fn: () => {
        // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
        snap100.excerptAt(0 as MultiBufferRow);
        // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
        snap100.excerptAt(Math.floor(totalRows100 / 2) as MultiBufferRow);
        // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
        snap100.excerptAt((totalRows100 - 1) as MultiBufferRow);
      },
    },
    {
      name: "Fetch 50 lines (viewport)",
      iterations: 1000,
      targetMs: 1,
      fn: () => {
        const start = Math.floor(Math.random() * Math.max(1, totalRows100 - 50));
        // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
        snap100.lines(start as MultiBufferRow, (start + 50) as MultiBufferRow);
      },
    },
    {
      name: "toBufferPoint conversion",
      iterations: 10000,
      targetMs: 0.01,
      fn: () => {
        const row = Math.floor(Math.random() * totalRows100);
        // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
        snap100.toBufferPoint({ row: row as MultiBufferRow, column: 5 });
      },
    },
    {
      name: "Anchor resolution - single",
      iterations: 10000,
      targetMs: 0.01,
      setup: () => {
        mb100 = createMultiBuffer();
        const buf = createBuffer(id, generateText(1000));
        for (let i = 0; i < 100; i++) {
          mb100.addExcerpt(buf, range(i * 10, (i + 1) * 10));
        }
        anchors = [];
        for (let i = 0; i < 100; i++) {
          const row = i * 10 + 5;
          // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
          const a = mb100.createAnchor({ row: row as MultiBufferRow, column: 3 }, Bias.Right);
          if (a) anchors.push(a);
        }
        snap100 = mb100.snapshot();
      },
      fn: () => {
        const a = anchors[Math.floor(Math.random() * anchors.length)];
        if (a) snap100.resolveAnchor(a);
      },
    },
    {
      name: "Anchor resolution - batch 100 (loop)",
      iterations: 100,
      targetMs: 1,
      fn: () => {
        for (const a of anchors) {
          snap100.resolveAnchor(a);
        }
      },
    },
    {
      name: "Anchor resolution - batch 100 (resolveAnchors)",
      iterations: 100,
      targetMs: 1,
      fn: () => {
        snap100.resolveAnchors(anchors);
      },
    },
    {
      name: "Snapshot creation (100 excerpts)",
      iterations: 1000,
      targetMs: 0.1,
      fn: () => {
        mb100.snapshot();
      },
    },
  ],
};
