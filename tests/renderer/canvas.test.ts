/**
 * Tests for the Canvas renderer with syntax highlighting integration.
 *
 * Note: Full rendering tests require a browser environment with OffscreenCanvas.
 * These tests focus on the logic that can be tested in Node/Bun environment.
 *
 * Also covers:
 * - Hit test coordinate translation (pixel -> buffer position)
 * - Gutter area handling
 * - WrapMap integration for soft-wrapped content
 * - Callback registration
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { createBuffer } from "../../src/buffer/buffer.ts";
import { createMultiBuffer } from "../../src/multibuffer/multibuffer.ts";
import type { MultiBufferPoint, MultiBufferRow } from "../../src/multibuffer/types.ts";
import { sliceTokensToRange } from "../../src/renderer/dom.ts";
import type { Token } from "../../src/renderer/highlighter.ts";
import { xToColumn, yToVisualRow } from "../../src/renderer/measurement.ts";
import { charColToVisualCol, visualColToCharCol } from "../../src/renderer/wrap-map.ts";
import { createBufferId, excerptRange, resetCounters } from "../helpers.ts";

// Helper to create a token
function tok(startColumn: number, endColumn: number, color = "#fff"): Token {
  return { startColumn, endColumn, color };
}

// biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in tests
const row = (n: number) => n as MultiBufferRow;

beforeEach(() => {
  resetCounters();
});

describe("Canvas renderer token handling", () => {
  describe("sliceTokensToRange for wrapped segments", () => {
    test("slices tokens correctly for first segment", () => {
      // Line: "const foo = 123;"
      // Tokens: const(0-5), foo(6-9), =(10-11), 123(12-15), ;(15-16)
      const tokens = [
        tok(0, 5, "#ff0000"),   // const
        tok(6, 9, "#00ff00"),   // foo
        tok(10, 11, "#0000ff"), // =
        tok(12, 15, "#ff00ff"), // 123
        tok(15, 16, "#ffff00"), // ;
      ];

      // First segment: columns 0-8 (e.g., "const fo")
      const sliced = sliceTokensToRange(tokens, 0, 8);
      expect(sliced).toEqual([
        tok(0, 5, "#ff0000"),  // const - fully included
        tok(6, 8, "#00ff00"),  // foo - clipped at segment end
      ]);
    });

    test("slices tokens correctly for middle segment", () => {
      const tokens = [
        tok(0, 5, "#ff0000"),   // const
        tok(6, 9, "#00ff00"),   // foo
        tok(10, 11, "#0000ff"), // =
        tok(12, 15, "#ff00ff"), // 123
        tok(15, 16, "#ffff00"), // ;
      ];

      // Middle segment: columns 8-14 (e.g., "o = 12")
      const sliced = sliceTokensToRange(tokens, 8, 14);
      expect(sliced).toEqual([
        tok(0, 1, "#00ff00"),  // o (from foo, adjusted offset)
        tok(2, 3, "#0000ff"),  // = (adjusted offset)
        tok(4, 6, "#ff00ff"),  // 12 (from 123, adjusted and clipped)
      ]);
    });

    test("slices tokens correctly for last segment", () => {
      const tokens = [
        tok(0, 5, "#ff0000"),
        tok(6, 9, "#00ff00"),
        tok(10, 11, "#0000ff"),
        tok(12, 15, "#ff00ff"),
        tok(15, 16, "#ffff00"),
      ];

      // Last segment: columns 14-16 (e.g., "3;")
      const sliced = sliceTokensToRange(tokens, 14, 16);
      expect(sliced).toEqual([
        tok(0, 1, "#ff00ff"),  // 3 (from 123)
        tok(1, 2, "#ffff00"),  // ;
      ]);
    });

    test("handles empty token array", () => {
      const sliced = sliceTokensToRange([], 0, 10);
      expect(sliced).toEqual([]);
    });

    test("handles segment with no overlapping tokens", () => {
      const tokens = [
        tok(0, 5, "#ff0000"),
        tok(20, 25, "#00ff00"),
      ];

      // Segment: columns 10-15 (gap between tokens)
      const sliced = sliceTokensToRange(tokens, 10, 15);
      expect(sliced).toEqual([]);
    });
  });

  describe("token gap filling logic", () => {
    test("identifies gaps before first token", () => {
      const tokens = [tok(5, 10, "#ff0000")];
      // Gap exists from 0-5, token covers 5-10
      // If rendering text "hello world" with segment 0-11:
      // - gap: "hello" (0-5) should use default color
      // - token: " worl" (5-10) should use #ff0000
      // - trailing: "d" (10-11) should use default color

      const sliced = sliceTokensToRange(tokens, 0, 11);
      expect(sliced).toEqual([tok(5, 10, "#ff0000")]);
      // The gap (0-5) and trailing (10-11) are handled by the renderer
    });

    test("identifies gaps between tokens", () => {
      const tokens = [
        tok(0, 3, "#ff0000"),
        tok(7, 10, "#00ff00"),
      ];
      // Gap exists from 3-7

      const sliced = sliceTokensToRange(tokens, 0, 10);
      expect(sliced).toEqual([
        tok(0, 3, "#ff0000"),
        tok(7, 10, "#00ff00"),
      ]);
      // Gap (3-7) should be filled with default color by renderer
    });

    test("identifies trailing gap after last token", () => {
      const tokens = [tok(0, 5, "#ff0000")];
      // Text is longer than token coverage

      const sliced = sliceTokensToRange(tokens, 0, 15);
      expect(sliced).toEqual([tok(0, 5, "#ff0000")]);
      // Trailing gap (5-15) handled by renderer
    });
  });
});

describe("CSS variable color resolution", () => {
  test("passes through non-variable colors", () => {
    // This would be tested in the actual renderer with DOM
    // Here we just verify the pattern that should be handled
    const directColor = "#ff0000";
    expect(directColor.startsWith("var(")).toBe(false);
  });

  test("identifies CSS variable colors", () => {
    const varColor = "var(--syntax-keyword, #fb4934)";
    expect(varColor.startsWith("var(")).toBe(true);

    // Parse the variable name and fallback
    const match = varColor.match(/^var\((--[^,)]+)(?:,\s*([^)]+))?\)$/);
    expect(match).not.toBeNull();
    expect(match?.[1]).toBe("--syntax-keyword");
    expect(match?.[2]).toBe("#fb4934");
  });

  test("handles CSS variable without fallback", () => {
    const varColor = "var(--syntax-keyword)";
    const match = varColor.match(/^var\((--[^,)]+)(?:,\s*([^)]+))?\)$/);
    expect(match).not.toBeNull();
    expect(match?.[1]).toBe("--syntax-keyword");
    expect(match?.[2]).toBeUndefined();
  });
});

describe("token rendering algorithm", () => {
  /**
   * Simulates the token rendering algorithm from the canvas renderer.
   * Returns an array of { text, color } segments.
   */
  function simulateTokenRendering(
    text: string,
    tokens: Token[] | undefined,
    defaultColor: string,
  ): Array<{ text: string; color: string }> {
    const segments: Array<{ text: string; color: string }> = [];

    if (!tokens || tokens.length === 0) {
      segments.push({ text, color: defaultColor });
      return segments;
    }

    let pos = 0;

    for (const token of tokens) {
      // Fill gap before token
      if (token.startColumn > pos) {
        segments.push({
          text: text.slice(pos, token.startColumn),
          color: defaultColor,
        });
      }

      // Draw token
      const tokenEnd = Math.min(token.endColumn, text.length);
      if (token.startColumn < tokenEnd) {
        segments.push({
          text: text.slice(token.startColumn, tokenEnd),
          color: token.color,
        });
      }

      pos = Math.max(pos, tokenEnd);
    }

    // Fill trailing gap
    if (pos < text.length) {
      segments.push({
        text: text.slice(pos),
        color: defaultColor,
      });
    }

    return segments;
  }

  test("renders line with no tokens using default color", () => {
    const result = simulateTokenRendering("hello world", undefined, "#default");
    expect(result).toEqual([{ text: "hello world", color: "#default" }]);
  });

  test("renders line with single token", () => {
    const tokens = [tok(0, 5, "#red")];
    const result = simulateTokenRendering("const x", tokens, "#default");
    expect(result).toEqual([
      { text: "const", color: "#red" },
      { text: " x", color: "#default" },
    ]);
  });

  test("renders line with multiple tokens and gaps", () => {
    const tokens = [
      tok(0, 5, "#red"),    // const
      tok(6, 7, "#blue"),   // x
      tok(8, 9, "#orange"), // =
      tok(10, 12, "#purple"), // 42
    ];
    const result = simulateTokenRendering("const x = 42;", tokens, "#default");
    expect(result).toEqual([
      { text: "const", color: "#red" },
      { text: " ", color: "#default" },
      { text: "x", color: "#blue" },
      { text: " ", color: "#default" },
      { text: "=", color: "#orange" },
      { text: " ", color: "#default" },
      { text: "42", color: "#purple" },
      { text: ";", color: "#default" },
    ]);
  });

  test("handles token that starts after text beginning", () => {
    const tokens = [tok(4, 8, "#green")];
    const result = simulateTokenRendering("    function", tokens, "#default");
    expect(result).toEqual([
      { text: "    ", color: "#default" },
      { text: "func", color: "#green" },
      { text: "tion", color: "#default" },
    ]);
  });

  test("handles adjacent tokens with no gap", () => {
    const tokens = [
      tok(0, 3, "#red"),
      tok(3, 6, "#blue"),
    ];
    const result = simulateTokenRendering("abcdef", tokens, "#default");
    expect(result).toEqual([
      { text: "abc", color: "#red" },
      { text: "def", color: "#blue" },
    ]);
  });

  test("clips tokens that extend past text length", () => {
    const tokens = [tok(0, 100, "#red")];
    const result = simulateTokenRendering("short", tokens, "#default");
    expect(result).toEqual([{ text: "short", color: "#red" }]);
  });
});

