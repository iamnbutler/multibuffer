/**
 * Tests that CanvasRenderer paints its caret at the *primary* selection.
 *
 * `Editor#selections` documents the last element as the primary selection (the
 * most recently added one), and `Editor#cursor` resolves that same element.
 * The canvas render path must agree: with multiple cursors active, the caret
 * belongs at `editor.cursor`, not at the oldest selection.
 *
 * The renderer is mounted under happy-dom with a recording 2D context so the
 * caret's actual pixel geometry can be asserted. The caret is the only
 * `fillRect` of width `CARET_WIDTH`, which makes it identifiable in the
 * recorded draw calls.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { createSingleBufferEditor } from "../../src/editor/factories.ts";
import { CanvasRenderer } from "../../src/renderer/canvas.ts";
import type { Measurements, Viewport } from "../../src/renderer/types.ts";
import { mbRow } from "../helpers.ts";

/** Width in px of the caret rect drawn by CanvasRenderer. */
const CARET_WIDTH = 2;

const MEASUREMENTS: Measurements = {
  lineHeight: 20,
  gutterWidth: 48,
  charWidth: 8,
  wrapWidth: 0,
};

type Rect = { x: number; y: number; width: number; height: number };

let happyWindow: Window;
let recorded: Rect[] = [];
let originalDocument: typeof globalThis.document;
let originalWindow: typeof globalThis.window;
let originalOffscreenCanvas: typeof globalThis.OffscreenCanvas;
let originalGetComputedStyle: typeof globalThis.getComputedStyle;

/**
 * Minimal 2D context stub. Only the calls CanvasRenderer makes are
 * implemented; `fillRect` records into `recorded` so draws can be asserted.
 */
function createRecordingContext(): CanvasRenderingContext2D {
  const ctx = {
    fillStyle: "",
    font: "",
    textAlign: "",
    textBaseline: "",
    globalCompositeOperation: "",
    fillRect: (x: number, y: number, width: number, height: number): void => {
      recorded.push({ x, y, width, height });
    },
    fillText: (): void => {},
    drawImage: (): void => {},
    save: (): void => {},
    restore: (): void => {},
    scale: (): void => {},
    clearRect: (): void => {},
    measureText: (): { width: number } => ({ width: MEASUREMENTS.charWidth ?? 8 }),
  };
  // biome-ignore lint/plugin/no-type-assertion: expect: test stub implements the subset of CanvasRenderingContext2D that CanvasRenderer uses
  return ctx as unknown as CanvasRenderingContext2D;
}

function setupDOM(): void {
  happyWindow = new Window({ width: 800, height: 600 });
  originalDocument = globalThis.document;
  originalWindow = globalThis.window;
  originalOffscreenCanvas = globalThis.OffscreenCanvas;
  originalGetComputedStyle = globalThis.getComputedStyle;

  // happy-dom has no canvas backend: hand the renderer a recording context.
  happyWindow.HTMLCanvasElement.prototype.getContext = (): CanvasRenderingContext2D =>
    createRecordingContext();

  // The glyph atlas allocates an OffscreenCanvas, which happy-dom lacks.
  class StubOffscreenCanvas {
    width: number;
    height: number;
    constructor(width: number, height: number) {
      this.width = width;
      this.height = height;
    }
    getContext(): CanvasRenderingContext2D {
      return createRecordingContext();
    }
  }
  // biome-ignore lint/plugin/no-type-assertion: expect: OffscreenCanvas stub for the glyph atlas under happy-dom
  globalThis.OffscreenCanvas = StubOffscreenCanvas as unknown as typeof globalThis.OffscreenCanvas;

  // biome-ignore lint/plugin/no-type-assertion: expect: happy-dom window/document assignment
  globalThis.document = happyWindow.document as unknown as Document;
  Object.defineProperty(globalThis, "window", {
    value: happyWindow,
    writable: true,
    configurable: true,
  });
  // biome-ignore lint/plugin/no-type-assertion: expect: happy-dom getComputedStyle assignment
  globalThis.getComputedStyle = happyWindow.getComputedStyle.bind(
    happyWindow,
  ) as unknown as typeof globalThis.getComputedStyle;

  // Without explicit dimensions the canvas is 0px wide and nothing paints.
  Object.defineProperty(happyWindow.HTMLElement.prototype, "clientWidth", {
    get: () => 800,
    configurable: true,
  });
  Object.defineProperty(happyWindow.HTMLElement.prototype, "clientHeight", {
    get: () => 600,
    configurable: true,
  });
}

