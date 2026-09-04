/**
 * Tests for unified diff hunk header construction.
 *
 * In the unified diff format an empty range is anchored to the line *before*
 * it rather than to a line of its own, so its start is not a line position and
 * must not be shifted to 1-based. `git diff` emits `@@ -0,0 +1,2 @@` for a new
 * file and `@@ -1,2 +0,0 @@` for a deleted one; these tests pin that
 * convention, using real `git diff` output as the oracle.
 */

import { describe, expect, test } from "bun:test";
import { diff } from "../../src/diff/diff.ts";
import { formatHunkHeader, hunkToHeader } from "../../src/diff/helpers.ts";

describe("hunkToHeader empty ranges", () => {
  test("a zero old count keeps its start unshifted", () => {
    const header = hunkToHeader({
      oldStart: 0,
      oldCount: 0,
      newStart: 0,
      newCount: 2,
      lines: [],
    });
    expect(header.oldStart).toBe(0);
    expect(header.newStart).toBe(1);
  });

  test("a zero new count keeps its start unshifted", () => {
    const header = hunkToHeader({
      oldStart: 0,
      oldCount: 2,
      newStart: 0,
      newCount: 0,
      lines: [],
    });
    expect(header.oldStart).toBe(1);
    expect(header.newStart).toBe(0);
  });

  test("a non-empty range is still converted to 1-based", () => {
    const header = hunkToHeader({
      oldStart: 9,
      oldCount: 5,
      newStart: 11,
      newCount: 7,
      lines: [],
    });
    expect(header.oldStart).toBe(10);
    expect(header.newStart).toBe(12);
  });
});

describe("hunk headers for whole-file changes", () => {
  test("adding every line of an empty file reads as git's new-file header", () => {
    const result = diff("", "hello\nworld");
    const hunk = result.hunks[0];
    expect(hunk).toBeDefined();
    if (!hunk) return;
    expect(formatHunkHeader(hunkToHeader(hunk))).toBe("@@ -0,0 +1,2 @@");
  });

  test("deleting every line reads as git's deleted-file header", () => {
    const result = diff("hello\nworld", "");
    const hunk = result.hunks[0];
    expect(hunk).toBeDefined();
    if (!hunk) return;
    expect(formatHunkHeader(hunkToHeader(hunk))).toBe("@@ -1,2 +0,0 @@");
  });

  test("a single added line uses the no-comma form on the new side", () => {
    const result = diff("", "hello", { context: 0 });
    const hunk = result.hunks[0];
    expect(hunk).toBeDefined();
    if (!hunk) return;
    expect(formatHunkHeader(hunkToHeader(hunk))).toBe("@@ -0,0 +1 @@");
  });
});
