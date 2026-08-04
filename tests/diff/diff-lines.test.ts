/**
 * Tests for `diffLines()` — the pre-split-array entry point to the line diff.
 *
 * `diffLines()` is public API (exported from `src/diff/index.ts`) but has no
 * callers inside this repository: every internal diff path goes through the
 * string-based `diff()`. That makes it the one diff entry point where a
 * regression would not be caught by any other test.
 *
 * The strongest available oracle is `diff()` itself, which is well covered by
 * `tests/diff/diff.test.ts` and shares `myersDiff`/`buildHunks` with
 * `diffLines()`. So alongside direct assertions, these tests pin the
 * equivalence `diffLines(a.split("\n"), b.split("\n")) === diff(a, b)`, plus
 * the structural invariants a hunk list must satisfy.
 *
 * @see tests/diff/diff.test.ts
 */

import { describe, expect, test } from "bun:test";
import { diff, diffLines } from "../../src/diff/diff.ts";
import type { DiffResult } from "../../src/diff/types.ts";
import { mulberry32, randomString } from "../property-helpers.ts";

/**
 * Stable structural rendering of a diff, for comparing two results by value.
 * Covers every field callers can observe, so an equality assertion on this
 * string is an assertion about the whole result.
 */
function render(result: DiffResult): string {
  return JSON.stringify({
    isEqual: result.isEqual,
    hunks: result.hunks.map((hunk) => ({
      oldStart: hunk.oldStart,
      oldCount: hunk.oldCount,
      newStart: hunk.newStart,
      newCount: hunk.newCount,
      lines: hunk.lines.map((line) => [line.kind, line.text, line.oldRow, line.newRow]),
    })),
  });
}

/** `diff()` treats "" as zero lines rather than one empty line; mirror that. */
function splitLikeDiff(text: string): string[] {
  return text === "" ? [] : text.split("\n");
}

function firstHunk(result: DiffResult) {
  const hunk = result.hunks[0];
  if (!hunk) throw new Error("expected at least one hunk");
  return hunk;
}

describe("diffLines", () => {
  test("identical line arrays are equal and produce no hunks", () => {
    const result = diffLines(["hello", "world"], ["hello", "world"]);
    expect(result.isEqual).toBe(true);
    expect(result.hunks).toEqual([]);
  });

  test("two empty arrays are equal", () => {
    const result = diffLines([], []);
    expect(result.isEqual).toBe(true);
    expect(result.hunks).toEqual([]);
  });

  test("empty to non-empty is all inserts", () => {
    const result = diffLines([], ["a", "b"]);
    expect(result.isEqual).toBe(false);
    const hunk = firstHunk(result);
    expect(hunk.lines).toEqual([
      { kind: "insert", text: "a", oldRow: undefined, newRow: 0 },
      { kind: "insert", text: "b", oldRow: undefined, newRow: 1 },
    ]);
    expect(hunk.oldCount).toBe(0);
    expect(hunk.newCount).toBe(2);
  });

  test("non-empty to empty is all deletes", () => {
    const result = diffLines(["a", "b"], []);
    expect(result.isEqual).toBe(false);
    const hunk = firstHunk(result);
    expect(hunk.lines).toEqual([
      { kind: "delete", text: "a", oldRow: 0, newRow: undefined },
      { kind: "delete", text: "b", oldRow: 1, newRow: undefined },
    ]);
    expect(hunk.oldCount).toBe(2);
    expect(hunk.newCount).toBe(0);
  });

  test("a changed line becomes a delete/insert pair with surrounding context", () => {
    const result = diffLines(["a", "b", "c"], ["a", "x", "c"]);
    expect(result.isEqual).toBe(false);
    const hunk = firstHunk(result);
    expect(hunk.lines).toEqual([
      { kind: "equal", text: "a", oldRow: 0, newRow: 0 },
      { kind: "delete", text: "b", oldRow: 1, newRow: undefined },
      { kind: "insert", text: "x", oldRow: undefined, newRow: 1 },
      { kind: "equal", text: "c", oldRow: 2, newRow: 2 },
    ]);
  });

  test("insertion in the middle keeps surrounding lines equal", () => {
    const result = diffLines(["a", "c"], ["a", "b", "c"]);
    const inserts = result.hunks.flatMap((h) => h.lines).filter((l) => l.kind === "insert");
    expect(inserts.length).toBe(1);
    const inserted = inserts[0];
    if (!inserted) throw new Error("expected an insert line");
    expect(inserted.text).toBe("b");
    expect(inserted.newRow).toBe(1);
    expect(inserted.oldRow).toBeUndefined();
  });

  test("deletion in the middle keeps surrounding lines equal", () => {
    const result = diffLines(["a", "b", "c"], ["a", "c"]);
    const deletes = result.hunks.flatMap((h) => h.lines).filter((l) => l.kind === "delete");
    expect(deletes.length).toBe(1);
    const deleted = deletes[0];
    if (!deleted) throw new Error("expected a delete line");
    expect(deleted.text).toBe("b");
    expect(deleted.oldRow).toBe(1);
    expect(deleted.newRow).toBeUndefined();
  });

  test("empty strings are ordinary lines, not absent ones", () => {
    // Unlike diff(), which maps the text "" to zero lines, diffLines() is given
    // the array directly — so [""] is one empty line and differs from [].
    expect(diffLines([""], [""]).isEqual).toBe(true);
    expect(diffLines([], [""]).isEqual).toBe(false);
    expect(diffLines(["", ""], [""]).isEqual).toBe(false);
  });

  test("no line is shared between two arrays with nothing in common", () => {
    const result = diffLines(["a", "b"], ["x", "y"]);
    expect(result.isEqual).toBe(false);
    const kinds = result.hunks.flatMap((h) => h.lines).map((l) => l.kind);
    expect(kinds).not.toContain("equal");
    expect(kinds.filter((k) => k === "delete").length).toBe(2);
    expect(kinds.filter((k) => k === "insert").length).toBe(2);
  });
});

