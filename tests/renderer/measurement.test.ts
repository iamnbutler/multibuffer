/**
 * Tests for pure viewport calculation functions in measurement.ts.
 *
 * Covers:
 * - calculateVisibleRows: scroll position → row range
 * - calculateContentHeight: total pixel height
 * - yToVisualRow / yToRow: pixel → row
 * - rowToY: row → pixel
 * - xToColumn: pixel → column
 * - clampScrollTop: scroll bounds enforcement (spool mm3lhpd9-u00r)
 * - calculateScrollTop: scroll strategies (spool mm3lhpe5-g1e7, mm3lhpi9-8bbb)
 */

import { describe, expect, test } from "bun:test";
import {
  calculateContentHeight,
  calculateScrollTop,
  calculateVisibleRows,
  clampScrollTop,
  rowToY,
  xToColumn,
  yToRow,
  yToVisualRow,
} from "../../src/multibuffer_renderer/measurement.ts";
import type { MultiBufferRow } from "../../src/multibuffer/types.ts";
import type { Measurements } from "../../src/multibuffer_renderer/types.ts";

// biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in tests
const row = (n: number) => n as MultiBufferRow;


describe("calculateContentHeight", () => {
  test("returns totalLines * lineHeight", () => {
    expect(calculateContentHeight(10, 20)).toBe(200);
  });

  test("returns 0 for empty content", () => {
    expect(calculateContentHeight(0, 20)).toBe(0);
  });

  test("single line", () => {
    expect(calculateContentHeight(1, 20)).toBe(20);
  });

  test("fractional lineHeight is respected", () => {
    expect(calculateContentHeight(5, 18.5)).toBe(92.5);
  });
});


describe("calculateVisibleRows", () => {
  const LH = 20;
  const VH = 200; // 10 visible lines at 20px each

  test("scrollTop=0 starts at row 0", () => {
    const { startRow, endRow } = calculateVisibleRows(0, VH, LH, 100);
    expect(startRow).toBe(0); // max(0, 0 - OVERDRAW) = 0
    expect(endRow).toBeGreaterThan(0);
  });

  test("endRow is clamped to totalLines", () => {
    const { endRow } = calculateVisibleRows(0, VH, LH, 5);
    expect(endRow).toBe(5);
  });

  test("scrollTop at exact line boundary", () => {
    // scrollTop = 200px → visibleStart = 10
    const { startRow } = calculateVisibleRows(200, VH, LH, 100);
    // visibleStart=10, startRow = max(0, 10-10) = 0 (overdraw is 10)
    expect(startRow).toBe(0);
  });

  test("scrolled well into content applies overdraw", () => {
    // scrollTop = 500px → visibleStart = 25
    // startRow = max(0, 25 - 10) = 15
    const { startRow } = calculateVisibleRows(500, VH, LH, 100);
    expect(startRow).toBe(15);
  });

  test("empty content returns row 0 to 0", () => {
    const { startRow, endRow } = calculateVisibleRows(0, VH, LH, 0);
    expect(startRow).toBe(0);
    expect(endRow).toBe(0);
  });

  test("viewport larger than content: endRow clamped to totalLines", () => {
    const { endRow } = calculateVisibleRows(0, 2000, LH, 3);
    expect(endRow).toBe(3);
  });

  test("scrollTop at maximum position", () => {
    const totalLines = 50;
    const contentHeight = totalLines * LH; // 1000
    const maxScroll = contentHeight - VH; // 800
    const { endRow } = calculateVisibleRows(maxScroll, VH, LH, totalLines);
    expect(endRow).toBe(totalLines); // clamped
  });
});


describe("yToVisualRow", () => {
  test("y=0 returns row 0", () => {
    expect(yToVisualRow(0, 20)).toBe(0);
  });

  test("y just below line boundary returns same row", () => {
    expect(yToVisualRow(19, 20)).toBe(0);
  });

  test("y at line boundary returns next row", () => {
    expect(yToVisualRow(20, 20)).toBe(1);
  });

  test("negative y is clamped to 0", () => {
    expect(yToVisualRow(-5, 20)).toBe(0);
  });

  test("midpoint of row 5", () => {
    expect(yToVisualRow(110, 20)).toBe(5);
  });
});


