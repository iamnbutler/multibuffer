/**
 * Tests for the Canvas renderer with syntax highlighting integration.
 *
 * Note: Full rendering tests require a browser environment with OffscreenCanvas.
 * These tests focus on the logic that can be tested in Node/Bun environment.
 */

import { describe, expect, test } from "bun:test";
import { sliceTokensToRange } from "../../src/renderer/dom.ts";
import type { Token } from "../../src/renderer/highlighter.ts";

// Helper to create a token
function tok(startColumn: number, endColumn: number, color = "#fff"): Token {
  return { startColumn, endColumn, color };
}

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
