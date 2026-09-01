/**
 * Tests for SearchController - find/replace functionality.
 *
 * Tests anchor-based result tracking, navigation, and replace operations.
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { createBuffer } from "../../src/buffer/buffer.ts";
import { Editor } from "../../src/editor/editor.ts";
import { SearchController } from "../../src/editor/search.ts";
import { createMultiBuffer } from "../../src/multibuffer/multibuffer.ts";
import type { MultiBuffer, MultiBufferRow } from "../../src/multibuffer/types.ts";
import {
  createBufferId,
  excerptRange,
  expectPoint,
  mbPoint,
  resetCounters,
} from "../helpers.ts";

/** Create a multibuffer with a single excerpt containing the given text. */
function setup(text: string): { mb: MultiBuffer; editor: Editor; search: SearchController } {
  const buf = createBuffer(createBufferId(), text);
  const mb = createMultiBuffer();
  mb.addExcerpt(buf, excerptRange(0, text.split("\n").length));
  const editor = new Editor(mb);
  const search = new SearchController(editor);
  return { mb, editor, search };
}

/** Read the full text content from the multibuffer snapshot. */
function getText(mb: MultiBuffer): string {
  const snap = mb.snapshot();
  // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in test
  const lines = snap.lines(0 as MultiBufferRow, snap.lineCount as MultiBufferRow);
  return lines.join("\n");
}

beforeEach(() => {
  resetCounters();
});

// ─── Basic Search ───────────────────────────────────────────────────

describe("SearchController - Basic Search", () => {
  test("find returns count of matches", () => {
    const { search } = setup("foo bar foo baz foo");
    const count = search.find("foo");
    expect(count).toBe(3);
    expect(search.state.count).toBe(3);
  });

  test("find with no matches returns 0", () => {
    const { search } = setup("hello world");
    const count = search.find("xyz");
    expect(count).toBe(0);
    expect(search.hasResults).toBe(false);
  });

  test("find with empty query returns 0", () => {
    const { search } = setup("hello world");
    const count = search.find("");
    expect(count).toBe(0);
  });

  test("find is case-insensitive by default", () => {
    const { search } = setup("FOO foo Foo fOO");
    const count = search.find("foo");
    expect(count).toBe(4);
  });

  test("find with caseSensitive option", () => {
    const { search } = setup("FOO foo Foo fOO");
    const count = search.find("foo", { caseSensitive: true });
    expect(count).toBe(1);
  });

  test("find across multiple lines", () => {
    const { search } = setup("foo\nbar\nfoo\nbaz");
    const count = search.find("foo");
    expect(count).toBe(2);
  });

  test("activeIndex starts at 0 with results", () => {
    const { search } = setup("foo bar foo");
    search.find("foo");
    expect(search.state.activeIndex).toBe(0);
  });

  test("activeIndex is -1 with no results", () => {
    const { search } = setup("hello world");
    search.find("xyz");
    expect(search.state.activeIndex).toBe(-1);
  });

  test("state contains query and options", () => {
    const { search } = setup("test");
    search.find("test", { caseSensitive: true, wholeWord: true });
    expect(search.state.query).toBe("test");
    expect(search.state.options.caseSensitive).toBe(true);
    expect(search.state.options.wholeWord).toBe(true);
  });
});

// ─── Whole Word Search ──────────────────────────────────────────────

describe("SearchController - Whole Word", () => {
  test("wholeWord matches only complete words", () => {
    const { search } = setup("foo foobar barfoo foo");
    const count = search.find("foo", { wholeWord: true });
    expect(count).toBe(2);
  });

  test("wholeWord respects word boundaries", () => {
    const { search } = setup("test testing tested test");
    const count = search.find("test", { wholeWord: true });
    expect(count).toBe(2);
  });
});

// ─── Regex Search ───────────────────────────────────────────────────

describe("SearchController - Regex", () => {
  test("regex search with pattern", () => {
    const { search } = setup("foo123 bar456 baz789");
    const count = search.find("\\d+", { regex: true });
    expect(count).toBe(3);
  });

  test("regex search with groups", () => {
    const { search } = setup("foo bar baz");
    const count = search.find("(foo|baz)", { regex: true });
    expect(count).toBe(2);
  });

  test("invalid regex returns 0 matches", () => {
    const { search } = setup("foo bar");
    const count = search.find("[invalid", { regex: true });
    expect(count).toBe(0);
  });

  test("regex case sensitivity", () => {
    const { search } = setup("FOO foo Foo");
    const countInsensitive = search.find("foo", { regex: true });
    expect(countInsensitive).toBe(3);

    const countSensitive = search.find("foo", { regex: true, caseSensitive: true });
    expect(countSensitive).toBe(1);
  });
});

