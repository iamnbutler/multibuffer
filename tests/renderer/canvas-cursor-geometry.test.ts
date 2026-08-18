/**
 * Tests for CanvasRenderer cursor geometry.
 *
 * The canvas renderer's hitTest() maps a click to the wrapped segment under the
 * pointer, so the caret must be painted on that same segment. These tests pin
 * the caret rect that `renderCursor()` paints, for both soft-wrapped lines and
 * lines containing astral (surrogate-pair) characters.
 *
 * happy-dom does not implement a 2D canvas context, so a recording stub is
 * installed to capture the fillRect() calls the renderer makes.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import type { MultiBufferPoint, MultiBufferRow, MultiBufferSnapshot } from "../../src/multibuffer/types.ts";
import { CanvasRenderer } from "../../src/renderer/canvas.ts";
import type { RenderState } from "../../src/renderer/types.ts";
import { mbRow } from "../helpers.ts";

/** Every fillRect() the renderer performed, most recent last. */
let painted: Array<{ x: number; y: number; w: number; h: number }> = [];

/** Minimal recording stand-in for CanvasRenderingContext2D. */
function makeRecordingCtx(): unknown {
  const props: Record<string, unknown> = {};
  return new Proxy(props, {
    get(target, prop: string) {
      if (prop in target) return target[prop];
      if (prop === "measureText") return (s: string) => ({ width: s.length * 8 });
      if (prop === "fillRect") {
        return (x: number, y: number, w: number, h: number) => {
          painted.push({ x, y, w, h });
        };
      }
      return () => undefined;
    },
    set(target, prop: string, value) {
      target[prop] = value;
      return true;
    },
  });
}

function makeSnapshot(textLines: string[]): MultiBufferSnapshot {
  // biome-ignore lint/plugin/no-type-assertion: expect: test stub implements the subset used by the renderer
  return {
    lineCount: textLines.length,
    version: 1,
    excerpts: [],
    lines: (start: MultiBufferRow, end: MultiBufferRow) => textLines.slice(start, end),
    excerptAt: () => undefined,
    resolveAnchor: () => undefined,
    resolveAnchors: () => [],
    clipPoint: (p: MultiBufferPoint) => p,
    excerptBoundaries: () => [],
  } as unknown as MultiBufferSnapshot;
}

const LINE_HEIGHT = 20;
const CHAR_WIDTH = 8;
const GUTTER_WIDTH = 40;

let happyWindow: Window;
let originalDocument: typeof globalThis.document;
let originalWindow: typeof globalThis.window;

