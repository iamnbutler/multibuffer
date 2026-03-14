/**
 * Demo harness for the multibuffer DOM renderer with editing support.
 */

import { createBuffer } from "../src/buffer/buffer.ts";
import type { BufferId } from "../src/buffer/types.ts";
import { createDiffController } from "../src/diff/controller.ts";
import { createUnifiedDiff } from "../src/diff/unified.ts";
import { Editor } from "../src/editor/editor.ts";
import { InputHandler } from "../src/editor/input-handler.ts";
import { createMultiBuffer } from "../src/multibuffer/multibuffer.ts";
import type {
  BufferPoint,
  BufferRow,
  Buffer as MbBuffer,
  MultiBuffer,
  MultiBufferRow,
} from "../src/multibuffer/types.ts";
import { createDomRenderer } from "../src/renderer/dom.ts";
import { Highlighter } from "../src/renderer/highlighter.ts";
import { createViewport } from "../src/renderer/measurement.ts";
import type { Measurements } from "../src/renderer/types.ts";
import { mountDiffView } from "./diff-renderer.ts";
import { sources } from "./sources.gen.ts";

/** Identifies a named fixture scenario in the demo. */
type ScenarioId =
  | "all"
  | "large-file"
  | "many-excerpts"
  | "unicode"
  | "long-lines"
  | "empty"
  | "single-line"
  | "diff-single"
  | "diff-multi"
  | "diff-editable";

