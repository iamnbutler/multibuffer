/**
 * Tests for SearchController.findNearest() edge cases and multi-excerpt search.
 *
 * The existing search.test.ts covers the common case (cursor between results).
 * This file covers:
 *
 * findNearest() edge cases:
 * - Cursor is before all results → returns first
 * - Cursor is after all results → wraps to first
 * - Only one result → always returns it
 *
 * Multi-excerpt search:
 * - Finds results in both excerpts
 * - findNearest navigates across excerpt boundaries
 * - Navigation wraps across excerpt boundaries
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { createBuffer } from "../../src/buffer/buffer.ts";
import { Editor } from "../../src/editor/editor.ts";
import { SearchController } from "../../src/editor/search.ts";
import { createMultiBuffer } from "../../src/multibuffer/multibuffer.ts";
import type { MultiBufferRow } from "../../src/multibuffer/types.ts";
import { createBufferId, excerptRange, mbPoint, resetCounters } from "../helpers.ts";

beforeEach(() => {
  resetCounters();
});

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Single-excerpt setup: one buffer, one excerpt. */
function singleExcerpt(text: string): { editor: Editor; search: SearchController } {
  const buf = createBuffer(createBufferId(), text);
  const mb = createMultiBuffer();
  mb.addExcerpt(buf, excerptRange(0, text.split("\n").length));
  const editor = new Editor(mb);
  const search = new SearchController(editor);
  return { editor, search };
}

/**
 * Two-excerpt setup: two buffers, each one line, no trailing newline.
 * Layout:
 *   row 0: textA
 *   row 1: textB
 */
function twoExcerpts(
  textA: string,
  textB: string,
): { editor: Editor; search: SearchController } {
  const bufA = createBuffer(createBufferId(), textA);
  const bufB = createBuffer(createBufferId(), textB);
  const mb = createMultiBuffer();
  mb.addExcerpt(bufA, excerptRange(0, 1));
  mb.addExcerpt(bufB, excerptRange(0, 1));
  const editor = new Editor(mb);
  const search = new SearchController(editor);
  return { editor, search };
}

/**
 * Three-excerpt setup: three buffers, one line each.
 * Layout:
 *   row 0: textA
 *   row 1: textB
 *   row 2: textC
 */
function threeExcerpts(
  textA: string,
  textB: string,
  textC: string,
): { editor: Editor; search: SearchController } {
  const bufA = createBuffer(createBufferId(), textA);
  const bufB = createBuffer(createBufferId(), textB);
  const bufC = createBuffer(createBufferId(), textC);
  const mb = createMultiBuffer();
  mb.addExcerpt(bufA, excerptRange(0, 1));
  mb.addExcerpt(bufB, excerptRange(0, 1));
  mb.addExcerpt(bufC, excerptRange(0, 1));
  const editor = new Editor(mb);
  const search = new SearchController(editor);
  return { editor, search };
}

// ─── findNearest — before all results ─────────────────────────────────────

describe("findNearest — cursor before all results", () => {
  test("returns first result when cursor is at column 0 before first match", () => {
    // "line foo one" — "foo" starts at column 5
    const { editor, search } = singleExcerpt("line foo one");
    search.find("foo");
    expect(search.state.count).toBe(1);

    // cursor starts at (0,0) which is before "foo" at (0,5)
    editor.setCursor(mbPoint(0, 0));
    search.findNearest();
    expect(search.state.activeIndex).toBe(0);
  });

  test("returns first result when cursor is on an earlier row", () => {
    // Two-line text: "header\nfoo content"
    // "foo" is only on row 1
    const { editor, search } = singleExcerpt("header\nfoo content");
    search.find("foo");
    expect(search.state.count).toBe(1);

    // cursor at row 0 — before the only match
    editor.setCursor(mbPoint(0, 0));
    search.findNearest();
    expect(search.state.activeIndex).toBe(0);
  });

  test("returns index 0 when cursor is exactly at column 0, row 0", () => {
    const { editor, search } = singleExcerpt("foo bar foo baz foo");
    search.find("foo");
    expect(search.state.count).toBe(3);

    editor.setCursor(mbPoint(0, 0));
    // Column 0 is exactly where the first "foo" starts; column >= 0 condition
    // means nearestIndex = 0 (first match at or after cursor)
    search.findNearest();
    expect(search.state.activeIndex).toBe(0);
  });
});

