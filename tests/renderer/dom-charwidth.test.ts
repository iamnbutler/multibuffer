/**
 * Tests for DomRenderer character-width measurement and its effect on hit testing.
 *
 * `_measureCharWidth()` appends a hidden probe span and divides its measured width
 * by 10. When the container has no layout — happy-dom always, and any real browser
 * where the editor is mounted while detached or display:none — that width is 0.
 * `hitTest()` then divides by it, so every click resolves to the end of the line.
 *
 * `CanvasRenderer._measureCharWidth()` already guards this with `|| 8`; these tests
 * pin the same behaviour for `DomRenderer`.
 *
 * The existing `dom.test.ts` hit-test assertions were written around the zero —
 * one reads "Column depends on charWidth which is 0 in happy-dom, so just verify
 * it's a number" (dom.test.ts:606) — so they pass either way. These do not.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import type { MultiBufferPoint, MultiBufferRow, MultiBufferSnapshot } from "../../src/multibuffer/types.ts";
import { DomRenderer } from "../../src/renderer/dom.ts";
import type { Measurements } from "../../src/renderer/types.ts";
import { mbRow, num } from "../helpers.ts";

/** The probe string `_measureCharWidth` appends; 10 characters wide. */
const PROBE_TEXT = "MMMMMMMMMM";

/** Build a minimal MultiBufferSnapshot stub covering what hitTest reaches. */
function makeSnapshot(textLines: string[]): MultiBufferSnapshot {
  // biome-ignore lint/plugin/no-type-assertion: expect: test stub implements required subset of interface
  return {
    lineCount: textLines.length,
    version: 1,
    excerpts: [],
    lines: (start: MultiBufferRow, end: MultiBufferRow) => textLines.slice(start, end),
    excerptAt: (_r: MultiBufferRow) => ({
      bufferId: "test-buffer",
      startRow: mbRow(0),
      endRow: mbRow(textLines.length),
      range: {
        context: {
          start: { row: mbRow(0), column: 0 },
          end: { row: mbRow(textLines.length), column: 0 },
        },
        primary: {
          start: { row: mbRow(0), column: 0 },
          end: { row: mbRow(textLines.length), column: 0 },
        },
      },
    }),
    toBufferPoint: () => {
      throw new Error("toBufferPoint called unexpectedly in test");
    },
    toMultiBufferPoint: () => {
      throw new Error("toMultiBufferPoint called unexpectedly in test");
    },
    resolveAnchor: () => {
      throw new Error("resolveAnchor called unexpectedly in test");
    },
    resolveAnchors: () => [],
    clipPoint: (p: MultiBufferPoint) => p,
    excerptBoundaries: () => [],
  } as unknown as MultiBufferSnapshot;
}

const DEFAULT_MEASUREMENTS: Measurements = {
  lineHeight: 20,
  charWidth: 8,
  gutterWidth: 40,
};

let happyWindow: Window;
let originalDocument: typeof globalThis.document;
let originalWindow: typeof globalThis.window;

function setupDOM(): void {
  happyWindow = new Window({ width: 800, height: 600 });
  originalDocument = globalThis.document;
  originalWindow = globalThis.window;
  // biome-ignore lint/plugin/no-type-assertion: expect: happy-dom window/document assignment
  globalThis.document = happyWindow.document as unknown as Document;
  Object.defineProperty(globalThis, "window", {
    value: happyWindow,
    writable: true,
    configurable: true,
  });
}

function teardownDOM(): void {
  globalThis.document = originalDocument;
  Object.defineProperty(globalThis, "window", {
    value: originalWindow,
    writable: true,
    configurable: true,
  });
  happyWindow.close();
}

/**
 * Give the measurement probe a real width.
 *
 * happy-dom reports 0 for every `getBoundingClientRect()`, so without this the
 * measured branch of `_measureCharWidth` is unreachable and "always return 8"
 * would be indistinguishable from a correct implementation.
 *
 * Intercepting the container's own `appendChild` (rather than patching
 * `Element.prototype`) keeps the stub scoped to this one element, so nothing
 * leaks into the other renderer test files.
 *
 * @param totalWidth  width in px reported for the 10-character probe
 * @returns a restore function
 */
