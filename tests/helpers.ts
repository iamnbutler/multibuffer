/**
 * Test helpers and utilities.
 */

import {
  Bias,
  type BufferId,
  type ExcerptId,
  type BufferRow,
  type MultiBufferRow,
  type BufferOffset,
  type MultiBufferOffset,
  type BufferPoint,
  type MultiBufferPoint,
  type BufferRange,
  type MultiBufferRange,
  type ExcerptRange,
  type TextSummary,
  type Anchor,
  type BufferAnchor,
} from "../src/multibuffer/types.ts";

// =============================================================================
// Type Constructors (for tests only)
// =============================================================================

let bufferIdCounter = 0;
let excerptIdCounter = 0;

export function createBufferId(): BufferId {
  return `buffer-${++bufferIdCounter}` as BufferId;
}

export function createExcerptId(): ExcerptId {
  const id = excerptIdCounter++;
  return { index: id, generation: 0 } as unknown as ExcerptId;
}

export function row(n: number): BufferRow {
  return n as BufferRow;
}

export function mbRow(n: number): MultiBufferRow {
  return n as MultiBufferRow;
}

export function offset(n: number): BufferOffset {
  return n as BufferOffset;
}

export function mbOffset(n: number): MultiBufferOffset {
  return n as MultiBufferOffset;
}

export function excerptId(index: number, generation: number = 0): ExcerptId {
  return { index, generation } as unknown as ExcerptId;
}

export function point(row: number, column: number): BufferPoint {
  return { row: row as BufferRow, column };
}

export function mbPoint(row: number, column: number): MultiBufferPoint {
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
    (_, i) => templates[i % templates.length]!
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
// =============================================================================

/**
 * Assert that two points are equal (handles branded types).
 */
export function expectPointEqual(
  actual: BufferPoint | MultiBufferPoint,
  expected: { row: number; column: number }
): void {
  if (
    (actual.row as number) !== expected.row ||
    actual.column !== expected.column
  ) {
    throw new Error(
      `Expected point (${expected.row}, ${expected.column}) but got (${actual.row}, ${actual.column})`
    );
  }
}

/**
 * Assert that a value is within a range (inclusive).
 */
export function expectInRange(
  value: number,
  min: number,
  max: number,
  message?: string
): void {
  if (value < min || value > max) {
    throw new Error(
      message ?? `Expected ${value} to be in range [${min}, ${max}]`
    );
  }
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
