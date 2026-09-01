/**
 * Decoration painting tests that drive the real `CanvasRenderer`.
 *
 * `DomRenderer` classifies decorations into **line-level** (whole row: colours
 * the row background, the gutter background and the gutter sign) and
 * **column-level / intraline** (a column span inside one row). The diff
 * subsystem emits both kinds on the same row — `DELETE_STYLE` / `INSERT_STYLE`
 * carry the `−` / `+` gutter sign, and `INTRALINE_*_STYLE` carries a
 * `backgroundColor` and nothing else (`src/diff/diff-styles.ts`).
 *
 * `CanvasRenderer` flattened both kinds into one style per row, last-one-wins,
 * so the intraline decoration — pushed after the line-level one — replaced it
 * and took the gutter sign with it (#736).
 *
 * The only existing coverage of this mapping, `decoration.test.ts`'s
 * `buildDecorationMap()`, is a local copy of the old flattening rather than a
 * call into `src/`, so it passes whatever the renderers do. These tests mount
 * the renderer on a recording stand-in for the 2D context and assert on the
 * rectangles and text it actually paints.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import type { MultiBufferSnapshot } from "../../src/multibuffer/types.ts";
import { CanvasRenderer } from "../../src/renderer/canvas.ts";
import type { Decoration, Measurements, RenderState, Viewport } from "../../src/renderer/types.ts";
import { mbRow } from "../helpers.ts";

const LINE_HEIGHT = 20;
const CHAR_WIDTH = 8;
const GUTTER_WIDTH = 40;
const CANVAS_WIDTH = 800;

const MEASUREMENTS: Measurements = {
  lineHeight: LINE_HEIGHT,
  charWidth: CHAR_WIDTH,
  gutterWidth: GUTTER_WIDTH,
};

/** The two styles the diff subsystem puts on a modified row, verbatim. */
const LINE_STYLE = {
  backgroundColor: "rgba(255, 80, 80, 0.10)",
  gutterBackground: "rgba(255, 80, 80, 0.18)",
  gutterSign: "−",
  gutterSignColor: "#f87171",
};
const INTRALINE_STYLE = { backgroundColor: "rgba(255, 80, 80, 0.25)" };

/** One recorded call on the stand-in context, with the fill colour in force. */
interface Call {
  readonly op: "fillRect" | "fillText" | "drawImage";
  readonly args: readonly number[];
  readonly fillStyle: string;
  readonly text?: string;
}

/**
 * Minimal recording stand-in for `CanvasRenderingContext2D`.
 *
 * Only the members `canvas.ts` and its glyph atlas touch are provided; the rest
 * are no-ops. `drawImage` drops the source image so the recorded arguments are
 * all numbers.
 */
