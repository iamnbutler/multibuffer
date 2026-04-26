/**
 * Cursor movement tests.
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { createBuffer } from "../../src/buffer/buffer.ts";
import { isWordChar, moveCursor, moveCursorVisual } from "../../src/editor/cursor.ts";
import { createMultiBuffer } from "../../src/multibuffer/multibuffer.ts";
import { WrapMap } from "../../src/renderer/wrap-map.ts";
import {
  createBufferId,
  excerptRange,
  expectPoint,
  mbPoint,
  resetCounters,
} from "../helpers.ts";

function setup(text: string) {
  const buf = createBuffer(createBufferId(), text);
  const mb = createMultiBuffer();
  mb.addExcerpt(buf, excerptRange(0, text.split("\n").length));
  return mb;
}

beforeEach(() => {
  resetCounters();
});

describe("Cursor - Horizontal Movement", () => {
  test("move right within line", () => {
    const snap = setup("Hello").snapshot();
    expectPoint(moveCursor(snap, mbPoint(0, 0), "right", "character"), 0, 1);
  });

  test("move right at end of line wraps to next", () => {
    const snap = setup("AB\nCD").snapshot();
    expectPoint(moveCursor(snap, mbPoint(0, 2), "right", "character"), 1, 0);
  });

  test("move right at end of buffer stays put", () => {
    const snap = setup("AB").snapshot();
    expectPoint(moveCursor(snap, mbPoint(0, 2), "right", "character"), 0, 2);
  });

  test("move left within line", () => {
    const snap = setup("Hello").snapshot();
    expectPoint(moveCursor(snap, mbPoint(0, 3), "left", "character"), 0, 2);
  });

  test("move left at start of line wraps to prev", () => {
    const snap = setup("AB\nCD").snapshot();
    expectPoint(moveCursor(snap, mbPoint(1, 0), "left", "character"), 0, 2);
  });

  test("move left at start of buffer stays put", () => {
    const snap = setup("AB").snapshot();
    expectPoint(moveCursor(snap, mbPoint(0, 0), "left", "character"), 0, 0);
  });
});

describe("Cursor - Vertical Movement", () => {
  test("move down", () => {
    const snap = setup("AAA\nBBBB\nCC").snapshot();
    expectPoint(moveCursor(snap, mbPoint(0, 2), "down", "character"), 1, 2);
  });

  test("move down clamps to shorter line", () => {
    const snap = setup("AAAA\nBB").snapshot();
    expectPoint(moveCursor(snap, mbPoint(0, 4), "down", "character"), 1, 2);
  });

  test("move down at last line stays put", () => {
    const snap = setup("AB\nCD").snapshot();
    expectPoint(moveCursor(snap, mbPoint(1, 1), "down", "character"), 1, 1);
  });

  test("move up", () => {
    const snap = setup("AAA\nBBBB").snapshot();
    expectPoint(moveCursor(snap, mbPoint(1, 2), "up", "character"), 0, 2);
  });

  test("move up clamps to shorter line", () => {
    const snap = setup("BB\nAAAA").snapshot();
    expectPoint(moveCursor(snap, mbPoint(1, 4), "up", "character"), 0, 2);
  });

  test("move up at first line stays put", () => {
    const snap = setup("AB\nCD").snapshot();
    expectPoint(moveCursor(snap, mbPoint(0, 1), "up", "character"), 0, 1);
  });
});

describe("Cursor - Line Granularity", () => {
  test("move to line start", () => {
    const snap = setup("Hello World").snapshot();
    expectPoint(moveCursor(snap, mbPoint(0, 7), "left", "line"), 0, 0);
  });

  test("move to line end", () => {
    const snap = setup("Hello World").snapshot();
    expectPoint(moveCursor(snap, mbPoint(0, 3), "right", "line"), 0, 11);
  });
});

describe("Cursor - Word Movement (ASCII)", () => {
  test("move right past ASCII word", () => {
    const snap = setup("hello world").snapshot();
    // skip "hello" then skip " " → land at start of "world"
    expectPoint(moveCursor(snap, mbPoint(0, 0), "right", "word"), 0, 6);
  });

  test("move right from whitespace", () => {
    const snap = setup("hello world").snapshot();
    // at space (5), skip " " → land at "world" (6)
    expectPoint(moveCursor(snap, mbPoint(0, 5), "right", "word"), 0, 6);
  });

  test("move right at end of word stays at end of line", () => {
    const snap = setup("hello").snapshot();
    // already past all word chars; skip nothing non-word → stay at 5
    expectPoint(moveCursor(snap, mbPoint(0, 5), "right", "word"), 0, 5);
  });

  test("move left past ASCII word", () => {
    const snap = setup("hello world").snapshot();
    // from end (11): look back, skip "world" → land at 6
    expectPoint(moveCursor(snap, mbPoint(0, 11), "left", "word"), 0, 6);
  });

  test("move left skips whitespace then word", () => {
    const snap = setup("hello world").snapshot();
    // from 6 (start of "world"): skip " " backward, then skip "hello" → 0
    expectPoint(moveCursor(snap, mbPoint(0, 6), "left", "word"), 0, 0);
  });

  test("move left at start of line stays put", () => {
    const snap = setup("hello").snapshot();
    expectPoint(moveCursor(snap, mbPoint(0, 0), "left", "word"), 0, 0);
  });
});

describe("Cursor - Word Movement (Unicode)", () => {
  test("isWordChar recognises ASCII letters", () => {
    expect(isWordChar("a")).toBe(true);
    expect(isWordChar("Z")).toBe(true);
    expect(isWordChar("9")).toBe(true);
    expect(isWordChar("_")).toBe(true);
    expect(isWordChar(" ")).toBe(false);
    expect(isWordChar(".")).toBe(false);
  });

  test("isWordChar recognises CJK ideographs", () => {
    expect(isWordChar("你")).toBe(true);
    expect(isWordChar("世")).toBe(true);
  });

  test("isWordChar recognises Cyrillic letters", () => {
    expect(isWordChar("п")).toBe(true);
    expect(isWordChar("р")).toBe(true);
  });

  test("isWordChar rejects emoji (Symbol category)", () => {
    // emoji are category So, not L or N
    expect(isWordChar("😀")).toBe(false);
  });

  test("move right through CJK word", () => {
    // All 4 CJK chars are word chars → skip all, no trailing non-word → col 4
    const snap = setup("你好世界").snapshot();
    expectPoint(moveCursor(snap, mbPoint(0, 0), "right", "word"), 0, 4);
  });

  test("move right past ASCII into CJK", () => {
    // "hello "(0-5) then "你好"(6-7)
    const snap = setup("hello 你好 world").snapshot();
    // from 0: skip "hello" → 5; skip " " → 6; land at '你'
    expectPoint(moveCursor(snap, mbPoint(0, 0), "right", "word"), 0, 6);
    // from 6: skip "你好" → 8; skip " " → 9; land at 'w'
    expectPoint(moveCursor(snap, mbPoint(0, 6), "right", "word"), 0, 9);
  });

  test("move left past CJK word", () => {
    // "hello 你好" — '你'=6, '好'=7, end=8
    const snap = setup("hello 你好").snapshot();
    // from 8: skip non-word → none; skip "你好" → 6
    expectPoint(moveCursor(snap, mbPoint(0, 8), "left", "word"), 0, 6);
  });

  test("move right through Cyrillic word", () => {
    // "привет мир": "привет"=6, " "=1, "мир"=3
    const snap = setup("привет мир").snapshot();
    // from 0: skip "привет" → 6; skip " " → 7; land at 'м'
    expectPoint(moveCursor(snap, mbPoint(0, 0), "right", "word"), 0, 7);
  });
});

describe("Cursor - Character Movement (Surrogate Pairs)", () => {
  test("move right over emoji advances by 2 code units", () => {
    // "😀" is U+1F600, encoded as a surrogate pair: 2 UTF-16 code units
    // "😀x" has length 3: emoji at [0,1], 'x' at [2]
    const snap = setup("😀x").snapshot();
    expectPoint(moveCursor(snap, mbPoint(0, 0), "right", "character"), 0, 2);
    expectPoint(moveCursor(snap, mbPoint(0, 2), "right", "character"), 0, 3);
  });

  test("move left over emoji advances by 2 code units", () => {
    // "x😀" has length 3: 'x' at [0], emoji at [1,2]
    const snap = setup("x😀").snapshot();
    expectPoint(moveCursor(snap, mbPoint(0, 3), "left", "character"), 0, 1);
    expectPoint(moveCursor(snap, mbPoint(0, 1), "left", "character"), 0, 0);
  });

  test("move right through line of emoji wraps correctly", () => {
    // "😀😀" has length 4
    const snap = setup("😀😀\nend").snapshot();
    expectPoint(moveCursor(snap, mbPoint(0, 0), "right", "character"), 0, 2);
    expectPoint(moveCursor(snap, mbPoint(0, 2), "right", "character"), 0, 4);
    // At end of emoji line — wrap to next line
    expectPoint(moveCursor(snap, mbPoint(0, 4), "right", "character"), 1, 0);
  });

  test("BMP characters still advance by 1", () => {
    // CJK are BMP (1 code unit each)
    const snap = setup("你好").snapshot();
    expectPoint(moveCursor(snap, mbPoint(0, 0), "right", "character"), 0, 1);
    expectPoint(moveCursor(snap, mbPoint(0, 1), "left", "character"), 0, 0);
  });
});

describe("Cursor - Vertical Movement Across Excerpt Headers", () => {
  // Set up a multibuffer with two excerpts separated by a trailing-newline row (header).
  // Excerpt 1: "a\nb\nc" → multiBuffer rows 0, 1, 2 (content) + row 3 (trailing newline/header)
  // Excerpt 2: "x\ny\nz" → multiBuffer rows 4, 5, 6
  function setupWithHeader() {
    const buf1 = createBuffer(createBufferId(), "a\nb\nc");
    const buf2 = createBuffer(createBufferId(), "x\ny\nz");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf1, excerptRange(0, 3), { hasTrailingNewline: true });
    mb.addExcerpt(buf2, excerptRange(0, 3));
    return mb;
  }

  test("move down from last content row of excerpt 1 skips header row and lands on first row of excerpt 2", () => {
    // Row 2 is the last content row of excerpt 1; row 3 is the header (trailing newline).
    // Pressing down should skip row 3 and land on row 4.
    const snap = setupWithHeader().snapshot();
    expectPoint(moveCursor(snap, mbPoint(2, 0), "down", "character"), 4, 0);
  });

  test("move up from first content row of excerpt 2 skips header row and lands on last row of excerpt 1", () => {
    // Row 4 is the first content row of excerpt 2; row 3 is the header (trailing newline).
    // Pressing up should skip row 3 and land on row 2.
    const snap = setupWithHeader().snapshot();
    expectPoint(moveCursor(snap, mbPoint(4, 0), "up", "character"), 2, 0);
  });

  test("move down through header preserves column (clamped to destination line length)", () => {
    const snap = setupWithHeader().snapshot();
    // "c" is at row 2, "x\ny\nz" lines have length 1.
    // Moving down from col 0 lands at col 0 on row 4.
    expectPoint(moveCursor(snap, mbPoint(2, 0), "down", "character"), 4, 0);
  });

  test("move up through header preserves column (clamped to destination line length)", () => {
    const snap = setupWithHeader().snapshot();
    expectPoint(moveCursor(snap, mbPoint(4, 0), "up", "character"), 2, 0);
  });

  test("move down within excerpt 2 does not skip non-header rows", () => {
    const snap = setupWithHeader().snapshot();
    expectPoint(moveCursor(snap, mbPoint(4, 0), "down", "character"), 5, 0);
  });

  test("move up within excerpt 1 does not skip non-header rows", () => {
    const snap = setupWithHeader().snapshot();
    expectPoint(moveCursor(snap, mbPoint(2, 0), "up", "character"), 1, 0);
  });
});

describe("Cursor - Buffer Granularity", () => {
  test("move to buffer start", () => {
    const snap = setup("AAA\nBBB\nCCC").snapshot();
    expectPoint(moveCursor(snap, mbPoint(2, 2), "left", "buffer"), 0, 0);
  });

  test("move to buffer end", () => {
    const snap = setup("AAA\nBBB\nCCC").snapshot();
    expectPoint(moveCursor(snap, mbPoint(0, 1), "right", "buffer"), 2, 3);
  });
});

// Helper: buffer with `rows` lines of uniform content, plus an optional short line at the end
function uniformLines(rows: number, lineContent = "AAAA"): string {
  return Array.from({ length: rows }, () => lineContent).join("\n");
}

describe("Cursor - Page Granularity", () => {
  test("page down advances exactly 30 rows", () => {
    // 40-row buffer: from row 5, page-down lands at row 35
    const snap = setup(uniformLines(40)).snapshot();
    expectPoint(moveCursor(snap, mbPoint(5, 0), "down", "page"), 35, 0);
  });

  test("page down clamps at last row", () => {
    // 32-row buffer (indices 0–31): from row 25, 25+30=55 > 31, clamps to 31
    const snap = setup(uniformLines(32)).snapshot();
    expectPoint(moveCursor(snap, mbPoint(25, 0), "down", "page"), 31, 0);
  });

  test("page down at last row stays put", () => {
    const snap = setup(uniformLines(32)).snapshot();
    expectPoint(moveCursor(snap, mbPoint(31, 0), "down", "page"), 31, 0);
  });

  test("page up advances exactly 30 rows back", () => {
    // 40-row buffer: from row 35, page-up lands at row 5
    const snap = setup(uniformLines(40)).snapshot();
    expectPoint(moveCursor(snap, mbPoint(35, 0), "up", "page"), 5, 0);
  });

  test("page up clamps at first row", () => {
    // from row 5, 5-30 < 0, clamps to row 0
    const snap = setup(uniformLines(40)).snapshot();
    expectPoint(moveCursor(snap, mbPoint(5, 0), "up", "page"), 0, 0);
  });

  test("page up at first row stays put", () => {
    const snap = setup(uniformLines(40)).snapshot();
    expectPoint(moveCursor(snap, mbPoint(0, 0), "up", "page"), 0, 0);
  });

  test("page down clamps column to shorter destination line", () => {
    // rows 0–29: "AAAA" (len 4), row 30: "BB" (len 2)
    const lines = [...Array.from({ length: 30 }, () => "AAAA"), "BB"];
    const snap = setup(lines.join("\n")).snapshot();
    // col 3 on row 0, destination row 30 has len 2 → col clamped to 2
    expectPoint(moveCursor(snap, mbPoint(0, 3), "down", "page"), 30, 2);
  });

  test("page up clamps column to shorter destination line", () => {
    // row 0: "BB" (len 2), rows 1–30: "AAAA" (len 4)
    const lines = ["BB", ...Array.from({ length: 30 }, () => "AAAA")];
    const snap = setup(lines.join("\n")).snapshot();
    // col 3 on row 30, destination row 0 has len 2 → col clamped to 2
    expectPoint(moveCursor(snap, mbPoint(30, 3), "up", "page"), 0, 2);
  });

  test("page left moves to line start (Home)", () => {
    const snap = setup("Hello World").snapshot();
    expectPoint(moveCursor(snap, mbPoint(0, 7), "left", "page"), 0, 0);
  });

  test("page right moves to line end (End)", () => {
    const snap = setup("Hello World").snapshot();
    expectPoint(moveCursor(snap, mbPoint(0, 3), "right", "page"), 0, 11);
  });

  test("page down skips trailing-newline separator row", () => {
    // Excerpt 1: 31 content lines (rows 0-30) + separator at row 31; Excerpt 2 starts at row 32.
    // Cursor at row 1, page down: rawRow = 1+30 = 31 (separator) → skips to row 32.
    const buf1 = createBuffer(createBufferId(), Array.from({ length: 31 }, (_, i) => `a${i}`).join("\n"));
    const buf2 = createBuffer(createBufferId(), "b0\nb1\nb2\nb3\nb4");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf1, excerptRange(0, 31), { hasTrailingNewline: true });
    mb.addExcerpt(buf2, excerptRange(0, 5));
    const snap = mb.snapshot();
    expectPoint(moveCursor(snap, mbPoint(1, 0), "down", "page"), 32, 0);
  });

  test("page up skips trailing-newline separator row", () => {
    // Excerpt 1: 5 content lines (rows 0-4) + separator at row 5; Excerpt 2: rows 6-36.
    // Cursor at row 35, page up: rawRow = 35-30 = 5 (separator) → skips to row 4.
    const buf1 = createBuffer(createBufferId(), "a0\na1\na2\na3\na4");
    const buf2 = createBuffer(createBufferId(), Array.from({ length: 31 }, (_, i) => `b${i}`).join("\n"));
    const mb = createMultiBuffer();
    mb.addExcerpt(buf1, excerptRange(0, 5), { hasTrailingNewline: true });
    mb.addExcerpt(buf2, excerptRange(0, 31));
    const snap = mb.snapshot();
    expectPoint(moveCursor(snap, mbPoint(35, 0), "up", "page"), 4, 0);
  });
});

describe("Cursor - Visual Line Movement (Wrapped Lines)", () => {
  /**
   * Test scenario: A long line wrapped to 3 visual lines.
   * With wrapWidth=10, "abcdefghij1234567890ABCDEFGHIJ" (30 chars) wraps to:
   *   Visual row 0: "abcdefghij" (chars 0-9)
   *   Visual row 1: "1234567890" (chars 10-19)
   *   Visual row 2: "ABCDEFGHIJ" (chars 20-29)
   */
  test("move down from first visual row stays within wrapped line", () => {
    const snap = setup("abcdefghij1234567890ABCDEFGHIJ").snapshot();
    const wrapMap = new WrapMap(snap, 10);

    // At row 0, col 5 (visual row 0, visual col 5) - in the middle of "abcdefghij"
    // Moving down should land on visual row 1, which is still buffer row 0 but col 15
    const result = moveCursorVisual(snap, mbPoint(0, 5), "down", "character", wrapMap);
    expectPoint(result, 0, 15); // Same buffer row, but in second segment
  });

  test("move down from second visual row stays within wrapped line", () => {
    const snap = setup("abcdefghij1234567890ABCDEFGHIJ").snapshot();
    const wrapMap = new WrapMap(snap, 10);

    // At row 0, col 15 (visual row 1) - in the middle of "1234567890"
    // Moving down should land on visual row 2, which is still buffer row 0 but col 25
    const result = moveCursorVisual(snap, mbPoint(0, 15), "down", "character", wrapMap);
    expectPoint(result, 0, 25); // Same buffer row, but in third segment
  });

  test("move up from second visual row stays within wrapped line", () => {
    const snap = setup("abcdefghij1234567890ABCDEFGHIJ").snapshot();
    const wrapMap = new WrapMap(snap, 10);

    // At row 0, col 15 (visual row 1) - in the middle of "1234567890"
    // Moving up should land on visual row 0, which is still buffer row 0 but col 5
    const result = moveCursorVisual(snap, mbPoint(0, 15), "up", "character", wrapMap);
    expectPoint(result, 0, 5); // Same buffer row, back in first segment
  });

  test("move up from third visual row stays within wrapped line", () => {
    const snap = setup("abcdefghij1234567890ABCDEFGHIJ").snapshot();
    const wrapMap = new WrapMap(snap, 10);

    // At row 0, col 25 (visual row 2) - in the middle of "ABCDEFGHIJ"
    // Moving up should land on visual row 1, which is still buffer row 0 but col 15
    const result = moveCursorVisual(snap, mbPoint(0, 25), "up", "character", wrapMap);
    expectPoint(result, 0, 15); // Same buffer row, but in second segment
  });

  test("move down from last visual row of wrapped line goes to next buffer line", () => {
    const snap = setup("abcdefghij1234567890ABCDEFGHIJ\nshort").snapshot();
    const wrapMap = new WrapMap(snap, 10);

    // At row 0, col 25 (visual row 2, last visual row of wrapped line)
    // Moving down should land on row 1 (next buffer line)
    const result = moveCursorVisual(snap, mbPoint(0, 25), "down", "character", wrapMap);
    expectPoint(result, 1, 5); // Next buffer line, column 5 (or clamped if shorter)
  });

  test("move up from first visual row of second buffer line goes to last visual row of first", () => {
    const snap = setup("abcdefghij1234567890ABCDEFGHIJ\nshort").snapshot();
    const wrapMap = new WrapMap(snap, 10);

    // At row 1, col 3 (first line of buffer row 1)
    // Moving up should land on last visual row of row 0 (visual row 2), col 3
    const result = moveCursorVisual(snap, mbPoint(1, 3), "up", "character", wrapMap);
    expectPoint(result, 0, 23); // Buffer row 0, segment 2, col 3 => char 20+3=23
  });

  test("visual column is preserved across visual rows of same buffer row", () => {
    const snap = setup("abcdefghij1234567890ABCDEFGHIJ").snapshot();
    const wrapMap = new WrapMap(snap, 10);

    // Start at visual column 7 of first visual row (char col 7)
    // Moving down should land at visual column 7 of second visual row (char col 17)
    const result = moveCursorVisual(snap, mbPoint(0, 7), "down", "character", wrapMap);
    expectPoint(result, 0, 17);
  });

  test("visual column clamps to shorter visual row", () => {
    // Create a line that wraps unevenly: "abcdefghij12345" (15 chars)
    // At wrapWidth=10: "abcdefghij" (10) + "12345" (5)
    const snap = setup("abcdefghij12345").snapshot();
    const wrapMap = new WrapMap(snap, 10);

    // At row 0, col 7 (visual row 0, visual col 7)
    // Moving down should land on visual row 1, clamped to end of "12345"
    const result = moveCursorVisual(snap, mbPoint(0, 7), "down", "character", wrapMap);
    expectPoint(result, 0, 15); // row 0, segment 1 ends at char 15 (text.length)
  });

  test("move up at first visual row of buffer stays put", () => {
    const snap = setup("abcdefghij1234567890").snapshot();
    const wrapMap = new WrapMap(snap, 10);

    // At row 0, col 5 (visual row 0)
    // Moving up should stay put (already at first visual row)
    const result = moveCursorVisual(snap, mbPoint(0, 5), "up", "character", wrapMap);
    expectPoint(result, 0, 5);
  });

  test("move down at last visual row of buffer stays put", () => {
    const snap = setup("abcdefghij1234567890").snapshot();
    const wrapMap = new WrapMap(snap, 10);

    // At row 0, col 15 (visual row 1, last visual row)
    // Moving down should stay put (already at last visual row)
    const result = moveCursorVisual(snap, mbPoint(0, 15), "down", "character", wrapMap);
    expectPoint(result, 0, 15);
  });

  test("horizontal movement ignores WrapMap (uses character boundaries)", () => {
    const snap = setup("abcdefghij1234567890").snapshot();
    const wrapMap = new WrapMap(snap, 10);

    // Moving right/left should work as before, ignoring visual wrapping
    const rightResult = moveCursorVisual(snap, mbPoint(0, 9), "right", "character", wrapMap);
    expectPoint(rightResult, 0, 10);

    const leftResult = moveCursorVisual(snap, mbPoint(0, 10), "left", "character", wrapMap);
    expectPoint(leftResult, 0, 9);
  });

  test("works with CJK characters that occupy 2 visual columns", () => {
    // "你好世界" - 4 CJK chars, each 2 visual columns = 8 visual columns
    // With wrapWidth=5, this wraps: "你好" (4 visual cols) + "世界" (4 visual cols)
    const snap = setup("你好世界").snapshot();
    const wrapMap = new WrapMap(snap, 5);

    // Verify wrap structure: should be 2 visual rows
    expect(wrapMap.totalVisualRows).toBe(2);

    // At row 0, col 1 (second CJK char "好", visual col 2-3 of first segment)
    // Moving down should land on visual row 1 (buffer row 0, col 2-3)
    const result = moveCursorVisual(snap, mbPoint(0, 1), "down", "character", wrapMap);
    // Visual col 2 (where "好" starts) maps to second segment visual col 2 = char col 2+floor(2/2) = char 3
    // Actually for CJK: visual col 2 in seg 1 would be char index 2 ("世")
    expectPoint(result, 0, 3);
  });
});