describe("diffLines context option", () => {
  const oldLines = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
  const newLines = ["a", "b", "c", "d", "E", "f", "g", "h", "i", "j"];

  test("defaults to 3 context lines on each side", () => {
    const hunk = firstHunk(diffLines(oldLines, newLines));
    const equals = hunk.lines.filter((l) => l.kind === "equal");
    expect(equals.map((l) => l.text)).toEqual(["b", "c", "d", "f", "g", "h"]);
  });

  test("honours a custom context width", () => {
    const hunk = firstHunk(diffLines(oldLines, newLines, { context: 1 }));
    const equals = hunk.lines.filter((l) => l.kind === "equal");
    expect(equals.map((l) => l.text)).toEqual(["d", "f"]);
  });

  test("changes far enough apart produce separate hunks", () => {
    const before = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const after = ["A", "b", "c", "d", "e", "f", "g", "H"];
    expect(diffLines(before, after, { context: 1 }).hunks.length).toBe(2);
    // With context 3 the two changes are still far enough apart to stay split.
    expect(diffLines(before, after, { context: 3 }).hunks.length).toBe(2);
  });

  test("a wide enough context merges nearby changes into one hunk", () => {
    const before = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const after = ["A", "b", "c", "d", "e", "f", "g", "H"];
    expect(diffLines(before, after, { context: 10 }).hunks.length).toBe(1);
  });

  test("context 0 splits a modification into delete-only and insert-only hunks", () => {
    // Characterising current behaviour, which differs from `diff -U0`: with no
    // context the delete and the insert are not merged into a single hunk, and
    // the absent side reports a start of 0 as a fallback rather than a real row.
    const hunks = diffLines(oldLines, newLines, { context: 0 }).hunks;
    expect(hunks.length).toBe(2);
    const [deleteHunk, insertHunk] = hunks;
    if (!deleteHunk || !insertHunk) throw new Error("expected two hunks");
    expect(deleteHunk.lines.map((l) => l.kind)).toEqual(["delete"]);
    expect(deleteHunk.oldStart).toBe(4);
    expect(deleteHunk.oldCount).toBe(1);
    expect(deleteHunk.newCount).toBe(0);
    expect(deleteHunk.newStart).toBe(0);
    expect(insertHunk.lines.map((l) => l.kind)).toEqual(["insert"]);
    expect(insertHunk.newStart).toBe(4);
    expect(insertHunk.newCount).toBe(1);
    expect(insertHunk.oldCount).toBe(0);
    expect(insertHunk.oldStart).toBe(0);
  });
});

