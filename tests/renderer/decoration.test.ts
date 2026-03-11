/**
 * Tests for decoration types and mapping logic.
 *
 * The actual DOM rendering of decorations is tested via Playwright (e2e).
 * These tests verify the decoration data model and row-range expansion.
 */

import { describe, expect, test } from "bun:test";
import type { MultiBufferRow } from "../../src/multibuffer/types.ts";
import type { Decoration, DecorationStyle } from "../../src/renderer/types.ts";

// biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in tests
const mbRow = (n: number) => n as MultiBufferRow;

/** Simulate the decoration-to-row mapping logic used in DomRenderer.render() */
function buildDecorationMap(
  decorations: readonly Decoration[],
  startRow: number,
  endRow: number,
): Map<number, Partial<DecorationStyle>> {
  const map = new Map<number, Partial<DecorationStyle>>();
  for (const dec of decorations) {
    if (!dec.style) continue;
    for (let r = dec.range.start.row; r <= dec.range.end.row; r++) {
      if (r >= startRow && r < endRow) {
        map.set(r, dec.style);
      }
    }
  }
  return map;
}

describe("Decoration row mapping", () => {
  test("single-line decoration maps to one row", () => {
    const dec: Decoration = {
      range: {
        start: { row: mbRow(5), column: 0 },
        end: { row: mbRow(5), column: 10 },
      },
      style: { backgroundColor: "red" },
    };

    const map = buildDecorationMap([dec], 0, 20);
    expect(map.size).toBe(1);
    expect(map.get(5)?.backgroundColor).toBe("red");
  });

  test("multi-line decoration maps to all rows in range", () => {
    const dec: Decoration = {
      range: {
        start: { row: mbRow(3), column: 0 },
        end: { row: mbRow(7), column: 0 },
      },
      style: { backgroundColor: "green" },
    };

    const map = buildDecorationMap([dec], 0, 20);
    expect(map.size).toBe(5); // rows 3, 4, 5, 6, 7
    for (let r = 3; r <= 7; r++) {
      expect(map.get(r)?.backgroundColor).toBe("green");
    }
  });

  test("decorations outside viewport are excluded", () => {
    const dec: Decoration = {
      range: {
        start: { row: mbRow(0), column: 0 },
        end: { row: mbRow(2), column: 0 },
      },
      style: { backgroundColor: "blue" },
    };

    const map = buildDecorationMap([dec], 5, 15);
    expect(map.size).toBe(0);
  });

  test("decoration partially overlapping viewport is clipped", () => {
    const dec: Decoration = {
      range: {
        start: { row: mbRow(3), column: 0 },
        end: { row: mbRow(8), column: 0 },
      },
      style: { backgroundColor: "yellow" },
    };

    // Viewport is rows 5-10
    const map = buildDecorationMap([dec], 5, 10);
    expect(map.size).toBe(4); // rows 5, 6, 7, 8
    expect(map.has(3)).toBe(false);
    expect(map.has(4)).toBe(false);
    expect(map.get(5)?.backgroundColor).toBe("yellow");
    expect(map.get(8)?.backgroundColor).toBe("yellow");
  });

  test("overlapping decorations: last wins", () => {
    const dec1: Decoration = {
      range: {
        start: { row: mbRow(0), column: 0 },
        end: { row: mbRow(5), column: 0 },
      },
      style: { backgroundColor: "red" },
    };
    const dec2: Decoration = {
      range: {
        start: { row: mbRow(3), column: 0 },
        end: { row: mbRow(8), column: 0 },
      },
      style: { backgroundColor: "green" },
    };

    const map = buildDecorationMap([dec1, dec2], 0, 10);
    // Rows 0-2: red only
    expect(map.get(0)?.backgroundColor).toBe("red");
    expect(map.get(2)?.backgroundColor).toBe("red");
    // Rows 3-5: green wins (last decoration)
    expect(map.get(3)?.backgroundColor).toBe("green");
    expect(map.get(5)?.backgroundColor).toBe("green");
    // Rows 6-8: green only
    expect(map.get(7)?.backgroundColor).toBe("green");
  });

  test("decoration without style is skipped", () => {
    const dec: Decoration = {
      range: {
        start: { row: mbRow(0), column: 0 },
        end: { row: mbRow(5), column: 0 },
      },
    };

    const map = buildDecorationMap([dec], 0, 10);
    expect(map.size).toBe(0);
  });

  test("gutter fields are passed through", () => {
    const dec: Decoration = {
      range: {
        start: { row: mbRow(2), column: 0 },
        end: { row: mbRow(2), column: 0 },
      },
      style: {
        backgroundColor: "rgba(204, 36, 29, 0.15)",
        gutterBackground: "rgba(204, 36, 29, 0.25)",
        gutterSign: "\u2212",
        gutterSignColor: "#cc241d",
      },
    };

    const map = buildDecorationMap([dec], 0, 10);
    const style = map.get(2);
    expect(style?.gutterSign).toBe("\u2212");
    expect(style?.gutterSignColor).toBe("#cc241d");
    expect(style?.gutterBackground).toBe("rgba(204, 36, 29, 0.25)");
  });
});

describe("DecorationStyle type contract", () => {
  test("all style fields are optional via Partial", () => {
    // This is a compile-time check — if it compiles, the contract is correct
    const style: Partial<DecorationStyle> = {};
    expect(style.backgroundColor).toBeUndefined();
    expect(style.gutterSign).toBeUndefined();
  });

  test("full style can be constructed", () => {
    const style: DecorationStyle = {
      backgroundColor: "#ff0000",
      color: "#ffffff",
      borderColor: "#000000",
      fontWeight: "bold",
      fontStyle: "italic",
      textDecoration: "underline",
      gutterBackground: "#330000",
      gutterColor: "#ff6666",
      gutterSign: "+",
      gutterSignColor: "#00ff00",
    };
    expect(style.gutterSign).toBe("+");
    expect(style.fontWeight).toBe("bold");
  });
});