// ─── findNearest — after all results (wrap-around) ─────────────────────────

describe("findNearest — cursor after all results wraps to first", () => {
  test("wraps to first result when cursor is after last match on same row", () => {
    const { editor, search } = singleExcerpt("foo bar foo");
    search.find("foo");
    expect(search.state.count).toBe(2);

    // "foo bar foo" — last "foo" ends at col 11; cursor past the end
    editor.setCursor(mbPoint(0, 11));
    search.findNearest();
    expect(search.state.activeIndex).toBe(0);
  });

  test("wraps to first result when cursor is on a row past all matches", () => {
    const { editor, search } = singleExcerpt("foo line\nend of text");
    search.find("foo");
    expect(search.state.count).toBe(1);

    // cursor on row 1 — past the only match which is on row 0
    editor.setCursor(mbPoint(1, 0));
    search.findNearest();
    expect(search.state.activeIndex).toBe(0);
  });

  test("wraps to first result when cursor is at end of last line", () => {
    // Three matches: row 0, row 1, row 2 — each at column 0
    const { editor, search } = threeExcerpts("foo line 1", "foo line 2", "foo line 3");
    search.find("foo");
    expect(search.state.count).toBe(3);

    // Move cursor past the last match (row 2, col 0)
    editor.setCursor(mbPoint(2, 10)); // end of "foo line 3"
    search.findNearest();
    // Should wrap to first
    expect(search.state.activeIndex).toBe(0);
  });
});

// ─── findNearest — single result ──────────────────────────────────────────

describe("findNearest — single result always activates it", () => {
  test("activates the only result when cursor is before it", () => {
    const { editor, search } = singleExcerpt("hello foo world");
    search.find("foo");
    expect(search.state.count).toBe(1);

    editor.setCursor(mbPoint(0, 0));
    search.findNearest();
    expect(search.state.activeIndex).toBe(0);
  });

  test("activates the only result (wraps) when cursor is after it", () => {
    const { editor, search } = singleExcerpt("hello foo world");
    search.find("foo");

    editor.setCursor(mbPoint(0, 15)); // after "hello foo world"
    search.findNearest();
    expect(search.state.activeIndex).toBe(0);
  });
});

// ─── Multi-excerpt search — basic ─────────────────────────────────────────

describe("SearchController — multi-excerpt basic search", () => {
  test("finds results in both excerpts", () => {
    const { search } = twoExcerpts("hello foo world", "another foo here");
    const count = search.find("foo");
    expect(count).toBe(2);
  });

  test("results are in excerpt order (row 0 before row 1)", () => {
    const { search } = twoExcerpts("hello foo world", "another foo here");
    search.find("foo");

    const resolved = search.resolveResults();
    expect(resolved.length).toBe(2);

    // First result is in row 0 (excerpt 1)
    expect(resolved[0]?.start.row).toBe(0);
    expect(resolved[0]?.start.column).toBe(6); // "hello " = 6 chars

    // Second result is in row 1 (excerpt 2)
    expect(resolved[1]?.start.row).toBe(1);
    expect(resolved[1]?.start.column).toBe(8); // "another " = 8 chars
  });

  test("search finds match in second excerpt only", () => {
    const { search } = twoExcerpts("no match here", "the target is here");
    const count = search.find("target");
    expect(count).toBe(1);

    const resolved = search.resolveResults();
    expect(resolved[0]?.start.row).toBe(1); // result in second excerpt
  });

  test("case-insensitive search across excerpts", () => {
    const { search } = twoExcerpts("Hello World", "hello world");
    const count = search.find("hello");
    expect(count).toBe(2);
  });
});