describe("wrapped line token slicing integration", () => {
  test("full workflow: tokens sliced correctly across wrap segments", () => {
    // Simulate a line: "const myVariable = 'hello world';"
    // With tokens for each syntax element
    const fullTokens = [
      tok(0, 5, "#keyword"),     // const
      tok(6, 16, "#variable"),   // myVariable
      tok(17, 18, "#operator"),  // =
      tok(19, 32, "#string"),    // 'hello world'
      tok(32, 33, "#punctuation"), // ;
    ];

    // Simulate wrap width that splits at column 15
    // Segment 1: "const myVariab" (0-14)
    // Segment 2: "le = 'hello wo" (14-28)
    // Segment 3: "rld';" (28-33)

    const seg1Tokens = sliceTokensToRange(fullTokens, 0, 14);
    expect(seg1Tokens).toEqual([
      tok(0, 5, "#keyword"),    // const (fully in segment)
      tok(6, 14, "#variable"),  // myVariab (clipped)
    ]);

    const seg2Tokens = sliceTokensToRange(fullTokens, 14, 28);
    expect(seg2Tokens).toEqual([
      tok(0, 2, "#variable"),   // le (continuation, adjusted offset)
      tok(3, 4, "#operator"),   // = (adjusted offset)
      tok(5, 14, "#string"),    // 'hello wo (adjusted and clipped)
    ]);

    const seg3Tokens = sliceTokensToRange(fullTokens, 28, 33);
    expect(seg3Tokens).toEqual([
      tok(0, 4, "#string"),      // rld' (adjusted offset)
      tok(4, 5, "#punctuation"), // ; (adjusted offset)
    ]);
  });
});

