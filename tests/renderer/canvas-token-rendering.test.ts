/**
 * Token-rendering tests that drive the real `CanvasRenderer`.
 *
 * `canvas.test.ts` used to cover this under "token rendering algorithm" with a
 * `simulateTokenRendering()` helper declared in that file — a second copy of
 * `CanvasRenderer._renderTokenizedLine()`. Nothing in those tests reached
 * `src/`, so they passed whatever the renderer did, and the copy had already
 * drifted: it emits a segment for whitespace between tokens, while the renderer
 * draws no glyph for a space at all (`_drawTextWithColor` skips `" "` and
 * `"\t"` and only advances the pen).
 *
 * These tests replace that block. They mount the renderer on a recording
 * stand-in for the 2D context and assert on the glyphs it actually paints, so
 * the token/gap colouring, the clipping of tokens past end-of-line and the
 * horizontal advance are pinned to the renderer's own behaviour.
 *
 * The rendering path under test is:
 *   `render()` → `_renderLine()` → `_renderTokenizedLine()` → `_drawTextWithColor()`
 * which, with a glyph atlas present, paints each character as a `drawImage()`
 * of the atlas cell followed by a `fillRect()` that tints it with the
 * character's colour.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import type { MultiBufferSnapshot } from "../../src/multibuffer/types.ts";
import { CanvasRenderer } from "../../src/renderer/canvas.ts";
import type { SyntaxHighlighter, Token } from "../../src/renderer/highlighter.ts";
import type { Measurements, RenderState, Viewport } from "../../src/renderer/types.ts";
import { mbRow } from "../helpers.ts";

const LINE_HEIGHT = 20;
const CHAR_WIDTH = 8;
const GUTTER_WIDTH = 40;
const DEFAULT_COLOR = "#default";

const MEASUREMENTS: Measurements = {
  lineHeight: LINE_HEIGHT,
  charWidth: CHAR_WIDTH,
  gutterWidth: GUTTER_WIDTH,
};

/** One recorded call on the stand-in context, with the fill colour in force. */
interface Call {
  readonly op: "fillRect" | "fillText" | "drawImage";
  readonly args: readonly number[];
  readonly fillStyle: string;
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
    canvas: { width: 800, height: 600 },
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
      calls.push({ op: "fillText", args: [x, y], fillStyle: `${ctx.fillStyle}:${text}` }),
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

/** A highlighter that returns the same tokens for every row. */
function fixedHighlighter(tokens: Token[] | undefined): SyntaxHighlighter {
  return {
    ready: true,
    parseBuffer: () => {},
    getLineTokens: () => tokens ?? [],
  };
}

/** A character the renderer actually painted, with the colour it was tinted. */
interface Glyph {
  readonly column: number;
  readonly char: string;
  readonly color: string;
}

/**
 * Reconstruct the painted glyphs from a recorded call list.
 *
 * `_drawTextWithColor` paints one `drawImage` per visible character followed by
 * the `fillRect` that tints it, so each such pair is one glyph. The destination
 * x of the `drawImage` (argument 4) gives the column.
 */
function paintedGlyphs(calls: readonly Call[], text: string): Glyph[] {
  const glyphs: Glyph[] = [];
  for (let i = 0; i < calls.length; i++) {
    const call = calls[i];
    if (call?.op !== "drawImage") continue;
    const tint = calls[i + 1];
    if (tint?.op !== "fillRect") continue;
    const destX = call.args[4];
    if (destX === undefined) continue;
    const column = (destX - GUTTER_WIDTH) / CHAR_WIDTH;
    glyphs.push({ column, char: text[column] ?? "", color: tint.fillStyle });
  }
  return glyphs;
}

/** Merge runs of adjacent columns sharing a colour into `{ text, color }`. */
function paintedRuns(glyphs: readonly Glyph[]): Array<{ text: string; color: string }> {
  const runs: Array<{ text: string; color: string }> = [];
  let previous: Glyph | undefined;
  for (const glyph of glyphs) {
    const last = runs[runs.length - 1];
    if (last && previous && glyph.color === previous.color && glyph.column === previous.column + 1) {
      last.text += glyph.char;
    } else {
      runs.push({ text: glyph.char, color: glyph.color });
    }
    previous = glyph;
  }
  return runs;
}

let window: Window;
const savedGlobals: Array<[string, PropertyDescriptor | undefined]> = [];

function defineGlobal(name: string, value: unknown): void {
  savedGlobals.push([name, Object.getOwnPropertyDescriptor(globalThis, name)]);
  Object.defineProperty(globalThis, name, { value, writable: true, configurable: true });
}

/**
 * Install happy-dom plus the 2D-context stand-ins.
 *
 * happy-dom returns null from `HTMLCanvasElement.getContext`, which makes
 * `CanvasRenderer.mount()` throw, and the glyph atlas needs an
 * `OffscreenCanvas` that does not exist outside a browser. Both are supplied
 * here for the duration of a test.
 */
function setupDom(calls: Call[]): void {
  window = new Window({ width: 800, height: 600 });
  defineGlobal("window", window);
  defineGlobal("document", window.document);
  defineGlobal("getComputedStyle", (element: Parameters<typeof window.getComputedStyle>[0]) =>
    window.getComputedStyle(element),
  );
  defineGlobal("requestAnimationFrame", () => 0);
  defineGlobal("cancelAnimationFrame", () => {});
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
  // biome-ignore lint/plugin/no-type-assertion: expect: happy-dom's prototype is patched to hand out the recording stand-in
  (window.HTMLCanvasElement.prototype as unknown as { getContext: () => CanvasRenderingContext2D }).getContext =
    () => makeRecordingContext(calls);
}

function teardownDom(): void {
  for (const [name, descriptor] of savedGlobals.reverse()) {
    if (descriptor) {
      Object.defineProperty(globalThis, name, descriptor);
    } else {
      Reflect.deleteProperty(globalThis, name);
    }
  }
  savedGlobals.length = 0;
  window.close();
}

/**
 * Render `text` as the only line, with `tokens`, and return the glyphs painted.
 */
function renderLine(calls: Call[], text: string, tokens: Token[] | undefined): Glyph[] {
  const renderer = new CanvasRenderer(MEASUREMENTS);
  const container = window.document.createElement("div");
  window.document.body.appendChild(container);
  // biome-ignore lint/plugin/no-type-assertion: expect: happy-dom elements stand in for HTMLElement
  renderer.mount(container as unknown as HTMLElement);
  renderer.setTheme({ syntaxDefault: DEFAULT_COLOR });
  renderer.setSnapshot(makeSnapshot([text]));
  renderer.setHighlighter(fixedHighlighter(tokens));

  const viewport: Viewport = {
    startRow: mbRow(0),
    endRow: mbRow(1),
    scrollTop: 0,
    height: 600,
    width: 800,
  };
  const state: RenderState = {
    viewport,
    selections: [],
    decorations: [],
    excerptHeaders: [],
    focused: false,
  };

  calls.length = 0;
  renderer.render(state, [text]);
  const glyphs = paintedGlyphs(calls, text);
  renderer.unmount();
  return glyphs;
}

const token = (startColumn: number, endColumn: number, color: string): Token => ({
  startColumn,
  endColumn,
  color,
});

describe("CanvasRenderer token rendering", () => {
  let calls: Call[];

  beforeEach(() => {
    calls = [];
    setupDom(calls);
  });

  afterEach(() => {
    teardownDom();
  });

  test("an untokenized line is painted entirely in the default colour", () => {
    const glyphs = renderLine(calls, "hello world", undefined);
    expect(paintedRuns(glyphs)).toEqual([
      { text: "hello", color: DEFAULT_COLOR },
      { text: "world", color: DEFAULT_COLOR },
    ]);
  });

  test("a token is painted in its own colour and the rest in the default", () => {
    const glyphs = renderLine(calls, "const x", [token(0, 5, "#red")]);
    expect(paintedRuns(glyphs)).toEqual([
      { text: "const", color: "#red" },
      { text: "x", color: DEFAULT_COLOR },
    ]);
  });

  test("each token keeps its colour and the gaps between them fall back to the default", () => {
    const glyphs = renderLine(calls, "const x = 42;", [
      token(0, 5, "#red"),
      token(6, 7, "#blue"),
      token(8, 9, "#orange"),
      token(10, 12, "#purple"),
    ]);
    expect(paintedRuns(glyphs)).toEqual([
      { text: "const", color: "#red" },
      { text: "x", color: "#blue" },
      { text: "=", color: "#orange" },
      { text: "42", color: "#purple" },
      { text: ";", color: DEFAULT_COLOR },
    ]);
  });

  test("a non-blank gap between two tokens is painted in the default colour", () => {
    // Every other fixture here separates tokens with spaces, which paint no
    // glyph — so only a visible gap character can pin the gap's colour.
    const glyphs = renderLine(calls, "ab.cd", [token(0, 2, "#red"), token(3, 5, "#blue")]);
    expect(paintedRuns(glyphs)).toEqual([
      { text: "ab", color: "#red" },
      { text: ".", color: DEFAULT_COLOR },
      { text: "cd", color: "#blue" },
    ]);
  });

  test("text before the first token is painted in the default colour", () => {
    const glyphs = renderLine(calls, "    function", [token(4, 8, "#green")]);
    expect(paintedRuns(glyphs)).toEqual([
      { text: "func", color: "#green" },
      { text: "tion", color: DEFAULT_COLOR },
    ]);
  });

  test("adjacent tokens are painted as separate colour runs", () => {
    const glyphs = renderLine(calls, "abcdef", [token(0, 3, "#red"), token(3, 6, "#blue")]);
    expect(paintedRuns(glyphs)).toEqual([
      { text: "abc", color: "#red" },
      { text: "def", color: "#blue" },
    ]);
  });

  test("a token reaching past end-of-line is clipped to the text", () => {
    const glyphs = renderLine(calls, "short", [token(0, 100, "#red")]);
    expect(paintedRuns(glyphs)).toEqual([{ text: "short", color: "#red" }]);
    expect(glyphs).toHaveLength("short".length);
  });

  test("a space between tokens is not painted, but still advances the pen", () => {
    const glyphs = renderLine(calls, "a b", [token(0, 1, "#red"), token(2, 3, "#blue")]);
    // Column 1 is a space: no glyph is drawn for it at all.
    expect(glyphs.map((g) => g.column)).toEqual([0, 2]);
    expect(glyphs.map((g) => g.char)).toEqual(["a", "b"]);
    // The pen still advanced across it, so "b" lands in column 2, not column 1.
    expect(glyphs[1]?.color).toBe("#blue");
  });

  test("leading whitespace is not painted but shifts the first glyph right", () => {
    const glyphs = renderLine(calls, "    function", [token(4, 8, "#green")]);
    expect(glyphs[0]?.column).toBe(4);
    expect(glyphs[0]?.char).toBe("f");
  });

  test("every painted glyph sits on the column grid, starting after the gutter", () => {
    const text = "const x = 42;";
    const glyphs = renderLine(calls, text, [token(0, 5, "#red")]);
    for (const glyph of glyphs) {
      expect(Number.isInteger(glyph.column)).toBe(true);
      expect(glyph.column).toBeGreaterThanOrEqual(0);
      expect(glyph.column).toBeLessThan(text.length);
      expect(text[glyph.column]).toBe(glyph.char);
    }
    // Whitespace is skipped, so fewer glyphs are painted than there are characters.
    expect(glyphs).toHaveLength(text.replace(/ /g, "").length);
  });
});
