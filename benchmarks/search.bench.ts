/**
 * SearchController benchmarks.
 *
 * Measures the full search pipeline, navigation, and replace operations.
 * `_performSearch()` runs on every keystroke while search is active — its
 * cost directly adds to keypress latency.
 *
 * Key performance targets (from CLAUDE.md):
 * - Keypress to model update: <1ms
 *
 * Pipeline for find():
 *   snap.lines()          O(lines) — collect all lines
 *   lines.join("\n")      allocates full document string
 *   _computeLineOffsets() O(chars) scan → line-offset array
 *   regex.exec()          repeated scan across full text
 *   createAnchor()        × number of matches
 */

import { createBuffer } from "../src/buffer/buffer.ts";
import { Editor } from "../src/editor/editor.ts";
import { SearchController } from "../src/editor/search.ts";
import { createMultiBuffer } from "../src/multibuffer/multibuffer.ts";
import type { BufferId, BufferRow, ExcerptRange, MultiBufferRow } from "../src/multibuffer/types.ts";
import type { BenchmarkSuite } from "./harness.ts";

// biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in benchmarks
const bufferId = "bench-search" as BufferId;

/**
 * Build a lineCount-line buffer with matchCount occurrences of "TODO"
 * distributed evenly. Returns a ready-to-use editor + search controller pair.
 */
function makeSearchEditor(
  lineCount: number,
  matchCount: number,
): { editor: Editor; search: SearchController } {
  const matchInterval = matchCount > 0 ? Math.floor(lineCount / matchCount) : lineCount + 1;
  const lines = Array.from({ length: lineCount }, (_, i) => {
    const matchIndex = matchInterval > 0 ? Math.floor(i / matchInterval) : -1;
    if (matchInterval > 0 && i % matchInterval === 0 && matchIndex < matchCount) {
      return `Line ${i + 1}: TODO task here`;
    }
    return `Line ${i + 1}: Some text content here`;
  });
  const text = lines.join("\n");
  const buf = createBuffer(bufferId, text);
  const mb = createMultiBuffer();
  const lineRows = lines.length;
  // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in benchmarks
  const start = { row: 0 as BufferRow, column: 0 };
  // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in benchmarks
  const end = { row: lineRows as BufferRow, column: 0 };
  const range: ExcerptRange = { context: { start, end }, primary: { start, end } };
  mb.addExcerpt(buf, range);
  const editor = new Editor(mb);
  const search = new SearchController(editor);
  return { editor, search };
}

let searchFind1k: SearchController;
let searchFind10k: SearchController;
let searchFindRegex1k: SearchController;
let searchNext1k: SearchController;
let searchReplaceAll1k: SearchController;
let searchViewport1k: SearchController;

export const searchBenchmarks: BenchmarkSuite = {
  name: "SearchController (keystroke search latency)",
  benchmarks: [
    {
      // Full search pipeline on a 1K-line buffer: snap.lines() + join + offset
      // computation + regex scan + anchor creation for 10 matches.
      // Represents keystroke cost while search is active.
      name: "find() - literal (1K lines, 10 matches)",
      iterations: 1000,
      targetMs: 1,
      setup: () => {
        const { search } = makeSearchEditor(1000, 10);
        searchFind1k = search;
      },
      fn: () => {
        searchFind1k.find("TODO");
      },
    },
    {
      // Same pipeline at 10K lines — measures O(lines) + O(chars) scaling.
      name: "find() - literal (10K lines, 100 matches)",
      iterations: 200,
      targetMs: 10,
      setup: () => {
        const { search } = makeSearchEditor(10_000, 100);
        searchFind10k = search;
      },
      fn: () => {
        searchFind10k.find("TODO");
      },
    },
    {
      // Regex path: pattern compilation + regex scan vs literal substring.
      // Measures incremental cost of the regex option flag.
      name: "find() - regex (1K lines, 10 matches)",
      iterations: 1000,
      targetMs: 1,
      setup: () => {
        const { search } = makeSearchEditor(1000, 10);
        searchFindRegex1k = search;
      },
      fn: () => {
        searchFindRegex1k.find("T.D.", { regex: true });
      },
    },
    {
      // Navigation: index increment + _selectActiveResult() anchor resolution.
      // Should be significantly cheaper than the full search pipeline.
      // 1000 iterations cycle through 10 results 100 times.
      name: "next() - navigate results (1K lines, 10 matches)",
      iterations: 1000,
      targetMs: 0.5,
      setup: () => {
        const { search } = makeSearchEditor(1000, 10);
        search.find("TODO");
        searchNext1k = search;
      },
      fn: () => {
        searchNext1k.next();
      },
    },
    {
      // Batch replace: anchor resolution × 10 + buffer edits × 10 + re-search.
      // Replacing "TODO" with "TODO" (identity) keeps matches stable across
      // iterations so setup is called only once.
      // Use low iterations — each call applies 10 rope edits.
      name: "replaceAll() - literal (1K lines, 10 matches)",
      iterations: 50,
      targetMs: 5,
      setup: () => {
        const { search } = makeSearchEditor(1000, 10);
        search.find("TODO");
        searchReplaceAll1k = search;
      },
      fn: () => {
        searchReplaceAll1k.replaceAll("TODO");
      },
    },
    {
      // Viewport highlight rendering: resolve only results in the visible 50-row
      // window. Simulates the per-frame highlight pass during scrolling.
      name: "resolveResultsInViewport() - 50 rows (1K lines, 10 matches)",
      iterations: 1000,
      targetMs: 0.5,
      setup: () => {
        const { search } = makeSearchEditor(1000, 10);
        search.find("TODO");
        searchViewport1k = search;
      },
      fn: () => {
        // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in benchmarks
        searchViewport1k.resolveResultsInViewport(0 as MultiBufferRow, 50 as MultiBufferRow);
      },
    },
  ],
};
