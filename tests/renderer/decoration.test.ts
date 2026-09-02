/**
 * Tests for the decoration type contract and gutter-mode measurements.
 *
 * Decoration-to-row mapping used to be tested here against a `buildDecorationMap`
 * copy declared in this file. That copy flattened every decoration by row, which
 * stopped matching `DomRenderer.render()` once it began separating line-level
 * decorations from column-level (intraline) ones — a same-row range ending
 * before the line end is intraline and paints no row background, while the copy
 * reported it as a painted row. Those cases now run against the real renderer in
 * `decoration-dom.test.ts`.
 */

import { describe, expect, test } from "bun:test";
import type { DecorationStyle, Measurements } from "../../src/renderer/types.ts";

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

describe("Measurements gutterMode", () => {
  test("gutterMode defaults to undefined (standard)", () => {
    const measurements: Measurements = {
      lineHeight: 20,
      gutterWidth: 48,
    };
    expect(measurements.gutterMode).toBeUndefined();
  });

  test("gutterMode can be set to 'standard'", () => {
    const measurements: Measurements = {
      lineHeight: 20,
      gutterWidth: 48,
      gutterMode: "standard",
    };
    expect(measurements.gutterMode).toBe("standard");
  });

  test("gutterMode can be set to 'diff'", () => {
    const measurements: Measurements = {
      lineHeight: 20,
      gutterWidth: 48,
      gutterMode: "diff",
    };
    expect(measurements.gutterMode).toBe("diff");
  });
});
