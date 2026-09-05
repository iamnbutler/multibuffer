/**
 * Theme-colour resolution tests for the two `CanvasRenderer` entry points that
 * repaint the cursor and the selection on their own.
 *
 * A `Theme` value may be a CSS `var()` reference — that is the whole reason
 * `canvas.ts` carries `resolveCssColor()` / `_resolveColor()`, and it is how
 * `colorForNodeType()` in `src/renderer/theme.ts` hands colours to the
 * renderers. The DOM renderer gets this for free because the browser resolves
 * `var()` in a style attribute; canvas does not — assigning an unparseable
 * string to `ctx.fillStyle` is a silent no-op that leaves the *previous* fill
 * colour in force.
 *
 * `render()` resolves both values (`_renderSelections`, `_renderCursor`), but
 * the public `renderCursor()` / `renderSelection()` methods — which
 * `editor-view.ts`, `diff-editor-view.ts` and `use-diff-view.ts` call after
 * every render — reach `_drawCursor()` / `_drawSelectionRange()`, which assign
 * `this._theme.cursor` / `this._theme.selection` raw.
 *
 * These tests drive the real renderer against a recording stand-in for the 2D
 * context and assert on the fill colour actually in force when the cursor and
 * selection rectangles are painted.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import type { MultiBufferPoint, MultiBufferSnapshot } from "../../src/multibuffer/types.ts";
import { CanvasRenderer } from "../../src/renderer/canvas.ts";
import type { Measurements, RenderState, Viewport } from "../../src/renderer/types.ts";
import { mbPoint, mbRow } from "../helpers.ts";

const LINE_HEIGHT = 20;
const CHAR_WIDTH = 8;
const GUTTER_WIDTH = 40;
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;

const MEASUREMENTS: Measurements = {
  lineHeight: LINE_HEIGHT,
  charWidth: CHAR_WIDTH,
  gutterWidth: GUTTER_WIDTH,
};

const LINES = ["const a = 1;", "const b = 2;", "const c = 3;"];

/** Cursor/selection colours as a `var()`-based theme supplies them. */
const CURSOR_VAR = "var(--editor-cursor, #abcdef)";
const CURSOR_FALLBACK = "#abcdef";
const SELECTION_VAR = "var(--editor-selection, #fedcba)";
const SELECTION_FALLBACK = "#fedcba";

/** One recorded call on the stand-in context, with the fill colour in force. */
interface Call {
  readonly op: "fillRect" | "fillText" | "drawImage";
  readonly args: readonly number[];
  readonly fillStyle: string;
}

/**
 * Minimal recording stand-in for `CanvasRenderingContext2D`.
 * Only the members `canvas.ts` and its glyph atlas touch are provided.
 */
function makeRecordingContext(calls: Call[]): CanvasRenderingContext2D {
  const ctx = {
    canvas: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
    fillStyle: "",
    strokeStyle: "",
    font: "",
    textAlign: "",
    textBaseline: "",
    globalCompositeOperation: "",
    imageSmoothingEnabled: false,
    lineWidth: 1,
    fillRect: (...args: number[]) => calls.push({ op: "fillRect", args, fillStyle: ctx.fillStyle }),
    fillText: (_text: string, x: number, y: number) =>
      calls.push({ op: "fillText", args: [x, y], fillStyle: ctx.fillStyle }),
    drawImage: (_image: unknown, ...args: number[]) =>
      calls.push({ op: "drawImage", args, fillStyle: ctx.fillStyle }),
    clearRect: () => {},
    measureText: (text: string) => ({ width: text.length * CHAR_WIDTH }),
    save: () => {},
    restore: () => {},
    scale: () => {},
    translate: () => {},
    beginPath: () => {},
    closePath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    fill: () => {},
    stroke: () => {},
    rect: () => {},
    clip: () => {},
  };
  // biome-ignore lint/plugin/no-type-assertion: expect: test stand-in implements the subset of CanvasRenderingContext2D the renderer uses
  return ctx as unknown as CanvasRenderingContext2D;
}