describe("diffLines agrees with diff", () => {
  const cases: Array<[string, string, string]> = [
    ["identical", "a\nb\nc", "a\nb\nc"],
    ["single change", "a\nb\nc", "a\nx\nc"],
    ["insertion", "a\nc", "a\nb\nc"],
    ["deletion", "a\nb\nc", "a\nc"],
    ["append", "a\nb", "a\nb\nc"],
    ["prepend", "b\nc", "a\nb\nc"],
    ["empty to text", "", "a\nb"],
    ["text to empty", "a\nb", ""],
    ["both empty", "", ""],
    ["blank lines", "a\n\n\nb", "a\n\nb"],
    ["all replaced", "a\nb\nc", "x\ny\nz"],
  ];

  for (const [name, oldText, newText] of cases) {
    test(`matches diff() for ${name}`, () => {
      const viaText = diff(oldText, newText);
      const viaLines = diffLines(splitLikeDiff(oldText), splitLikeDiff(newText));
      expect(render(viaLines)).toBe(render(viaText));
    });
  }

  test("matches diff() across randomly generated texts", () => {
    const rng = mulberry32(0xd1ff11e5);
    for (let i = 0; i < 400; i++) {
      const oldText = randomString(rng, 24);
      const newText = randomString(rng, 24);
      const viaText = diff(oldText, newText);
      const viaLines = diffLines(splitLikeDiff(oldText), splitLikeDiff(newText));
      expect(render(viaLines)).toBe(render(viaText));
    }
  });

  test("matches diff() for non-default context widths", () => {
    const rng = mulberry32(0x0c07e47);
    for (const context of [0, 1, 5]) {
      for (let i = 0; i < 100; i++) {
        const oldText = randomString(rng, 24);
        const newText = randomString(rng, 24);
        const viaText = diff(oldText, newText, { context });
        const viaLines = diffLines(splitLikeDiff(oldText), splitLikeDiff(newText), { context });
        expect(render(viaLines)).toBe(render(viaText));
      }
    }
  });
});

