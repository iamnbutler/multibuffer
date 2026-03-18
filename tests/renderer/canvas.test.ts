/**
 * Tests for CanvasRenderer cursor and selection rendering.
 *
 * Note: Full rendering tests require a browser environment (OffscreenCanvas,
 * Canvas 2D context). These tests validate the public API, configuration,
 * and state management.
 */

import { describe, expect, test } from "bun:test";
import { CanvasRenderer } from "../../src/renderer/canvas.ts";
import type { Measurements } from "../../src/renderer/types.ts";
import { num } from "../helpers.ts";

const testMeasurements: Measurements = {
  lineHeight: 20,
  gutterWidth: 48,
  charWidth: 8,
};

describe("CanvasRenderer.setCursorBlink", () => {
  test("default blink interval is 600ms", () => {
    const renderer = new CanvasRenderer(testMeasurements);
    expect(renderer.getCursorBlinkInterval()).toBe(600);
  });

  test("setCursorBlink stores a custom interval", () => {
    const renderer = new CanvasRenderer(testMeasurements);
    renderer.setCursorBlink(1000);
    expect(renderer.getCursorBlinkInterval()).toBe(1000);
  });

  test("setCursorBlink(false) disables blinking", () => {
    const renderer = new CanvasRenderer(testMeasurements);
    renderer.setCursorBlink(false);
    expect(renderer.getCursorBlinkInterval()).toBe(false);
  });

  test("setCursorBlink can be called before mount without throwing", () => {
    const renderer = new CanvasRenderer(testMeasurements);
    expect(() => renderer.setCursorBlink(500)).not.toThrow();
    expect(() => renderer.setCursorBlink(false)).not.toThrow();
  });

  test("setCursorBlink throws RangeError for zero", () => {
    const renderer = new CanvasRenderer(testMeasurements);
    expect(() => renderer.setCursorBlink(0)).toThrow(RangeError);
  });

  test("setCursorBlink throws RangeError for negative values", () => {
    const renderer = new CanvasRenderer(testMeasurements);
    expect(() => renderer.setCursorBlink(-100)).toThrow(RangeError);
  });
});

describe("CanvasRenderer.setCursorHidden", () => {
  test("cursor is visible by default", () => {
    const renderer = new CanvasRenderer(testMeasurements);
    expect(renderer.cursorHidden).toBe(false);
  });

  test("setCursorHidden(true) hides cursor", () => {
    const renderer = new CanvasRenderer(testMeasurements);
    renderer.setCursorHidden(true);
    expect(renderer.cursorHidden).toBe(true);
  });

  test("setCursorHidden(false) shows cursor", () => {
    const renderer = new CanvasRenderer(testMeasurements);
    renderer.setCursorHidden(true);
    renderer.setCursorHidden(false);
    expect(renderer.cursorHidden).toBe(false);
  });
});

describe("CanvasRenderer.setFocused", () => {
  test("setFocused can be called before mount without throwing", () => {
    const renderer = new CanvasRenderer(testMeasurements);
    expect(() => renderer.setFocused(true)).not.toThrow();
    expect(() => renderer.setFocused(false)).not.toThrow();
  });
});

describe("CanvasRenderer theme support", () => {
  test("setTheme can be called before mount", () => {
    const renderer = new CanvasRenderer(testMeasurements);
    expect(() =>
      renderer.setTheme({
        cursor: "#ff0000",
        selection: "rgba(0,0,255,0.3)",
      }),
    ).not.toThrow();
  });

  test("setTheme accepts partial theme", () => {
    const renderer = new CanvasRenderer(testMeasurements);
    expect(() => renderer.setTheme({ cursor: "#00ff00" })).not.toThrow();
  });
});

describe("CanvasRenderer viewport", () => {
  test("initial viewport has zero dimensions", () => {
    const renderer = new CanvasRenderer(testMeasurements);
    const viewport = renderer.getViewport();
    expect(num(viewport.startRow)).toBe(0);
    expect(num(viewport.endRow)).toBe(0);
    expect(viewport.scrollTop).toBe(0);
    expect(viewport.height).toBe(0);
    expect(viewport.width).toBe(0);
  });
});

describe("CanvasRenderer measurements", () => {
  test("setMeasurements updates internal state", () => {
    const renderer = new CanvasRenderer(testMeasurements);
    const newMeasurements: Measurements = {
      lineHeight: 24,
      gutterWidth: 60,
      charWidth: 10,
    };
    expect(() => renderer.setMeasurements(newMeasurements)).not.toThrow();
  });

  test("charWidth from measurements is used", () => {
    const measurementsWithCharWidth: Measurements = {
      lineHeight: 20,
      gutterWidth: 48,
      charWidth: 12,
    };
    const renderer = new CanvasRenderer(measurementsWithCharWidth);
    // charWidth is internal but affects hit testing
    expect(() => renderer.hitTest(100, 50)).not.toThrow();
  });
});

describe("CanvasRenderer hit testing", () => {
  test("hitTest returns position without snapshot", () => {
    const renderer = new CanvasRenderer(testMeasurements);
    const result = renderer.hitTest(100, 50);
    expect(result).toBeDefined();
    expect(result?.row).toBeGreaterThanOrEqual(0);
    expect(result?.column).toBeGreaterThanOrEqual(0);
  });

  test("hitTest clamps column to non-negative", () => {
    const renderer = new CanvasRenderer(testMeasurements);
    // Click in gutter area (x < gutterWidth)
    const result = renderer.hitTest(10, 50);
    expect(result?.column).toBe(0);
  });
});

describe("Cursor blink type contract", () => {
  test("setCursorBlink parameter is number | false", () => {
    type SetCursorBlinkType = CanvasRenderer["setCursorBlink"];
    const _check: SetCursorBlinkType = (_ms: number | false) => {};
    expect(_check).toBeDefined();
  });
});
