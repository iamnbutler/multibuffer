/**
 * Delete operation tests — ported from Zed's editor_tests.rs.
 *
 * Covers deleteBackward/deleteForward with various granularities
 * (character, word, line) and edge cases (multi-cursor, emoji,
 * boundary conditions).
 *
 * TDD: tests are written before implementation is complete — some may fail.
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { createBuffer } from "../../src/buffer/buffer.ts";
import { Editor } from "../../src/editor/editor.ts";
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
function setup(text: string): { mb: MultiBuffer; editor: Editor } {
  const buf = createBuffer(createBufferId(), text);
  const mb = createMultiBuffer();
  mb.addExcerpt(buf, excerptRange(0, text.split("\n").length));
  const editor = new Editor(mb);
  return { mb, editor };
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

// ─── Delete to beginning of line ────────────────────────────────

describe("Delete to beginning of line", () => {
  test("deleteBackward with 'line' granularity deletes to start of line", () => {
    const { editor, mb } = setup("Hello World");
    editor.setCursor(mbPoint(0, 7));
    editor.dispatch({ type: "deleteBackward", granularity: "line" });
    expect(getText(mb)).toBe("orld");
    expectPoint(editor.cursor, 0, 0);
  });

  test("at start of line, joins with previous line (deletes newline)", () => {
    const { editor, mb } = setup("Hello\nWorld");
    editor.setCursor(mbPoint(1, 0));
    editor.dispatch({ type: "deleteBackward", granularity: "line" });
    expect(getText(mb)).toBe("HelloWorld");
    expectPoint(editor.cursor, 0, 5);
  });

  test("at start of first line, does nothing", () => {
    const { editor, mb } = setup("Hello\nWorld");
    editor.setCursor(mbPoint(0, 0));
    editor.dispatch({ type: "deleteBackward", granularity: "line" });
    expect(getText(mb)).toBe("Hello\nWorld");
    expectPoint(editor.cursor, 0, 0);
  });

  test("with multi-cursor, deletes to beginning at each cursor", () => {
    const { editor, mb } = setup("Hello World\nFoo Bar");
    editor.setCursor(mbPoint(0, 7));
    editor.dispatch({ type: "addCursor", at: mbPoint(1, 5) });
    editor.dispatch({ type: "deleteBackward", granularity: "line" });
    expect(getText(mb)).toBe("orld\nar");
  });

  test("preserves text after cursor on same line", () => {
    const { editor, mb } = setup("one two three four");
    editor.setCursor(mbPoint(0, 8));
    editor.dispatch({ type: "deleteBackward", granularity: "line" });
    expect(getText(mb)).toBe("three four");
    expectPoint(editor.cursor, 0, 0);
  });

  test("with multi-cursor at column 0, joins lines", () => {
    const { editor, mb } = setup("aaa\nbbb\nccc");
    editor.setCursor(mbPoint(1, 0));
    editor.dispatch({ type: "addCursor", at: mbPoint(2, 0) });
    editor.dispatch({ type: "deleteBackward", granularity: "line" });
    expect(getText(mb)).toBe("aaabbbccc");
  });

  test("with multi-cursor, mixed column 0 and mid-line", () => {
    const { editor, mb } = setup("Hello World\nFoo\nBar Baz");
    // cursor 1: mid-line (deletes to line start)
    editor.setCursor(mbPoint(0, 7));
    // cursor 2: column 0 (joins with previous line)
    editor.dispatch({ type: "addCursor", at: mbPoint(2, 0) });
    editor.dispatch({ type: "deleteBackward", granularity: "line" });
    expect(getText(mb)).toBe("orld\nFooBar Baz");
  });
});

// ─── Delete to word boundary ────────────────────────────────────

describe("Delete to word boundary", () => {
  test("deleteBackward with 'word' granularity deletes preceding word", () => {
    const { editor, mb } = setup("Hello World");
    editor.setCursor(mbPoint(0, 11));
    editor.dispatch({ type: "deleteBackward", granularity: "word" });
    expect(getText(mb)).toBe("Hello ");
    expectPoint(editor.cursor, 0, 6);
  });

  test("deleteForward with 'word' granularity deletes following word", () => {
    const { editor, mb } = setup("Hello World");
    editor.setCursor(mbPoint(0, 0));
    editor.dispatch({ type: "deleteForward", granularity: "word" });
    expect(getText(mb)).toBe(" World");
    expectPoint(editor.cursor, 0, 0);
  });

  test("word delete skips contiguous whitespace as a unit", () => {
    // Ported from Zed's test_delete_whitespaces: contiguous whitespace
    // sequences are removed entirely, words behind them are not affected.
    const { editor, mb } = setup("here is some text    with a space");
    editor.setCursor(mbPoint(0, 21)); // cursor right before "with"
    editor.dispatch({ type: "deleteBackward", granularity: "word" });
    expect(getText(mb)).toBe("here is some textwith a space");
  });

  test("word delete forward skips contiguous whitespace as a unit", () => {
    const { editor, mb } = setup("here is some text    with a space");
    editor.setCursor(mbPoint(0, 17)); // cursor right after "text"
    editor.dispatch({ type: "deleteForward", granularity: "word" });
    expect(getText(mb)).toBe("here is some textwith a space");
  });

  test("word delete at line start crosses to previous line", () => {
    const { editor, mb } = setup("Hello World\nFoo");
    editor.setCursor(mbPoint(1, 0));
    editor.dispatch({ type: "deleteBackward", granularity: "word" });
    // moveWordBoundary crosses line boundary to end of previous line (deletes newline)
    expect(getText(mb)).toBe("Hello WorldFoo");
    expectPoint(editor.cursor, 0, 11);
  });

  test("word delete at line end crosses to next line", () => {
    const { editor, mb } = setup("Hello\nWorld");
    editor.setCursor(mbPoint(0, 5));
    editor.dispatch({ type: "deleteForward", granularity: "word" });
    // moveWordBoundary crosses line boundary to start of next line (deletes newline)
    expect(getText(mb)).toBe("HelloWorld");
    expectPoint(editor.cursor, 0, 5);
  });

  test("with multi-cursor, word delete at each position", () => {
    const { editor, mb } = setup("one two\nthree four");
    editor.setCursor(mbPoint(0, 7)); // end of "two"
    editor.dispatch({ type: "addCursor", at: mbPoint(1, 10) }); // end of "four"
    editor.dispatch({ type: "deleteBackward", granularity: "word" });
    expect(getText(mb)).toBe("one \nthree ");
  });

  test("word delete backward crosses to empty previous line", () => {
    const { editor, mb } = setup("Hello\n\nWorld");
    editor.setCursor(mbPoint(2, 0));
    editor.dispatch({ type: "deleteBackward", granularity: "word" });
    // From row 2 col 0 → crosses to row 1 (empty) → lands at col 0 of empty line
    expect(getText(mb)).toBe("Hello\nWorld");
    expectPoint(editor.cursor, 1, 0);
  });

  test("word delete backward crosses to line of only non-word characters", () => {
    const { editor, mb } = setup("...\nWorld");
    editor.setCursor(mbPoint(1, 0));
    editor.dispatch({ type: "deleteBackward", granularity: "word" });
    // moveWordBoundary crosses to end of previous line (deletes newline only)
    expect(getText(mb)).toBe("...World");
    expectPoint(editor.cursor, 0, 3);
  });

  test("word delete forward crosses from end of line to next line", () => {
    const { editor, mb } = setup("Hello\nWorld");
    editor.setCursor(mbPoint(0, 5));
    editor.dispatch({ type: "deleteForward", granularity: "word" });
    // moveWordBoundary crosses to start of next line (deletes newline only)
    expect(getText(mb)).toBe("HelloWorld");
    expectPoint(editor.cursor, 0, 5);
  });

  test("word delete forward from mid-word does not cross line", () => {
    const { editor, mb } = setup("Cargo\nWorld");
    editor.setCursor(mbPoint(0, 2));
    editor.dispatch({ type: "deleteForward", granularity: "word" });
    // From mid-word "Ca|rgo" → deletes "rgo" (rest of word), stays on same line
    expect(getText(mb)).toBe("Ca\nWorld");
    expectPoint(editor.cursor, 0, 2);
  });

  test("word delete forward crosses to empty next line", () => {
    const { editor, mb } = setup("Hello\n\nWorld");
    editor.setCursor(mbPoint(0, 5));
    editor.dispatch({ type: "deleteForward", granularity: "word" });
    // From end of "Hello" → crosses to empty line → lands at start of empty line
    expect(getText(mb)).toBe("Hello\nWorld");
    expectPoint(editor.cursor, 0, 5);
  });
});

// ─── Backspace edge cases ───────────────────────────────────────

describe("Backspace edge cases", () => {
  test("backspace at position 0,0 is no-op", () => {
    const { editor, mb } = setup("Hello");
    editor.dispatch({ type: "deleteBackward", granularity: "character" });
    expect(getText(mb)).toBe("Hello");
    expectPoint(editor.cursor, 0, 0);
  });

  test("backspace at start of line joins with previous line", () => {
    const { editor, mb } = setup("Hello\nWorld");
    editor.setCursor(mbPoint(1, 0));
    editor.dispatch({ type: "deleteBackward", granularity: "character" });
    expect(getText(mb)).toBe("HelloWorld");
    expectPoint(editor.cursor, 0, 5);
  });

  test("backspace with selection deletes the selection", () => {
    const { editor, mb } = setup("Hello World");
    editor.setCursor(mbPoint(0, 0));
    // Select "Hello"
    for (let i = 0; i < 5; i++) {
      editor.dispatch({ type: "extendSelection", direction: "right", granularity: "character" });
    }
    editor.dispatch({ type: "deleteBackward", granularity: "character" });
    expect(getText(mb)).toBe(" World");
    expectPoint(editor.cursor, 0, 0);
  });

  test("backspace with multi-cursor deletes at each position", () => {
    // Ported from Zed's test_backspace: multiple cursors with collapsed selections
    const { editor, mb } = setup("one two three\nfour five six");
    editor.setCursor(mbPoint(0, 3)); // after "one"
    editor.dispatch({ type: "addCursor", at: mbPoint(1, 4) }); // after "four"
    editor.dispatch({ type: "deleteBackward", granularity: "character" });
    expect(getText(mb)).toBe("on two three\nfou five six");
  });

  test("backspace after emoji (surrogate pair) deletes whole emoji", () => {
    const { editor, mb } = setup("Hello 🎉 World");
    // Position cursor after the emoji. The emoji "🎉" is a surrogate pair (2 UTF-16 code units),
    // but in our system we work with Unicode scalar values.
    // "Hello " = 6 chars, "🎉" = 1 char (as [...str].length), " World" = 6 chars
    // So the emoji is at position 6, cursor after it is position 8 (surrogate pair = 2 UTF-16 code units)
    editor.setCursor(mbPoint(0, 8));
    editor.dispatch({ type: "deleteBackward", granularity: "character" });
    // Should delete the whole emoji, not just half a surrogate pair
    const result = getText(mb);
    // The emoji should be gone
    expect(result.includes("🎉")).toBe(false);
  });
});

// ─── Delete forward edge cases ──────────────────────────────────

describe("Delete forward edge cases", () => {
  test("delete at end of last line is no-op", () => {
    const { editor, mb } = setup("Hello");
    editor.setCursor(mbPoint(0, 5));
    editor.dispatch({ type: "deleteForward", granularity: "character" });
    expect(getText(mb)).toBe("Hello");
    expectPoint(editor.cursor, 0, 5);
  });

  test("delete at end of line joins with next line", () => {
    const { editor, mb } = setup("Hello\nWorld");
    editor.setCursor(mbPoint(0, 5));
    editor.dispatch({ type: "deleteForward", granularity: "character" });
    expect(getText(mb)).toBe("HelloWorld");
    expectPoint(editor.cursor, 0, 5);
  });

  test("delete with selection deletes selection", () => {
    // Ported from Zed's test_delete: for non-empty selections, only
    // selected characters are deleted (regardless of forward direction).
    const { editor, mb } = setup("Hello World");
    editor.setCursor(mbPoint(0, 0));
    // Select "Hello"
    for (let i = 0; i < 5; i++) {
      editor.dispatch({ type: "extendSelection", direction: "right", granularity: "character" });
    }
    editor.dispatch({ type: "deleteForward", granularity: "character" });
    expect(getText(mb)).toBe(" World");
    expectPoint(editor.cursor, 0, 0);
  });

  test("delete with multi-cursor deletes at each position", () => {
    const { editor, mb } = setup("one two three\nfour five six");
    editor.setCursor(mbPoint(0, 2)); // before "e" in "one"
    editor.dispatch({ type: "addCursor", at: mbPoint(1, 3) }); // before "r" in "four"
    editor.dispatch({ type: "deleteForward", granularity: "character" });
    expect(getText(mb)).toBe("on two three\nfou five six");
  });
});
