/**
 * Cursor movement tests.
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { createBuffer } from "../../src/buffer/buffer.ts";
import { isWordChar, moveCursor } from "../../src/editor/cursor.ts";
import { createMultiBuffer } from "../../src/multibuffer/multibuffer.ts";
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
});
