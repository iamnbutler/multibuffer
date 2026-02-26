/**
 * Type system tests - verify branded types and type constructors work correctly.
 */

import { describe, test, expect, beforeEach } from "bun:test";
import {
  createBufferId,
  createExcerptId,
  row,
  mbRow,
  offset,
  mbOffset,
  excerptId,
  point,
  mbPoint,
  range,
  mbRange,
  excerptRange,
  bufferAnchor,
  anchor,
  textSummary,
  resetCounters,
  Bias,
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

  test("ExcerptId creates unique numeric identifiers", () => {
    const id1 = createExcerptId();
    const id2 = createExcerptId();
    expect(id1).not.toBe(id2);
    expect((id1 as number) < (id2 as number)).toBe(true); // Monotonically increasing
  });

  test("BufferRow preserves numeric value", () => {
    const r = row(42);
    expect(r as number).toBe(42);
  });

  test("MultiBufferRow preserves numeric value", () => {
    const r = mbRow(100);
    expect(r as number).toBe(100);
  });

  test("BufferOffset preserves numeric value", () => {
    const o = offset(256);
    expect(o as number).toBe(256);
  });

  test("MultiBufferOffset preserves numeric value", () => {
    const o = mbOffset(1024);
    expect(o as number).toBe(1024);
  });

  test("ExcerptId from number preserves value", () => {
    const id = excerptId(5);
    expect(id as number).toBe(5);
  });
});

// =============================================================================
// Position Types
// =============================================================================

describe("Position Types", () => {
  test("point creates valid BufferPoint", () => {
    const p = point(10, 5);
    expect(p.row as number).toBe(10);
    expect(p.column).toBe(5);
  });

  test("mbPoint creates valid MultiBufferPoint", () => {
    const p = mbPoint(20, 15);
    expect(p.row as number).toBe(20);
    expect(p.column).toBe(15);
  });

  test("range creates valid BufferRange", () => {
    const r = range(0, 0, 10, 20);
    expect(r.start.row as number).toBe(0);
    expect(r.start.column).toBe(0);
    expect(r.end.row as number).toBe(10);
    expect(r.end.column).toBe(20);
  });

  test("mbRange creates valid MultiBufferRange", () => {
    const r = mbRange(5, 3, 15, 8);
    expect(r.start.row as number).toBe(5);
    expect(r.start.column).toBe(3);
    expect(r.end.row as number).toBe(15);
    expect(r.end.column).toBe(8);
  });
});

// =============================================================================
// Excerpt Range Types
// =============================================================================

describe("Excerpt Range Types", () => {
  test("excerptRange with explicit primary", () => {
    const er = excerptRange(5, 15, 8, 12);
    expect(er.context.start.row as number).toBe(5);
    expect(er.context.end.row as number).toBe(15);
    expect(er.primary.start.row as number).toBe(8);
    expect(er.primary.end.row as number).toBe(12);
  });

  test("excerptRange without primary uses context", () => {
    const er = excerptRange(10, 20);
    expect(er.context).toEqual(er.primary);
    expect(er.context.start.row as number).toBe(10);
    expect(er.context.end.row as number).toBe(20);
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
    expect(a.offset as number).toBe(100);
    expect(a.bias).toBe(Bias.Right); // Default
  });

  test("bufferAnchor with explicit bias", () => {
    const a = bufferAnchor(50, Bias.Left);
    expect(a.offset as number).toBe(50);
    expect(a.bias).toBe(Bias.Left);
  });

  test("anchor combines excerpt and buffer anchor", () => {
    const a = anchor(3, 200, Bias.Left);
    expect(a.excerptId as number).toBe(3);
    expect(a.textAnchor.offset as number).toBe(200);
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
    expect(summary.lines).toBe(1); // Empty string has one empty line
    expect(summary.bytes).toBe(0);
    expect(summary.lastLineLength).toBe(0);
  });

  test("textSummary for trailing newline", () => {
    const summary = textSummary("Hello\n");
    expect(summary.lines).toBe(2);
    expect(summary.lastLineLength).toBe(0); // Empty last line
  });

  test("textSummary for unicode content", () => {
    const summary = textSummary("Hello 世界");
    expect(summary.chars).toBe(8); // "Hello " (6) + "世界" (2) = 8 chars
    expect(summary.bytes).toBeGreaterThan(8); // UTF-8 bytes > char count for non-ASCII
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
    expect(id as string).toBe("buffer-1");
  });

  test("resetCounters resets excerpt ID counter", () => {
    createExcerptId();
    createExcerptId();
    resetCounters();
    const id = createExcerptId();
    expect(id as number).toBe(1);
  });
});