beforeEach(() => {
  painted = [];
  happyWindow = new Window({ width: 800, height: 600 });
  originalDocument = globalThis.document;
  originalWindow = globalThis.window;
  // biome-ignore lint/plugin/no-type-assertion: expect: happy-dom document assignment
  globalThis.document = happyWindow.document as unknown as Document;
  Object.defineProperty(globalThis, "window", { value: happyWindow, writable: true, configurable: true });
  // happy-dom's own getComputedStyle needs a window binding the renderer does not supply,
  // and only `font` is read (charWidth is provided explicitly via Measurements).
  Object.defineProperty(globalThis, "getComputedStyle", {
    value: () => ({ font: "14px monospace", getPropertyValue: () => "" }),
    writable: true,
    configurable: true,
  });
  // happy-dom returns null from getContext("2d"), which the renderer treats as a fatal error.
  const canvasProto = Object.getPrototypeOf(happyWindow.document.createElement("canvas"));
  Object.defineProperty(canvasProto, "getContext", {
    value: () => makeRecordingCtx(),
    writable: true,
    configurable: true,
  });
  // GlyphAtlas requires OffscreenCanvas, which happy-dom does not implement.
  Object.defineProperty(globalThis, "OffscreenCanvas", {
    value: class {
      getContext() {
        return makeRecordingCtx();
      }
    },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  globalThis.document = originalDocument;
  Object.defineProperty(globalThis, "window", { value: originalWindow, writable: true, configurable: true });
  happyWindow.close();
});

/** Mount a renderer over `lines` and return the caret rect painted for `point`. */
function caretFor(
  lines: string[],
  point: MultiBufferPoint,
  wrapWidth: number,
): { x: number; y: number } | undefined {
  const renderer = new CanvasRenderer({
    lineHeight: LINE_HEIGHT,
    charWidth: CHAR_WIDTH,
    gutterWidth: GUTTER_WIDTH,
    wrapWidth,
  });
  const container = document.createElement("div");
  document.body.appendChild(container);
  renderer.mount(container);
  renderer.setSnapshot(makeSnapshot(lines));

  const state: RenderState = {
    viewport: {
      startRow: mbRow(0),
      endRow: mbRow(lines.length),
      scrollTop: 0,
      height: 600,
      width: 800,
    },
    selections: [],
    decorations: [],
    excerptHeaders: [],
    focused: true,
  };
  renderer.render(state, lines);

  painted = [];
  renderer.renderCursor(point);
  // The caret is the only 2px-wide rect the renderer paints.
  const caret = painted.filter((r) => r.w === 2).at(-1);
  renderer.unmount();
  return caret ? { x: caret.x, y: caret.y } : undefined;
}

describe("CanvasRenderer cursor geometry", () => {
  describe("soft wrapping", () => {
    // 72 characters, wrapped at 20 columns → segments start at 0, 20, 40, 60.
    const LONG = "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij";

    test("caret on the first segment is unchanged", () => {
      expect(caretFor([LONG], { row: mbRow(0), column: 5 }, 20)).toEqual({
        x: GUTTER_WIDTH + 5 * CHAR_WIDTH,
        y: 0,
      });
    });

    test("caret at a segment boundary moves to the next visual row, column 0", () => {
      expect(caretFor([LONG], { row: mbRow(0), column: 20 }, 20)).toEqual({
        x: GUTTER_WIDTH,
        y: LINE_HEIGHT,
      });
    });

    test("caret mid-segment is placed relative to that segment", () => {
      // Column 45 sits in segment 2 (chars 40..59), five columns in.
      expect(caretFor([LONG], { row: mbRow(0), column: 45 }, 20)).toEqual({
        x: GUTTER_WIDTH + 5 * CHAR_WIDTH,
        y: 2 * LINE_HEIGHT,
      });
    });

    test("caret at end of line lands on the last segment", () => {
      // 72 characters → segment 3 (chars 60..71), twelve columns in.
      expect(caretFor([LONG], { row: mbRow(0), column: 72 }, 20)).toEqual({
        x: GUTTER_WIDTH + 12 * CHAR_WIDTH,
        y: 3 * LINE_HEIGHT,
      });
    });

    test("caret on a line shorter than the wrap width is unaffected", () => {
      expect(caretFor(["short"], { row: mbRow(0), column: 3 }, 20)).toEqual({
        x: GUTTER_WIDTH + 3 * CHAR_WIDTH,
        y: 0,
      });
    });
  });

  // Controls: these hold both before and after the segment-relative caret fix.
  // They guard the wide-character measurement that the fix routes through.
  describe("astral characters", () => {
    // "ab" + U+1F600 (one code point, two UTF-16 units, two display cells) + "cd"
    const EMOJI = "ab\u{1F600}cd";

    test("caret after an emoji accounts for both of its display cells", () => {
      // Column 4 is just past the surrogate pair: 2 ascii cells + 2 emoji cells.
      expect(caretFor([EMOJI], { row: mbRow(0), column: 4 }, 0)).toEqual({
        x: GUTTER_WIDTH + 4 * CHAR_WIDTH,
        y: 0,
      });
    });

    test("caret before an emoji is unaffected", () => {
      expect(caretFor([EMOJI], { row: mbRow(0), column: 2 }, 0)).toEqual({
        x: GUTTER_WIDTH + 2 * CHAR_WIDTH,
        y: 0,
      });
    });
  });

  describe("no wrapping", () => {
    test("caret tracks the column directly", () => {
      expect(caretFor(["plain ascii line"], { row: mbRow(0), column: 6 }, 0)).toEqual({
        x: GUTTER_WIDTH + 6 * CHAR_WIDTH,
        y: 0,
      });
    });
  });
});
