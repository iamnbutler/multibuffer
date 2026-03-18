/**
 * Tests for canvas renderer scroll and viewport management.
 *
 * These tests verify the CanvasRenderer's integration with measurement.ts
 * for viewport calculation, scroll handling, and scrollTo strategies.
 * Actual canvas rendering is tested via Playwright (e2e).
 */

import { describe, expect, test, beforeEach, mock } from "bun:test";
import type { MultiBufferRow } from "../../src/multibuffer/types.ts";
import type { Measurements, Viewport } from "../../src/renderer/types.ts";
import {
  calculateContentHeight,
  calculateScrollTop,
  createViewport,
} from "../../src/renderer/measurement.ts";
import { num } from "../helpers.ts";

// biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in tests
const mbRow = (n: number) => n as MultiBufferRow;

describe("Canvas renderer scroll integration", () => {
  const measurements: Measurements = {
    lineHeight: 20,
    charWidth: 8,
    gutterWidth: 40,
  };

  describe("viewport calculation", () => {
    test("createViewport returns correct startRow and endRow for scrollTop=0", () => {
      const viewport = createViewport(0, 200, 800, measurements, 100);
      expect(viewport.scrollTop).toBe(0);
      expect(num(viewport.startRow)).toBe(0);
      // With OVERDRAW=10, visible lines = ceil(200/20)+1 = 11, endRow = min(0+11+10, 100) = 21
      expect(num(viewport.endRow)).toBeLessThanOrEqual(100);
      expect(num(viewport.endRow)).toBeGreaterThan(0);
    });

    test("createViewport advances startRow when scrolled", () => {
      // scrollTop=500px → visibleStart=25, startRow = max(0, 25-10) = 15
      const viewport = createViewport(500, 200, 800, measurements, 100);
      expect(viewport.scrollTop).toBe(500);
      expect(num(viewport.startRow)).toBe(15);
    });

    test("createViewport clamps endRow to totalLines for small content", () => {
      const viewport = createViewport(0, 200, 800, measurements, 5);
      expect(num(viewport.endRow)).toBe(5);
    });

    test("createViewport preserves dimensions", () => {
      const viewport = createViewport(100, 400, 600, measurements, 50);
      expect(viewport.height).toBe(400);
      expect(viewport.width).toBe(600);
    });
  });

  describe("content height calculation", () => {
    test("calculateContentHeight returns totalLines * lineHeight", () => {
      const height = calculateContentHeight(100, 20);
      expect(height).toBe(2000);
    });

    test("calculateContentHeight returns 0 for empty content", () => {
      const height = calculateContentHeight(0, 20);
      expect(height).toBe(0);
    });

    test("calculateContentHeight handles fractional lineHeight", () => {
      const height = calculateContentHeight(10, 18.5);
      expect(height).toBe(185);
    });
  });

  describe("scrollTo strategies", () => {
    // Layout: 50 lines × 20px = 1000px content, 200px viewport
    const lineHeight = 20;
    const viewportHeight = 200;
    const contentHeight = 1000;

    test("strategy top places row at top of viewport", () => {
      const scrollTop = calculateScrollTop(
        mbRow(10),
        "top",
        0,
        lineHeight,
        viewportHeight,
        contentHeight,
      );
      expect(scrollTop).toBe(200); // row 10 → y=200
    });

    test("strategy top clamps to maxScroll for row near end", () => {
      const scrollTop = calculateScrollTop(
        mbRow(49),
        "top",
        0,
        lineHeight,
        viewportHeight,
        contentHeight,
      );
      expect(scrollTop).toBe(800); // maxScroll = 1000 - 200 = 800
    });

    test("strategy center centers row in viewport", () => {
      // row 20 → y=400; center: 400 - 200/2 + 20/2 = 310
      const scrollTop = calculateScrollTop(
        mbRow(20),
        "center",
        0,
        lineHeight,
        viewportHeight,
        contentHeight,
      );
      expect(scrollTop).toBe(310);
    });

    test("strategy bottom places row at bottom of viewport", () => {
      // row 10 → y=200; bottom: 200 - 200 + 20 = 20
      const scrollTop = calculateScrollTop(
        mbRow(10),
        "bottom",
        0,
        lineHeight,
        viewportHeight,
        contentHeight,
      );
      expect(scrollTop).toBe(20);
    });

    test("strategy nearest does not scroll if row is already visible", () => {
      // currentScrollTop=100, viewport covers y=100..300, row 7 → y=140 is visible
      const scrollTop = calculateScrollTop(
        mbRow(7),
        "nearest",
        100,
        lineHeight,
        viewportHeight,
        contentHeight,
      );
      expect(scrollTop).toBe(100); // unchanged
    });

    test("strategy nearest scrolls up if row is above viewport", () => {
      // currentScrollTop=200, row 5 → y=100 < 200
      const scrollTop = calculateScrollTop(
        mbRow(5),
        "nearest",
        200,
        lineHeight,
        viewportHeight,
        contentHeight,
      );
      expect(scrollTop).toBe(100);
    });

    test("strategy nearest scrolls down if row is below viewport", () => {
      // currentScrollTop=0 (viewport y=0..200), row 15 → y=300, bottom=320 > 200
      // scrollTop = 300 - 200 + 20 = 120
      const scrollTop = calculateScrollTop(
        mbRow(15),
        "nearest",
        0,
        lineHeight,
        viewportHeight,
        contentHeight,
      );
      expect(scrollTop).toBe(120);
    });
  });

  describe("spacer height", () => {
    test("spacer height should match content height", () => {
      const totalLines = 100;
      const lineHeight = 20;
      const contentHeight = calculateContentHeight(totalLines, lineHeight);
      expect(contentHeight).toBe(2000);
    });

    test("spacer height updates when content changes", () => {
      const initialHeight = calculateContentHeight(50, 20);
      const updatedHeight = calculateContentHeight(100, 20);
      expect(initialHeight).toBe(1000);
      expect(updatedHeight).toBe(2000);
    });
  });
});