/** Build a minimal single-excerpt snapshot over `LINES`. */
function makeSnapshot(): MultiBufferSnapshot {
  const wholeRange = {
    start: { row: mbRow(0), column: 0 },
    end: { row: mbRow(LINES.length), column: 0 },
  };
  const snapshot = {
    lineCount: LINES.length,
    version: 1,
    excerpts: [],
    lines: (start: number, end: number) => LINES.slice(start, end),
    excerptAt: () => ({
      bufferId: "test-buffer",
      startRow: mbRow(0),
      endRow: mbRow(LINES.length),
      range: { context: wholeRange, primary: wholeRange },
    }),
    clipPoint: (point: unknown) => point,
    resolveAnchors: () => [],
    excerptBoundaries: () => [],
  };
  // biome-ignore lint/plugin/no-type-assertion: expect: test stub implements the subset of MultiBufferSnapshot the renderer uses
  return snapshot as unknown as MultiBufferSnapshot;
}

const VIEWPORT: Viewport = {
  startRow: mbRow(0),
  endRow: mbRow(LINES.length),
  scrollTop: 0,
  height: CANVAS_HEIGHT,
  width: CANVAS_WIDTH,
};

const RENDER_STATE: RenderState = {
  viewport: VIEWPORT,
  selections: [],
  decorations: [],
  excerptHeaders: [],
  focused: true,
};

let window: Window;
const savedProperties: Array<[object, string, PropertyDescriptor | undefined]> = [];

/** Define `name` on `target`, remembering what was there so it can be put back. */
function define(target: object, name: string, descriptor: PropertyDescriptor): void {
  savedProperties.push([target, name, Object.getOwnPropertyDescriptor(target, name)]);
  Object.defineProperty(target, name, { configurable: true, ...descriptor });
}

function defineGlobal(name: string, value: unknown): void {
  define(globalThis, name, { value, writable: true });
}

/**
 * Install happy-dom plus the 2D-context stand-ins.
 *
 * happy-dom returns null from `HTMLCanvasElement.getContext`, which makes
 * `mount()` throw, and the glyph atlas needs an `OffscreenCanvas` that does not
 * exist outside a browser. happy-dom also lays nothing out, so every element
 * measures 0 and the renderer would size its canvas to 0×0.
 *
 * Everything installed here — including the patches on happy-dom's *shared*
 * element prototypes, which outlive the `Window` instance — is restored in
 * `teardownDom()`. `glyph-atlas.test.ts` decides at module load whether to skip
 * by probing `OffscreenCanvas` and `document.createElement("canvas")`, so a
 * `getContext` patch left behind here silently changes that file's behaviour.
 */
function setupDom(calls: Call[]): void {
  window = new Window({ width: CANVAS_WIDTH, height: CANVAS_HEIGHT });
  defineGlobal("window", window);
  defineGlobal("document", window.document);
  defineGlobal("getComputedStyle", (element: Parameters<typeof window.getComputedStyle>[0]) =>
    window.getComputedStyle(element),
  );
  defineGlobal("requestAnimationFrame", () => 0);
  defineGlobal("cancelAnimationFrame", () => {});
  for (const [prop, value] of [
    ["clientWidth", CANVAS_WIDTH],
    ["offsetWidth", CANVAS_WIDTH],
    ["clientHeight", CANVAS_HEIGHT],
    ["offsetHeight", CANVAS_HEIGHT],
  ] as const) {
    define(window.HTMLElement.prototype, prop, { get: () => value });
  }
  defineGlobal(
    "OffscreenCanvas",
    class {
      readonly width: number;
      readonly height: number;
      constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
      }
      getContext(): CanvasRenderingContext2D {
        // The atlas paints into its own canvas; those calls are not under test.
        return makeRecordingContext([]);
      }
    },
  );
  define(window.HTMLCanvasElement.prototype, "getContext", {
    value: () => makeRecordingContext(calls),
    writable: true,
  });
}

