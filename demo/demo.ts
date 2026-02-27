/**
 * Demo harness for the multibuffer DOM renderer with editing support.
 */

import { Editor } from "../src/editor/editor.ts";
import { InputHandler } from "../src/editor/input-handler.ts";
import { createBuffer } from "../src/multibuffer/buffer.ts";
import { createMultiBuffer } from "../src/multibuffer/multibuffer.ts";
import type {
  BufferId,
  BufferPoint,
  BufferRow,
} from "../src/multibuffer/types.ts";
import { createDomRenderer } from "../src/multibuffer_renderer/dom.ts";
import { Highlighter } from "../src/multibuffer_renderer/highlighter.ts";
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

async function main() {
  const mb = createMultiBuffer();

  for (const src of sources) {
    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in demo
    const buf = createBuffer(src.path as BufferId, src.content);
    const lineCount = src.content.split("\n").length;

    if (src.path.includes("single-line")) {
      mb.addExcerpt(buf, range(0, lineCount), { hasTrailingNewline: true });
    } else if (src.path.includes("large-file")) {
      mb.addExcerpt(buf, range(10, 28), { hasTrailingNewline: true });
      mb.addExcerpt(buf, range(80, 105), { hasTrailingNewline: true });
    } else {
      const end = Math.min(20, lineCount);
      mb.addExcerpt(buf, range(0, end), { hasTrailingNewline: true });
    }
  }

  const measurements: Measurements = {
    lineHeight: 20,
    charWidth: 8.4,
    gutterWidth: 48,
    wrapWidth: 120,
  };

  const renderer = createDomRenderer(measurements);
  const container = document.getElementById("editor");
  if (!container) {
    console.error("No #editor element found");
    return;
  }

  renderer.mount(container);

  // Initialize syntax highlighting
  const highlighter = new Highlighter();
  try {
    await highlighter.init(
      "./wasm/tree-sitter.wasm",
      "./wasm/tree-sitter-typescript.wasm",
    );
    for (const src of sources) {
      highlighter.parseBuffer(src.path, src.content);
    }
    renderer.setHighlighter(highlighter);
  } catch (e) {
    console.warn("Syntax highlighting unavailable:", e);
  }

  // Set up editor
  const editor = new Editor(mb);

  // Render function: refreshes the display from current state
  function renderAll() {
    if (!container) return;
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
    const boundaries = snapshot.excerptBoundaries(
      viewport.startRow,
      viewport.endRow,
    );

    const excerptHeaders = boundaries
      .filter((b) => b.prev !== undefined)
      .map((b) => ({
        // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic
        row: (b.row - 1) as import("../src/multibuffer/types.ts").MultiBufferRow,
        path: b.next.bufferId,
        label: `L${b.next.range.context.start.row + 1}\u2013${b.next.range.context.end.row}`,
      }));

    renderer.render(
      {
        viewport,
        selections: [],
        decorations: [],
        excerptHeaders,
        focused: true,
      },
      lines,
    );

    // Render cursor and selection
    const cursor = editor.cursor;
    renderer.renderCursor(cursor);

    const sel = editor.selection;
    if (sel) {
      const start = snapshot.resolveAnchor(sel.range.start);
      const end = snapshot.resolveAnchor(sel.range.end);
      renderer.renderSelection(start, end);
    } else {
      renderer.renderSelection(undefined, undefined);
    }
  }

  // Wire editor state changes to re-render
  editor.onChange(renderAll);

  // Wire mouse clicks to cursor placement
  renderer.onClickPosition((clickPoint) => {
    editor.setCursor(clickPoint);
  });

  // Wire keyboard input
  const inputHandler = new InputHandler((command) => {
    editor.dispatch(command);
  });
  inputHandler.mount(container);

  // Focus the input handler on container click
  container.addEventListener("mousedown", () => {
    inputHandler.focus();
  });

  // Initial render
  renderAll();
  inputHandler.focus();
}

main();
