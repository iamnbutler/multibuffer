/**
 * Test helpers and utilities.
 */

import {
  type Anchor,
  Bias,
  type BufferAnchor,
  type BufferId,
  type BufferOffset,
  type BufferPoint,
  type BufferRange,
  type BufferRow,
  type ExcerptId,
  type ExcerptRange,
  type MultiBufferOffset,
  type MultiBufferPoint,
  type MultiBufferRange,
  type MultiBufferRow,
  type TextSummary,
} from "../src/multibuffer/types.ts";

// =============================================================================
// Type Constructors (for tests only)
// =============================================================================

let bufferIdCounter = 0;
let excerptIdCounter = 0;

export function createBufferId(): BufferId {
  // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
  return `buffer-${++bufferIdCounter}` as BufferId;
}

export function createExcerptId(): ExcerptId {
  const id = excerptIdCounter++;
  // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
  return { index: id, generation: 0 } as unknown as ExcerptId;
}

export function row(n: number): BufferRow {
  // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
  return n as BufferRow;
}

export function mbRow(n: number): MultiBufferRow {
  // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
  return n as MultiBufferRow;
}

export function offset(n: number): BufferOffset {
  // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
  return n as BufferOffset;
}

export function mbOffset(n: number): MultiBufferOffset {
  // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
  return n as MultiBufferOffset;
}

export function excerptId(index: number, generation: number = 0): ExcerptId {
  // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
  return { index, generation } as unknown as ExcerptId;
}

export function point(row: number, column: number): BufferPoint {
  // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
  return { row: row as BufferRow, column };
}

export function mbPoint(row: number, column: number): MultiBufferPoint {
  // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
  return { row: row as MultiBufferRow, column };
}

export function range(
  startRow: number,
  startCol: number,
  endRow: number,
  endCol: number
): BufferRange {
  return {
    start: point(startRow, startCol),
    end: point(endRow, endCol),
  };
}

export function mbRange(
  startRow: number,
  startCol: number,
  endRow: number,
  endCol: number
): MultiBufferRange {
  return {
    start: mbPoint(startRow, startCol),
    end: mbPoint(endRow, endCol),
  };
}

export function excerptRange(
  contextStartRow: number,
  contextEndRow: number,
  primaryStartRow?: number,
  primaryEndRow?: number
): ExcerptRange {
  const context = range(contextStartRow, 0, contextEndRow, 0);
  const primary =
    primaryStartRow !== undefined && primaryEndRow !== undefined
      ? range(primaryStartRow, 0, primaryEndRow, 0)
      : context;
  return { context, primary };
}

export function bufferAnchor(off: number, bias: Bias = Bias.Right): BufferAnchor {
  return { offset: offset(off), bias };
}

export function anchor(
  excIndex: number,
  off: number,
  bias: Bias = Bias.Right,
  generation: number = 0,
): Anchor {
  return {
    excerptId: excerptId(excIndex, generation),
    textAnchor: bufferAnchor(off, bias),
  };
}

// =============================================================================
// Text Summary Helpers
// =============================================================================

export function textSummary(text: string): TextSummary {
  const lines = text.split("\n");
  const lastLine = lines[lines.length - 1] ?? "";
  return {
    lines: lines.length,
    bytes: new TextEncoder().encode(text).length,
    lastLineLength: lastLine.length,
    chars: [...text].length,
  };
}

// =============================================================================
// Test Data Generators
// =============================================================================

/**
 * Generate lines of text for testing.
 */
export function generateLines(count: number, prefix = "Line"): string[] {
  return Array.from({ length: count }, (_, i) => `${prefix} ${i + 1}`);
}

/**
 * Generate a text blob with N lines.
 */
export function generateText(lineCount: number, prefix = "Line"): string {
  return generateLines(lineCount, prefix).join("\n");
}

/**
 * Generate realistic code-like content.
 */
