/**
 * DOM rendering tests for line-level decorations.
 *
 * These drive the real `DomRenderer` under happy-dom and assert on the elements
 * it actually produces. `decoration.test.ts` covers the decoration *data model*
 * against a mapping function declared in that file; nothing there executes
 * `DomRenderer.render()`, so the rendering of row backgrounds, gutter
 * backgrounds, gutter colours and `+`/`−` signs had no executable coverage.
 *
 * The distinction under test is the line-level vs column-level (intraline)
 * classification in `DomRenderer.render()`: a decoration spanning a whole line
 * paints the row, while one bounded by columns decorates a span of the text.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import type { MultiBufferPoint, MultiBufferRow, MultiBufferSnapshot } from "../../src/multibuffer/types.ts";
import { DomRenderer } from "../../src/renderer/dom.ts";
import { createViewport } from "../../src/renderer/measurement.ts";
import type { Decoration, DecorationStyle, Measurements, RenderState } from "../../src/renderer/types.ts";
import { mbRow } from "../helpers.ts";

/** Build a minimal MultiBufferSnapshot stub for testing. */
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

/** A line-level decoration: whole row, from column 0 to the end sentinel. */
function lineDecoration(
  startRow: number,
  endRow: number,
  style: Partial<DecorationStyle>,
): Decoration {
  // biome-ignore lint/plugin/no-type-assertion: expect: decoration literal for a test fixture
  return {
    range: {
      start: { row: mbRow(startRow), column: 0 },
      end: { row: mbRow(endRow), column: Number.MAX_SAFE_INTEGER },
    },
    style,
  } as unknown as Decoration;
}

/** A column-level (intraline) decoration: bounded by columns within one row. */
function columnDecoration(
  row: number,
  startColumn: number,
  endColumn: number,
  style: Partial<DecorationStyle>,
): Decoration {
  // biome-ignore lint/plugin/no-type-assertion: expect: decoration literal for a test fixture
  return {
    range: {
      start: { row: mbRow(row), column: startColumn },
      end: { row: mbRow(row), column: endColumn },
    },
    style,
  } as unknown as Decoration;
}

const DELETE_STYLE: Partial<DecorationStyle> = {
  backgroundColor: "rgba(255, 80, 80, 0.10)",
  gutterBackground: "rgba(255, 80, 80, 0.18)",
  gutterColor: "#ffaaaa",
  gutterSign: "−",
  gutterSignColor: "#ff5555",
};

// Store original globals to restore after tests
let originalDocument: typeof globalThis.document;
let originalWindow: typeof globalThis.window;
let happyWindow: Window;

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