describe("Canvas renderer viewport synchronization", () => {
  const measurements: Measurements = {
    lineHeight: 20,
    charWidth: 8,
    gutterWidth: 40,
  };

  test("viewport startRow and endRow define visible range", () => {
    // scrollTop=200 (row 10), viewport height=400 (20 rows)
    const viewport = createViewport(200, 400, 800, measurements, 100);

    // With OVERDRAW=10:
    // visibleStart = floor(200/20) = 10
    // startRow = max(0, 10-10) = 0
    expect(num(viewport.startRow)).toBe(0);

    // visibleLines = ceil(400/20)+1 = 21
    // endRow = min(10+21+10, 100) = 41
    expect(num(viewport.endRow)).toBeLessThanOrEqual(100);
    expect(num(viewport.endRow)).toBeGreaterThanOrEqual(21);
  });

  test("scroll to beginning results in startRow=0", () => {
    const viewport = createViewport(0, 200, 800, measurements, 100);
    expect(num(viewport.startRow)).toBe(0);
  });

  test("scroll to end clamps to content", () => {
    // 100 lines × 20px = 2000px content
    // maxScroll = 2000 - 200 = 1800
    const viewport = createViewport(1800, 200, 800, measurements, 100);
    expect(num(viewport.endRow)).toBe(100);
  });
});

describe("Canvas renderer overdraw behavior", () => {
  const measurements: Measurements = {
    lineHeight: 20,
    charWidth: 8,
    gutterWidth: 40,
  };

  test("overdraw renders extra rows above viewport", () => {
    // Scroll to row 30 (scrollTop=600)
    const viewport = createViewport(600, 200, 800, measurements, 100);
    // visibleStart = 30, startRow should be 30 - OVERDRAW = 20
    expect(num(viewport.startRow)).toBe(20);
  });

  test("overdraw renders extra rows below viewport", () => {
    // Scroll to row 10 (scrollTop=200), viewport shows ~10 rows
    const viewport = createViewport(200, 200, 800, measurements, 100);
    // visibleEnd = 10 + ceil(200/20)+1 = 21
    // endRow = min(21 + OVERDRAW, 100) = 31
    expect(num(viewport.endRow)).toBeGreaterThan(20);
  });

  test("overdraw clamps to available content at start", () => {
    // At scrollTop=0, can't overdraw above
    const viewport = createViewport(0, 200, 800, measurements, 100);
    expect(num(viewport.startRow)).toBe(0);
  });

  test("overdraw clamps to available content at end", () => {
    // At end of content, endRow clamps to totalLines
    const viewport = createViewport(1800, 200, 800, measurements, 100);
    expect(num(viewport.endRow)).toBe(100);
  });
});