describe("Cursor - Visual Row Movement Across Excerpt Headers (issue #89)", () => {
  // Set up a multibuffer with two excerpts separated by a trailing-newline row (header).
  // Excerpt 1: "a\nb\nc" → multiBuffer rows 0, 1, 2 (content) + row 3 (trailing newline/header)
  // Excerpt 2: "x\ny\nz" → multiBuffer rows 4, 5, 6
  function setupWithHeader() {
    const buf1 = createBuffer(createBufferId(), "a\nb\nc");
    const buf2 = createBuffer(createBufferId(), "x\ny\nz");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf1, excerptRange(0, 3), { hasTrailingNewline: true });
    mb.addExcerpt(buf2, excerptRange(0, 3));
    return mb;
  }

  test("moveCursorVisual down from last content row of excerpt 1 skips header row", () => {
    // Row 2 is the last content row of excerpt 1; row 3 is the header (trailing newline).
    // With wrapWidth set, pressing down should skip row 3 and land on row 4.
    const snap = setupWithHeader().snapshot();
    const wrapMap = new WrapMap(snap, 80);
    expectPoint(moveCursorVisual(snap, mbPoint(2, 0), "down", "character", wrapMap), 4, 0);
  });

  test("moveCursorVisual up from first content row of excerpt 2 skips header row", () => {
    // Row 4 is the first content row of excerpt 2; row 3 is the header (trailing newline).
    // With wrapWidth set, pressing up should skip row 3 and land on row 2.
    const snap = setupWithHeader().snapshot();
    const wrapMap = new WrapMap(snap, 80);
    expectPoint(moveCursorVisual(snap, mbPoint(4, 0), "up", "character", wrapMap), 2, 0);
  });

  test("moveCursorVisual down preserves column across header skip", () => {
    // Use longer lines so a non-zero column is meaningful
    const buf1 = createBuffer(createBufferId(), "aaa\nbbb\nccc");
    const buf2 = createBuffer(createBufferId(), "xxx\nyyy\nzzz");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf1, excerptRange(0, 3), { hasTrailingNewline: true });
    mb.addExcerpt(buf2, excerptRange(0, 3));
    const snap = mb.snapshot();
    const wrapMap = new WrapMap(snap, 80);
    // Row 2 is "ccc" (len 3), row 3 is header, row 4 is "xxx" (len 3).
    // Starting at col 2, should skip header and land at col 2 on row 4.
    expectPoint(moveCursorVisual(snap, mbPoint(2, 2), "down", "character", wrapMap), 4, 2);
  });

  test("moveCursorVisual within excerpt does not skip non-header rows", () => {
    const snap = setupWithHeader().snapshot();
    const wrapMap = new WrapMap(snap, 80);
    // Moving down from row 4 should land on row 5 (both in excerpt 2)
    expectPoint(moveCursorVisual(snap, mbPoint(4, 0), "down", "character", wrapMap), 5, 0);
    // Moving up from row 2 should land on row 1 (both in excerpt 1)
    expectPoint(moveCursorVisual(snap, mbPoint(2, 0), "up", "character", wrapMap), 1, 0);
  });
});
