/**
 * Tests for sliceTokensToRange — extracts and adjusts tokens that overlap a column range.
 *
 * Validates correctness of the binary-search implementation against all edge cases.
 * The function must return the same results as a naive linear scan.
 */

import { describe, expect, test } from "bun:test";
import { sliceTokensToRange } from "../../src/renderer/dom.ts";
import type { Token } from "../../src/renderer/highlighter.ts";

// Helper to build a Token
function tok(startColumn: number, endColumn: number, color = "#fff"): Token {
  return { startColumn, endColumn, color };
}

describe("sliceTokensToRange — empty / no-overlap cases", () => {
  test("empty token array returns []", () => {
    expect(sliceTokensToRange([], 0, 10)).toEqual([]);
  });

  test("all tokens end before segStart — returns []", () => {
    const tokens = [tok(0, 5), tok(5, 10)];
    expect(sliceTokensToRange(tokens, 10, 20)).toEqual([]);
  });

  test("all tokens start after segEnd — returns []", () => {
    const tokens = [tok(20, 30), tok(30, 40)];
    expect(sliceTokensToRange(tokens, 0, 10)).toEqual([]);
  });

  test("adjacent token ends exactly at segStart — no overlap", () => {
    const tokens = [tok(0, 5)];
    expect(sliceTokensToRange(tokens, 5, 10)).toEqual([]);
  });

  test("token starts exactly at segEnd — no overlap", () => {
    const tokens = [tok(10, 20)];
    expect(sliceTokensToRange(tokens, 0, 10)).toEqual([]);
  });
});

describe("sliceTokensToRange — full overlap", () => {
  test("single token fully inside range — returned with adjusted offsets", () => {
    const tokens = [tok(3, 7)];
    const result = sliceTokensToRange(tokens, 3, 7);
    expect(result).toEqual([tok(0, 4)]);
  });

  test("all tokens inside range — all returned with adjusted offsets", () => {
    const tokens = [tok(2, 4, "#a"), tok(4, 6, "#b"), tok(6, 8, "#c")];
    const result = sliceTokensToRange(tokens, 2, 8);
    expect(result).toEqual([tok(0, 2, "#a"), tok(2, 4, "#b"), tok(4, 6, "#c")]);
  });
});

describe("sliceTokensToRange — partial overlap / clipping", () => {
  test("token straddles segStart — start is clipped to 0", () => {
    const tokens = [tok(3, 8)];
    const result = sliceTokensToRange(tokens, 5, 10);
    expect(result).toEqual([tok(0, 3)]);
  });

  test("token straddles segEnd — end is clipped to range length", () => {
    const tokens = [tok(3, 12)];
    const result = sliceTokensToRange(tokens, 5, 10);
    expect(result).toEqual([tok(0, 5)]);
  });

  test("token spans entire range — clipped to full segment width", () => {
    const tokens = [tok(0, 100)];
    const result = sliceTokensToRange(tokens, 20, 30);
    expect(result).toEqual([tok(0, 10)]);
  });

  test("multiple tokens with partial overlaps at both ends", () => {
    // Segment is [4, 8)
    const tokens = [tok(0, 5, "#a"), tok(5, 7, "#b"), tok(7, 12, "#c")];
    const result = sliceTokensToRange(tokens, 4, 8);
    // #a: startColumn=0, endColumn=1 (5-4=1, clamped)
    // #b: startColumn=1, endColumn=3
    // #c: startColumn=3, endColumn=4 (8-4=4, clamped)
    expect(result).toEqual([tok(0, 1, "#a"), tok(1, 3, "#b"), tok(3, 4, "#c")]);
  });
});

describe("sliceTokensToRange — correctness at scale (binary search must match linear)", () => {
  function linearSlice(tokens: Token[], segStart: number, segEnd: number): Token[] {
    const result: Token[] = [];
    for (const t of tokens) {
      if (t.endColumn <= segStart || t.startColumn >= segEnd) continue;
      result.push({
        startColumn: Math.max(0, t.startColumn - segStart),
        endColumn: Math.min(segEnd - segStart, t.endColumn - segStart),
        color: t.color,
      });
    }
    return result;
  }

  test("200 tokens — binary search matches linear scan for early segment", () => {
    const tokens: Token[] = [];
    for (let i = 0; i < 200; i++) {
      tokens.push(tok(i * 3, i * 3 + 2, `#${i.toString(16).padStart(6, "0")}`));
    }
    const got = sliceTokensToRange(tokens, 0, 6);
    const expected = linearSlice(tokens, 0, 6);
    expect(got).toEqual(expected);
  });

  test("200 tokens — binary search matches linear scan for middle segment", () => {
    const tokens: Token[] = [];
    for (let i = 0; i < 200; i++) {
      tokens.push(tok(i * 3, i * 3 + 2, `#${i.toString(16).padStart(6, "0")}`));
    }
    const got = sliceTokensToRange(tokens, 150, 180);
    const expected = linearSlice(tokens, 150, 180);
    expect(got).toEqual(expected);
  });

  test("200 tokens — binary search matches linear scan for tail segment", () => {
    const tokens: Token[] = [];
    for (let i = 0; i < 200; i++) {
      tokens.push(tok(i * 3, i * 3 + 2, `#${i.toString(16).padStart(6, "0")}`));
    }
    const got = sliceTokensToRange(tokens, 550, 600);
    const expected = linearSlice(tokens, 550, 600);
    expect(got).toEqual(expected);
  });

  test("gap between tokens — empty window returns []", () => {
    // Tokens occupy [0,2), [6,8) — window [3,5) has no tokens
    const tokens = [tok(0, 2), tok(6, 8)];
    const got = sliceTokensToRange(tokens, 3, 5);
    expect(got).toEqual([]);
  });
});

describe("sliceTokensToRange — single token boundary conditions", () => {
  test("segment width = 1, token covers it exactly", () => {
    const tokens = [tok(5, 6)];
    expect(sliceTokensToRange(tokens, 5, 6)).toEqual([tok(0, 1)]);
  });

  test("segment width = 1, token starts at segEnd — no overlap", () => {
    const tokens = [tok(6, 7)];
    expect(sliceTokensToRange(tokens, 5, 6)).toEqual([]);
  });

  test("segment width = 1, token ends at segStart — no overlap", () => {
    const tokens = [tok(4, 5)];
    expect(sliceTokensToRange(tokens, 5, 6)).toEqual([]);
  });
});
