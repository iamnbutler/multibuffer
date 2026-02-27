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
      renderer.getScrollTop(),
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
    renderer.scrollTo({ row: cursor.row, strategy: "nearest" });

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

  // Wire mouse interactions
  renderer.onClickPosition((clickPoint) => {
    editor.setCursor(clickPoint);
  });
  renderer.onDrag((dragPoint) => {
    editor.extendSelectionTo(dragPoint);
  });
  renderer.onDoubleClick((clickPoint) => {
    editor.selectWordAt(clickPoint);
  });
  renderer.onTripleClick((clickPoint) => {
    editor.selectLineAt(clickPoint);
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

  // ── Debug API ───────────────────────────────────────────────────

  /** Return plain serializable editor state (no branded types). */
  function getState() {
    const cursor = editor.cursor;
    const snap = mb.snapshot();
    const sel = editor.selection;
    let selectionRange: {
      start: { row: number; column: number };
      end: { row: number; column: number };
    } | null = null;
    if (sel) {
      const s = snap.resolveAnchor(sel.range.start);
      const e = snap.resolveAnchor(sel.range.end);
      if (s && e) {
        selectionRange = {
          start: { row: Number(s.row), column: s.column },
          end: { row: Number(e.row), column: e.column },
        };
      }
    }
    return {
      cursor: { row: Number(cursor.row), column: cursor.column },
      lineCount: snap.lineCount,
      selectionRange,
    };
  }

  /** Return full buffer text. */
  function getText() {
    const snap = mb.snapshot();
    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction for debug API
    const startRow = 0 as import("../src/multibuffer/types.ts").MultiBufferRow;
    // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic for debug API
    const endRow = snap.lineCount as import("../src/multibuffer/types.ts").MultiBufferRow;
    return snap.lines(startRow, endRow).join("\n");
  }

  /** Parse "Meta+Shift+ArrowRight" → KeyboardEventInit. */
  function parseKeyCombo(combo: string): KeyboardEventInit & { key: string } {
    const parts = combo.split("+");
    const key = parts.pop() ?? "";
    const init: KeyboardEventInit & { key: string } = {
      key,
      bubbles: true,
      cancelable: true,
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
    };
    for (const mod of parts) {
      const m = mod.toLowerCase();
      if (m === "meta" || m === "cmd") init.metaKey = true;
      else if (m === "ctrl" || m === "control") init.ctrlKey = true;
      else if (m === "shift") init.shiftKey = true;
      else if (m === "alt" || m === "opt" || m === "option") init.altKey = true;
    }
    return init;
  }

  /** Simulate a keypress on the hidden textarea. */
  function simulatePress(combo: string) {
    const textarea = container?.querySelector("textarea");
    if (!textarea) return;
    textarea.focus();
    const init = parseKeyCombo(combo);
    textarea.dispatchEvent(new KeyboardEvent("keydown", init));
  }

  /** Simulate typing text into the hidden textarea. */
  function simulateType(text: string) {
    const textarea = container?.querySelector("textarea");
    if (!textarea) return;
    textarea.focus();
    for (const ch of text) {
      // For regular characters, set value and fire input event
      textarea.value = ch;
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  // Connect to debug WebSocket
  const wsUrl = `ws://${location.host}/ws?role=browser`;
  const ws = new WebSocket(wsUrl);
  ws.onopen = () => console.log("[debug] Connected to debug server");
  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      const { id, cmd } = msg;
      let result: Record<string, number | string | boolean | null | Record<string, number>> | ReturnType<typeof getState> = { error: "unhandled" };

      switch (cmd) {
        case "getState":
          result = getState();
          break;
        case "getText":
          result = { text: getText() };
          break;
        case "dispatch":
          editor.dispatch(msg.command);
          result = getState();
          break;
        case "press":
          simulatePress(msg.key);
          result = getState();
          break;
        case "type":
          simulateType(msg.text);
          result = getState();
          break;
        case "click": {
          // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction for debug API
          const clickRow = msg.row as import("../src/multibuffer/types.ts").MultiBufferRow;
          editor.setCursor({ row: clickRow, column: msg.column });
          result = getState();
          break;
        }
        default:
          result = { error: `Unknown command: ${cmd}` };
      }

      ws.send(JSON.stringify({ id, result }));
    } catch (err) {
      console.error("[debug] Error handling message:", err);
    }
  };

  // Expose on window for direct console access too
  // biome-ignore lint/plugin/no-type-assertion: expect: extending window for debug API
  (window as unknown as Record<string, unknown>).__editor = {
    editor,
    multiBuffer: mb,
    renderer,
    inputHandler,
    getState,
    getText,
  };
}

main();
