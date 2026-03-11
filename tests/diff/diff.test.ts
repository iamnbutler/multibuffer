/**
 * Tests for the line-level diff algorithm.
 */

import { describe, expect, test } from "bun:test";
import { diff } from "../../src/diff/diff.ts";

describe("diff", () => {
  test("identical texts produce no hunks", () => {
    const result = diff("hello\nworld", "hello\nworld");
    expect(result.isEqual).toBe(true);
    expect(result.hunks).toEqual([]);
  });

  test("empty to non-empty is all inserts", () => {
    const result = diff("", "a\nb");
    expect(result.isEqual).toBe(false);
    expect(result.hunks.length).toBe(1);
    const hunk = result.hunks[0];
    if (!hunk) throw new Error("expected hunk");
    expect(hunk.lines.length).toBe(2);
    expect(hunk.lines[0]).toEqual({ kind: "insert", text: "a", oldRow: undefined, newRow: 0 });
    expect(hunk.lines[1]).toEqual({ kind: "insert", text: "b", oldRow: undefined, newRow: 1 });
  });

  test("non-empty to empty is all deletes", () => {
    const result = diff("a\nb", "");
    expect(result.isEqual).toBe(false);
    expect(result.hunks.length).toBe(1);
    const hunk = result.hunks[0];
    if (!hunk) throw new Error("expected hunk");
    expect(hunk.lines.length).toBe(2);
    expect(hunk.lines[0]).toEqual({ kind: "delete", text: "a", oldRow: 0, newRow: undefined });
    expect(hunk.lines[1]).toEqual({ kind: "delete", text: "b", oldRow: 1, newRow: undefined });
  });

  test("single line change", () => {
    const result = diff("hello\nworld", "hello\nearth");
    expect(result.isEqual).toBe(false);
    expect(result.hunks.length).toBe(1);
    const hunk = result.hunks[0];
    if (!hunk) throw new Error("expected hunk");
    const kinds = hunk.lines.map((l) => l.kind);
    expect(kinds).toContain("delete");
    expect(kinds).toContain("insert");
    expect(kinds).toContain("equal");
  });

  test("insertion in the middle", () => {
    const result = diff("a\nc", "a\nb\nc");
    expect(result.isEqual).toBe(false);
    const allLines = result.hunks.flatMap((h) => h.lines);
    const insertLines = allLines.filter((l) => l.kind === "insert");
    expect(insertLines.length).toBe(1);
    const ins = insertLines[0];
    if (!ins) throw new Error("expected insert");
    expect(ins.text).toBe("b");
    expect(ins.newRow).toBe(1);
  });

  test("deletion in the middle", () => {
    const result = diff("a\nb\nc", "a\nc");
    expect(result.isEqual).toBe(false);
    const allLines = result.hunks.flatMap((h) => h.lines);
    const deleteLines = allLines.filter((l) => l.kind === "delete");
    expect(deleteLines.length).toBe(1);
    const del = deleteLines[0];
    if (!del) throw new Error("expected delete");
    expect(del.text).toBe("b");
    expect(del.oldRow).toBe(1);
  });

  test("hunk counts match line counts", () => {
    const result = diff("a\nb\nc\nd", "a\nx\nc\ny");
    for (const hunk of result.hunks) {
      const oldLines = hunk.lines.filter((l) => l.kind !== "insert").length;
      const newLines = hunk.lines.filter((l) => l.kind !== "delete").length;
      expect(oldLines).toBe(hunk.oldCount);
      expect(newLines).toBe(hunk.newCount);
    }
  });

  test("multiple separate changes produce separate hunks with enough context gap", () => {
    const old = Array.from({ length: 20 }, (_, i) => `line ${i}`).join("\n");
    const lines = old.split("\n");
    lines[2] = "changed 2";
    lines[17] = "changed 17";
    const result = diff(old, lines.join("\n"));
    expect(result.hunks.length).toBe(2);
  });

  test("both empty texts are equal", () => {
    const result = diff("", "");
    expect(result.isEqual).toBe(true);
    expect(result.hunks).toEqual([]);
  });

  test("context lines default to 3", () => {
    const old = Array.from({ length: 10 }, (_, i) => `line ${i}`).join("\n");
    const lines = old.split("\n");
    lines[5] = "changed";
    const result = diff(old, lines.join("\n"));
    expect(result.hunks.length).toBe(1);
    const hunk = result.hunks[0];
    if (!hunk) throw new Error("expected hunk");
    const equalBefore = hunk.lines.filter(
      (l, i) => l.kind === "equal" && i < hunk.lines.findIndex((x) => x.kind !== "equal"),
    );
    expect(equalBefore.length).toBeLessThanOrEqual(3);
  });

  test("custom context lines", () => {
    const old = Array.from({ length: 20 }, (_, i) => `line ${i}`).join("\n");
    const lines = old.split("\n");
    lines[10] = "changed";
    const result = diff(old, lines.join("\n"), { context: 1 });
    const hunk = result.hunks[0];
    if (!hunk) throw new Error("expected hunk");
    const equalBefore = hunk.lines.filter(
      (l, i) => l.kind === "equal" && i < hunk.lines.findIndex((x) => x.kind !== "equal"),
    );
    expect(equalBefore.length).toBeLessThanOrEqual(1);
  });
});
