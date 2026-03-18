/**
 * Tests for intraline (character-level) diff highlighting.
 */

import { describe, expect, test } from "bun:test";
import {
  computeIntralineDiff,
  pairDeleteInsertLines,
} from "../../src/diff/diff.ts";
import type { DiffLine } from "../../src/diff/types.ts";

describe("computeIntralineDiff", () => {
  test("identical lines produce empty ranges", () => {
    const result = computeIntralineDiff("hello world", "hello world");
    expect(result.deleteRanges).toEqual([]);
    expect(result.insertRanges).toEqual([]);
  });

  test("single word change at end", () => {
    const result = computeIntralineDiff(
      'const foo = "hello"',
      'const foo = "world"',
    );
    // "hello" -> "world" - character-level diff finds 'o' is common
    // The common prefix is 'const foo = "' (13 chars) and common suffix is '"'
    expect(result.deleteRanges.length).toBeGreaterThan(0);
    expect(result.insertRanges.length).toBeGreaterThan(0);
    // Starts at column 13 where the differing middle begins
    expect(result.deleteRanges[0]?.startColumn).toBe(13);
    expect(result.insertRanges[0]?.startColumn).toBe(13);
  });

  test("single character change in middle", () => {
    const result = computeIntralineDiff("abcdef", "abXdef");
    // 'c' -> 'X'
    expect(result.deleteRanges).toEqual([{ startColumn: 2, endColumn: 3 }]);
    expect(result.insertRanges).toEqual([{ startColumn: 2, endColumn: 3 }]);
  });

  test("insertion in middle", () => {
    const result = computeIntralineDiff("abdef", "abcdef");
    // '' -> 'c' inserted at position 2
    expect(result.deleteRanges).toEqual([]);
    expect(result.insertRanges).toEqual([{ startColumn: 2, endColumn: 3 }]);
  });

  test("deletion in middle", () => {
    const result = computeIntralineDiff("abcdef", "abdef");
    // 'c' -> '' deleted
    expect(result.deleteRanges).toEqual([{ startColumn: 2, endColumn: 3 }]);
    expect(result.insertRanges).toEqual([]);
  });

  test("empty delete line", () => {
    const result = computeIntralineDiff("", "hello");
    expect(result.deleteRanges).toEqual([]);
    expect(result.insertRanges).toEqual([{ startColumn: 0, endColumn: 5 }]);
  });

  test("empty insert line", () => {
    const result = computeIntralineDiff("hello", "");
    expect(result.deleteRanges).toEqual([{ startColumn: 0, endColumn: 5 }]);
    expect(result.insertRanges).toEqual([]);
  });

  test("complete replacement", () => {
    const result = computeIntralineDiff("abc", "xyz");
    // No common prefix or suffix
    expect(result.deleteRanges).toEqual([{ startColumn: 0, endColumn: 3 }]);
    expect(result.insertRanges).toEqual([{ startColumn: 0, endColumn: 3 }]);
  });

  test("multi-word change", () => {
    const result = computeIntralineDiff(
      "The quick brown fox",
      "The slow red fox",
    );
    // Common prefix: "The "
    // Common suffix: " fox"
    // Differing middle: "quick brown" vs "slow red"
    const deleteRange = result.deleteRanges[0];
    const insertRange = result.insertRanges[0];
    expect(deleteRange?.startColumn).toBe(4);
    expect(insertRange?.startColumn).toBe(4);
  });

  test("performance cap: skips very long lines", () => {
    const longLine = "x".repeat(1500);
    const result = computeIntralineDiff(longLine, `${longLine}y`, {
      maxLineLength: 1000,
    });
    // Should return full-line ranges for both
    expect(result.deleteRanges).toEqual([
      { startColumn: 0, endColumn: 1500 },
    ]);
    expect(result.insertRanges).toEqual([
      { startColumn: 0, endColumn: 1501 },
    ]);
  });

  test("handles tabs and special characters", () => {
    const result = computeIntralineDiff("\tvalue: 42", "\tvalue: 99");
    // Common prefix: "\tvalue: "
    expect(result.deleteRanges[0]?.startColumn).toBe(8);
    expect(result.insertRanges[0]?.startColumn).toBe(8);
  });

  test("multiple changes in line", () => {
    const result = computeIntralineDiff("aXcXe", "aYcYe");
    // Two separate changes: X->Y at positions 1 and 3
    // The character-level diff should identify both
    expect(result.deleteRanges.length).toBe(2);
    expect(result.insertRanges.length).toBe(2);
    expect(result.deleteRanges[0]).toEqual({ startColumn: 1, endColumn: 2 });
    expect(result.deleteRanges[1]).toEqual({ startColumn: 3, endColumn: 4 });
  });
});