// ─── Navigation ─────────────────────────────────────────────────────

describe("SearchController - Navigation", () => {
  test("next advances through results", () => {
    const { search } = setup("foo bar foo baz foo");
    search.find("foo");

    expect(search.state.activeIndex).toBe(0);
    search.next();
    expect(search.state.activeIndex).toBe(1);
    search.next();
    expect(search.state.activeIndex).toBe(2);
  });

  test("next wraps to first result", () => {
    const { search } = setup("foo bar foo");
    search.find("foo");

    search.next(); // -> 1
    search.next(); // -> 0 (wrap)
    expect(search.state.activeIndex).toBe(0);
  });

  test("prev moves backwards through results", () => {
    const { search } = setup("foo bar foo baz foo");
    search.find("foo");
    search.goTo(2);

    search.prev();
    expect(search.state.activeIndex).toBe(1);
    search.prev();
    expect(search.state.activeIndex).toBe(0);
  });

  test("prev wraps to last result", () => {
    const { search } = setup("foo bar foo");
    search.find("foo");

    search.prev(); // -> 1 (wrap from 0)
    expect(search.state.activeIndex).toBe(1);
  });

  test("goTo jumps to specific index", () => {
    const { search } = setup("a b a c a d a");
    search.find("a");

    expect(search.goTo(3)).toBe(true);
    expect(search.state.activeIndex).toBe(3);
  });

  test("goTo returns false for invalid index", () => {
    const { search } = setup("foo bar foo");
    search.find("foo");

    expect(search.goTo(-1)).toBe(false);
    expect(search.goTo(10)).toBe(false);
  });

  test("next returns false with no results", () => {
    const { search } = setup("hello");
    search.find("xyz");
    expect(search.next()).toBe(false);
  });

  test("prev returns false with no results", () => {
    const { search } = setup("hello");
    search.find("xyz");
    expect(search.prev()).toBe(false);
  });

  test("navigation selects match in editor", () => {
    const { editor, search } = setup("hello foo world");
    search.find("foo");

    // First match should be selected
    const selection = editor.selection;
    expect(selection).toBeDefined();

    // Get selected text
    const selectedText = editor.getSelectedText();
    expect(selectedText).toBe("foo");
  });

  test("findNearest finds closest result after cursor", () => {
    const { editor, search } = setup("foo bar foo baz foo");
    search.find("foo");

    // Move cursor past first two matches
    editor.setCursor(mbPoint(0, 12)); // After "foo bar foo "

    search.findNearest();
    // Should select the third "foo" (nearest after cursor)
    expect(search.state.activeIndex).toBe(2);
  });
});

// ─── Replace ────────────────────────────────────────────────────────

describe("SearchController - Replace", () => {
  test("replaceActive replaces current match", () => {
    const { mb, search } = setup("foo bar foo");
    search.find("foo");

    const result = search.replaceActive("baz");
    expect(result).toBe(true);
    expect(getText(mb)).toBe("baz bar foo");
  });

  test("replaceActive returns false with no match", () => {
    const { search } = setup("hello world");
    search.find("xyz");
    expect(search.replaceActive("test")).toBe(false);
  });

  test("replaceAll replaces all matches", () => {
    const { mb, search } = setup("foo bar foo baz foo");
    search.find("foo");

    const count = search.replaceAll("qux");
    expect(count).toBe(3);
    expect(getText(mb)).toBe("qux bar qux baz qux");
  });

  test("replaceAll with empty replacement", () => {
    const { mb, search } = setup("foo bar foo");
    search.find("foo");

    search.replaceAll("");
    expect(getText(mb)).toBe(" bar ");
  });

  test("replaceAll preserves text not matched", () => {
    const { mb, search } = setup("hello\nfoo\nworld\nfoo\nend");
    search.find("foo");

    search.replaceAll("bar");
    expect(getText(mb)).toBe("hello\nbar\nworld\nbar\nend");
  });

  test("replaceAll with multiline matches", () => {
    const { mb, search } = setup("line foo one\nline foo two\nline foo three");
    search.find("foo");

    const count = search.replaceAll("bar");
    expect(count).toBe(3);
    expect(getText(mb)).toBe("line bar one\nline bar two\nline bar three");
  });
});

