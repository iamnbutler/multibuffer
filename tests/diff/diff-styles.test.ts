/**
 * Tests for diff-styles helper functions and hunkToHeader.
 *
 * These pure utility functions are used extensively by controller.ts,
 * multibuffer.ts, and patch.ts but had no direct unit tests.
 */

import { describe, expect, test } from "bun:test";
import type { BufferRow } from "../../src/buffer/types.ts";
import {
  DELETE_STYLE,
  INSERT_STYLE,
  INTRALINE_DELETE_STYLE,
  INTRALINE_INSERT_STYLE,
  makeColumnDecoration,
  makeDecoration,
  makeExcerptRange,
} from "../../src/diff/diff-styles.ts";
import { hunkToHeader } from "../../src/diff/helpers.ts";
import type { MultiBufferRow } from "../../src/multibuffer/types.ts";

describe("makeExcerptRange", () => {
  test("produces matching context and primary ranges", () => {
    const range = makeExcerptRange(5, 10);
    expect(range.context).toEqual(range.primary);
  });

  test("start row and end row are set correctly", () => {
    const range = makeExcerptRange(3, 7);
    expect(range.context.start.row).toBe(3 as BufferRow);
    expect(range.context.start.column).toBe(0);
    expect(range.context.end.row).toBe(7 as BufferRow);
    expect(range.context.end.column).toBe(0);
  });

  test("single-row range (startRow === endRow - 1 pattern)", () => {
    const range = makeExcerptRange(0, 1);
    expect(range.primary.start.row).toBe(0 as BufferRow);
    expect(range.primary.end.row).toBe(1 as BufferRow);
  });

  test("zero-based start", () => {
    const range = makeExcerptRange(0, 0);
    expect(range.context.start.row).toBe(0 as BufferRow);
    expect(range.context.end.row).toBe(0 as BufferRow);
  });
});

describe("makeDecoration", () => {
  test("single-line decoration has start === end row", () => {
    const dec = makeDecoration(5, 1, DELETE_STYLE);
    expect(dec.range.start.row).toBe(5 as MultiBufferRow);
    expect(dec.range.end.row).toBe(5 as MultiBufferRow);
    expect(dec.range.start.column).toBe(0);
    expect(dec.range.end.column).toBe(Number.MAX_SAFE_INTEGER);
  });

  test("multi-line decoration spans correct rows", () => {
    const dec = makeDecoration(10, 3, INSERT_STYLE);
    expect(dec.range.start.row).toBe(10 as MultiBufferRow);
    expect(dec.range.end.row).toBe(12 as MultiBufferRow);
  });

  test("style is passed through", () => {
    const dec = makeDecoration(0, 1, DELETE_STYLE);
    expect(dec.style).toBe(DELETE_STYLE);
  });

  test("custom style object is preserved", () => {
    const custom = { backgroundColor: "red" };
    const dec = makeDecoration(0, 2, custom);
    expect(dec.style).toBe(custom);
  });
});

describe("makeColumnDecoration", () => {
  test("column range is set on a single row", () => {
    const dec = makeColumnDecoration(3, 5, 12, INTRALINE_DELETE_STYLE);
    expect(dec.range.start.row).toBe(3 as MultiBufferRow);
    expect(dec.range.end.row).toBe(3 as MultiBufferRow);
    expect(dec.range.start.column).toBe(5);
    expect(dec.range.end.column).toBe(12);
  });

  test("style is passed through", () => {
    const dec = makeColumnDecoration(0, 0, 10, INTRALINE_INSERT_STYLE);
    expect(dec.style).toBe(INTRALINE_INSERT_STYLE);
  });

  test("zero-width range (startColumn === endColumn)", () => {
    const dec = makeColumnDecoration(1, 7, 7, INTRALINE_DELETE_STYLE);
    expect(dec.range.start.column).toBe(7);
    expect(dec.range.end.column).toBe(7);
  });
});

describe("hunkToHeader", () => {
  test("converts 0-based indices to 1-based", () => {
    const header = hunkToHeader({
      oldStart: 0,
      oldCount: 5,
      newStart: 0,
      newCount: 7,
      lines: [],
    });
    expect(header.oldStart).toBe(1);
    expect(header.newStart).toBe(1);
  });

  test("preserves counts unchanged", () => {
    const header = hunkToHeader({
      oldStart: 9,
      oldCount: 3,
      newStart: 11,
      newCount: 4,
      lines: [],
    });
    expect(header.oldCount).toBe(3);
    expect(header.newCount).toBe(4);
  });

  test("non-zero start indices are incremented by 1", () => {
    const header = hunkToHeader({
      oldStart: 42,
      oldCount: 1,
      newStart: 50,
      newCount: 1,
      lines: [],
    });
    expect(header.oldStart).toBe(43);
    expect(header.newStart).toBe(51);
  });
});

describe("style constants", () => {
  test("DELETE_STYLE has minus gutter sign", () => {
    expect(DELETE_STYLE.gutterSign).toBe("\u2212");
  });

  test("INSERT_STYLE has plus gutter sign", () => {
    expect(INSERT_STYLE.gutterSign).toBe("+");
  });

  test("intraline styles have higher opacity than line-level", () => {
    // Line-level: 0.10 opacity, intraline: 0.25 opacity
    expect(INTRALINE_DELETE_STYLE.backgroundColor).toContain("0.25");
    expect(INTRALINE_INSERT_STYLE.backgroundColor).toContain("0.25");
    expect(DELETE_STYLE.backgroundColor).toContain("0.10");
    expect(INSERT_STYLE.backgroundColor).toContain("0.10");
  });
});
