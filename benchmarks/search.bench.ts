/**
 * SearchController benchmarks.
 *
 * Measures _performSearch latency, which runs on every find() call and on
 * every text change while a query is active.  The hot path:
 *   snap.lines() → join("\n") → regex match → lineOffsets → anchor creation
 *
 * After the perf(search) optimization the lineOffset step is O(L) instead
 * of O(T), where L = line count and T = total characters.
 */

import { createBuffer } from "../src/buffer/buffer.ts";
import { Editor } from "../src/editor/editor.ts";
import { SearchController } from "../src/editor/search.ts";
import { createMultiBuffer } from "../src/multibuffer/multibuffer.ts";
import type { BufferId, BufferRow } from "../src/multibuffer/types.ts";
import type { BenchmarkSuite } from "./harness.ts";

function makeSearchSetup(lineCount: number): { editor: Editor; search: SearchController } {
  // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in benchmarks
  const bufferId = `bench-search-${lineCount}` as BufferId;
  const text = Array.from(
    { length: lineCount },
    (_, i) => `Line ${i + 1}: function foo() { return ${i}; } // TODO: fix`,
  ).join("\n");
  const buf = createBuffer(bufferId, text);
  const mb = createMultiBuffer();
  const lineRows = text.split("\n").length;
  // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in benchmarks
  const start = { row: 0 as BufferRow, column: 0 };
  // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in benchmarks
  const end = { row: lineRows as BufferRow, column: 0 };
  const excerptRange = { context: { start, end }, primary: { start, end } };
  mb.addExcerpt(buf, excerptRange);
  return { editor: new Editor(mb), search: new SearchController(new Editor(mb)) };
}

let searchSetup1k: ReturnType<typeof makeSearchSetup>;
let searchSetup10k: ReturnType<typeof makeSearchSetup>;

export const searchBenchmarks: BenchmarkSuite = {
  name: "SearchController (_performSearch latency)",
  benchmarks: [
    {
      // find() on a 1K-line buffer: regex match + lineOffset computation.
      // lineOffset step is now O(L=1K) instead of O(T≈50K chars).
      name: "search.find - literal (1K lines, ~25 matches)",
      iterations: 200,
      targetMs: 5,
      setup: () => {
        searchSetup1k = makeSearchSetup(1000);
        searchSetup1k.search.clear();
      },
      fn: () => {
        searchSetup1k.search.find("TODO");
        searchSetup1k.search.clear();
      },
    },
    {
      // find() on a 10K-line buffer: measures scaling behaviour.
      // lineOffset step is O(L=10K) instead of O(T≈500K chars).
      name: "search.find - literal (10K lines, ~250 matches)",
      iterations: 50,
      targetMs: 20,
      setup: () => {
        searchSetup10k = makeSearchSetup(10_000);
        searchSetup10k.search.clear();
      },
      fn: () => {
        searchSetup10k.search.find("TODO");
        searchSetup10k.search.clear();
      },
    },
  ],
};