// ─── Anchor Stability ───────────────────────────────────────────────

describe("SearchController - Anchor Stability", () => {
  test("results survive edits before matches", () => {
    const { mb, editor, search } = setup("AAA foo BBB");
    search.find("foo");

    // Edit before the match
    editor.setCursor(mbPoint(0, 0));
    editor.dispatch({ type: "insertText", text: "XXX" });

    // Results should be refreshed and still valid
    expect(search.state.count).toBe(1);
    expect(getText(mb)).toBe("XXXAAA foo BBB");

    // Navigation should still work
    search.goTo(0);
    expect(editor.getSelectedText()).toBe("foo");
  });

  test("results survive edits after matches", () => {
    const { mb, editor, search } = setup("foo AAA BBB");
    search.find("foo");

    // Edit after the match
    editor.setCursor(mbPoint(0, 11));
    editor.dispatch({ type: "insertText", text: " CCC" });

    expect(search.state.count).toBe(1);
    expect(getText(mb)).toBe("foo AAA BBB CCC");

    search.goTo(0);
    expect(editor.getSelectedText()).toBe("foo");
  });

  test("replace updates result count", () => {
    const { search } = setup("foo bar foo baz foo");
    search.find("foo");
    expect(search.state.count).toBe(3);

    search.replaceActive("qux");
    // Should be updated after replacement
    expect(search.state.count).toBe(2);
  });
});

// ─── resolveResults ─────────────────────────────────────────────────

describe("SearchController - resolveResults", () => {
  test("resolveResults returns positions for all matches", () => {
    const { search } = setup("foo bar foo");
    search.find("foo");

    const resolved = search.resolveResults();
    expect(resolved.length).toBe(2);

    expect(resolved[0]?.start).toEqual(mbPoint(0, 0));
    expect(resolved[0]?.end).toEqual(mbPoint(0, 3));

    expect(resolved[1]?.start).toEqual(mbPoint(0, 8));
    expect(resolved[1]?.end).toEqual(mbPoint(0, 11));
  });

  test("resolveResults works across lines", () => {
    const { search } = setup("foo\nbar\nfoo");
    search.find("foo");

    const resolved = search.resolveResults();
    expect(resolved.length).toBe(2);

    expectPoint(resolved[0]?.start ?? mbPoint(-1, -1), 0, 0);
    expectPoint(resolved[1]?.start ?? mbPoint(-1, -1), 2, 0);
  });

  test("resolveResultsInViewport filters by excerpt bounds", () => {
    // Create multiple excerpts - viewport filtering works at excerpt level
    const buf1 = createBuffer(createBufferId(), "foo line 1");
    const buf2 = createBuffer(createBufferId(), "foo line 2");
    const buf3 = createBuffer(createBufferId(), "foo line 3");

    const mb = createMultiBuffer();
    mb.addExcerpt(buf1, excerptRange(0, 1)); // rows 0
    mb.addExcerpt(buf2, excerptRange(0, 1)); // rows 1
    mb.addExcerpt(buf3, excerptRange(0, 1)); // rows 2

    const editor = new Editor(mb);
    const search = new SearchController(editor);
    search.find("foo");

    expect(search.state.count).toBe(3);

    // Filter to viewport containing only the middle excerpt (row 1)
    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in test
    const visible = search.resolveResultsInViewport(1 as MultiBufferRow, 2 as MultiBufferRow);

    // Only the match in the middle excerpt should be visible
    expect(visible.length).toBe(1);
    expect(visible[0]?.index).toBe(1);
  });
});

// ─── Clear and Dispose ──────────────────────────────────────────────

describe("SearchController - Clear and Dispose", () => {
  test("clear removes all results", () => {
    const { search } = setup("foo bar foo");
    search.find("foo");
    expect(search.state.count).toBe(2);

    search.clear();
    expect(search.state.count).toBe(0);
    expect(search.state.query).toBe("");
    expect(search.hasResults).toBe(false);
  });

  test("dispose prevents further use", () => {
    const { search } = setup("foo bar foo");
    search.find("foo");
    search.dispose();

    expect(search.disposed).toBe(true);
    expect(() => search.find("foo")).toThrow("disposed");
  });

  test("dispose is idempotent", () => {
    const { search } = setup("foo");
    search.dispose();
    search.dispose(); // Should not throw
    expect(search.disposed).toBe(true);
  });
});