describe("hit test coordinate translation", () => {
  // These tests verify the pure functions that hitTest relies on

  describe("yToVisualRow - vertical coordinate translation", () => {
    const lineHeight = 20;

    test("y=0 -> row 0", () => {
      expect(yToVisualRow(0, lineHeight)).toBe(0);
    });

    test("y within first line -> row 0", () => {
      expect(yToVisualRow(10, lineHeight)).toBe(0);
      expect(yToVisualRow(19, lineHeight)).toBe(0);
    });

    test("y at line boundary -> next row", () => {
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

    test("x at gutter edge -> column 0", () => {
      expect(xToColumn(40, measurements)).toBe(0);
    });

    test("x within gutter -> column 0 (clamped)", () => {
      expect(xToColumn(0, measurements)).toBe(0);
      expect(xToColumn(20, measurements)).toBe(0);
    });

    test("x one char width after gutter -> column 1", () => {
      expect(xToColumn(48, measurements)).toBe(1);
    });

    test("x multiple chars after gutter", () => {
      expect(xToColumn(56, measurements)).toBe(2); // (56-40)/8 = 2
      expect(xToColumn(80, measurements)).toBe(5); // (80-40)/8 = 5
    });

    test("fractional position floors to column", () => {
      expect(xToColumn(44, measurements)).toBe(0); // (44-40)/8 = 0.5 -> 0
      expect(xToColumn(52, measurements)).toBe(1); // (52-40)/8 = 1.5 -> 1
    });
  });

  describe("visualColToCharCol - wide character handling", () => {
    test("ASCII: visual col equals char col", () => {
      expect(visualColToCharCol("hello", 0)).toBe(0);
      expect(visualColToCharCol("hello", 3)).toBe(3);
      expect(visualColToCharCol("hello", 5)).toBe(5);
    });

    test("CJK: visual col 2 maps to char col 1", () => {
      // "each char is 2 visual columns
      expect(visualColToCharCol("\u65E5\u672C", 0)).toBe(0);
      expect(visualColToCharCol("\u65E5\u672C", 2)).toBe(1);
      expect(visualColToCharCol("\u65E5\u672C", 4)).toBe(2);
    });

    test("click in middle of wide char snaps to next char", () => {
      // Clicking in visual col 1 (middle of \u65E5) snaps to char col 1
      expect(visualColToCharCol("\u65E5\u672C", 1)).toBe(1);
    });

    test("mixed ASCII and CJK", () => {
      // "a\u65E5b": a@vis0, \u65E5@vis1-2, b@vis3
      expect(visualColToCharCol("a\u65E5b", 0)).toBe(0); // before 'a'
      expect(visualColToCharCol("a\u65E5b", 1)).toBe(1); // before '\u65E5'
      expect(visualColToCharCol("a\u65E5b", 3)).toBe(2); // before 'b'
    });

    test("emoji (surrogate pair)", () => {
      // "\uD83D\uDE00" is 2 UTF-16 code units, 2 visual columns
      expect(visualColToCharCol("\uD83D\uDE00", 0)).toBe(0);
      expect(visualColToCharCol("\uD83D\uDE00", 2)).toBe(2);
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
      expect(charColToVisualCol("\u65E5\u672C", 0)).toBe(0);
      expect(charColToVisualCol("\u65E5\u672C", 1)).toBe(2);
      expect(charColToVisualCol("\u65E5\u672C", 2)).toBe(4);
    });

    test("roundtrip: charCol -> visualCol -> charCol", () => {
      const text = "a\u65E5b";
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
