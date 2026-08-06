/**
 * Behavioural tests for CanvasRenderer - the canvas-based rendering implementation.
 *
 * `src/renderer/canvas.ts` is ~1300 lines and, before this file, the only
 * assertions reaching it were two `typeof === "function"` export checks in
 * `canvas.test.ts`. Nothing exercised its behaviour, because `mount()` throws
 * "Failed to get 2D context from canvas" under happy-dom, whose
 * `getContext("2d")` returns null.
 *
 * This file installs a recording stand-in for the 2D context (and for
 * `OffscreenCanvas`, used by the glyph atlas) so the renderer can be mounted and
 * driven. The stand-in only has to avoid throwing: `hitTest`, the viewport and
 * the scroll accessors never touch the context, so their assertions do not
 * depend on the fidelity of the fake.
 *
 * Covers:
 * - Mount/unmount lifecycle
 * - Character-width resolution (explicit value, and the fallback)
 * - Hit testing: gutter offset, diff gutter, scroll offset, clamping,
 *   wide characters (tab/CJK/emoji) and soft-wrapped segments
 * - Viewport and scroll accessors
 * - render() painting through the 2D context
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { createBuffer } from "../../src/buffer/buffer.ts";
import { createMultiBuffer } from "../../src/multibuffer/multibuffer.ts";
import type { MultiBufferSnapshot } from "../../src/multibuffer/types.ts";
import { CanvasRenderer, createCanvasRenderer } from "../../src/renderer/canvas.ts";
import type { Measurements, RenderState } from "../../src/renderer/types.ts";
import { createBufferId, excerptRange, mbRow, num } from "../helpers.ts";

/** A single recorded drawing operation: the method name followed by its arguments. */
type RecordedCall = readonly [string, ...unknown[]];

/**
 * Minimal recording stand-in for CanvasRenderingContext2D.
 *
 * Only the members `canvas.ts` and the glyph atlas actually use are provided:
 * fillStyle, font, textBaseline, textAlign, globalCompositeOperation,
 * fillRect, clearRect, fillText, drawImage, scale, save, restore,
 * measureText and getImageData.
 */
function createRecordingContext(): { calls: RecordedCall[]; context: object } {
  const calls: RecordedCall[] = [];
  const context = {
    fillStyle: "",
    font: "",
    textBaseline: "",
    textAlign: "",
    globalCompositeOperation: "",
    fillRect: (...args: unknown[]) => calls.push(["fillRect", ...args]),
    clearRect: (...args: unknown[]) => calls.push(["clearRect", ...args]),
    fillText: (...args: unknown[]) => calls.push(["fillText", ...args]),
    drawImage: (...args: unknown[]) => calls.push(["drawImage", ...args]),
    scale: (...args: unknown[]) => calls.push(["scale", ...args]),
    save: () => calls.push(["save"]),
    restore: () => calls.push(["restore"]),
    measureText: (text: string) => ({ width: text.length * 8 }),
    getImageData: (_x: number, _y: number, width: number, height: number) => ({
      data: new Uint8ClampedArray(width * height * 4),
      width,
      height,
    }),
  };
  return { calls, context };
}

/** Recorded calls made against the main (on-screen) canvas of the renderer under test. */
let mainCanvasCalls: RecordedCall[] = [];

/** Callbacks queued by the requestAnimationFrame stand-in, newest last. */
let pendingFrames: Array<() => void> = [];

/** Run every queued animation frame callback. */
function flushAnimationFrames(): void {
  const queued = pendingFrames;
  pendingFrames = [];
  for (const callback of queued) callback();
}

let originalDocument: typeof globalThis.document;
let originalWindow: typeof globalThis.window;
let happyWindow: Window;

/**
 * Globals replaced for the duration of a test, keyed by name, holding the
 * descriptor they had beforehand (or undefined when they did not exist).
 */
const savedGlobals = new Map<string, PropertyDescriptor | undefined>();

/** Replace a global, remembering how to put it back. */
function stubGlobal(name: string, value: object): void {
  if (!savedGlobals.has(name)) {
    savedGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  }
  Object.defineProperty(globalThis, name, { value, writable: true, configurable: true });
}