describe("yToRow", () => {
  test("without wrap map: equals yToVisualRow cast to MultiBufferRow", () => {
    const r = yToRow(60, 20);
    expect(r).toBe(3);
  });

  test("y=0 returns row 0", () => {
    expect(yToRow(0, 20)).toBe(0);
  });
});


describe("rowToY", () => {
  test("row 0 → y 0", () => {
    expect(rowToY(row(0), 20)).toBe(0);
  });

  test("row 5 → y 100", () => {
    expect(rowToY(row(5), 20)).toBe(100);
  });

  test("row 1 with 16px line height", () => {
    expect(rowToY(row(1), 16)).toBe(16);
  });
});


describe("xToColumn", () => {
  const M: Measurements = { lineHeight: 20, charWidth: 8, gutterWidth: 40 };

  test("x at gutter boundary → column 0", () => {
    expect(xToColumn(40, M)).toBe(0);
  });

  test("x one char after gutter → column 0 (floor)", () => {
    expect(xToColumn(44, M)).toBe(0); // 4/8 = 0.5 → floor 0
  });

  test("x exactly one char after gutter → column 1", () => {
    expect(xToColumn(48, M)).toBe(1); // 8/8 = 1
  });

  test("x within gutter (< gutterWidth) → column 0", () => {
    expect(xToColumn(10, M)).toBe(0);
  });

  test("x=0 → column 0", () => {
    expect(xToColumn(0, M)).toBe(0);
  });

  test("x far right maps to correct column", () => {
    // x = 40 + 10*8 = 120 → column 10
    expect(xToColumn(120, M)).toBe(10);
  });
});


describe("clampScrollTop (spool mm3lhpd9-u00r)", () => {
  test("zero scrollTop stays at 0", () => {
    expect(clampScrollTop(0, 1000, 200)).toBe(0);
  });

  test("negative scrollTop clamps to 0", () => {
    expect(clampScrollTop(-50, 1000, 200)).toBe(0);
  });

  test("scrollTop within range is unchanged", () => {
    expect(clampScrollTop(400, 1000, 200)).toBe(400);
  });

  test("scrollTop at maxScroll is unchanged", () => {
    // maxScroll = 1000 - 200 = 800
    expect(clampScrollTop(800, 1000, 200)).toBe(800);
  });

  test("scrollTop above maxScroll clamps to maxScroll", () => {
    expect(clampScrollTop(900, 1000, 200)).toBe(800);
  });

  test("viewport larger than content: maxScroll=0, any scrollTop clamps to 0", () => {
    expect(clampScrollTop(100, 200, 400)).toBe(0);
  });

  test("empty content: clamps to 0", () => {
    expect(clampScrollTop(50, 0, 200)).toBe(0);
  });

  test("contentHeight equals viewportHeight: maxScroll=0", () => {
    expect(clampScrollTop(1, 200, 200)).toBe(0);
  });
});


