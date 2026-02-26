/**
 * Test helpers and utilities.
 */

import type {
  BufferId,
  ExcerptId,
  BufferRow,
  MultiBufferRow,
  BufferOffset,
  MultiBufferOffset,
  BufferPoint,
  BufferRange,
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
  return `excerpt-${++excerptIdCounter}` as ExcerptId;
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

export function point(row: number, column: number): BufferPoint {
  return { row: row as BufferRow, column };
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
  return Array.from({ length: lineCount }, (_, i) => templates[i % templates.length]!);
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
export async function timeAsync<T>(fn: () => Promise<T>): Promise<{ result: T; durationMs: number }> {
  const start = performance.now();
  const result = await fn();
  const durationMs = performance.now() - start;
  return { result, durationMs };
}

// =============================================================================
// Reset (for test isolation)
// =============================================================================

export function resetCounters(): void {
  bufferIdCounter = 0;
  excerptIdCounter = 0;
}