// ─── Multi-excerpt search — navigation ────────────────────────────────────

describe("SearchController — multi-excerpt findNearest navigation", () => {
  test("findNearest returns match in second excerpt when cursor is past first excerpt match", () => {
    // row 0: "hello target world" — "target" at col 6
    // row 1: "and target again"   — "target" at col 4
    const { editor, search } = twoExcerpts("hello target world", "and target again");
    search.find("target");
    expect(search.state.count).toBe(2);

    // Cursor past "hello target" in row 0
    editor.setCursor(mbPoint(0, 12));
    search.findNearest();
    // Should select the match in row 1 (second excerpt)
    expect(search.state.activeIndex).toBe(1);
  });

  test("findNearest returns first excerpt match when cursor is at row 0 before it", () => {
    const { editor, search } = twoExcerpts("hello target world", "and target again");
    search.find("target");

    editor.setCursor(mbPoint(0, 0)); // before "target" in row 0
    search.findNearest();
    expect(search.state.activeIndex).toBe(0);
  });

  test("findNearest wraps to first excerpt match when cursor is past all", () => {
    // row 0: "hello target" — match at col 6
    // row 1: "more target"  — match at col 5
    const { editor, search } = twoExcerpts("hello target", "more target");
    search.find("target");
    expect(search.state.count).toBe(2);

    // Cursor at end of last excerpt, past all results
    editor.setCursor(mbPoint(1, 11));
    search.findNearest();
    // Should wrap to index 0 (first excerpt's match)
    expect(search.state.activeIndex).toBe(0);
  });

  test("next() navigates from first excerpt to second excerpt", () => {
    const { search } = twoExcerpts("find this first", "find this second");
    search.find("find");
    expect(search.state.count).toBe(2);

    // After find(), activeIndex is 0 (first result in row 0)
    expect(search.state.activeIndex).toBe(0);

    // next() should advance to result in row 1
    search.next();
    expect(search.state.activeIndex).toBe(1);
  });

  test("next() wraps from second excerpt back to first", () => {
    const { search } = twoExcerpts("find this first", "find this second");
    search.find("find");

    search.next(); // -> index 1 (second excerpt)
    search.next(); // -> index 0 (wrap back to first excerpt)
    expect(search.state.activeIndex).toBe(0);
  });

  test("prev() navigates from second excerpt to first excerpt", () => {
    const { search } = twoExcerpts("find this first", "find this second");
    search.find("find");
    search.goTo(1); // Start at second excerpt's match

    search.prev();
    expect(search.state.activeIndex).toBe(0); // Back to first excerpt
  });
});

// ─── Multi-excerpt search — resolveResultsInViewport ─────────────────────

describe("SearchController — resolveResultsInViewport multi-excerpt", () => {
  test("returns only results within the viewport rows", () => {
    const { search } = threeExcerpts("foo row 0", "foo row 1", "foo row 2");
    search.find("foo");
    expect(search.state.count).toBe(3);

    // Viewport covering only rows 1-2 (second and third excerpts); endRow is exclusive
    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in test
    const visible = search.resolveResultsInViewport(1 as MultiBufferRow, 3 as MultiBufferRow);
    expect(visible.length).toBe(2);
    // Both visible results should be in rows 1 and 2
    expect(visible.some((r) => r.start.row === 1)).toBe(true);
    expect(visible.some((r) => r.start.row === 2)).toBe(true);
    // Row 0 result should not be included
    expect(visible.some((r) => r.start.row === 0)).toBe(false);
  });

  test("viewport covering only the first excerpt returns one result", () => {
    const { search } = threeExcerpts("foo row 0", "foo row 1", "foo row 2");
    search.find("foo");

    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in test
    const visible = search.resolveResultsInViewport(0 as MultiBufferRow, 1 as MultiBufferRow);
    expect(visible.length).toBe(1);
    expect(visible[0]?.start.row).toBe(0);
  });
});