export function generateCode(lineCount: number): string[] {
  const templates = [
    "function example() {",
    "  const value = 42;",
    "  return value * 2;",
    "}",
    "",
    "class Component {",
    "  constructor() {",
    "    this.state = {};",
    "  }",
    "}",
  ];
  return Array.from(
    { length: lineCount },
    (_, i) => templates[i % templates.length] ?? ""
  );
}

/**
 * Generate text with specific edge cases.
 */
export function generateEdgeCaseText(): {
  empty: string;
  singleLine: string;
  withTrailingNewline: string;
  withMultipleTrailingNewlines: string;
  withEmptyLines: string;
  unicodeContent: string;
} {
  return {
    empty: "",
    singleLine: "Hello, world!",
    withTrailingNewline: "Line 1\nLine 2\n",
    withMultipleTrailingNewlines: "Line 1\n\n\n",
    withEmptyLines: "Line 1\n\nLine 3\n\nLine 5",
    unicodeContent: "Hello 世界\nПривет мир\n🎉🎊",
  };
}

// =============================================================================
// Timing Utilities
// =============================================================================

/**
 * Measure execution time of a function.
 */
export function time<T>(fn: () => T): { result: T; durationMs: number } {
  const start = performance.now();
  const result = fn();
  const durationMs = performance.now() - start;
  return { result, durationMs };
}

/**
 * Measure execution time of an async function.
 */
export async function timeAsync<T>(
  fn: () => Promise<T>
): Promise<{ result: T; durationMs: number }> {
  const start = performance.now();
  const result = await fn();
  const durationMs = performance.now() - start;
  return { result, durationMs };
}

/**
 * Run a function multiple times and return statistics.
 */
export function benchmark(
  fn: () => void,
  iterations: number = 1000
): {
  avgMs: number;
  minMs: number;
  maxMs: number;
  totalMs: number;
} {
  const times: number[] = [];

  // Warmup
  for (let i = 0; i < Math.min(100, iterations / 10); i++) {
    fn();
  }

  // Actual measurement
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }

  const totalMs = times.reduce((a, b) => a + b, 0);
  return {
    avgMs: totalMs / iterations,
    minMs: Math.min(...times),
    maxMs: Math.max(...times),
    totalMs,
  };
}

// =============================================================================
// Assertion Helpers
//
// Branded types (BufferRow, MultiBufferRow, etc.) are numbers at runtime but
// TypeScript won't let you write expect(brandedValue).toBe(42) because the
// .toBe() overload expects the branded type, not plain number.
//
// These helpers encapsulate the cast so test call sites stay clean.
// =============================================================================

import { expect } from "bun:test";

/**
 * Unwrap any branded numeric type for assertions.
 * All our branded types (BufferRow, BufferOffset, etc.) are number & { __brand }.
 * This strips the brand so expect().toBe() works with plain numbers.
 */
export function num(
  value: BufferRow | MultiBufferRow | BufferOffset | MultiBufferOffset | number,
): number {
  // biome-ignore lint/plugin/no-type-assertion: expect: unwrapping branded numeric type
  return value as number;
}

/** Unwrap a branded string type for assertions. */
export function str(value: BufferId | string): string {
  // biome-ignore lint/plugin/no-type-assertion: expect: unwrapping branded string type
  return value as string;
}

/** Assert a point equals {row, column}. */
export function expectPoint(
  actual: BufferPoint | MultiBufferPoint,
  expectedRow: number,
  expectedCol: number,
): void {
  expect(num(actual.row)).toBe(expectedRow);
  expect(actual.column).toBe(expectedCol);
}

/** Assert an offset equals a number. */
export function expectOffset(
  actual: BufferOffset | MultiBufferOffset,
  expected: number,
): void {
  expect(num(actual)).toBe(expected);
}

// =============================================================================
// Reset (for test isolation)
// =============================================================================

export function resetCounters(): void {
  bufferIdCounter = 0;
  excerptIdCounter = 0;
}

// Re-export Bias for convenience
export { Bias };
