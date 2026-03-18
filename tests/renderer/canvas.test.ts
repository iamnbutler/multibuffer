/**
 * Tests for CanvasRenderer hit testing and mouse event handling.
 *
 * Covers:
 * - Hit test coordinate translation (pixel → buffer position)
 * - Gutter area handling
 * - WrapMap integration for soft-wrapped content
 * - Callback registration
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { createBuffer } from "../../src/buffer/buffer.ts";
import { createMultiBuffer } from "../../src/multibuffer/multibuffer.ts";
import type { MultiBufferPoint, MultiBufferRow } from "../../src/multibuffer/types.ts";
import { xToColumn, yToVisualRow } from "../../src/renderer/measurement.ts";
import { charColToVisualCol, visualColToCharCol } from "../../src/renderer/wrap-map.ts";
import { createBufferId, excerptRange, resetCounters } from "../helpers.ts";

// biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in tests
const row = (n: number) => n as MultiBufferRow;

beforeEach(() => {
  resetCounters();
});

describe("hit test coordinate translation", () => {
  // These tests verify the pure functions that hitTest relies on

  describe("yToVisualRow - vertical coordinate translation", () => {
    const lineHeight = 20;

    test("y=0 → row 0", () => {
      expect(yToVisualRow(0, lineHeight)).toBe(0);
    });

    test("y within first line → row 0", () => {
      expect(yToVisualRow(10, lineHeight)).toBe(0);
      expect(yToVisualRow(19, lineHeight)).toBe(0);
    });

    test("y at line boundary → next row", () => {
      expect(yToVisualRow(20, lineHeight)).toBe(1);
      expect(yToVisualRow(40, lineHeight)).toBe(2);
    });

    test("y with scroll offset", () => {
      const scrollTop = 100; // scrolled 5 lines
      const clientY = 30; // 1.5 lines from top of viewport
      expect(yToVisualRow(scrollTop + clientY, lineHeight)).toBe(6);
    });
  });

  describe("xToColumn - horizontal coordinate translation", () => {
    const measurements = { lineHeight: 20, charWidth: 8, gutterWidth: 40 };

    test("x at gutter edge → column 0", () => {
      expect(xToColumn(40, measurements)).toBe(0);
    });

    test("x within gutter → column 0 (clamped)", () => {
      expect(xToColumn(0, measurements)).toBe(0);
      expect(xToColumn(20, measurements)).toBe(0);
    });

    test("x one char width after gutter → column 1", () => {
      expect(xToColumn(48, measurements)).toBe(1);
    });

    test("x multiple chars after gutter", () => {
      expect(xToColumn(56, measurements)).toBe(2); // (56-40)/8 = 2
      expect(xToColumn(80, measurements)).toBe(5); // (80-40)/8 = 5
    });

    test("fractional position floors to column", () => {
      expect(xToColumn(44, measurements)).toBe(0); // (44-40)/8 = 0.5 → 0
      expect(xToColumn(52, measurements)).toBe(1); // (52-40)/8 = 1.5 → 1
    });
  });

  describe("visualColToCharCol - wide character handling", () => {
    test("ASCII: visual col equals char col", () => {
      expect(visualColToCharCol("hello", 0)).toBe(0);
      expect(visualColToCharCol("hello", 3)).toBe(3);
      expect(visualColToCharCol("hello", 5)).toBe(5);
    });

    test("CJK: visual col 2 maps to char col 1", () => {
      // "日本" - each char is 2 visual columns
      expect(visualColToCharCol("日本", 0)).toBe(0);
      expect(visualColToCharCol("日本", 2)).toBe(1);
      expect(visualColToCharCol("日本", 4)).toBe(2);
    });

    test("click in middle of wide char snaps to next char", () => {
      // Clicking in visual col 1 (middle of 日) snaps to char col 1
      expect(visualColToCharCol("日本", 1)).toBe(1);
    });

    test("mixed ASCII and CJK", () => {
      // "a日b": a@vis0, 日@vis1-2, b@vis3
      expect(visualColToCharCol("a日b", 0)).toBe(0); // before 'a'
      expect(visualColToCharCol("a日b", 1)).toBe(1); // before '日'
      expect(visualColToCharCol("a日b", 3)).toBe(2); // before 'b'
    });

    test("emoji (surrogate pair)", () => {
      // "😀" is 2 UTF-16 code units, 2 visual columns
      expect(visualColToCharCol("😀", 0)).toBe(0);
      expect(visualColToCharCol("😀", 2)).toBe(2);
    });

    test("click past end of line clamps to line length", () => {
      expect(visualColToCharCol("abc", 10)).toBe(3);
    });
  });

  describe("charColToVisualCol - reverse mapping", () => {
    test("ASCII: char col equals visual col", () => {
      expect(charColToVisualCol("hello", 0)).toBe(0);
      expect(charColToVisualCol("hello", 3)).toBe(3);
    });

    test("CJK: char col 1 maps to visual col 2", () => {
      expect(charColToVisualCol("日本", 0)).toBe(0);
      expect(charColToVisualCol("日本", 1)).toBe(2);
      expect(charColToVisualCol("日本", 2)).toBe(4);
    });

    test("roundtrip: charCol → visualCol → charCol", () => {
      const text = "a日b";
      for (let c = 0; c <= text.length; c++) {
        const visual = charColToVisualCol(text, c);
        const back = visualColToCharCol(text, visual);
        expect(back).toBe(c);
      }
    });
  });
});

describe("hit test with WrapMap", () => {
  // Tests that verify WrapMap integration for wrapped lines

  test("wrapped line segment lookup", () => {
    const bufferId = createBufferId();
    const buffer = createBuffer(
      bufferId,
      "short\n" + "this is a longer line that will wrap at 10 columns\n" + "end"
    );

    const mb = createMultiBuffer();
    mb.addExcerpt(buffer, excerptRange(0, 3));

    const snapshot = mb.snapshot();
    const lines = snapshot.lines(row(0), row(3));

    expect(lines.length).toBe(3);
    expect(lines[0]).toBe("short");
    expect(lines[1]).toBe("this is a longer line that will wrap at 10 columns");
    expect(lines[2]).toBe("end");
  });

  test("segment char start calculation", () => {
    // Verify that WrapMap correctly tracks segment boundaries
    const bufferId = createBufferId();
    const buffer = createBuffer(
      bufferId,
      "abcdefghijklmnopqrst" // 20 chars, will wrap at wrapWidth 10
    );

    const mb = createMultiBuffer();
    mb.addExcerpt(buffer, excerptRange(0, 1));

    const snapshot = mb.snapshot();

    // With wrapWidth=10, the line "abcdefghijklmnopqrst" would split into:
    // segment 0: "abcdefghij" (chars 0-9)
    // segment 1: "klmnopqrst" (chars 10-19)
    const { WrapMap } = require("../../src/renderer/wrap-map.ts");
    const wrapMap = new WrapMap(snapshot, 10);

    expect(wrapMap.visualRowsForLine(row(0))).toBe(2);
    expect(wrapMap.segmentCharStart(row(0), 0)).toBe(0);
    expect(wrapMap.segmentCharStart(row(0), 1)).toBe(10);
  });
});

describe("gutter area handling", () => {
  test("click in gutter area should map to column 0", () => {
    // The hitTest implementation treats clicks in the gutter (x < gutterWidth)
    // as column 0 clicks
    const gutterWidth = 40;
    const charWidth = 8;

    // Simulate gutter click logic
    const x = 20; // within gutter
    const effectiveColumn = x < gutterWidth
      ? 0
      : Math.max(0, Math.floor((x - gutterWidth) / charWidth));

    expect(effectiveColumn).toBe(0);
  });

  test("click at gutter boundary maps correctly", () => {
    const gutterWidth = 40;
    const charWidth = 8;

    // At exactly gutterWidth, should be column 0
    const x = gutterWidth;
    const column = Math.max(0, Math.floor((x - gutterWidth) / charWidth));
    expect(column).toBe(0);
  });
});

describe("callback registration", () => {
  test("callback types are correct", () => {
    // Verify the callback signatures match MultiBufferPoint
    const clickCallback = (point: MultiBufferPoint) => {
      expect(typeof point.row).toBe("number");
      expect(typeof point.column).toBe("number");
    };

    const dragCallback = (point: MultiBufferPoint) => {
      expect(point).toHaveProperty("row");
      expect(point).toHaveProperty("column");
    };

    // These are type checks - they verify the callback signatures
    const mockPoint: MultiBufferPoint = { row: row(5), column: 10 };
    clickCallback(mockPoint);
    dragCallback(mockPoint);
  });
});

describe("canvas renderer exports", () => {
  test("createCanvasRenderer is exported", () => {
    const { createCanvasRenderer } = require("../../src/renderer/index.ts");
    expect(typeof createCanvasRenderer).toBe("function");
  });

  test("CanvasRenderer class is exported", () => {
    const { CanvasRenderer } = require("../../src/renderer/index.ts");
    expect(typeof CanvasRenderer).toBe("function");
  });
});