interface Scenario {
  readonly id: ScenarioId;
  readonly label: string;
  /** If true, this scenario renders a diff view instead of the editor. */
  readonly isDiff?: boolean;
  build(m: MultiBuffer): void;
}

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

  // Keep Buffer references so we can re-parse syntax highlighting after edits.
  const bufferObjects = new Map<string, MbBuffer>();

  for (const src of sources) {
    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in demo
    const buf = createBuffer(src.path as BufferId, src.content);
    bufferObjects.set(src.path, buf);
    const lineCount = buf.snapshot().lineCount;

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
    // charWidth is auto-measured by the renderer from the actual font
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

  // Initialize syntax highlighting.
  // parsedVersions tracks which buffer version was last parsed so renderAll()
  // can skip re-parsing buffers that haven't changed.
  const parsedVersions = new Map<string, number>();
  const highlighter = new Highlighter();
  try {
    await highlighter.init(
      "./wasm/tree-sitter.wasm",
      "./wasm/tree-sitter-typescript.wasm",
    );
    for (const src of sources) {
      highlighter.parseBuffer(src.path, src.content);
      const buf = bufferObjects.get(src.path);
      if (buf) parsedVersions.set(src.path, buf.version);
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

    // Re-parse any buffers whose content has changed since the last parse.
    // This keeps syntax highlighting correct after edits.
    if (highlighter.ready) {
      for (const [bufferId, buf] of bufferObjects) {
        const lastVersion = parsedVersions.get(bufferId) ?? -1;
        if (buf.version > lastVersion) {
          highlighter.parseBuffer(bufferId, buf.snapshot().text());
          parsedVersions.set(bufferId, buf.version);
        }
      }
    }

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
  editor.on("change", renderAll);

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
    if (command.type === "copy") {
      const text = editor.getSelectedText();
      if (text) {
        navigator.clipboard.writeText(text);
      }
    } else if (command.type === "cut") {
      const text = editor.getCutText();
      if (text) {
        navigator.clipboard.writeText(text);
      }
    }
    editor.dispatch(command);
  });
  inputHandler.mount(container);

  // Wire focus state to cursor blink animation
  const textarea = container.querySelector("textarea");
  if (textarea) {
    textarea.addEventListener("focus", () => renderer.setFocused(true));
    textarea.addEventListener("blur", () => renderer.setFocused(false));
  }

  // Focus the input handler on container click
  container.addEventListener("mousedown", () => {
    inputHandler.focus();
  });

  // Initial render
  renderAll();
  inputHandler.focus();

  // ── Fixture Scenario Switcher ──────────────────────────────────────────────────

  const fixtureSrcs = sources.filter((s) => s.path.startsWith("demo/fixtures/"));

  function buildDefault(m: MultiBuffer): void {
    for (const src of sources) {
      // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in demo
      const buf = createBuffer(src.path as BufferId, src.content);
      const lineCount = buf.snapshot().lineCount;
      if (src.path.includes("single-line")) {
        m.addExcerpt(buf, range(0, lineCount), { hasTrailingNewline: true });
      } else if (src.path.includes("large-file")) {
        m.addExcerpt(buf, range(10, 28), { hasTrailingNewline: true });
        m.addExcerpt(buf, range(80, 105), { hasTrailingNewline: true });
      } else {
        m.addExcerpt(buf, range(0, Math.min(20, lineCount)), { hasTrailingNewline: true });
      }
    }
  }

  const scenarios: Scenario[] = [
    { id: "all", label: "All files", build: buildDefault },
    {
      id: "large-file",
      label: "Single large buffer",
      build(m) {
        const src = fixtureSrcs.find((s) => s.path.includes("large-file"));
        if (!src) return;
        // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in demo
        const buf = createBuffer(src.path as BufferId, src.content);
        const lineCount = buf.snapshot().lineCount;
        m.addExcerpt(buf, range(0, lineCount), { hasTrailingNewline: true });
      },
    },
    {
      id: "many-excerpts",
      label: "Many excerpts",
      build(m) {
        for (const src of sources) {
          // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in demo
          const buf = createBuffer(src.path as BufferId, src.content);
          const lineCount = buf.snapshot().lineCount;
          for (let start = 0; start + 3 <= lineCount; start += 10) {
            m.addExcerpt(buf, range(start, Math.min(start + 3, lineCount)), {
              hasTrailingNewline: true,
            });
          }
        }
      },
    },
    {
      id: "unicode",
      label: "Unicode",
      build(m) {
        const src = fixtureSrcs.find((s) => s.path.includes("unicode"));
        if (!src) return;
        // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in demo
        const buf = createBuffer(src.path as BufferId, src.content);
        m.addExcerpt(buf, range(0, buf.snapshot().lineCount), {
          hasTrailingNewline: true,
        });
      },
    },
    {
      id: "long-lines",
      label: "Long lines",
      build(m) {
        const src = fixtureSrcs.find((s) => s.path.includes("long-lines"));
        if (!src) return;
        // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in demo
        const buf = createBuffer(src.path as BufferId, src.content);
        m.addExcerpt(buf, range(0, buf.snapshot().lineCount), {
          hasTrailingNewline: true,
        });
      },
    },
    {
      id: "empty",
      label: "Empty & whitespace",
      build(m) {
        const src = fixtureSrcs.find((s) =>
          s.path.includes("empty-and-whitespace"),
        );
        if (!src) return;
        // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in demo
        const buf = createBuffer(src.path as BufferId, src.content);
        m.addExcerpt(buf, range(0, buf.snapshot().lineCount), {
          hasTrailingNewline: true,
        });
      },
    },
    {
      id: "single-line",
      label: "Single line",
      build(m) {
        const src = fixtureSrcs.find((s) => s.path.includes("single-line"));
        if (!src) return;
        // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in demo
        const buf = createBuffer(src.path as BufferId, src.content);
        m.addExcerpt(buf, range(0, buf.snapshot().lineCount), {
          hasTrailingNewline: true,
        });
      },
    },
    {
      id: "diff-single",
      label: "Unified Diff (single)",
      isDiff: true,
      build() {
        // no-op: diff scenarios render via mountDiffView
      },
    },
    {
      id: "diff-multi",
      label: "Unified Diff (multi)",
      isDiff: true,
      build() {
        // no-op: diff scenarios render via mountDiffView
      },
    },
    {
      id: "diff-editable",
      label: "Editable Diff",
      isDiff: true,
      build() {
        // no-op: handled by mountEditableDiff
      },
    },
  ];

  let activeScenarioId: ScenarioId = "all";
  let diffUnmount: (() => void) | null = null;

  // Scroll container created by the DomRenderer — we toggle its visibility for diff mode
  const scrollContainer = container.firstElementChild;

  function switchScenario(id: ScenarioId): void {
    if (id === activeScenarioId) return;
    activeScenarioId = id;

    // Clean up previous diff view if any
    if (diffUnmount) {
      diffUnmount();
      diffUnmount = null;
    }

    const scenario = scenarios.find((s) => s.id === id);
    if (!scenario) return;

    if (scenario.isDiff) {
      // Hide the editor scroll container
      if (scrollContainer instanceof HTMLElement) {
        scrollContainer.style.display = "none";
      }
      if (container) diffUnmount = renderDiffScenario(id, container);
    } else {
      // Show the editor scroll container
      if (scrollContainer instanceof HTMLElement) {
        scrollContainer.style.display = "";
      }
      const toRemove = mb.excerpts.map((e) => e.id);
      for (const excerptId of toRemove) {
        mb.removeExcerpt(excerptId);
      }
      scenario.build(mb);
      // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in demo
      editor.setCursor({ row: 0 as MultiBufferRow, column: 0 });
    }
  }

  function renderDiffScenario(
    id: ScenarioId,
    target: HTMLElement,
  ): () => void {
    if (id === "diff-single") {
      return renderSingleBufferDiff(target);
    }
    if (id === "diff-editable") {
      return mountEditableDiff(target);
    }
    return renderMultiBufferDiff(target);
  }

  function renderSingleBufferDiff(target: HTMLElement): () => void {
    // Use the first source file and create a modified version
    const src = sources[0];
    if (!src) return () => {};

    const oldText = src.content;
    const oldLines = oldText.split("\n");
    const newLines = [...oldLines];

    // Simulate realistic edits: modify some lines, add some, remove some
    if (newLines.length > 3) {
      newLines[2] = `${newLines[2]} // updated`;
    }
    if (newLines.length > 8) {
      newLines.splice(8, 0, "// NEW: inserted line", "// NEW: another inserted line");
    }
    if (newLines.length > 5) {
      newLines.splice(5, 1); // delete one line
    }
    const newText = newLines.join("\n");

    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in demo
    const oldId = `${src.path} (before)` as BufferId;
    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in demo
    const newId = `${src.path} (after)` as BufferId;

    const diff = createUnifiedDiff(oldId, oldText, newId, newText);
    return mountDiffView(target, [{ label: src.path, diff }]);
  }

  function renderMultiBufferDiff(target: HTMLElement): () => void {
    const files: Array<{ label: string; diff: ReturnType<typeof createUnifiedDiff> }> = [];

    // Create diffs for up to 4 source files with varied edit patterns
    const editPatterns = [
      // Pattern 0: modify a few lines
      (lines: string[]) => {
        const out = [...lines];
        if (out.length > 2) out[1] = `${out[1]} // refactored`;
        if (out.length > 6) out[5] = `${out[5]} // updated`;
        return out;
      },
      // Pattern 1: add lines
      (lines: string[]) => {
        const out = [...lines];
        const insertAt = Math.min(4, out.length);
        out.splice(insertAt, 0, "  // TODO: handle edge case", "  // TODO: add tests");
        return out;
      },
      // Pattern 2: remove lines
      (lines: string[]) => {
        const out = [...lines];
        if (out.length > 10) out.splice(3, 2);
        return out;
      },
      // Pattern 3: mixed edits
      (lines: string[]) => {
        const out = [...lines];
        if (out.length > 4) out[3] = "  // rewritten logic";
        if (out.length > 8) out.splice(7, 1);
        if (out.length > 6) out.splice(5, 0, "  // added validation");
        return out;
      },
    ];

    const maxFiles = Math.min(4, sources.length);
    for (let i = 0; i < maxFiles; i++) {
      const src = sources[i];
      if (!src) continue;

      const pattern = editPatterns[i % editPatterns.length];
      if (!pattern) continue;

      const oldLines = src.content.split("\n");
      const newLines = pattern(oldLines);

      // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in demo
      const oldId = `${src.path} (old)` as BufferId;
      // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in demo
      const newId = `${src.path} (new)` as BufferId;

      const diff = createUnifiedDiff(oldId, src.content, newId, newLines.join("\n"));
      files.push({ label: src.path, diff });
    }

    return mountDiffView(target, files);
  }

  /**
   * Mount an editable diff view using DiffController for live re-diff on edit.
   * This demonstrates the full diff editing pipeline:
   * - DiffController manages a MultiBuffer with delete/insert/equal excerpts
   * - Delete excerpts are non-editable (from old buffer)
   * - Insert/equal excerpts are editable (from new buffer)
   * - Edits trigger re-diff: convergence collapses pairs, divergence creates new pairs
   * - DomRenderer in gutterMode: "diff" shows dual line numbers
   */
  function mountEditableDiff(target: HTMLElement): () => void {
    // Use the first source file and create a modified version
    const src = sources[0];
    if (!src) return () => {};

    const oldText = src.content;
    const oldLines = oldText.split("\n");
    const newLines = [...oldLines];

    // Simulate edits: modify, add, and remove lines
    if (newLines.length > 3) {
      newLines[2] = `${newLines[2]} // updated`;
    }
    if (newLines.length > 8) {
      newLines.splice(8, 0, "// NEW: inserted line", "// NEW: another inserted line");
    }
    if (newLines.length > 5) {
      newLines.splice(5, 1); // delete one line
    }
    const newText = newLines.join("\n");

    // Create buffers
    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in demo
    const oldId = `${src.path} (before)` as BufferId;
    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in demo
    const newId = `${src.path} (after)` as BufferId;
    const oldBuf = createBuffer(oldId, oldText);
    const newBuf = createBuffer(newId, newText);

    // Create DiffController for live re-diff on edit
    const diffController = createDiffController(oldBuf, newBuf, { debounceMs: 150 });
    const diffMb = diffController.multiBuffer;

    // Create diff renderer with dual gutter mode
    const diffMeasurements: Measurements = {
      lineHeight: 20,
      gutterWidth: 48, // Not used in diff mode, but required
      wrapWidth: 0, // No wrapping for now
      gutterMode: "diff",
    };

    const diffRenderer = createDomRenderer(diffMeasurements);
    diffRenderer.mount(target);
    diffRenderer.setSnapshot(diffMb.snapshot());

    // Create editor for the diff MultiBuffer
    const diffEditor = new Editor(diffMb);

    // Render function - uses current decorations from controller
    function renderDiff() {
      const snapshot = diffMb.snapshot();
      diffRenderer.setSnapshot(snapshot);

      const viewport = createViewport(
        diffRenderer.getScrollTop(),
        target.clientHeight,
        target.clientWidth,
        diffMeasurements,
        snapshot.lineCount,
      );

      const lines = snapshot.lines(viewport.startRow, viewport.endRow);

      // Diff mode: no excerpt headers - show unified view without fragmentation
      diffRenderer.render(
        {
          viewport,
          selections: [],
          decorations: diffController.decorations,
          excerptHeaders: [],
          focused: true,
        },
        lines,
      );

      // Render cursor and selection
      const cursor = diffEditor.cursor;
      diffRenderer.renderCursor(cursor);
      diffRenderer.scrollTo({ row: cursor.row, strategy: "nearest" });

      const sel = diffEditor.selection;
      if (sel) {
        const start = snapshot.resolveAnchor(sel.range.start);
        const end = snapshot.resolveAnchor(sel.range.end);
        diffRenderer.renderSelection(start, end);
      } else {
        diffRenderer.renderSelection(undefined, undefined);
      }
    }

    // Wire editor changes to re-render AND notify controller for re-diff
    diffEditor.on("change", () => {
      renderDiff();
      diffController.notifyChange();
    });

    // Subscribe to controller updates (after debounced re-diff)
    diffController.onUpdate(() => {
      renderDiff();
    });

    // Wire mouse interactions
    diffRenderer.onClickPosition((clickPoint) => {
      diffEditor.setCursor(clickPoint);
    });
    diffRenderer.onDrag((dragPoint) => {
      diffEditor.extendSelectionTo(dragPoint);
    });
    diffRenderer.onDoubleClick((clickPoint) => {
      diffEditor.selectWordAt(clickPoint);
    });
    diffRenderer.onTripleClick((clickPoint) => {
      diffEditor.selectLineAt(clickPoint);
    });

    // Wire keyboard input
    const diffInputHandler = new InputHandler((command) => {
      if (command.type === "copy") {
        const text = diffEditor.getSelectedText();
        if (text) navigator.clipboard.writeText(text);
      } else if (command.type === "cut") {
        const text = diffEditor.getCutText();
        if (text) navigator.clipboard.writeText(text);
      }
      diffEditor.dispatch(command);
    });
    diffInputHandler.mount(target);

    // Wire focus state
    const textarea = target.querySelector("textarea");
    if (textarea) {
      textarea.addEventListener("focus", () => diffRenderer.setFocused(true));
      textarea.addEventListener("blur", () => diffRenderer.setFocused(false));
    }

    // Focus on container click
    target.addEventListener("mousedown", () => {
      diffInputHandler.focus();
    });

    // Initial render
    renderDiff();
    diffInputHandler.focus();

    // Return cleanup function
    return () => {
      diffController.dispose();
      diffRenderer.unmount();
      diffInputHandler.unmount();
    };
  }

  function createScenarioPicker(): HTMLElement {
    const panel = document.createElement("div");
    panel.style.cssText = [
      "position:fixed",
      "top:8px",
      "right:8px",
      "display:flex",
      "flex-direction:column",
      "gap:1px",
      "background:#3c3836",
      "border:1px solid #504945",
      "border-radius:4px",
      "padding:4px",
      "z-index:1000",
      "font-size:11px",
      "font-family:inherit",
    ].join(";");

    const heading = document.createElement("div");
    heading.textContent = "Fixture";
    heading.style.cssText =
      "color:#928374;padding:2px 6px 4px;text-transform:uppercase;letter-spacing:.05em;";
    panel.appendChild(heading);

    const btns: Array<{ el: HTMLButtonElement; id: ScenarioId }> = [];

    function refreshHighlight(): void {
      for (const { el, id } of btns) {
        el.style.fontWeight = id === activeScenarioId ? "bold" : "normal";
        el.style.color = id === activeScenarioId ? "#fabd2f" : "#ebdbb2";
      }
    }

    for (const scenario of scenarios) {
      const btn = document.createElement("button");
      btn.textContent = scenario.label;
      btn.style.cssText = [
        "display:block",
        "background:none",
        "border:none",
        "text-align:left",
        "color:#ebdbb2",
        "padding:3px 8px",
        "border-radius:3px",
        "cursor:pointer",
        "font-family:inherit",
        "font-size:11px",
        "white-space:nowrap",
      ].join(";");
      btns.push({ el: btn, id: scenario.id });
      btn.addEventListener("mouseover", () => {
        if (scenario.id !== activeScenarioId) btn.style.background = "#504945";
      });
      btn.addEventListener("mouseout", () => {
        btn.style.background = "none";
      });
      btn.addEventListener("mousedown", (e) => e.preventDefault());
      btn.addEventListener("click", () => {
        switchScenario(scenario.id);
        refreshHighlight();
        inputHandler.focus();
      });
      panel.appendChild(btn);
    }

    refreshHighlight();
    return panel;
  }

  document.body.appendChild(createScenarioPicker());

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
