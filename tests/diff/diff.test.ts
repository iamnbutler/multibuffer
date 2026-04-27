/**
 * Tests for the line-level diff algorithm.
 */

import { describe, expect, test } from "bun:test";
import { diff, diffLines } from "../../src/diff/diff.ts";
import { formatHunkHeader } from "../../src/diff/helpers.ts";

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

describe("diffLines", () => {
  test("same reference returns isEqual immediately (fast path)", () => {
    const lines = ["a", "b", "c"];
    const result = diffLines(lines, lines);
    expect(result.isEqual).toBe(true);
    expect(result.hunks).toEqual([]);
  });

  test("identical content but different references returns isEqual", () => {
    const oldLines = ["hello", "world"];
    const newLines = ["hello", "world"];
    const result = diffLines(oldLines, newLines);
    expect(result.isEqual).toBe(true);
    expect(result.hunks).toEqual([]);
  });

  test("both empty arrays are equal", () => {
    const result = diffLines([], []);
    expect(result.isEqual).toBe(true);
    expect(result.hunks).toEqual([]);
  });

  test("empty to non-empty is all inserts", () => {
    const result = diffLines([], ["a", "b"]);
    expect(result.isEqual).toBe(false);
    expect(result.hunks.length).toBe(1);
    const hunk = result.hunks[0];
    if (!hunk) throw new Error("expected hunk");
    expect(hunk.lines[0]).toEqual({ kind: "insert", text: "a", oldRow: undefined, newRow: 0 });
    expect(hunk.lines[1]).toEqual({ kind: "insert", text: "b", oldRow: undefined, newRow: 1 });
  });

  test("non-empty to empty is all deletes", () => {
    const result = diffLines(["a", "b"], []);
    expect(result.isEqual).toBe(false);
    expect(result.hunks.length).toBe(1);
    const hunk = result.hunks[0];
    if (!hunk) throw new Error("expected hunk");
    expect(hunk.lines[0]).toEqual({ kind: "delete", text: "a", oldRow: 0, newRow: undefined });
    expect(hunk.lines[1]).toEqual({ kind: "delete", text: "b", oldRow: 1, newRow: undefined });
  });

  test("single line change produces one hunk", () => {
    const result = diffLines(["hello", "world"], ["hello", "earth"]);
    expect(result.isEqual).toBe(false);
    expect(result.hunks.length).toBe(1);
    const allLines = result.hunks.flatMap((h) => h.lines);
    expect(allLines.some((l) => l.kind === "delete" && l.text === "world")).toBe(true);
    expect(allLines.some((l) => l.kind === "insert" && l.text === "earth")).toBe(true);
  });

  test("row numbers match positions in original arrays", () => {
    const old = ["a", "b", "c"];
    const next = ["a", "x", "c"];
    const result = diffLines(old, next);
    const allLines = result.hunks.flatMap((h) => h.lines);
    const del = allLines.find((l) => l.kind === "delete");
    const ins = allLines.find((l) => l.kind === "insert");
    if (!del || !ins) throw new Error("expected delete and insert");
    expect(del.oldRow).toBe(1);
    expect(del.newRow).toBeUndefined();
    expect(ins.newRow).toBe(1);
    expect(ins.oldRow).toBeUndefined();
  });

  test("multiple separate changes produce separate hunks", () => {
    const oldLines = Array.from({ length: 20 }, (_, i) => `line ${i}`);
    const newLines = [...oldLines];
    newLines[1] = "changed 1";
    newLines[18] = "changed 18";
    const result = diffLines(oldLines, newLines);
    expect(result.hunks.length).toBe(2);
  });

  test("hunk oldCount/newCount match actual lines", () => {
    const result = diffLines(["a", "b", "c", "d"], ["a", "x", "c", "y"]);
    for (const hunk of result.hunks) {
      const oldCount = hunk.lines.filter((l) => l.kind !== "insert").length;
      const newCount = hunk.lines.filter((l) => l.kind !== "delete").length;
      expect(oldCount).toBe(hunk.oldCount);
      expect(newCount).toBe(hunk.newCount);
    }
  });

  test("custom context lines", () => {
    const oldLines = Array.from({ length: 20 }, (_, i) => `line ${i}`);
    const newLines = [...oldLines];
    newLines[10] = "changed";
    const result = diffLines(oldLines, newLines, { context: 1 });
    const hunk = result.hunks[0];
    if (!hunk) throw new Error("expected hunk");
    const changeIdx = hunk.lines.findIndex((l) => l.kind !== "equal");
    const equalBefore = hunk.lines.filter((l, i) => l.kind === "equal" && i < changeIdx);
    expect(equalBefore.length).toBeLessThanOrEqual(1);
  });

  test("produces same result as diff() on equivalent inputs", () => {
    const oldLines = ["a", "b", "c", "d"];
    const newLines = ["a", "x", "c", "y"];
    const fromDiff = diff(oldLines.join("\n"), newLines.join("\n"));
    const fromDiffLines = diffLines(oldLines, newLines);
    expect(fromDiffLines.isEqual).toBe(fromDiff.isEqual);
    expect(fromDiffLines.hunks.length).toBe(fromDiff.hunks.length);
    for (let i = 0; i < fromDiff.hunks.length; i++) {
      const dh = fromDiff.hunks[i];
      const dlh = fromDiffLines.hunks[i];
      if (!dh || !dlh) throw new Error("expected hunk");
      expect(dlh.oldStart).toBe(dh.oldStart);
      expect(dlh.oldCount).toBe(dh.oldCount);
      expect(dlh.newStart).toBe(dh.newStart);
      expect(dlh.newCount).toBe(dh.newCount);
    }
  });
});

describe("formatHunkHeader", () => {
  test("formats basic hunk header", () => {
    const result = formatHunkHeader({
      oldStart: 10,
      oldCount: 5,
      newStart: 12,
      newCount: 7,
    });
    expect(result).toBe("@@ -10,5 +12,7 @@");
  });

  test("single line count omits comma", () => {
    const result = formatHunkHeader({
      oldStart: 10,
      oldCount: 1,
      newStart: 12,
      newCount: 1,
    });
    expect(result).toBe("@@ -10 +12 @@");
  });

  test("mixed single and multiple counts", () => {
    const result = formatHunkHeader({
      oldStart: 5,
      oldCount: 1,
      newStart: 7,
      newCount: 3,
    });
    expect(result).toBe("@@ -5 +7,3 @@");
  });

  test("includes context when provided", () => {
    const result = formatHunkHeader({
      oldStart: 10,
      oldCount: 5,
      newStart: 12,
      newCount: 7,
      context: "function handleClick()",
    });
    expect(result).toBe("@@ -10,5 +12,7 @@ function handleClick()");
  });
});
