/**
 * Tests for the line-level diff algorithm.
 */

import { describe, expect, test } from "bun:test";
import { diff, diffLines } from "../../src/diff/diff.ts";
import { formatHunkHeader, hunkToHeader } from "../../src/diff/helpers.ts";

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
  test("identical arrays produce no hunks", () => {
    const result = diffLines(["hello", "world"], ["hello", "world"]);
    expect(result.isEqual).toBe(true);
    expect(result.hunks).toEqual([]);
  });

  test("both empty arrays are equal", () => {
    const result = diffLines([], []);
    expect(result.isEqual).toBe(true);
    expect(result.hunks).toEqual([]);
  });

  test("empty old to non-empty new is all inserts", () => {
    const result = diffLines([], ["a", "b"]);
    expect(result.isEqual).toBe(false);
    expect(result.hunks.length).toBe(1);
    const hunk = result.hunks[0];
    if (!hunk) throw new Error("expected hunk");
    expect(hunk.lines.length).toBe(2);
    expect(hunk.lines[0]).toEqual({ kind: "insert", text: "a", oldRow: undefined, newRow: 0 });
    expect(hunk.lines[1]).toEqual({ kind: "insert", text: "b", oldRow: undefined, newRow: 1 });
  });

  test("non-empty old to empty new is all deletes", () => {
    const result = diffLines(["a", "b"], []);
    expect(result.isEqual).toBe(false);
    const allLines = result.hunks.flatMap((h) => h.lines);
    expect(allLines.every((l) => l.kind === "delete")).toBe(true);
    expect(allLines.length).toBe(2);
  });

  test("single line change", () => {
    const result = diffLines(["hello", "world"], ["hello", "earth"]);
    expect(result.isEqual).toBe(false);
    const allLines = result.hunks.flatMap((h) => h.lines);
    const deleteLines = allLines.filter((l) => l.kind === "delete");
    const insertLines = allLines.filter((l) => l.kind === "insert");
    expect(deleteLines.length).toBe(1);
    expect(deleteLines[0]?.text).toBe("world");
    expect(insertLines.length).toBe(1);
    expect(insertLines[0]?.text).toBe("earth");
  });

  test("produces same result as diff() for equivalent content", () => {
    const oldLines = ["a", "b", "c", "d"];
    const newLines = ["a", "x", "c", "d"];
    const fromDiff = diff(oldLines.join("\n"), newLines.join("\n"));
    const fromDiffLines = diffLines(oldLines, newLines);
    expect(fromDiffLines.isEqual).toBe(fromDiff.isEqual);
    expect(fromDiffLines.hunks.length).toBe(fromDiff.hunks.length);
    const dHunk = fromDiff.hunks[0];
    const dlHunk = fromDiffLines.hunks[0];
    if (!dHunk || !dlHunk) throw new Error("expected hunk");
    expect(dlHunk.oldCount).toBe(dHunk.oldCount);
    expect(dlHunk.newCount).toBe(dHunk.newCount);
    expect(dlHunk.lines.map((l) => l.kind)).toEqual(dHunk.lines.map((l) => l.kind));
  });

  test("respects custom context option", () => {
    const oldLines = Array.from({ length: 20 }, (_, i) => `line ${i}`);
    const newLines = [...oldLines];
    newLines[10] = "changed";
    const result = diffLines(oldLines, newLines, { context: 1 });
    const hunk = result.hunks[0];
    if (!hunk) throw new Error("expected hunk");
    const equalBefore = hunk.lines.filter(
      (l, i) => l.kind === "equal" && i < hunk.lines.findIndex((x) => x.kind !== "equal"),
    );
    expect(equalBefore.length).toBeLessThanOrEqual(1);
  });

  test("multiple separate changes produce separate hunks", () => {
    const oldLines = Array.from({ length: 20 }, (_, i) => `line ${i}`);
    const newLines = [...oldLines];
    newLines[2] = "changed 2";
    newLines[17] = "changed 17";
    const result = diffLines(oldLines, newLines);
    expect(result.hunks.length).toBe(2);
  });
});

describe("hunkToHeader", () => {
  test("converts 0-based DiffHunk indices to 1-based HunkHeader", () => {
    const hunk = {
      oldStart: 0,
      oldCount: 3,
      newStart: 0,
      newCount: 4,
      lines: [],
    };
    const header = hunkToHeader(hunk);
    expect(header.oldStart).toBe(1);
    expect(header.newStart).toBe(1);
  });

  test("preserves oldCount and newCount unchanged", () => {
    const hunk = {
      oldStart: 9,
      oldCount: 5,
      newStart: 11,
      newCount: 7,
      lines: [],
    };
    const header = hunkToHeader(hunk);
    expect(header.oldCount).toBe(5);
    expect(header.newCount).toBe(7);
  });

  test("adds 1 to both start positions", () => {
    const hunk = {
      oldStart: 4,
      oldCount: 2,
      newStart: 6,
      newCount: 2,
      lines: [],
    };
    const header = hunkToHeader(hunk);
    expect(header.oldStart).toBe(5);
    expect(header.newStart).toBe(7);
  });

  test("result is suitable input for formatHunkHeader", () => {
    const hunk = {
      oldStart: 9,
      oldCount: 5,
      newStart: 11,
      newCount: 7,
      lines: [],
    };
    const formatted = formatHunkHeader(hunkToHeader(hunk));
    expect(formatted).toBe("@@ -10,5 +12,7 @@");
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
