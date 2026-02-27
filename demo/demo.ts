/**
 * Demo harness for the multibuffer DOM renderer.
 * Uses actual source files from src/multibuffer/ as excerpt content.
 */

import { createBuffer } from "../src/multibuffer/buffer.ts";
import { createMultiBuffer } from "../src/multibuffer/multibuffer.ts";
import type { BufferId, BufferPoint, BufferRow } from "../src/multibuffer/types.ts";
import { createDomRenderer } from "../src/multibuffer_renderer/dom.ts";
import { createViewport } from "../src/multibuffer_renderer/measurement.ts";
import type { Measurements } from "../src/multibuffer_renderer/types.ts";
import { sources } from "./sources.gen.ts";

function point(row: number, col: number): BufferPoint {
  // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in demo
  return { row: row as BufferRow, column: col };
}

function range(startRow: number, endRow: number) {
  const context = { start: point(startRow, 0), end: point(endRow, 0) };
  return { context, primary: context };
}

function main() {
  const mb = createMultiBuffer();

  for (const src of sources) {
    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in demo
    const buf = createBuffer(src.path as BufferId, src.content);
    const lineCount = src.content.split("\n").length;

    if (src.path.includes("single-line")) {
      // Single-line file: show the whole thing
      mb.addExcerpt(buf, range(0, lineCount), { hasTrailingNewline: true });
    } else if (src.path.includes("large-file")) {
      // Large file: show two separate excerpts (functions + data)
      mb.addExcerpt(buf, range(10, 28), { hasTrailingNewline: true });
      mb.addExcerpt(buf, range(80, 105), { hasTrailingNewline: true });
    } else {
      // Default: show up to 20 lines from the top
      const end = Math.min(20, lineCount);
      mb.addExcerpt(buf, range(0, end), { hasTrailingNewline: true });
    }
  }

  const measurements: Measurements = {
    lineHeight: 20,
    charWidth: 8.4,
    gutterWidth: 48,
    wrapWidth: 60,
  };

  const renderer = createDomRenderer(measurements);
  const container = document.getElementById("editor");
  if (!container) {
    console.error("No #editor element found");
    return;
  }

  renderer.mount(container);

  const snapshot = mb.snapshot();
  renderer.setSnapshot(snapshot);

  const viewport = createViewport(
    0,
    container.clientHeight,
    container.clientWidth,
    measurements,
    snapshot.lineCount,
  );

  const lines = snapshot.lines(viewport.startRow, viewport.endRow);
  const boundaries = snapshot.excerptBoundaries(viewport.startRow, viewport.endRow);

  const excerptHeaders = boundaries.map((b) => ({
    // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic
    row: (b.prev ? b.row - 1 : b.row) as import("../src/multibuffer/types.ts").MultiBufferRow,
    path: b.next.bufferId,
    label: `L${b.next.range.context.start.row + 1}\u2013${b.next.range.context.end.row}`,
  }));

  renderer.render(
    {
      viewport,
      selections: [],
      decorations: [],
      excerptHeaders,
      focused: false,
    },
    lines,
  );
}

main();