describe("pairDeleteInsertLines", () => {
  test("empty lines array", () => {
    const pairs = pairDeleteInsertLines([]);
    expect(pairs).toEqual([]);
  });

  test("only equal lines", () => {
    const lines: DiffLine[] = [
      { kind: "equal", text: "line 1", oldRow: 0, newRow: 0 },
      { kind: "equal", text: "line 2", oldRow: 1, newRow: 1 },
    ];
    const pairs = pairDeleteInsertLines(lines);
    expect(pairs).toEqual([]);
  });

  test("single delete-insert pair", () => {
    const lines: DiffLine[] = [
      { kind: "delete", text: "old line", oldRow: 0, newRow: undefined },
      { kind: "insert", text: "new line", oldRow: undefined, newRow: 0 },
    ];
    const pairs = pairDeleteInsertLines(lines);
    expect(pairs.length).toBe(1);
    expect(pairs[0]?.deleteIdx).toBe(0);
    expect(pairs[0]?.insertIdx).toBe(1);
    expect(pairs[0]?.deleteLine.text).toBe("old line");
    expect(pairs[0]?.insertLine.text).toBe("new line");
  });

  test("multiple consecutive delete-insert pairs", () => {
    const lines: DiffLine[] = [
      { kind: "delete", text: "old 1", oldRow: 0, newRow: undefined },
      { kind: "delete", text: "old 2", oldRow: 1, newRow: undefined },
      { kind: "insert", text: "new 1", oldRow: undefined, newRow: 0 },
      { kind: "insert", text: "new 2", oldRow: undefined, newRow: 1 },
    ];
    const pairs = pairDeleteInsertLines(lines);
    expect(pairs.length).toBe(2);
    expect(pairs[0]?.deleteLine.text).toBe("old 1");
    expect(pairs[0]?.insertLine.text).toBe("new 1");
    expect(pairs[1]?.deleteLine.text).toBe("old 2");
    expect(pairs[1]?.insertLine.text).toBe("new 2");
  });

  test("more deletes than inserts", () => {
    const lines: DiffLine[] = [
      { kind: "delete", text: "old 1", oldRow: 0, newRow: undefined },
      { kind: "delete", text: "old 2", oldRow: 1, newRow: undefined },
      { kind: "delete", text: "old 3", oldRow: 2, newRow: undefined },
      { kind: "insert", text: "new 1", oldRow: undefined, newRow: 0 },
    ];
    const pairs = pairDeleteInsertLines(lines);
    expect(pairs.length).toBe(1);
    expect(pairs[0]?.deleteLine.text).toBe("old 1");
    expect(pairs[0]?.insertLine.text).toBe("new 1");
  });

  test("more inserts than deletes", () => {
    const lines: DiffLine[] = [
      { kind: "delete", text: "old 1", oldRow: 0, newRow: undefined },
      { kind: "insert", text: "new 1", oldRow: undefined, newRow: 0 },
      { kind: "insert", text: "new 2", oldRow: undefined, newRow: 1 },
      { kind: "insert", text: "new 3", oldRow: undefined, newRow: 2 },
    ];
    const pairs = pairDeleteInsertLines(lines);
    expect(pairs.length).toBe(1);
    expect(pairs[0]?.deleteLine.text).toBe("old 1");
    expect(pairs[0]?.insertLine.text).toBe("new 1");
  });

  test("delete-insert separated by equal lines", () => {
    const lines: DiffLine[] = [
      { kind: "delete", text: "old 1", oldRow: 0, newRow: undefined },
      { kind: "insert", text: "new 1", oldRow: undefined, newRow: 0 },
      { kind: "equal", text: "context", oldRow: 1, newRow: 1 },
      { kind: "delete", text: "old 2", oldRow: 2, newRow: undefined },
      { kind: "insert", text: "new 2", oldRow: undefined, newRow: 2 },
    ];
    const pairs = pairDeleteInsertLines(lines);
    expect(pairs.length).toBe(2);
    expect(pairs[0]?.deleteLine.text).toBe("old 1");
    expect(pairs[0]?.insertLine.text).toBe("new 1");
    expect(pairs[1]?.deleteLine.text).toBe("old 2");
    expect(pairs[1]?.insertLine.text).toBe("new 2");
  });

  test("only deletes - no pairs", () => {
    const lines: DiffLine[] = [
      { kind: "delete", text: "old 1", oldRow: 0, newRow: undefined },
      { kind: "delete", text: "old 2", oldRow: 1, newRow: undefined },
    ];
    const pairs = pairDeleteInsertLines(lines);
    expect(pairs).toEqual([]);
  });

  test("only inserts - no pairs", () => {
    const lines: DiffLine[] = [
      { kind: "insert", text: "new 1", oldRow: undefined, newRow: 0 },
      { kind: "insert", text: "new 2", oldRow: undefined, newRow: 1 },
    ];
    const pairs = pairDeleteInsertLines(lines);
    expect(pairs).toEqual([]);
  });

  test("inserts before deletes are not paired", () => {
    const lines: DiffLine[] = [
      { kind: "insert", text: "new 1", oldRow: undefined, newRow: 0 },
      { kind: "delete", text: "old 1", oldRow: 0, newRow: undefined },
    ];
    const pairs = pairDeleteInsertLines(lines);
    // Inserts come before deletes, so they shouldn't be paired
    expect(pairs).toEqual([]);
  });
});