describe("calculateScrollTop - scroll strategies (spool mm3lhpe5-g1e7, mm3lhpi9-8bbb)", () => {
  // Layout: 50 lines × 20px = 1000px content, 200px viewport
  const LH = 20;
  const VH = 200;
  const CONTENT_H = 1000;
  const CURRENT = 100; // current scrollTop at row 5

  describe("strategy: top", () => {
    test("places row at top of viewport", () => {
      // row 10 → y=200; scrollTop should be 200
      const result = calculateScrollTop(row(10), "top", CURRENT, LH, VH, CONTENT_H);
      expect(result).toBe(200);
    });

    test("row 0 → scrollTop 0", () => {
      const result = calculateScrollTop(row(0), "top", CURRENT, LH, VH, CONTENT_H);
      expect(result).toBe(0);
    });

    test("row near end clamps to maxScroll", () => {
      // row 49 → y=980; maxScroll=800; should clamp to 800
      const result = calculateScrollTop(row(49), "top", CURRENT, LH, VH, CONTENT_H);
      expect(result).toBe(800);
    });
  });

  describe("strategy: center", () => {
    test("centers row in viewport", () => {
      // row 20 → y=400; center: 400 - 200/2 + 20/2 = 400 - 100 + 10 = 310
      const result = calculateScrollTop(row(20), "center", CURRENT, LH, VH, CONTENT_H);
      expect(result).toBe(310);
    });

    test("row 0 centered: clamps to 0", () => {
      // y=0; 0 - 100 + 10 = -90 → clamped to 0
      const result = calculateScrollTop(row(0), "center", CURRENT, LH, VH, CONTENT_H);
      expect(result).toBe(0);
    });

    test("row near end: clamps to maxScroll", () => {
      const result = calculateScrollTop(row(49), "center", CURRENT, LH, VH, CONTENT_H);
      expect(result).toBe(800); // maxScroll
    });
  });

  describe("strategy: bottom", () => {
    test("places row at bottom of viewport", () => {
      // row 10 → y=200; bottom: 200 - 200 + 20 = 20
      const result = calculateScrollTop(row(10), "bottom", CURRENT, LH, VH, CONTENT_H);
      expect(result).toBe(20);
    });

    test("row 0 at bottom: clamps to 0", () => {
      // y=0; 0 - 200 + 20 = -180 → clamped to 0
      const result = calculateScrollTop(row(0), "bottom", CURRENT, LH, VH, CONTENT_H);
      expect(result).toBe(0);
    });

    test("row near end places correctly", () => {
      // row 45 → y=900; bottom: 900 - 200 + 20 = 720
      const result = calculateScrollTop(row(45), "bottom", CURRENT, LH, VH, CONTENT_H);
      expect(result).toBe(720);
    });
  });

  describe("strategy: nearest", () => {
    test("row already visible: no scroll", () => {
      // currentScrollTop=100, viewport covers rows 5-15 (y=100..300)
      // row 7 → y=140, fully visible → no change
      const result = calculateScrollTop(row(7), "nearest", 100, LH, VH, CONTENT_H);
      expect(result).toBe(100);
    });

    test("row above viewport: scrolls up to show at top", () => {
      // currentScrollTop=200 (rows 10-20 visible), row 5 → y=100 < 200
      const result = calculateScrollTop(row(5), "nearest", 200, LH, VH, CONTENT_H);
      expect(result).toBe(100); // scroll to y=100
    });

    test("row below viewport: scrolls down to show at bottom", () => {
      // currentScrollTop=0 (rows 0-10 visible, bottom=200), row 15 → y=300, bottom=320 > 200
      // scrollTop = 300 - 200 + 20 = 120
      const result = calculateScrollTop(row(15), "nearest", 0, LH, VH, CONTENT_H);
      expect(result).toBe(120);
    });

    test("row at top boundary of viewport: no scroll", () => {
      // currentScrollTop=100, row 5 → y=100, rowBottom=120, viewportBottom=300
      // y(100) >= currentScrollTop(100) and rowBottom(120) <= viewportBottom(300) → no change
      const result = calculateScrollTop(row(5), "nearest", 100, LH, VH, CONTENT_H);
      expect(result).toBe(100);
    });

    test("row at bottom boundary of viewport: no scroll", () => {
      // currentScrollTop=100, viewportBottom=300
      // row 14 → y=280, rowBottom=300 == viewportBottom → exactly fits → no change
      const result = calculateScrollTop(row(14), "nearest", 100, LH, VH, CONTENT_H);
      expect(result).toBe(100);
    });

    test("result is clamped to maxScroll", () => {
      // row 49 → below any reasonable viewport → scrolls to bottom, clamped to 800
      const result = calculateScrollTop(row(49), "nearest", 0, LH, VH, CONTENT_H);
      expect(result).toBe(800);
    });
  });

  describe("edge cases", () => {
    test("viewport larger than content: all strategies clamp to 0", () => {
      // 3 lines × 20px = 60px content, 200px viewport
      for (const strategy of ["top", "center", "bottom", "nearest"] as const) {
        const result = calculateScrollTop(row(0), strategy, 0, LH, VH, 60);
        expect(result).toBe(0);
      }
    });

    test("single line content: all strategies return 0", () => {
      const singleLine = 1 * LH; // 20px
      for (const strategy of ["top", "center", "bottom", "nearest"] as const) {
        const result = calculateScrollTop(row(0), strategy, 0, LH, VH, singleLine);
        expect(result).toBe(0);
      }
    });
  });
});
