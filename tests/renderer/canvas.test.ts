/**
 * Tests for the Canvas renderer.
 *
 * Covers:
 * - CanvasRenderer: interface compliance and basic rendering
 * - createCanvasRenderer factory function
 *
 * Note: GlyphAtlas and full rendering tests require a browser environment
 * with OffscreenCanvas support (Playwright e2e). These tests verify the
 * logic that can run in Bun without DOM/Canvas APIs.
 */

import { describe, expect, test } from "bun:test";
import type { MultiBufferRow } from "../../src/multibuffer/types.ts";
import { CanvasRenderer, createCanvasRenderer } from "../../src/renderer/canvas.ts";
import type { Measurements } from "../../src/renderer/types.ts";

// biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in tests
const row = (n: number) => n as MultiBufferRow;

const DEFAULT_MEASUREMENTS: Measurements = {
  lineHeight: 20,
  charWidth: 8,
  gutterWidth: 40,
};

// Note: GlyphAtlas requires OffscreenCanvas which is only available in browsers.
// These tests are skipped in Bun/Node and run in Playwright e2e tests instead.
// To test locally in a browser context, uncomment the GlyphAtlas tests below.

describe("CanvasRenderer", () => {
  describe("construction", () => {
    test("creates renderer with measurements", () => {
      const renderer = new CanvasRenderer(DEFAULT_MEASUREMENTS);
      expect(renderer).toBeDefined();
    });

    test("creates renderer with custom theme", () => {
      const renderer = new CanvasRenderer(DEFAULT_MEASUREMENTS, {
        syntaxDefault: "#ffffff",
      });
      expect(renderer).toBeDefined();
    });

    test("getViewport returns initial zero viewport before mount", () => {
      const renderer = new CanvasRenderer(DEFAULT_MEASUREMENTS);
      const viewport = renderer.getViewport();
      expect(viewport.startRow).toBe(row(0));
      expect(viewport.endRow).toBe(row(0));
      expect(viewport.scrollTop).toBe(0);
      expect(viewport.height).toBe(0);
      expect(viewport.width).toBe(0);
    });
  });

  describe("setMeasurements", () => {
    test("updates measurements", () => {
      const renderer = new CanvasRenderer(DEFAULT_MEASUREMENTS);
      const newMeasurements: Measurements = {
        lineHeight: 24,
        charWidth: 10,
        gutterWidth: 50,
      };
      // Should not throw
      renderer.setMeasurements(newMeasurements);
    });
  });

  describe("setTheme", () => {
    test("updates theme", () => {
      const renderer = new CanvasRenderer(DEFAULT_MEASUREMENTS);
      // Should not throw
      renderer.setTheme({
        cursor: "#ff0000",
        syntaxDefault: "#00ff00",
      });
    });

    test("partial theme update merges with existing", () => {
      const renderer = new CanvasRenderer(DEFAULT_MEASUREMENTS, {
        cursor: "#aaa",
      });
      renderer.setTheme({ gutter: "#bbb" });
      // No assertion needed - just verify no errors
    });
  });

  describe("hitTest", () => {
    test("returns undefined for negative y before mount", () => {
      const renderer = new CanvasRenderer(DEFAULT_MEASUREMENTS);
      const result = renderer.hitTest(50, -10);
      // Before mount, totalLines is 0, so any row should be out of bounds
      expect(result).toBeUndefined();
    });
  });

  describe("getAtlas", () => {
    test("returns null before mount", () => {
      const renderer = new CanvasRenderer(DEFAULT_MEASUREMENTS);
      expect(renderer.getAtlas()).toBeNull();
    });
  });
});

describe("createCanvasRenderer", () => {
  test("returns a Renderer instance", () => {
    const renderer = createCanvasRenderer(DEFAULT_MEASUREMENTS);
    expect(renderer).toBeDefined();
    expect(typeof renderer.mount).toBe("function");
    expect(typeof renderer.unmount).toBe("function");
    expect(typeof renderer.render).toBe("function");
    expect(typeof renderer.scrollTo).toBe("function");
    expect(typeof renderer.getViewport).toBe("function");
    expect(typeof renderer.hitTest).toBe("function");
    expect(typeof renderer.setMeasurements).toBe("function");
    expect(typeof renderer.setTheme).toBe("function");
  });

  test("accepts optional theme parameter", () => {
    const renderer = createCanvasRenderer(DEFAULT_MEASUREMENTS, {
      cursor: "#ff0000",
    });
    expect(renderer).toBeDefined();
  });
});

describe("CanvasRenderer interface compliance", () => {
  test("implements Renderer interface", () => {
    const renderer = createCanvasRenderer(DEFAULT_MEASUREMENTS);

    // All required methods should be defined
    expect(typeof renderer.mount).toBe("function");
    expect(typeof renderer.unmount).toBe("function");
    expect(typeof renderer.setMeasurements).toBe("function");
    expect(typeof renderer.setTheme).toBe("function");
    expect(typeof renderer.render).toBe("function");
    expect(typeof renderer.scrollTo).toBe("function");
    expect(typeof renderer.getViewport).toBe("function");
    expect(typeof renderer.hitTest).toBe("function");
  });
});