function makeRecordingContext(calls: Call[]): CanvasRenderingContext2D {
  const ctx = {
    canvas: { width: CANVAS_WIDTH, height: 600 },
    fillStyle: "",
    strokeStyle: "",
    font: "",
    textAlign: "",
    textBaseline: "",
    globalCompositeOperation: "",
    imageSmoothingEnabled: false,
    lineWidth: 1,
    fillRect: (...args: number[]) => calls.push({ op: "fillRect", args, fillStyle: ctx.fillStyle }),
    fillText: (text: string, x: number, y: number) =>
      calls.push({ op: "fillText", args: [x, y], fillStyle: ctx.fillStyle, text }),
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

/** Build a minimal single-excerpt snapshot over `textLines`. */
function makeSnapshot(textLines: string[]): MultiBufferSnapshot {
  const wholeRange = {
    start: { row: mbRow(0), column: 0 },
    end: { row: mbRow(textLines.length), column: 0 },
  };
  const snapshot = {
    lineCount: textLines.length,
    version: 1,
    excerpts: [],
    lines: (start: number, end: number) => textLines.slice(start, end),
    excerptAt: () => ({
      bufferId: "test-buffer",
      startRow: mbRow(0),
      endRow: mbRow(textLines.length),
      range: { context: wholeRange, primary: wholeRange },
    }),
    clipPoint: (point: unknown) => point,
    resolveAnchors: () => [],
    excerptBoundaries: () => [],
  };
  // biome-ignore lint/plugin/no-type-assertion: expect: test stub implements the subset of MultiBufferSnapshot the renderer uses
  return snapshot as unknown as MultiBufferSnapshot;
}

/** A whole-row decoration, as `makeDecoration()` in `src/diff/diff-styles.ts` builds it. */
function lineDecoration(row: number, style: Partial<Decoration["style"]>): Decoration {
  return {
    range: {
      start: { row: mbRow(row), column: 0 },
      end: { row: mbRow(row), column: Number.MAX_SAFE_INTEGER },
    },
    style,
  };
}

/** A column-span decoration, as `makeColumnDecoration()` builds it. */
function columnDecoration(
  row: number,
  startColumn: number,
  endColumn: number,
  style: Partial<Decoration["style"]>,
): Decoration {
  return {
    range: {
      start: { row: mbRow(row), column: startColumn },
      end: { row: mbRow(row), column: endColumn },
    },
    style,
  };
}

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
 * `CanvasRenderer.mount()` throw, and the glyph atlas needs an
 * `OffscreenCanvas` that does not exist outside a browser.
 *
 * Everything installed here — including the patches on happy-dom's *shared*
 * element prototypes, which outlive the `Window` instance — is restored in
 * `teardownDom()`. `glyph-atlas.test.ts` decides at module load whether to skip
 * by probing `OffscreenCanvas` and `document.createElement("canvas")`, so a
 * `getContext` patch left behind here silently changes that file's behaviour.
 */
function setupDom(calls: Call[]): void {
  window = new Window({ width: CANVAS_WIDTH, height: 600 });
  defineGlobal("window", window);
  defineGlobal("document", window.document);
  defineGlobal("getComputedStyle", (element: Parameters<typeof window.getComputedStyle>[0]) =>
    window.getComputedStyle(element),
  );
  defineGlobal("requestAnimationFrame", () => 0);
  defineGlobal("cancelAnimationFrame", () => {});
  // happy-dom lays nothing out, so every element measures 0 and the renderer
  // would size its canvas to 0×0. Give elements the window's dimensions so
  // `_resizeCanvas()` produces a canvas with real width to paint into.
  for (const [prop, value] of [
    ["clientWidth", CANVAS_WIDTH],
    ["offsetWidth", CANVAS_WIDTH],
    ["clientHeight", 600],
    ["offsetHeight", 600],
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

/** Render `lines` with `decorations` and return every recorded call. */
function render(calls: Call[], lines: string[], decorations: Decoration[]): Call[] {
  const renderer = new CanvasRenderer(MEASUREMENTS);
  const container = window.document.createElement("div");
  window.document.body.appendChild(container);
  // biome-ignore lint/plugin/no-type-assertion: expect: happy-dom elements stand in for HTMLElement
  renderer.mount(container as unknown as HTMLElement);
  renderer.setSnapshot(makeSnapshot(lines));

  const viewport: Viewport = {
    startRow: mbRow(0),
    endRow: mbRow(lines.length),
    scrollTop: 0,
    height: 600,
    width: CANVAS_WIDTH,
  };
  const state: RenderState = {
    viewport,
    selections: [],
    decorations,
    excerptHeaders: [],
    focused: false,
  };

  calls.length = 0;
  renderer.render(state, lines);
  renderer.unmount();
  return [...calls];
}

/** Every `fillText` the renderer emitted, as `text` → colour. */
function paintedText(calls: readonly Call[]): Array<{ text: string; color: string; x: number }> {
  const out: Array<{ text: string; color: string; x: number }> = [];
  for (const call of calls) {
    if (call.op !== "fillText" || call.text === undefined) continue;
    out.push({ text: call.text, color: call.fillStyle, x: call.args[0] ?? -1 });
  }
  return out;
}

/**
 * The background rectangles painted for the row at `y`, excluding the
 * per-glyph tint rects (each of which directly follows a `drawImage`).
 */
function backgroundRects(
  calls: readonly Call[],
  y: number,
): Array<{ x: number; width: number; color: string }> {
  const out: Array<{ x: number; width: number; color: string }> = [];
  for (let i = 0; i < calls.length; i++) {
    const call = calls[i];
    if (call?.op !== "fillRect") continue;
    if (calls[i - 1]?.op === "drawImage") continue; // glyph tint
    if (call.args[1] !== y || call.args[3] !== LINE_HEIGHT) continue;
    out.push({ x: call.args[0] ?? -1, width: call.args[2] ?? -1, color: call.fillStyle });
  }
  return out;
}

describe("CanvasRenderer decoration painting", () => {
  let calls: Call[];

  beforeEach(() => {
    calls = [];
    setupDom(calls);
  });

  afterEach(() => {
    teardownDom();
  });

  test("a line-level decoration alone paints its gutter sign", () => {
    const recorded = render(calls, ["hello world"], [lineDecoration(0, LINE_STYLE)]);

    const sign = paintedText(recorded).find((t) => t.text === "−");
    expect(sign).toBeDefined();
    expect(sign?.color).toBe("#f87171");
  });

  test("the gutter sign survives an intraline decoration on the same row", () => {
    // Exactly what src/diff/multibuffer.ts pushes for a modified row: the
    // line-level style first, then the intraline span.
    const recorded = render(
      calls,
      ["hello world"],
      [lineDecoration(0, LINE_STYLE), columnDecoration(0, 2, 5, INTRALINE_STYLE)],
    );

    const sign = paintedText(recorded).find((t) => t.text === "−");
    expect(sign).toBeDefined();
    expect(sign?.color).toBe("#f87171");
  });

  test("the row background stays the line-level colour when an intraline span shares the row", () => {
    const recorded = render(
      calls,
      ["hello world"],
      [lineDecoration(0, LINE_STYLE), columnDecoration(0, 2, 5, INTRALINE_STYLE)],
    );

    const rects = backgroundRects(recorded, 0);
    const rowBackground = rects.find((r) => r.x === GUTTER_WIDTH && r.width === CANVAS_WIDTH);
    expect(rowBackground?.color).toBe(LINE_STYLE.backgroundColor);
  });

  test("the gutter background stays the line-level colour when an intraline span shares the row", () => {
    const recorded = render(
      calls,
      ["hello world"],
      [lineDecoration(0, LINE_STYLE), columnDecoration(0, 2, 5, INTRALINE_STYLE)],
    );

    const rects = backgroundRects(recorded, 0);
    const gutter = rects.find((r) => r.x === 0 && r.width === GUTTER_WIDTH);
    expect(gutter?.color).toBe(LINE_STYLE.gutterBackground);
  });

  test("an intraline decoration paints across its columns only, not the whole row", () => {
    const recorded = render(
      calls,
      ["hello world"],
      [lineDecoration(0, LINE_STYLE), columnDecoration(0, 2, 5, INTRALINE_STYLE)],
    );

    const span = backgroundRects(recorded, 0).find(
      (r) => r.color === INTRALINE_STYLE.backgroundColor,
    );
    expect(span).toBeDefined();
    // Columns 2..5 of an 8px-per-character line, offset by the gutter.
    expect(span?.x).toBe(GUTTER_WIDTH + 2 * CHAR_WIDTH);
    expect(span?.width).toBe(3 * CHAR_WIDTH);
  });

  test("an undecorated row is unaffected", () => {
    const recorded = render(
      calls,
      ["hello world", "second line"],
      [lineDecoration(0, LINE_STYLE), columnDecoration(0, 2, 5, INTRALINE_STYLE)],
    );

    const rects = backgroundRects(recorded, LINE_HEIGHT);
    expect(rects.some((r) => r.color === LINE_STYLE.backgroundColor)).toBe(false);
    expect(rects.some((r) => r.color === INTRALINE_STYLE.backgroundColor)).toBe(false);
  });
});