function stubProbeWidth(container: HTMLElement, totalWidth: number): () => void {
  const realAppend = container.appendChild.bind(container);
  Object.defineProperty(container, "appendChild", {
    configurable: true,
    writable: true,
    value: (node: Node): Node => {
      if (node.textContent === PROBE_TEXT) {
        Object.defineProperty(node, "getBoundingClientRect", {
          configurable: true,
          value: () => ({
            width: totalWidth,
            height: 16,
            top: 0,
            left: 0,
            right: totalWidth,
            bottom: 16,
            x: 0,
            y: 0,
            toJSON: () => ({}),
          }),
        });
      }
      return realAppend(node);
    },
  });
  return () => {
    // `appendChild` lives on the prototype, so deleting the own property restores it.
    Reflect.deleteProperty(container, "appendChild");
  };
}

describe("DomRenderer character width", () => {
  let container: HTMLElement;
  let renderer: DomRenderer;

  beforeEach(() => {
    setupDOM();
    container = document.createElement("div");
    container.style.width = "800px";
    container.style.height = "600px";
    document.body.appendChild(container);
    renderer = new DomRenderer(DEFAULT_MEASUREMENTS);
  });

  afterEach(() => {
    renderer.unmount();
    teardownDOM();
  });

  describe("_measureCharWidth fallback", () => {
    test("mounting into a container with no layout leaves a usable char width", () => {
      renderer.mount(container);

      // The probe measures 0 without layout. Falling through to 0 makes every
      // downstream division either Infinity or NaN.
      expect(renderer.getCharWidth()).toBe(8);
    });

    test("remeasure() does not reintroduce a zero char width", () => {
      renderer.mount(container);
      renderer.setSnapshot(makeSnapshot(["hello world"]));

      renderer.remeasure();

      expect(renderer.getCharWidth()).toBe(8);
    });

    test("a container that reports real layout is measured, not defaulted", () => {
      // 130px across 10 characters = 13px each; deliberately not the 8px fallback
      // and not the 8px passed in DEFAULT_MEASUREMENTS.
      const restore = stubProbeWidth(container, 130);
      try {
        renderer.mount(container);
        expect(renderer.getCharWidth()).toBe(13);
      } finally {
        restore();
      }
    });
  });

  describe("hitTest with an unmeasurable container", () => {
    const LINE = "hello world"; // 11 characters

    beforeEach(() => {
      renderer.mount(container);
      renderer.setSnapshot(makeSnapshot([LINE]));
    });

    test("a click at the gutter boundary is column 0, not end-of-line", () => {
      const result = renderer.hitTest(40, 0);

      expect(result).toBeDefined();
      expect(num(result?.row ?? mbRow(0))).toBe(0);
      // (40 - 40) / 0 is NaN on an unguarded char width.
      expect(result?.column).toBe(0);
    });

    test("x maps to distinct columns across the line", () => {
      // gutterWidth 40, charWidth 8: column = floor((x - 40) / 8)
      const columns = [40, 44, 48, 60, 100].map((x) => renderer.hitTest(x, 0)?.column);

      expect(columns).toEqual([0, 0, 1, 2, 7]);
    });

    test("clicking past the end of the line clamps to the line length", () => {
      const columns = [200, 5000].map((x) => renderer.hitTest(x, 0)?.column);

      expect(columns).toEqual([LINE.length, LINE.length]);
    });

    test("column is non-decreasing as x increases", () => {
      const xs = [40, 44, 48, 56, 60, 72, 100, 140, 200, 5000];
      const columns = xs.map((x) => renderer.hitTest(x, 0)?.column ?? -1);
      const sorted = [...columns].sort((a, b) => a - b);

      expect(columns).toEqual(sorted);
    });

    test("clicking left of the gutter clamps to column 0", () => {
      const columns = [0, 10, 39].map((x) => renderer.hitTest(x, 0)?.column);

      expect(columns).toEqual([0, 0, 0]);
    });

    test("hit testing distinguishes the first half of the line from the second", () => {
      const early = renderer.hitTest(48, 0)?.column ?? -1;
      const late = renderer.hitTest(120, 0)?.column ?? -1;

      expect(early).toBeLessThan(late);
      expect(late).toBeLessThanOrEqual(LINE.length);
    });
  });
});
