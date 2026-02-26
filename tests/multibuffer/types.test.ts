/**
 * Type system tests - verify branded types and type constructors work correctly.
 */

import { beforeEach, describe, expect, test } from "bun:test";
import {
  anchor,
  Bias,
  bufferAnchor,
  createBufferId,
  createExcerptId,
  excerptId,
  excerptRange,
  expectOffset,
  expectPoint,
  mbOffset,
  mbPoint,
  mbRange,
  mbRow,
  num,
  offset,
  point,
  range,
  resetCounters,
  row,
  str,
  textSummary,
} from "../helpers.ts";

beforeEach(() => {
  resetCounters();
});

// =============================================================================
// Branded Types
// =============================================================================

describe("Branded Types", () => {
  test("BufferId creates unique string identifiers", () => {
    const id1 = createBufferId();
    const id2 = createBufferId();
    expect(id1).not.toBe(id2);
    expect(typeof id1).toBe("string");
  });

  test("ExcerptId creates unique identifiers with generational index", () => {
    const id1 = createExcerptId();
    const id2 = createExcerptId();
    expect(id1).not.toEqual(id2);
    expect(id1.index).not.toBe(id2.index);
  });

  test("BufferRow preserves numeric value", () => {
    expect(num(row(42))).toBe(42);
  });

  test("MultiBufferRow preserves numeric value", () => {
    expect(num(mbRow(100))).toBe(100);
  });

  test("BufferOffset preserves numeric value", () => {
    expect(num(offset(256))).toBe(256);
  });

  test("MultiBufferOffset preserves numeric value", () => {
    expect(num(mbOffset(1024))).toBe(1024);
  });

  test("ExcerptId from index preserves value", () => {
    const id = excerptId(5);
    expect(id.index).toBe(5);
    expect(id.generation).toBe(0);
  });
});

// =============================================================================
// Position Types
// =============================================================================

describe("Position Types", () => {
  test("point creates valid BufferPoint", () => {
    expectPoint(point(10, 5), 10, 5);
  });

  test("mbPoint creates valid MultiBufferPoint", () => {
    expectPoint(mbPoint(20, 15), 20, 15);
  });

  test("range creates valid BufferRange", () => {
    const r = range(0, 0, 10, 20);
    expectPoint(r.start, 0, 0);
    expectPoint(r.end, 10, 20);
  });

  test("mbRange creates valid MultiBufferRange", () => {
    const r = mbRange(5, 3, 15, 8);
    expectPoint(r.start, 5, 3);
    expectPoint(r.end, 15, 8);
  });
});

// =============================================================================
// Excerpt Range Types
// =============================================================================

describe("Excerpt Range Types", () => {
  test("excerptRange with explicit primary", () => {
    const er = excerptRange(5, 15, 8, 12);
    expectPoint(er.context.start, 5, 0);
    expectPoint(er.context.end, 15, 0);
    expectPoint(er.primary.start, 8, 0);
    expectPoint(er.primary.end, 12, 0);
  });

  test("excerptRange without primary uses context", () => {
    const er = excerptRange(10, 20);
    expect(er.context).toEqual(er.primary);
    expectPoint(er.context.start, 10, 0);
    expectPoint(er.context.end, 20, 0);
  });
});

// =============================================================================
// Bias Type
// =============================================================================

describe("Bias Type", () => {
  test("Bias.Left is 0", () => {
    expect(Bias.Left).toBe(0);
  });

  test("Bias.Right is 1", () => {
    expect(Bias.Right).toBe(1);
  });

  test("Bias values are distinct", () => {
    expect(Bias.Left).not.toBe(Bias.Right);
  });
});

// =============================================================================
// Anchor Types
// =============================================================================

describe("Anchor Types", () => {
  test("bufferAnchor with default bias", () => {
    const a = bufferAnchor(100);
    expectOffset(a.offset, 100);
    expect(a.bias).toBe(Bias.Right);
  });

  test("bufferAnchor with explicit bias", () => {
    const a = bufferAnchor(50, Bias.Left);
    expectOffset(a.offset, 50);
    expect(a.bias).toBe(Bias.Left);
  });

  test("anchor combines excerpt and buffer anchor", () => {
    const a = anchor(3, 200, Bias.Left);
    expect(a.excerptId.index).toBe(3);
    expectOffset(a.textAnchor.offset, 200);
    expect(a.textAnchor.bias).toBe(Bias.Left);
  });

  test("anchor with default bias", () => {
    const a = anchor(1, 50);
    expect(a.textAnchor.bias).toBe(Bias.Right);
  });
});

// =============================================================================
// Text Summary
// =============================================================================

describe("Text Summary", () => {
  test("textSummary for single line", () => {
    const summary = textSummary("Hello");
    expect(summary.lines).toBe(1);
    expect(summary.bytes).toBe(5);
    expect(summary.lastLineLength).toBe(5);
    expect(summary.chars).toBe(5);
  });

  test("textSummary for multiple lines", () => {
    const summary = textSummary("Hello\nWorld");
    expect(summary.lines).toBe(2);
    expect(summary.bytes).toBe(11);
    expect(summary.lastLineLength).toBe(5);
  });

  test("textSummary for empty string", () => {
    const summary = textSummary("");
    expect(summary.lines).toBe(1);
    expect(summary.bytes).toBe(0);
    expect(summary.lastLineLength).toBe(0);
  });

  test("textSummary for trailing newline", () => {
    const summary = textSummary("Hello\n");
    expect(summary.lines).toBe(2);
    expect(summary.lastLineLength).toBe(0);
  });

  test("textSummary for unicode content", () => {
    const summary = textSummary("Hello 世界");
    expect(summary.chars).toBe(8);
    expect(summary.bytes).toBeGreaterThan(8);
  });
});

// =============================================================================
// Counter Reset
// =============================================================================

describe("Counter Reset", () => {
  test("resetCounters resets buffer ID counter", () => {
    createBufferId();
    createBufferId();
    resetCounters();
    const id = createBufferId();
    expect(str(id)).toBe("buffer-1");
  });

  test("resetCounters resets excerpt ID counter", () => {
    createExcerptId();
    createExcerptId();
    resetCounters();
    const id = createExcerptId();
    expect(id.index).toBe(0);
  });
});