/** Undo every stubGlobal call, deleting globals that did not exist before. */
function restoreGlobals(): void {
  for (const [name, descriptor] of savedGlobals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
  savedGlobals.clear();
}

/**
 * Install happy-dom plus the 2D-context stand-ins.
 *
 * happy-dom returns null from `HTMLCanvasElement.getContext`, which makes
 * `CanvasRenderer.mount()` throw, so the prototype is patched for the duration
 * of the test. Every canvas gets its own recorder; the last one created before
 * a renderer mounts is the renderer's own canvas.
 */
function setupDOM(): void {
  happyWindow = new Window({ width: 800, height: 600 });
  originalDocument = globalThis.document;
  originalWindow = globalThis.window;
  // biome-ignore lint/plugin/no-type-assertion: expect: happy-dom document assignment, matching dom.test.ts
  globalThis.document = happyWindow.document as unknown as Document;
  Object.defineProperty(globalThis, "window", {
    value: happyWindow,
    writable: true,
    configurable: true,
  });

  // canvas.ts calls the bare global `getComputedStyle`, which happy-dom exposes
  // only on its Window instance - and whose implementation throws while
  // collecting stylesheets in this environment. The renderer uses just two
  // members of the result: `.font`, and `.getPropertyValue()` for resolving
  // `var(--x)` colours. Both are supplied directly.
  stubGlobal("getComputedStyle", () => ({
    font: "14px monospace",
    getPropertyValue: () => "",
  }));

  const canvasCtor = Reflect.get(happyWindow, "HTMLCanvasElement");
  const canvasProto = Reflect.get(canvasCtor, "prototype");
  Reflect.set(canvasProto, "getContext", function (this: object) {
    let existing = Reflect.get(this, "__recordingContext");
    if (existing === undefined) {
      const { calls, context } = createRecordingContext();
      existing = context;
      Reflect.set(this, "__recordingContext", context);
      mainCanvasCalls = calls;
    }
    return existing;
  });

  // The renderer defers painting to an animation frame. Queue the callbacks
  // rather than running them, so tests decide when a scheduled render happens.
  pendingFrames = [];
  stubGlobal("requestAnimationFrame", (callback: () => void) => pendingFrames.push(callback));
  stubGlobal("cancelAnimationFrame", (id: number) => {
    pendingFrames[id - 1] = () => {};
  });

  // The glyph atlas allocates an OffscreenCanvas, which happy-dom lacks.
  stubGlobal(
    "OffscreenCanvas",
    class {
      width: number;
      height: number;
      private readonly _context = createRecordingContext().context;
      constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
      }
      getContext(): object {
        return this._context;
      }
    },
  );
}

function teardownDOM(): void {
  globalThis.document = originalDocument;
  Object.defineProperty(globalThis, "window", {
    value: originalWindow,
    writable: true,
    configurable: true,
  });
  restoreGlobals();
  pendingFrames = [];
  happyWindow.close();
}

const DEFAULT_MEASUREMENTS: Measurements = {
  lineHeight: 20,
  charWidth: 8,
  gutterWidth: 40,
};

/**
 * Five rows chosen to exercise the width logic:
 * plain ASCII, a short line, a leading tab, full-width CJK, and an
 * astral-plane emoji (a surrogate pair).
 */
const SAMPLE_TEXT = "hello world\nsecond\n\ttabbed\n日本語\nemoji 😀 x";

function sampleSnapshot(rows = 5): MultiBufferSnapshot {
  const buffer = createBuffer(createBufferId(), SAMPLE_TEXT);
  const multibuffer = createMultiBuffer();
  multibuffer.addExcerpt(buffer, excerptRange(0, rows));
  return multibuffer.snapshot();
}