describe("diffLines result invariants", () => {
  test("hunk counts match the lines each side actually contributes", () => {
    const rng = mulberry32(0x1a5ec001);
    for (let i = 0; i < 300; i++) {
      const oldLines = splitLikeDiff(randomString(rng, 24));
      const newLines = splitLikeDiff(randomString(rng, 24));
      for (const hunk of diffLines(oldLines, newLines).hunks) {
        const fromOld = hunk.lines.filter((l) => l.kind !== "insert");
        const fromNew = hunk.lines.filter((l) => l.kind !== "delete");
        expect(hunk.oldCount).toBe(fromOld.length);
        expect(hunk.newCount).toBe(fromNew.length);
      }
    }
  });

  test("row numbers increase strictly within a hunk on each side", () => {
    const rng = mulberry32(0x0abcde01);
    for (let i = 0; i < 300; i++) {
      const oldLines = splitLikeDiff(randomString(rng, 24));
      const newLines = splitLikeDiff(randomString(rng, 24));
      for (const hunk of diffLines(oldLines, newLines).hunks) {
        let previousOld = -1;
        let previousNew = -1;
        for (const line of hunk.lines) {
          if (line.oldRow !== undefined) {
            expect(line.oldRow).toBeGreaterThan(previousOld);
            previousOld = line.oldRow;
          }
          if (line.newRow !== undefined) {
            expect(line.newRow).toBeGreaterThan(previousNew);
            previousNew = line.newRow;
          }
        }
      }
    }
  });

  test("line kinds carry exactly the row numbers they should", () => {
    const rng = mulberry32(0x12045);
    for (let i = 0; i < 300; i++) {
      const oldLines = splitLikeDiff(randomString(rng, 24));
      const newLines = splitLikeDiff(randomString(rng, 24));
      for (const hunk of diffLines(oldLines, newLines).hunks) {
        for (const line of hunk.lines) {
          if (line.kind === "insert") {
            expect(line.oldRow).toBeUndefined();
            expect(line.newRow).not.toBeUndefined();
          } else if (line.kind === "delete") {
            expect(line.newRow).toBeUndefined();
            expect(line.oldRow).not.toBeUndefined();
          } else {
            expect(line.oldRow).not.toBeUndefined();
            expect(line.newRow).not.toBeUndefined();
          }
        }
      }
    }
  });

  test("a hunk line's text is the line it points at in the source array", () => {
    const rng = mulberry32(0x7e77a1);
    for (let i = 0; i < 300; i++) {
      const oldLines = splitLikeDiff(randomString(rng, 24));
      const newLines = splitLikeDiff(randomString(rng, 24));
      for (const hunk of diffLines(oldLines, newLines).hunks) {
        for (const line of hunk.lines) {
          if (line.oldRow !== undefined) expect(line.text).toBe(oldLines[line.oldRow] ?? "");
          if (line.newRow !== undefined) expect(line.text).toBe(newLines[line.newRow] ?? "");
        }
      }
    }
  });

  test("a full-context diff reconstructs both inputs exactly", () => {
    // With context wide enough to cover the whole file, every line appears in a
    // hunk — so filtering by kind must rebuild each side verbatim. This is the
    // strongest single check that no line is dropped, duplicated or reordered.
    const rng = mulberry32(0xfc0011);
    for (let i = 0; i < 300; i++) {
      const oldLines = splitLikeDiff(randomString(rng, 24));
      const newLines = splitLikeDiff(randomString(rng, 24));
      const result = diffLines(oldLines, newLines, { context: 1000 });
      if (result.isEqual) continue;
      const all = result.hunks.flatMap((h) => h.lines);
      expect(all.filter((l) => l.kind !== "insert").map((l) => l.text)).toEqual(oldLines);
      expect(all.filter((l) => l.kind !== "delete").map((l) => l.text)).toEqual(newLines);
    }
  });

  test("isEqual is true exactly when the two arrays hold the same lines", () => {
    const rng = mulberry32(0xe00a11);
    for (let i = 0; i < 300; i++) {
      const oldLines = splitLikeDiff(randomString(rng, 20));
      const newLines = splitLikeDiff(randomString(rng, 20));
      const result = diffLines(oldLines, newLines);
      const sameContent =
        oldLines.length === newLines.length && oldLines.every((l, idx) => l === newLines[idx]);
      expect(result.isEqual).toBe(sameContent);
      // A result reporting equality must not also report changes.
      if (result.isEqual) expect(result.hunks).toEqual([]);
      else expect(result.hunks.length).toBeGreaterThan(0);
    }
  });
});

describe("diffLines inputs that shortcut paths rely on", () => {
  // `diffLines()` is the exclusive target of two open optimisation PRs — one
  // adding an `oldLines === newLines` reference check, one skipping the
  // `edits.every()` scan when the two lengths differ. Neither had a test to
  // hold it honest; these pin the behaviour each one assumes.

  test("passing the same array twice reports equality", () => {
    const lines = ["a", "b", "c"];
    const result = diffLines(lines, lines);
    expect(result.isEqual).toBe(true);
    expect(result.hunks).toEqual([]);
  });

  test("equal content in two distinct arrays also reports equality", () => {
    const lines = Array.from({ length: 200 }, (_, i) => `line ${i}`);
    const copy = lines.slice();
    expect(lines).not.toBe(copy);
    const result = diffLines(lines, copy);
    expect(result.isEqual).toBe(true);
    expect(result.hunks).toEqual([]);
  });

  test("arrays of differing length are never reported equal", () => {
    const rng = mulberry32(0x1e4610);
    for (let i = 0; i < 200; i++) {
      const oldLines = splitLikeDiff(randomString(rng, 20));
      const newLines = splitLikeDiff(randomString(rng, 20));
      if (oldLines.length === newLines.length) continue;
      expect(diffLines(oldLines, newLines).isEqual).toBe(false);
    }
    // And the smallest such case, explicitly.
    expect(diffLines(["a"], ["a", "a"]).isEqual).toBe(false);
    expect(diffLines([], [""]).isEqual).toBe(false);
  });

  test("does not mutate either input array", () => {
    const oldLines = ["a", "b", "c"];
    const newLines = ["a", "x", "c", "d"];
    const oldSnapshot = oldLines.slice();
    const newSnapshot = newLines.slice();
    diffLines(oldLines, newLines);
    expect(oldLines).toEqual(oldSnapshot);
    expect(newLines).toEqual(newSnapshot);
  });
});
