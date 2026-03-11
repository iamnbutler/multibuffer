/**
 * Tests for unified diff view.
 *
 * A unified diff renders old and new content in a single scrollable view,
 * with deleted lines, inserted lines, and unchanged context interleaved.
 */

import { describe, expect, test } from "bun:test";
import type { BufferId } from "../../src/buffer/types.ts";
import { createUnifiedDiff } from "../../src/diff/unified.ts";

// biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in tests
const oldId = "old.ts" as BufferId;
// biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in tests
const newId = "new.ts" as BufferId;

describe("createUnifiedDiff", () => {
  test("identical texts produce all equal lines", () => {
    const text = "hello\nworld";
    const result = createUnifiedDiff(oldId, text, newId, text);
    expect(result.lines.length).toBe(2);
    expect(result.lines.every((l) => l.kind === "equal")).toBe(true);
    const first = result.lines[0];
    const second = result.lines[1];
    if (!first || !second) throw new Error("expected 2 lines");
    expect(first.text).toBe("hello");
    expect(second.text).toBe("world");
  });

  test("single line change shows delete then insert", () => {
    const result = createUnifiedDiff(oldId, "a\nb\nc", newId, "a\nB\nc");
    const changed = result.lines.filter((l) => l.kind !== "equal");
    expect(changed.length).toBe(2);
    const del = changed[0];
    const ins = changed[1];
    if (!del || !ins) throw new Error("expected delete and insert");
    expect(del.kind).toBe("delete");
    expect(del.text).toBe("b");
    expect(ins.kind).toBe("insert");
    expect(ins.text).toBe("B");
  });

  test("lines track source buffer and row", () => {
    const result = createUnifiedDiff(oldId, "a\nb", newId, "a\nc");
    const deleteLine = result.lines.find((l) => l.kind === "delete");
    const insertLine = result.lines.find((l) => l.kind === "insert");
    if (!deleteLine || !insertLine) throw new Error("expected delete and insert");
    expect(deleteLine.bufferId).toBe(oldId);
    expect(deleteLine.sourceRow).toBe(1);
    expect(insertLine.bufferId).toBe(newId);
    expect(insertLine.sourceRow).toBe(1);
  });

  test("equal lines reference the new buffer", () => {
    const result = createUnifiedDiff(oldId, "same\nline", newId, "same\nline");
    for (const line of result.lines) {
      expect(line.bufferId).toBe(newId);
    }
  });

  test("pure insertion", () => {
    const result = createUnifiedDiff(oldId, "a\nc", newId, "a\nb\nc");
    const inserts = result.lines.filter((l) => l.kind === "insert");
    expect(inserts.length).toBe(1);
    const ins = inserts[0];
    if (!ins) throw new Error("expected insert");
    expect(ins.text).toBe("b");
  });

  test("pure deletion", () => {
    const result = createUnifiedDiff(oldId, "a\nb\nc", newId, "a\nc");
    const deletes = result.lines.filter((l) => l.kind === "delete");
    expect(deletes.length).toBe(1);
    const del = deletes[0];
    if (!del) throw new Error("expected delete");
    expect(del.text).toBe("b");
  });

  test("empty old to non-empty new", () => {
    const result = createUnifiedDiff(oldId, "", newId, "hello\nworld");
    expect(result.lines.length).toBe(2);
    expect(result.lines.every((l) => l.kind === "insert")).toBe(true);
  });

  test("line count matches total unified lines", () => {
    const result = createUnifiedDiff(
      oldId,
      "a\nb\nc\nd",
      newId,
      "a\nB\nc\nD",
    );
    // a(equal) + b(delete) + B(insert) + c(equal) + d(delete) + D(insert)
    expect(result.lines.length).toBe(6);
    expect(result.lineCount).toBe(6);
  });

  test("stats track insert and delete counts", () => {
    const result = createUnifiedDiff(
      oldId,
      "a\nb\nc",
      newId,
      "a\nB\nC\nd",
    );
    expect(result.stats.inserts).toBeGreaterThan(0);
    expect(result.stats.deletes).toBeGreaterThan(0);
  });
});
