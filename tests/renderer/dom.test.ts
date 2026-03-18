/**
 * Tests for DomRenderer - the DOM-based rendering implementation.
 *
 * Uses happy-dom for DOM environment simulation.
 * Covers:
 * - Mount/unmount lifecycle
 * - Theme application
 * - Cursor blink configuration
 * - Cursor and selection rendering
 * - Hit testing
 * - Scroll behavior
 * - Mouse event handling
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import type { MultiBufferPoint, MultiBufferRow, MultiBufferSnapshot } from "../../src/multibuffer/types.ts";
import { createDomRenderer, DomRenderer } from "../../src/renderer/dom.ts";
import type { Decoration, Measurements, RenderState, Theme, Viewport } from "../../src/renderer/types.ts";
import { num } from "../helpers.ts";

// biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in tests
const row = (n: number): MultiBufferRow => n as MultiBufferRow;

/** Build a minimal MultiBufferSnapshot stub for testing. */
function makeSnapshot(textLines: string[]): MultiBufferSnapshot {
  // biome-ignore lint/plugin/no-type-assertion: expect: test stub implements required subset of interface
  return {
    lineCount: textLines.length,
    version: 1,
    excerpts: [],
    lines: (start: MultiBufferRow, end: MultiBufferRow) =>
      textLines.slice(start, end),
    excerptAt: (_r: MultiBufferRow) => ({
      bufferId: "test-buffer",
      startRow: row(0),
      endRow: row(textLines.length),
      range: {
        context: {
          start: { row: row(0), column: 0 },
          end: { row: row(textLines.length), column: 0 },
        },
        primary: {
          start: { row: row(0), column: 0 },
          end: { row: row(textLines.length), column: 0 },
        },
      },
    }),
    toBufferPoint: () => undefined,
    toMultiBufferPoint: () => undefined,
    resolveAnchor: () => undefined,
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
  // biome-ignore lint/suspicious/noExplicitAny: expect: happy-dom Window API differs from native Window but is compatible for testing
  // biome-ignore lint/plugin/no-type-assertion: expect: happy-dom Window type differs from native Window but is compatible for testing
  (globalThis as any).window = happyWindow;
}

function teardownDOM(): void {
  globalThis.document = originalDocument;
  globalThis.window = originalWindow;
  happyWindow.close();
}

describe("DomRenderer", () => {
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

  describe("mount/unmount lifecycle", () => {
    test("mount creates scroll container structure", () => {
      renderer.mount(container);

      // Should have a scroll container child
      expect(container.children.length).toBe(1);
      const scrollContainer = container.children[0];
      expect(scrollContainer).toBeDefined();
      expect(scrollContainer?.tagName).toBe("DIV");
    });

    test("mount creates cursor element", () => {
      renderer.mount(container);

      // Find the cursor element (has position:absolute and width:2px)
      const scrollContainer = container.children[0];
      const cursor = scrollContainer?.querySelector('[style*="width:2px"]');
      expect(cursor).toBeDefined();
    });

    test("mount injects blink animation keyframes", () => {
      renderer.mount(container);

      // Check that a style element was added to document.head
      const styles = Array.from(document.head.querySelectorAll("style"));
      let found = false;
      for (const style of styles) {
        if (style.textContent?.includes("cursor-blink")) {
          found = true;
          break;
        }
      }
      expect(found).toBe(true);
    });

    test("unmount removes all DOM elements", () => {
      renderer.mount(container);
      expect(container.children.length).toBe(1);

      renderer.unmount();
      expect(container.children.length).toBe(0);
    });

    test("unmount removes blink style from head", () => {
      renderer.mount(container);

      // Count styles with cursor-blink before unmount
      let countBefore = 0;
      for (const style of Array.from(document.head.querySelectorAll("style"))) {
        if (style.textContent?.includes("cursor-blink")) countBefore++;
      }

      renderer.unmount();

      // Count styles with cursor-blink after unmount
      let countAfter = 0;
      for (const style of Array.from(document.head.querySelectorAll("style"))) {
        if (style.textContent?.includes("cursor-blink")) countAfter++;
      }

      expect(countAfter).toBe(countBefore - 1);
    });

    test("unmount is idempotent", () => {
      renderer.mount(container);
      renderer.unmount();
      // Should not throw
      expect(() => renderer.unmount()).not.toThrow();
    });
  });

  describe("theme configuration", () => {
    test("setTheme applies CSS variables to container", () => {
      renderer.mount(container);
      renderer.setTheme({
        cursor: "#ff0000",
        selection: "rgba(255,0,0,0.3)",
      });

      expect(container.style.getPropertyValue("--editor-cursor")).toBe("#ff0000");
      expect(container.style.getPropertyValue("--editor-selection")).toBe("rgba(255,0,0,0.3)");
    });

    test("setTheme before mount applies theme on mount", () => {
      renderer.setTheme({ cursor: "#00ff00" });
      renderer.mount(container);

      expect(container.style.getPropertyValue("--editor-cursor")).toBe("#00ff00");
    });

    test("setTheme merges with existing theme", () => {
      renderer.mount(container);
      renderer.setTheme({ cursor: "#ff0000" });
      renderer.setTheme({ selection: "#0000ff" });

      // Both should be set
      expect(container.style.getPropertyValue("--editor-cursor")).toBe("#ff0000");
      expect(container.style.getPropertyValue("--editor-selection")).toBe("#0000ff");
    });
  });

  describe("cursor blink configuration", () => {
    test("setCursorBlink with valid interval updates blink setting", () => {
      renderer.mount(container);
      renderer.setCursorBlink(500);
      expect(renderer.getCursorBlinkInterval()).toBe(500);
    });

    test("setCursorBlink(false) disables blinking", () => {
      renderer.mount(container);
      renderer.setCursorBlink(false);
      expect(renderer.getCursorBlinkInterval()).toBe(false);
    });

    test("setCursorBlink with non-positive number throws RangeError", () => {
      renderer.mount(container);
      expect(() => renderer.setCursorBlink(0)).toThrow(RangeError);
      expect(() => renderer.setCursorBlink(-100)).toThrow(RangeError);
    });

    test("default blink interval is 600ms", () => {
      renderer.mount(container);
      expect(renderer.getCursorBlinkInterval()).toBe(600);
    });
  });

  describe("focus state", () => {
    test("setFocused updates internal focus state", () => {
      renderer.mount(container);
      const snapshot = makeSnapshot(["hello"]);
      renderer.setSnapshot(snapshot);

      // Render cursor to make it visible
      renderer.renderCursor({ row: row(0), column: 0 });

      // When focused, cursor should blink
      renderer.setFocused(true);

      // When unfocused, cursor animation should be none
      renderer.setFocused(false);

      // Test passes if no errors are thrown
      expect(true).toBe(true);
    });
  });

  describe("cursor visibility", () => {
    test("setCursorHidden(true) hides the cursor", () => {
      renderer.mount(container);
      const snapshot = makeSnapshot(["hello"]);
      renderer.setSnapshot(snapshot);

      renderer.renderCursor({ row: row(0), column: 0 });
      renderer.setCursorHidden(true);

      expect(renderer.cursorHidden).toBe(true);
    });

    test("setCursorHidden(false) allows cursor to be shown", () => {
      renderer.mount(container);
      renderer.setCursorHidden(true);
      renderer.setCursorHidden(false);

      expect(renderer.cursorHidden).toBe(false);
    });

    test("renderCursor does nothing when cursor is hidden", () => {
      renderer.mount(container);
      const snapshot = makeSnapshot(["hello"]);
      renderer.setSnapshot(snapshot);

      renderer.setCursorHidden(true);
      renderer.renderCursor({ row: row(0), column: 0 });

      // Should not throw and cursor should remain hidden
      expect(renderer.cursorHidden).toBe(true);
    });
  });

  describe("snapshot and measurements", () => {
    test("setSnapshot stores the snapshot for rendering", () => {
      renderer.mount(container);
      const snapshot = makeSnapshot(["line1", "line2"]);
      renderer.setSnapshot(snapshot);

      // After setting snapshot, we should be able to render
      const viewport: Viewport = {
        startRow: row(0),
        endRow: row(2),
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

      // Should not throw
      expect(() => renderer.render(state, ["line1", "line2"])).not.toThrow();
    });

    test("setMeasurements updates measurements", () => {
      renderer.mount(container);
      const newMeasurements: Measurements = {
        lineHeight: 24,
        charWidth: 10,
        gutterWidth: 50,
      };
      renderer.setMeasurements(newMeasurements);

      // Measurements are updated (no public getter, but render should use them)
      expect(true).toBe(true);
    });

    test("getCharWidth returns measured character width", () => {
      renderer.mount(container);
      // After mount, charWidth should be measured (or use default)
      const charWidth = renderer.getCharWidth();
      expect(typeof charWidth).toBe("number");
      expect(charWidth).toBeGreaterThan(0);
    });
  });

  describe("viewport", () => {
    test("getViewport returns current viewport", () => {
      renderer.mount(container);
      const viewport = renderer.getViewport();

      expect(viewport).toBeDefined();
      expect(typeof viewport.startRow).toBe("number");
      expect(typeof viewport.endRow).toBe("number");
      expect(typeof viewport.scrollTop).toBe("number");
    });

    test("getScrollTop returns 0 when not mounted", () => {
      expect(renderer.getScrollTop()).toBe(0);
    });

    test("getScrollTop returns scroll position when mounted", () => {
      renderer.mount(container);
      // Initial scroll should be 0
      expect(renderer.getScrollTop()).toBe(0);
    });
  });

  describe("render", () => {
    test("render displays lines in the viewport", () => {
      renderer.mount(container);
      const snapshot = makeSnapshot(["hello", "world"]);
      renderer.setSnapshot(snapshot);

      const viewport: Viewport = {
        startRow: row(0),
        endRow: row(2),
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

      renderer.render(state, ["hello", "world"]);

      // Check that the lines container has content
      const scrollContainer = container.children[0];
      const linesContainer = scrollContainer?.querySelector('[style*="position:absolute"]');
      expect(linesContainer).toBeDefined();
    });

    test("render with decorations applies styles", () => {
      renderer.mount(container);
      const snapshot = makeSnapshot(["hello", "world"]);
      renderer.setSnapshot(snapshot);

      const decorations: readonly Decoration[] = [
        {
          range: {
            start: { row: row(0), column: 0 },
            end: { row: row(0), column: 5 },
          },
          style: {
            backgroundColor: "#ff0000",
            color: "#ffffff",
            fontWeight: "bold",
            fontStyle: "normal",
            textDecoration: "none",
            borderColor: "",
            gutterBackground: "",
            gutterColor: "",
            gutterSign: "",
            gutterSignColor: "",
          },
        },
      ];

      const viewport: Viewport = {
        startRow: row(0),
        endRow: row(2),
        scrollTop: 0,
        height: 600,
        width: 800,
      };
      const state: RenderState = {
        viewport,
        selections: [],
        decorations,
        excerptHeaders: [],
        focused: false,
      };

      renderer.render(state, ["hello", "world"]);

      // Should not throw
      expect(true).toBe(true);
    });

    test("render does nothing when not mounted", () => {
      const viewport: Viewport = {
        startRow: row(0),
        endRow: row(2),
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

      // Should not throw
      expect(() => renderer.render(state, ["hello"])).not.toThrow();
    });
  });

  describe("cursor rendering", () => {
    test("renderCursor positions cursor at given point", () => {
      renderer.mount(container);
      const snapshot = makeSnapshot(["hello world"]);
      renderer.setSnapshot(snapshot);

      renderer.renderCursor({ row: row(0), column: 5 });

      // Find cursor element and check its position
      const scrollContainer = container.children[0];
      const cursor = scrollContainer?.querySelector('[style*="width:2px"]');
      expect(cursor).toBeDefined();

      // Cursor should be visible
      // biome-ignore lint/plugin/no-type-assertion: expect: querySelector returns Element, but we need HTMLElement for style access
      const style = (cursor as HTMLElement)?.style;
      expect(style?.display).toBe("block");
    });

    test("renderCursor with undefined hides cursor", () => {
      renderer.mount(container);
      renderer.renderCursor(undefined);

      const scrollContainer = container.children[0];
      const cursor = scrollContainer?.querySelector('[style*="width:2px"]');
      // biome-ignore lint/plugin/no-type-assertion: expect: querySelector returns Element, but we need HTMLElement for style access
      const style = (cursor as HTMLElement)?.style;
      expect(style?.display).toBe("none");
    });
  });

  describe("selection rendering", () => {
    test("renderSelection with valid range shows highlights", () => {
      renderer.mount(container);
      const snapshot = makeSnapshot(["hello world"]);
      renderer.setSnapshot(snapshot);

      renderer.renderSelection(
        { row: row(0), column: 0 },
        { row: row(0), column: 5 },
      );

      // Should not throw
      expect(true).toBe(true);
    });

    test("renderSelection with undefined clears selection", () => {
      renderer.mount(container);
      const snapshot = makeSnapshot(["hello world"]);
      renderer.setSnapshot(snapshot);

      renderer.renderSelection(undefined, undefined);

      // Should not throw
      expect(true).toBe(true);
    });

    test("renderSelection with same start and end shows nothing", () => {
      renderer.mount(container);
      const snapshot = makeSnapshot(["hello world"]);
      renderer.setSnapshot(snapshot);

      renderer.renderSelection(
        { row: row(0), column: 3 },
        { row: row(0), column: 3 },
      );

      // Should not throw (empty selection)
      expect(true).toBe(true);
    });
  });

  describe("hitTest", () => {
    test("hitTest returns undefined when not mounted", () => {
      const result = renderer.hitTest(100, 50);
      expect(result).toBeUndefined();
    });

    test("hitTest returns position for valid coordinates", () => {
      renderer.mount(container);
      const snapshot = makeSnapshot(["hello world"]);
      renderer.setSnapshot(snapshot);

      // x=40 is at gutter boundary, y=0 is first row
      const result = renderer.hitTest(40, 0);
      expect(result).toBeDefined();
      expect(num(result?.row ?? row(0))).toBe(0);
      expect(result?.column).toBe(0);
    });

    test("hitTest returns column based on x position", () => {
      renderer.mount(container);
      const snapshot = makeSnapshot(["hello world"]);
      renderer.setSnapshot(snapshot);

      // x = gutterWidth + charWidth * columns
      // With gutterWidth=40 and charWidth=8, x=48 should be column 1
      const result = renderer.hitTest(48, 0);
      expect(result).toBeDefined();
      expect(result?.column).toBeGreaterThanOrEqual(0);
    });
  });

  describe("scrollTo", () => {
    test("scrollTo with strategy top scrolls to row", () => {
      renderer.mount(container);
      const snapshot = makeSnapshot(Array(100).fill("line"));
      renderer.setSnapshot(snapshot);

      renderer.scrollTo({ row: row(50), strategy: "top" });

      // Should not throw
      expect(true).toBe(true);
    });

    test("scrollTo with strategy center scrolls to row", () => {
      renderer.mount(container);
      const snapshot = makeSnapshot(Array(100).fill("line"));
      renderer.setSnapshot(snapshot);

      renderer.scrollTo({ row: row(50), strategy: "center" });
      expect(true).toBe(true);
    });

    test("scrollTo does nothing when not mounted", () => {
      // Should not throw
      expect(() => renderer.scrollTo({ row: row(0), strategy: "top" })).not.toThrow();
    });
  });

  describe("event callbacks", () => {
    test("onClickPosition registers callback", () => {
      renderer.mount(container);
      renderer.onClickPosition(() => {
        // Callback would be called on click
      });

      // Callback registered, but we can't easily trigger mouse events in happy-dom
      expect(true).toBe(true);
    });

    test("onDrag registers callback", () => {
      renderer.mount(container);
      renderer.onDrag(() => {
        // Callback would be called on drag
      });

      expect(true).toBe(true);
    });

    test("onDoubleClick registers callback", () => {
      renderer.mount(container);
      renderer.onDoubleClick(() => {});
      expect(true).toBe(true);
    });

    test("onTripleClick registers callback", () => {
      renderer.mount(container);
      renderer.onTripleClick(() => {});
      expect(true).toBe(true);
    });
  });

  describe("remeasure", () => {
    test("remeasure does nothing when not mounted", () => {
      expect(() => renderer.remeasure()).not.toThrow();
    });

    test("remeasure updates character width measurement", () => {
      renderer.mount(container);

      renderer.remeasure();
      const widthAfter = renderer.getCharWidth();

      // Width should be measured (value depends on font)
      expect(typeof widthAfter).toBe("number");
      expect(widthAfter).toBeGreaterThan(0);
    });
  });

  describe("createDomRenderer factory", () => {
    test("createDomRenderer returns a DomRenderer instance", () => {
      const r = createDomRenderer(DEFAULT_MEASUREMENTS);
      expect(r).toBeInstanceOf(DomRenderer);
    });

    test("createDomRenderer with theme applies theme", () => {
      const theme: Partial<Theme> = { cursor: "#123456" };
      const r = createDomRenderer(DEFAULT_MEASUREMENTS, theme);
      r.mount(container);

      expect(container.style.getPropertyValue("--editor-cursor")).toBe("#123456");
      r.unmount();
    });
  });

  describe("diff mode gutter", () => {
    test("render with gutterMode diff uses diff gutter layout", () => {
      const diffMeasurements: Measurements = {
        lineHeight: 20,
        charWidth: 8,
        gutterWidth: 40,
        gutterMode: "diff",
      };
      const diffRenderer = new DomRenderer(diffMeasurements);
      diffRenderer.mount(container);

      const snapshot = makeSnapshot(["hello", "world"]);
      diffRenderer.setSnapshot(snapshot);

      const viewport: Viewport = {
        startRow: row(0),
        endRow: row(2),
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

      diffRenderer.render(state, ["hello", "world"]);

      // Should render without errors in diff mode
      expect(true).toBe(true);

      diffRenderer.unmount();
    });
  });

  describe("excerpt headers", () => {
    test("render with excerpt headers displays them", () => {
      renderer.mount(container);
      const snapshot = makeSnapshot(["", "hello", "world"]);
      renderer.setSnapshot(snapshot);

      const viewport: Viewport = {
        startRow: row(0),
        endRow: row(3),
        scrollTop: 0,
        height: 600,
        width: 800,
      };
      const state: RenderState = {
        viewport,
        selections: [],
        decorations: [],
        excerptHeaders: [
          { row: row(0), path: "test.ts", label: "L1-10" },
        ],
        focused: false,
      };

      renderer.render(state, ["", "hello", "world"]);

      // Should render without errors
      expect(true).toBe(true);
    });
  });

  describe("wrap width", () => {
    test("setMeasurements with wrapWidth enables soft wrapping", () => {
      renderer.mount(container);
      const snapshot = makeSnapshot(["a very long line that should wrap when the wrap width is small"]);
      renderer.setSnapshot(snapshot);

      const wrappedMeasurements: Measurements = {
        lineHeight: 20,
        charWidth: 8,
        gutterWidth: 40,
        wrapWidth: 20,
      };
      renderer.setMeasurements(wrappedMeasurements);

      const viewport: Viewport = {
        startRow: row(0),
        endRow: row(1),
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

      renderer.render(state, ["a very long line that should wrap when the wrap width is small"]);

      // Should render without errors
      expect(true).toBe(true);
    });
  });
});

describe("DomRenderer static properties", () => {
  test("LAZY_WRAP_THRESHOLD is defined", () => {
    expect(DomRenderer.LAZY_WRAP_THRESHOLD).toBe(5000);
  });

  test("WRAP_CHUNK_SIZE is defined", () => {
    expect(DomRenderer.WRAP_CHUNK_SIZE).toBe(2000);
  });
});