// ─── Edge Cases ─────────────────────────────────────────────────────

describe("SearchController - Edge Cases", () => {
  test("search in empty document", () => {
    const { search } = setup("");
    const count = search.find("foo");
    expect(count).toBe(0);
  });

  test("search for newline character", () => {
    const { search } = setup("foo\nbar");
    // Newlines in the joined text should be findable
    const count = search.find("\n");
    expect(count).toBe(1);
  });

  test("search with special regex characters (literal)", () => {
    const { search } = setup("foo.bar foo*bar foo+bar");
    const count = search.find("foo.bar"); // Should be escaped
    expect(count).toBe(1);
  });

  test("overlapping matches with regex", () => {
    const { search } = setup("aaa");
    // Non-overlapping regex matches
    const count = search.find("aa", { regex: true });
    expect(count).toBe(1); // Only one match because regex is non-overlapping
  });

  test("unicode search", () => {
    const { search } = setup("Hello 世界 and 世界 again");
    const count = search.find("世界");
    expect(count).toBe(2);
  });

  test("emoji search", () => {
    const { search } = setup("Hello 🎉 world 🎉 test");
    const count = search.find("🎉");
    expect(count).toBe(2);
  });

  test("activeResult returns undefined when no results", () => {
    const { search } = setup("hello");
    search.find("xyz");
    expect(search.activeResult).toBeUndefined();
  });

  test("activeResult returns current match", () => {
    const { search } = setup("foo bar foo");
    search.find("foo");

    const result = search.activeResult;
    expect(result).toBeDefined();
    expect(result?.matchedText).toBe("foo");
  });

  test("re-finding updates results", () => {
    const { search } = setup("foo bar baz");

    search.find("foo");
    expect(search.state.count).toBe(1);

    search.find("ba");
    expect(search.state.count).toBe(2);

    search.find("xyz");
    expect(search.state.count).toBe(0);
  });
});

// ─── Multi-excerpt ──────────────────────────────────────────────────

describe("SearchController - Multi-excerpt", () => {
  test("search across multiple excerpts", () => {
    const buf1 = createBuffer(createBufferId(), "foo line one");
    const buf2 = createBuffer(createBufferId(), "foo line two");

    const mb = createMultiBuffer();
    mb.addExcerpt(buf1, excerptRange(0, 1));
    mb.addExcerpt(buf2, excerptRange(0, 1));

    const editor = new Editor(mb);
    const search = new SearchController(editor);

    const count = search.find("foo");
    expect(count).toBe(2);

    // Navigate to each match
    search.goTo(0);
    expect(editor.getSelectedText()).toBe("foo");

    search.goTo(1);
    expect(editor.getSelectedText()).toBe("foo");
  });

  test("search results are sorted by display order after moveExcerpt reorders excerpts", () => {
    // buf1 is inserted first (slot-map index 0), buf2 second (index 1).
    // After moveExcerpt, buf2 is displayed first (rows 0+) and buf1 second.
    // Results must be sorted by display row, not by slot-map index.
    const buf1 = createBuffer(createBufferId(), "foo in buf1");
    const buf2 = createBuffer(createBufferId(), "foo in buf2");

    const mb = createMultiBuffer();
    const id1 = mb.addExcerpt(buf1, excerptRange(0, 1));
    mb.addExcerpt(buf2, excerptRange(0, 1));

    // Move id1 (buf1) to the end — now buf2 is displayed first, buf1 second.
    mb.moveExcerpt(id1, undefined);

    const editor = new Editor(mb);
    const search = new SearchController(editor);

    const count = search.find("foo");
    expect(count).toBe(2);

    const resolved = search.resolveResults();
    const first = resolved[0];
    const second = resolved[1];
    if (!first || !second) throw new Error("expected two resolved results");

    // Display order: buf2 (row 0) before buf1 (row 1+).
    // Without the fix, compareAnchors would sort by slot index: buf1 (0) before buf2 (1),
    // giving results[0].start.row > results[1].start.row — the wrong order.
    const row0 = first.start.row;
    const row1 = second.start.row;
    expect(row0).toBeLessThan(row1);
  });
});