describe("CanvasRenderer", () => {
  let container: HTMLElement;
  let renderer: CanvasRenderer;
  let mounted: CanvasRenderer | undefined;

  function mountWith(measurements: Measurements, withSnapshot = true): CanvasRenderer {
    renderer = new CanvasRenderer(measurements);
    renderer.mount(container);
    mounted = renderer;
    if (withSnapshot) renderer.setSnapshot(sampleSnapshot());
    return renderer;
  }

  beforeEach(() => {
    mounted = undefined;
    setupDOM();
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    // Tests that unmount explicitly leave nothing to tear down here.
    if (mounted && container.children.length > 0) mounted.unmount();
    if (container?.parentNode) container.parentNode.removeChild(container);
    teardownDOM();
  });

  describe("mount/unmount lifecycle", () => {
    test("mount builds a scroll container holding a spacer and a canvas", () => {
      mountWith(DEFAULT_MEASUREMENTS, false);

      expect(container.children.length).toBe(1);
      const scrollContainer = container.children[0];
      expect(scrollContainer?.tagName).toBe("DIV");
      // Spacer drives scroll height; the canvas is painted over it.
      expect(scrollContainer?.children.length).toBe(2);
      expect(scrollContainer?.children[1]?.tagName).toBe("CANVAS");
    });

    test("unmount detaches everything it added", () => {
      mountWith(DEFAULT_MEASUREMENTS, false);
      expect(container.children.length).toBe(1);

      renderer.unmount();

      expect(container.children.length).toBe(0);
    });

    test("unmount is idempotent", () => {
      mountWith(DEFAULT_MEASUREMENTS, false);

      renderer.unmount();
      expect(() => renderer.unmount()).not.toThrow();
      expect(container.children.length).toBe(0);
    });

    test("createCanvasRenderer returns a mountable renderer", () => {
      const created = createCanvasRenderer(DEFAULT_MEASUREMENTS);
      expect(created).toBeInstanceOf(CanvasRenderer);

      created.mount(container);
      expect(container.children.length).toBe(1);
      created.unmount();
    });
  });

  describe("character width", () => {
    test("an explicit measurements.charWidth is used as-is", () => {
      mountWith({ lineHeight: 20, charWidth: 11, gutterWidth: 40 }, false);

      expect(renderer.getCharWidth()).toBe(11);
    });

    test("falls back to 8px when the container reports no layout", () => {
      // happy-dom reports a zero-width bounding box, standing in for a
      // container that is display:none or not yet laid out. Without the
      // fallback this would be 0 and every hit test would divide by zero.
      mountWith({ lineHeight: 20, gutterWidth: 40 }, false);

      expect(renderer.getCharWidth()).toBe(8);
    });
  });

  describe("hitTest", () => {
    test("returns undefined before mount", () => {
      const unmounted = new CanvasRenderer(DEFAULT_MEASUREMENTS);

      expect(unmounted.hitTest(10, 10)).toBeUndefined();
    });

    test("maps x past the gutter to a column, one column per charWidth", () => {
      mountWith(DEFAULT_MEASUREMENTS);

      // gutterWidth 40, charWidth 8: x=40 is column 0, each 8px steps one over.
      expect(renderer.hitTest(40, 0)).toEqual({ row: mbRow(0), column: 0 });
      expect(renderer.hitTest(48, 0)).toEqual({ row: mbRow(0), column: 1 });
      // (100 - 40) / 8 = 7.5, floored to 7.
      expect(renderer.hitTest(100, 0)).toEqual({ row: mbRow(0), column: 7 });
    });

    test("rounds down within a single character cell", () => {
      mountWith(DEFAULT_MEASUREMENTS);

      // The whole 40..47 band is still column 0; 48 is the first of column 1.
      expect(renderer.hitTest(41, 0)).toEqual({ row: mbRow(0), column: 0 });
      expect(renderer.hitTest(47, 0)).toEqual({ row: mbRow(0), column: 0 });
      expect(renderer.hitTest(48, 0)).toEqual({ row: mbRow(0), column: 1 });
    });

    test("clicks in the gutter resolve to column 0 on that row", () => {
      mountWith(DEFAULT_MEASUREMENTS);

      expect(renderer.hitTest(0, 0)).toEqual({ row: mbRow(0), column: 0 });
      expect(renderer.hitTest(10, 0)).toEqual({ row: mbRow(0), column: 0 });
      expect(renderer.hitTest(39, 25)).toEqual({ row: mbRow(1), column: 0 });
    });

    test("y selects the row by lineHeight", () => {
      mountWith(DEFAULT_MEASUREMENTS);

      // lineHeight 20: 0..19 is row 0, 20..39 row 1, and so on.
      expect(renderer.hitTest(40, 0)?.row).toBe(mbRow(0));
      expect(renderer.hitTest(40, 19)?.row).toBe(mbRow(0));
      expect(renderer.hitTest(40, 20)?.row).toBe(mbRow(1));
      expect(renderer.hitTest(40, 80)?.row).toBe(mbRow(4));
    });

    test("x beyond the end of the line clamps to the line length", () => {
      mountWith(DEFAULT_MEASUREMENTS);

      // Row 0 is "hello world" - 11 characters.
      expect(renderer.hitTest(400, 0)).toEqual({ row: mbRow(0), column: 11 });
      // Row 1 is "second" - 6 characters.
      expect(renderer.hitTest(400, 20)).toEqual({ row: mbRow(1), column: 6 });
    });

    test("diff gutter mode uses the diff column widths, not measurements.gutterWidth", () => {
      // 40 (old) + 40 (new) + 16 (sign) = 96, overriding the gutterWidth of 40.
      mountWith({ ...DEFAULT_MEASUREMENTS, gutterMode: "diff" });

      // Still inside the 96px gutter even though it is past gutterWidth 40.
      expect(renderer.hitTest(40, 0)).toEqual({ row: mbRow(0), column: 0 });
      expect(renderer.hitTest(95, 0)).toEqual({ row: mbRow(0), column: 0 });
      // Text starts at 96.
      expect(renderer.hitTest(96, 0)).toEqual({ row: mbRow(0), column: 0 });
      expect(renderer.hitTest(104, 0)).toEqual({ row: mbRow(0), column: 1 });
    });

    test("a full-width CJK character spans two columns of pixels", () => {
      mountWith(DEFAULT_MEASUREMENTS);

      // Row 3 is "日本語"; each glyph occupies two cells, so both the first and
      // the second 8px cell after the gutter land on character index 1.
      expect(renderer.hitTest(40, 60)).toEqual({ row: mbRow(3), column: 0 });
      expect(renderer.hitTest(48, 60)).toEqual({ row: mbRow(3), column: 1 });
      expect(renderer.hitTest(56, 60)).toEqual({ row: mbRow(3), column: 1 });
    });

    test("an astral-plane emoji counts as one character", () => {
      mountWith(DEFAULT_MEASUREMENTS);

      // Row 4 is "emoji 😀 x": six ASCII characters, then a surrogate pair.
      // (88 - 40) / 8 = 6 - the cell where the emoji begins.
      expect(renderer.hitTest(88, 80)).toEqual({ row: mbRow(4), column: 6 });
    });

    test("a leading tab is a single character", () => {
      mountWith(DEFAULT_MEASUREMENTS);

      // Row 2 is "\ttabbed" - the tab is index 0, "t" is index 1.
      expect(renderer.hitTest(40, 50)).toEqual({ row: mbRow(2), column: 0 });
      expect(renderer.hitTest(48, 50)).toEqual({ row: mbRow(2), column: 1 });
    });

    test("soft wrapping maps each visual row to its segment of the line", () => {
      mountWith({ ...DEFAULT_MEASUREMENTS, wrapWidth: 5 });

      // "hello world" (11 chars) wraps every 5 cells, so the segments start at
      // character 0, 5 and 10. One cell past the gutter is offset 1 into each.
      expect(renderer.hitTest(48, 0)).toEqual({ row: mbRow(0), column: 1 });
      expect(renderer.hitTest(48, 20)).toEqual({ row: mbRow(0), column: 6 });
      expect(renderer.hitTest(48, 40)).toEqual({ row: mbRow(0), column: 11 });
      // The fourth visual row is the start of the next buffer row.
      expect(renderer.hitTest(48, 60)).toEqual({ row: mbRow(1), column: 1 });
    });

    test("the first text pixel of a wrapped row is the start of that segment", () => {
      mountWith({ ...DEFAULT_MEASUREMENTS, wrapWidth: 5 });

      // x exactly at the gutter edge is column 0 of the visual row, which for a
      // continuation segment is the character the segment starts at - not
      // character 0 of the line.
      expect(renderer.hitTest(40, 0)).toEqual({ row: mbRow(0), column: 0 });
      expect(renderer.hitTest(40, 20)).toEqual({ row: mbRow(0), column: 5 });
      expect(renderer.hitTest(40, 40)).toEqual({ row: mbRow(0), column: 10 });
    });

    test("a gutter click on a wrapped row snaps to the start of the line", () => {
      mountWith({ ...DEFAULT_MEASUREMENTS, wrapWidth: 5 });

      // Inside the gutter the segment offset is deliberately not applied: the
      // click resolves to column 0 even on a continuation row, whose first text
      // pixel would have been character 5.
      expect(renderer.hitTest(0, 20)).toEqual({ row: mbRow(0), column: 0 });
      expect(renderer.hitTest(10, 20)).toEqual({ row: mbRow(0), column: 0 });
      expect(renderer.hitTest(39, 20)).toEqual({ row: mbRow(0), column: 0 });
      expect(renderer.hitTest(39, 40)).toEqual({ row: mbRow(0), column: 0 });
    });

    test("hit testing follows the scroll position", () => {
      mountWith(DEFAULT_MEASUREMENTS);
      const scrollContainer = container.children[0];
      if (!scrollContainer) throw new Error("scroll container missing");

      expect(renderer.hitTest(40, 0)?.row).toBe(mbRow(0));

      // Scrolling two lines down means y=0 is now row 2.
      Reflect.set(scrollContainer, "scrollTop", 40);

      expect(renderer.hitTest(40, 0)?.row).toBe(mbRow(2));
      expect(renderer.hitTest(40, 20)?.row).toBe(mbRow(3));
    });
  });

  describe("viewport and scrolling", () => {
    test("getScrollTop reflects the scroll container", () => {
      mountWith(DEFAULT_MEASUREMENTS);
      const scrollContainer = container.children[0];
      if (!scrollContainer) throw new Error("scroll container missing");

      expect(renderer.getScrollTop()).toBe(0);

      Reflect.set(scrollContainer, "scrollTop", 120);

      expect(renderer.getScrollTop()).toBe(120);
    });

    test("getScrollTop is 0 before mount", () => {
      expect(new CanvasRenderer(DEFAULT_MEASUREMENTS).getScrollTop()).toBe(0);
    });

    test("scrollTo moves the scroll container to the target row", () => {
      mountWith(DEFAULT_MEASUREMENTS);
      const scrollContainer = container.children[0];
      if (!scrollContainer) throw new Error("scroll container missing");

      renderer.scrollTo({ row: mbRow(3), strategy: "top" });

      // Row 3 at lineHeight 20 sits at y = 60.
      expect(Reflect.get(scrollContainer, "scrollTop")).toBe(60);
    });

    test("getViewport returns a viewport with the expected shape", () => {
      mountWith(DEFAULT_MEASUREMENTS);
      const viewport = renderer.getViewport();

      expect(num(viewport.startRow)).toBeGreaterThanOrEqual(0);
      expect(num(viewport.endRow)).toBeGreaterThanOrEqual(num(viewport.startRow));
      expect(viewport.scrollTop).toBe(0);
    });
  });

  describe("render", () => {
    const renderState: RenderState = {
      viewport: {
        startRow: mbRow(0),
        endRow: mbRow(5),
        scrollTop: 0,
        height: 100,
        width: 800,
      },
      selections: [],
      decorations: [],
      excerptHeaders: [],
      focused: true,
    };

    test("paints through the 2D context", () => {
      mountWith(DEFAULT_MEASUREMENTS);
      mainCanvasCalls.length = 0;

      renderer.render(renderState, ["hello world", "second"]);

      // A background fill plus the per-row painting.
      expect(mainCanvasCalls.length).toBeGreaterThan(0);
      expect(mainCanvasCalls.some((call) => call[0] === "fillRect")).toBe(true);
    });

    test("setTheme defers painting to an animation frame", () => {
      mountWith(DEFAULT_MEASUREMENTS);
      mainCanvasCalls.length = 0;

      renderer.setTheme({ cursor: "#123456" });
      // Nothing is painted synchronously - the work is queued.
      expect(mainCanvasCalls.length).toBe(0);

      flushAnimationFrames();

      expect(mainCanvasCalls.length).toBeGreaterThan(0);
      // The gutter carries line numbers, so row 1 is drawn as text.
      expect(mainCanvasCalls.some((call) => call[0] === "fillText" && call[1] === "1")).toBe(true);
    });

    test("renders without a snapshot", () => {
      mountWith(DEFAULT_MEASUREMENTS, false);

      expect(() => renderer.render(renderState, ["hello world"])).not.toThrow();
    });

    test("setSnapshot then render does not throw for an empty document", () => {
      mountWith(DEFAULT_MEASUREMENTS, false);
      const buffer = createBuffer(createBufferId(), "");
      const multibuffer = createMultiBuffer();
      multibuffer.addExcerpt(buffer, excerptRange(0, 1));
      renderer.setSnapshot(multibuffer.snapshot());

      expect(() => renderer.render(renderState, [""])).not.toThrow();
    });
  });

  describe("measurement changes", () => {
    test("setMeasurements changes how x maps to columns", () => {
      mountWith(DEFAULT_MEASUREMENTS);
      expect(renderer.hitTest(56, 0)).toEqual({ row: mbRow(0), column: 2 });

      renderer.setMeasurements({ lineHeight: 20, charWidth: 16, gutterWidth: 40 });

      // (56 - 40) / 16 = 1.
      expect(renderer.hitTest(56, 0)).toEqual({ row: mbRow(0), column: 1 });
    });

    test("setMeasurements changes how y maps to rows", () => {
      mountWith(DEFAULT_MEASUREMENTS);
      expect(renderer.hitTest(40, 40)?.row).toBe(mbRow(2));

      renderer.setMeasurements({ lineHeight: 40, charWidth: 8, gutterWidth: 40 });

      expect(renderer.hitTest(40, 40)?.row).toBe(mbRow(1));
    });
  });
});