function teardownDOM(): void {
  globalThis.document = originalDocument;
  globalThis.OffscreenCanvas = originalOffscreenCanvas;
  globalThis.getComputedStyle = originalGetComputedStyle;
  Object.defineProperty(globalThis, "window", {
    value: originalWindow,
    writable: true,
    configurable: true,
  });
  happyWindow.close();
}

function createContainer(): HTMLElement {
  const container = happyWindow.document.createElement("div");
  happyWindow.document.body.appendChild(container);
  // biome-ignore lint/plugin/no-type-assertion: expect: happy-dom element used as HTMLElement
  return container as unknown as HTMLElement;
}

/** A viewport covering `rowCount` rows, independent of scroll measurement. */
function viewportFor(rowCount: number): Viewport {
  return {
    startRow: mbRow(0),
    endRow: mbRow(rowCount),
    scrollTop: 0,
    height: 600,
    width: 800,
  };
}

beforeEach(() => {
  recorded = [];
  setupDOM();
});

afterEach(() => {
  teardownDOM();
});

describe("CanvasRenderer caret follows the primary selection", () => {
  test("with multiple cursors the caret is drawn at editor.cursor, not the oldest selection", () => {
    const renderer = new CanvasRenderer(MEASUREMENTS);
    renderer.mount(createContainer());

    const editor = createSingleBufferEditor("aaaa\nbbbb\ncccc\ndddd");
    // Adds a second cursor on the row below; the new one becomes primary.
    editor.dispatch({ type: "addCursorBelow" });
    expect(editor.selections.length).toBe(2);

    const snapshot = editor.multiBuffer.snapshot();
    const viewport = viewportFor(4);
    renderer.setSnapshot(snapshot);
    recorded = [];
    renderer.render(
      {
        viewport,
        selections: editor.selections,
        decorations: [],
        excerptHeaders: [],
        focused: true,
      },
      snapshot.lines(viewport.startRow, viewport.endRow),
    );

    const carets = recorded.filter((r) => r.width === CARET_WIDTH);
    expect(carets.length).toBe(1);

    // The caret's row is its y offset divided by the line height.
    const caret = carets[0];
    expect(caret).toBeDefined();
    const caretRow = (caret?.y ?? -1) / MEASUREMENTS.lineHeight;
    expect(caretRow).toBe(editor.cursor.row);

    // Pin the specific regression: `addCursorBelow` leaves the oldest selection
    // on row 0, so a caret drawn there would mean the renderer read
    // `selections[0]` instead of the primary selection.
    expect(editor.cursor.row).toBe(mbRow(1));
    expect(caretRow).not.toBe(0);
  });

  test("with a single cursor the caret still tracks that selection", () => {
    const renderer = new CanvasRenderer(MEASUREMENTS);
    renderer.mount(createContainer());

    const editor = createSingleBufferEditor("aaaa\nbbbb\ncccc\ndddd");
    editor.dispatch({ type: "moveCursor", direction: "down", granularity: "line" });
    expect(editor.selections.length).toBe(1);

    const snapshot = editor.multiBuffer.snapshot();
    const viewport = viewportFor(4);
    renderer.setSnapshot(snapshot);
    recorded = [];
    renderer.render(
      {
        viewport,
        selections: editor.selections,
        decorations: [],
        excerptHeaders: [],
        focused: true,
      },
      snapshot.lines(viewport.startRow, viewport.endRow),
    );

    const carets = recorded.filter((r) => r.width === CARET_WIDTH);
    expect(carets.length).toBe(1);
    expect((carets[0]?.y ?? -1) / MEASUREMENTS.lineHeight).toBe(editor.cursor.row);
  });
});