describe("DomRenderer line-level decorations", () => {
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
    if (renderer) {
      renderer.unmount();
    }
    if (container?.parentNode) {
      container.parentNode.removeChild(container);
    }
    teardownDOM();
  });

  /**
   * Render `lines` with `decorations` and return the row elements produced.
   *
   * mount() builds `container > scrollContainer > [spacer, selectionLayer,
   * linesContainer, cursor]`, so the rendered rows are the children of the
   * third element. Indexed traversal is used rather than a selector because
   * happy-dom does not reliably support attribute selectors here.
   */
  function renderRows(lines: string[], decorations: Decoration[]): HTMLElement[] {
    renderer.mount(container);
    renderer.setSnapshot(makeSnapshot(lines));

    const viewport = createViewport(0, 600, 800, DEFAULT_MEASUREMENTS, lines.length);
    const state: RenderState = {
      viewport,
      selections: [],
      decorations,
      excerptHeaders: [],
      focused: true,
    };
    renderer.render(state, lines);

    const scrollContainer = container.children[0];
    const linesContainer = scrollContainer?.children[2];
    // biome-ignore lint/plugin/no-type-assertion: expect: rendered rows are HTMLElements
    return Array.from(linesContainer?.children ?? []) as unknown as HTMLElement[];
  }

  /** The gutter is the only visible (inline-block) gutter column in standard mode. */
  function gutterOf(row: HTMLElement): HTMLElement | undefined {
    for (const child of Array.from(row.children)) {
      // biome-ignore lint/plugin/no-type-assertion: expect: row children are HTMLElements
      const el = child as unknown as HTMLElement;
      if (el.style?.display === "inline-block") return el;
    }
    return undefined;
  }

  test("a line-level decoration paints the row background", () => {
    const rows = renderRows(["alpha", "bravo", "charlie"], [lineDecoration(1, 1, DELETE_STYLE)]);

    expect(rows.length).toBe(3);
    expect(rows[1]?.style.background).toBe("rgba(255, 80, 80, 0.10)");
  });

  test("undecorated rows keep the default background", () => {
    const rows = renderRows(["alpha", "bravo", "charlie"], [lineDecoration(1, 1, DELETE_STYLE)]);

    expect(rows[0]?.style.background).not.toBe("rgba(255, 80, 80, 0.10)");
    expect(rows[2]?.style.background).not.toBe("rgba(255, 80, 80, 0.10)");
  });

  test("a line-level decoration paints the gutter background and colour", () => {
    const rows = renderRows(["alpha", "bravo", "charlie"], [lineDecoration(1, 1, DELETE_STYLE)]);

    const gutter = gutterOf(rows[1] ?? document.createElement("div"));
    expect(gutter?.style.background).toBe("rgba(255, 80, 80, 0.18)");
    expect(gutter?.style.color).toBe("#ffaaaa");
  });

  test("the gutter sign is rendered alongside the line number", () => {
    const rows = renderRows(["alpha", "bravo", "charlie"], [lineDecoration(1, 1, DELETE_STYLE)]);

    const gutter = gutterOf(rows[1] ?? document.createElement("div"));
    expect(gutter?.textContent).toContain("−");
    // The line number is kept: row index 1 renders as line 2.
    expect(gutter?.textContent).toContain("2");
  });

  test("the gutter sign carries its own colour in its own span", () => {
    const rows = renderRows(["alpha", "bravo", "charlie"], [lineDecoration(1, 1, DELETE_STYLE)]);

    const gutter = gutterOf(rows[1] ?? document.createElement("div"));
    const signSpan = Array.from(gutter?.children ?? []).find((c) => c.textContent?.includes("−"));
    expect(signSpan).toBeDefined();
    // biome-ignore lint/plugin/no-type-assertion: expect: span is an HTMLElement
    expect((signSpan as unknown as HTMLElement)?.style.color).toBe("#ff5555");
  });

  test("a multi-row line-level decoration paints every row in its range", () => {
    const rows = renderRows(
      ["alpha", "bravo", "charlie", "delta"],
      [lineDecoration(1, 2, { backgroundColor: "rgb(1, 2, 3)" })],
    );

    expect(rows[0]?.style.background).not.toBe("rgb(1, 2, 3)");
    expect(rows[1]?.style.background).toBe("rgb(1, 2, 3)");
    expect(rows[2]?.style.background).toBe("rgb(1, 2, 3)");
    expect(rows[3]?.style.background).not.toBe("rgb(1, 2, 3)");
  });

  test("an intraline decoration on the same row does not displace the line-level one", () => {
    // This is the ordering the diff subsystem produces: a signed line-level
    // decoration first, then an unsigned intraline decoration on the same row.
    // The line-level styling must survive both.
    const rows = renderRows(
      ["alpha", "bravo", "charlie"],
      [
        lineDecoration(1, 1, DELETE_STYLE),
        columnDecoration(1, 1, 3, { backgroundColor: "rgba(255, 0, 0, 0.25)" }),
      ],
    );

    expect(rows[1]?.style.background).toBe("rgba(255, 80, 80, 0.10)");

    const gutter = gutterOf(rows[1] ?? document.createElement("div"));
    expect(gutter?.style.background).toBe("rgba(255, 80, 80, 0.18)");
    expect(gutter?.textContent).toContain("−");
  });

  test("a column-bounded decoration does not paint the whole row", () => {
    const rows = renderRows(
      ["alpha", "bravo", "charlie"],
      [columnDecoration(1, 1, 3, { backgroundColor: "rgba(255, 0, 0, 0.25)" })],
    );

    expect(rows[1]?.style.background).not.toBe("rgba(255, 0, 0, 0.25)");
  });
});