function teardownDom(): void {
  for (const [target, name, descriptor] of savedProperties.reverse()) {
    if (descriptor) {
      Object.defineProperty(target, name, descriptor);
    } else {
      Reflect.deleteProperty(target, name);
    }
  }
  savedProperties.length = 0;
  window.close();
}

/**
 * Mount a renderer with `theme`, run one full `render()` (as every consumer
 * does), then hand back the renderer and a call log cleared of that render's
 * own painting so only the follow-up repaint is recorded.
 */
function mountWithTheme(
  calls: Call[],
  theme: { cursor: string; selection: string },
): CanvasRenderer {
  const renderer = new CanvasRenderer(MEASUREMENTS, { theme });
  const container = window.document.createElement("div");
  window.document.body.appendChild(container);
  // biome-ignore lint/plugin/no-type-assertion: expect: happy-dom's HTMLElement is structurally the DOM one the renderer expects
  renderer.mount(container as unknown as HTMLElement);
  renderer.setSnapshot(makeSnapshot());
  renderer.render(RENDER_STATE, LINES);
  calls.length = 0;
  return renderer;
}

describe("CanvasRenderer — renderCursor()/renderSelection() resolve theme colours", () => {
  let calls: Call[];

  beforeEach(() => {
    calls = [];
    setupDom(calls);
  });

  afterEach(() => {
    teardownDom();
  });

  test("renderCursor() paints the cursor with the resolved colour, not the raw var()", () => {
    const renderer = mountWithTheme(calls, {
      cursor: CURSOR_VAR,
      selection: SELECTION_VAR,
    });

    renderer.renderCursor(mbPoint(1, 3));

    const cursorRects = calls.filter((c) => c.op === "fillRect");
    expect(cursorRects.length).toBeGreaterThan(0);
    for (const rect of cursorRects) {
      expect(rect.fillStyle).toBe(CURSOR_FALLBACK);
    }
  });

  test("renderSelection() paints the selection with the resolved colour, not the raw var()", () => {
    const renderer = mountWithTheme(calls, {
      cursor: CURSOR_VAR,
      selection: SELECTION_VAR,
    });

    const start: MultiBufferPoint = mbPoint(0, 2);
    const end: MultiBufferPoint = mbPoint(1, 5);
    renderer.renderSelection(start, end);

    const selectionRects = calls.filter((c) => c.op === "fillRect");
    expect(selectionRects.length).toBeGreaterThan(0);
    for (const rect of selectionRects) {
      expect(rect.fillStyle).toBe(SELECTION_FALLBACK);
    }
  });

  test("a plain colour theme is unchanged by resolution", () => {
    const renderer = mountWithTheme(calls, {
      cursor: "#112233",
      selection: "#445566",
    });

    renderer.renderCursor(mbPoint(0, 0));
    expect(calls.filter((c) => c.op === "fillRect").map((c) => c.fillStyle)).toEqual(["#112233"]);

    calls.length = 0;
    renderer.renderSelection(mbPoint(0, 0), mbPoint(0, 4));
    const selectionFills = calls.filter((c) => c.op === "fillRect").map((c) => c.fillStyle);
    expect(selectionFills.length).toBeGreaterThan(0);
    for (const fill of selectionFills) {
      expect(fill).toBe("#445566");
    }
  });

  test("renderCursor() agrees with the cursor colour render() itself paints", () => {
    const renderer = mountWithTheme(calls, {
      cursor: CURSOR_VAR,
      selection: SELECTION_VAR,
    });

    // render()'s own cursor path already resolves; it is the oracle here.
    renderer.render({ ...RENDER_STATE, focused: true }, LINES);
    const renderedFills = new Set(calls.filter((c) => c.op === "fillRect").map((c) => c.fillStyle));
    expect(renderedFills.has(CURSOR_VAR)).toBe(false);

    calls.length = 0;
    renderer.renderCursor(mbPoint(1, 3));
    const repaintedFills = new Set(
      calls.filter((c) => c.op === "fillRect").map((c) => c.fillStyle),
    );
    expect(repaintedFills.has(CURSOR_VAR)).toBe(false);
  });
});
