/**
 * Tests for visual-width utilities, wrapLine, and WrapMap class in wrap-map.ts.
 *
 * Covers:
 * - visualWidth: display cell count for ASCII, CJK, emoji, fullwidth
 * - charColToVisualCol: char index → visual column conversion
 * - visualColToCharCol: visual column → char index conversion
 * - wrapLine: visual-width-aware line splitting
 * - WrapMap: prefix-sum row mapping with O(1) forward and O(log n) reverse lookup
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { createBuffer } from "../../src/multibuffer/buffer.ts";
import { createMultiBuffer } from "../../src/multibuffer/multibuffer.ts";
import type { MultiBufferRow } from "../../src/multibuffer/types.ts";
import {
  charColToVisualCol,
  visualColToCharCol,
  visualWidth,
  WrapMap,
  wrapLine,
} from "../../src/multibuffer_renderer/wrap-map.ts";
import { createBufferId, excerptRange, num, resetCounters } from "../helpers.ts";

describe("visualWidth", () => {
  test("empty string returns 0", () => {
    expect(visualWidth("")).toBe(0);
  });

  test("ASCII: each char counts as 1 cell", () => {
    expect(visualWidth("hello")).toBe(5);
    expect(visualWidth("a")).toBe(1);
  });

  test("CJK ideograph: 2 cells per character", () => {
    expect(visualWidth("日")).toBe(2);
    expect(visualWidth("日本語")).toBe(6);
  });

  test("emoji: 2 cells per glyph", () => {
    expect(visualWidth("😀")).toBe(2);
    expect(visualWidth("🎉🎊")).toBe(4);
  });

  test("fullwidth Latin: 2 cells per character", () => {
    // Fullwidth Latin Capital Letter A: U+FF21
    expect(visualWidth("\uFF21")).toBe(2);
  });

  test("mixed ASCII and CJK", () => {
    expect(visualWidth("hi日")).toBe(4); // 1+1+2
    expect(visualWidth("a日b")).toBe(4); // 1+2+1
  });

  test("mixed ASCII and emoji", () => {
    // a=1, b=1, 😀=2, c=1, d=1 → 6
    expect(visualWidth("ab😀cd")).toBe(6);
  });

  test("Hangul syllable: 2 cells", () => {
    expect(visualWidth("\uAC00")).toBe(2); // 가
  });

  test("Katakana: 2 cells per character", () => {
    expect(visualWidth("アイウ")).toBe(6);
  });
});

describe("charColToVisualCol", () => {
  test("ASCII: char col equals visual col", () => {
    expect(charColToVisualCol("hello", 0)).toBe(0);
    expect(charColToVisualCol("hello", 3)).toBe(3);
    expect(charColToVisualCol("hello", 5)).toBe(5);
  });

  test("CJK: visual col accounts for wide chars", () => {
    // "日本語": char 0→vw 0, char 1→vw 2, char 2→vw 4, char 3→vw 6
    expect(charColToVisualCol("日本語", 0)).toBe(0);
    expect(charColToVisualCol("日本語", 1)).toBe(2);
    expect(charColToVisualCol("日本語", 2)).toBe(4);
    expect(charColToVisualCol("日本語", 3)).toBe(6);
  });

  test("mixed: correct for position after wide char", () => {
    // "a日b": a=1, 日=2, b=1 → visual cols: a@0, 日@1, b@3
    expect(charColToVisualCol("a日b", 0)).toBe(0); // before 'a'
    expect(charColToVisualCol("a日b", 1)).toBe(1); // before '日'
    expect(charColToVisualCol("a日b", 2)).toBe(3); // before 'b'
    expect(charColToVisualCol("a日b", 3)).toBe(4); // end of string
  });

  test("emoji: surrogate pair is 2 UTF-16 code units, 2 visual cells", () => {
    // "😀" has .length = 2 (surrogate pair), visual width = 2
    // charCol 2 = after the emoji
    expect(charColToVisualCol("😀", 2)).toBe(2);
  });

  test("col beyond end: returns full visual width", () => {
    expect(charColToVisualCol("ab", 5)).toBe(2);
    expect(charColToVisualCol("日", 5)).toBe(2);
  });

  test("empty string: always 0", () => {
    expect(charColToVisualCol("", 0)).toBe(0);
    expect(charColToVisualCol("", 3)).toBe(0);
  });
});

describe("visualColToCharCol", () => {
  test("ASCII: visual col equals char col", () => {
    expect(visualColToCharCol("hello", 0)).toBe(0);
    expect(visualColToCharCol("hello", 3)).toBe(3);
    expect(visualColToCharCol("hello", 5)).toBe(5);
  });

  test("CJK: visual col to char index", () => {
    // "日本語": vw 0→char 0, vw 2→char 1, vw 4→char 2, vw 6→char 3
    expect(visualColToCharCol("日本語", 0)).toBe(0);
    expect(visualColToCharCol("日本語", 2)).toBe(1);
    expect(visualColToCharCol("日本語", 4)).toBe(2);
    expect(visualColToCharCol("日本語", 6)).toBe(3);
  });

  test("visual col within wide char: snaps to next char boundary", () => {
    // "日b": '日' occupies visual cols 0-1, 'b' at visual col 2
    // visual col 1 is mid-'日': snaps to char 1 (after '日')
    expect(visualColToCharCol("日b", 1)).toBe(1);
    // visual col 2 = start of 'b'
    expect(visualColToCharCol("日b", 2)).toBe(1);
  });

  test("charColToVisualCol round-trip", () => {
    // charCol → visualCol → charCol should be identity
    for (const text of ["hello", "日本語", "a日b", "abc"]) {
      for (let col = 0; col <= text.length; col++) {
        const visual = charColToVisualCol(text, col);
        const back = visualColToCharCol(text, visual);
        expect(back).toBe(col);
      }
    }
  });

  test("empty string: always 0", () => {
    expect(visualColToCharCol("", 0)).toBe(0);
    expect(visualColToCharCol("", 3)).toBe(0);
  });

  test("col beyond visual width: clamps to string length", () => {
    expect(visualColToCharCol("ab", 10)).toBe(2);
    expect(visualColToCharCol("日", 10)).toBe(1);
  });
});

describe("wrapLine with visual width", () => {
  test("ASCII: splits at wrapWidth character boundary", () => {
    expect(wrapLine("abcdefgh", 4)).toEqual(["abcd", "efgh"]);
    expect(wrapLine("abcde", 4)).toEqual(["abcd", "e"]);
  });

  test("text with visual width <= wrapWidth: returned as-is", () => {
    expect(wrapLine("hello", 8)).toEqual(["hello"]);
    expect(wrapLine("日日", 4)).toEqual(["日日"]); // vw=4 == wrapWidth
  });

  test("empty string: returns ['']", () => {
    expect(wrapLine("", 8)).toEqual([""]);
  });

  test("wrapWidth <= 0: returns whole string unsplit", () => {
    expect(wrapLine("hello world", 0)).toEqual(["hello world"]);
    expect(wrapLine("hello", -1)).toEqual(["hello"]);
  });

  test("CJK: splits at visual width boundary", () => {
    // "日日日" vw=6, wrapWidth=4 → "日日" (vw=4) + "日" (vw=2)
    expect(wrapLine("日日日", 4)).toEqual(["日日", "日"]);
  });

  test("CJK: never splits mid-glyph even if wrapWidth is odd", () => {
    // "日日" vw=4, wrapWidth=3 → can't fit 2 wide chars in 3 cells
    // First '日' fits (vw=2 ≤ 3), second '日' would push to vw=4 > 3 → cut
    expect(wrapLine("日日", 3)).toEqual(["日", "日"]);
  });

  test("mixed ASCII and CJK: splits at correct visual boundary", () => {
    // "abc日ef" vw=8, wrapWidth=5
    // 'a'(1)+'b'(1)+'c'(1)+'日'(2)=5 → fits at exactly wrapWidth
    // 'e'(1) → vw=6 > 5 → cut before 'e'
    expect(wrapLine("abc日ef", 5)).toEqual(["abc日", "ef"]);
  });

  test("emoji: treated as 2 visual cells", () => {
    // "ab😀cd" vw=6, wrapWidth=4
    // 'a'(1)+'b'(1)+'😀'(2)=4 → exactly wrapWidth
    // 'c'(1) → vw=5 > 4 → cut before 'c'
    expect(wrapLine("ab😀cd", 4)).toEqual(["ab😀", "cd"]);
  });

  test("emoji surrogate pair is never split", () => {
    // "😀😀" vw=4, wrapWidth=3 → each emoji is 2 cells
    // first emoji fits (vw=2 ≤ 3), second → vw=4 > 3 → cut
    expect(wrapLine("😀😀", 3)).toEqual(["😀", "😀"]);
  });

  test("segment char offsets are correct (used for token slicing)", () => {
    // "日本語test" → wrapWidth=6 → "日本語"(vw=6) + "test"(vw=4)
    const segs = wrapLine("日本語test", 6);
    expect(segs).toEqual(["日本語", "test"]);
    // Char offsets: seg 0 starts at 0, seg 1 starts at 3
    expect(segs[0]?.length).toBe(3); // 3 CJK chars
    expect(segs[1]?.length).toBe(4); // 4 ASCII chars
  });
});

describe("WrapMap class", () => {
  // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in tests
  const mbRow = (n: number) => n as MultiBufferRow;

  function makeSnapshot(text: string) {
    const buf = createBuffer(createBufferId(), text);
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, text.split("\n").length));
    return mb.snapshot();
  }

  beforeEach(() => {
    resetCounters();
  });

  test("wrapWidth getter returns configured value", () => {
    const snap = makeSnapshot("hello");
    const wm = new WrapMap(snap, 120);
    expect(wm.wrapWidth).toBe(120);
  });

  test("single line shorter than wrapWidth: 1 visual row", () => {
    const snap = makeSnapshot("hello");
    const wm = new WrapMap(snap, 80);
    expect(wm.totalVisualRows).toBe(1);
    expect(wm.visualRowsForLine(mbRow(0))).toBe(1);
  });

  test("multiple short lines, no wrapping: N visual rows total", () => {
    const snap = makeSnapshot("abc\ndef\nghi");
    const wm = new WrapMap(snap, 80);
    expect(wm.totalVisualRows).toBe(3);
    expect(wm.visualRowsForLine(mbRow(0))).toBe(1);
    expect(wm.visualRowsForLine(mbRow(1))).toBe(1);
    expect(wm.visualRowsForLine(mbRow(2))).toBe(1);
  });

  test("line that wraps produces multiple visual rows", () => {
    // "abcdefghij" (10 chars) at wrapWidth=5 → ["abcde","fghij"] → 2 visual rows
    const snap = makeSnapshot("abcdefghij");
    const wm = new WrapMap(snap, 5);
    expect(wm.totalVisualRows).toBe(2);
    expect(wm.visualRowsForLine(mbRow(0))).toBe(2);
  });

  test("mixed wrapped and non-wrapped lines: correct per-line visual row counts", () => {
    // Line 0: "short" (5 chars, wrapWidth=10) → 1 visual row
    // Line 1: "averylongline" (13 chars) → ["averylongl","ine"] → 2 visual rows
    // Line 2: "x" → 1 visual row
    const snap = makeSnapshot("short\naverylongline\nx");
    const wm = new WrapMap(snap, 10);
    expect(wm.visualRowsForLine(mbRow(0))).toBe(1);
    expect(wm.visualRowsForLine(mbRow(1))).toBe(2);
    expect(wm.visualRowsForLine(mbRow(2))).toBe(1);
    expect(wm.totalVisualRows).toBe(4);
  });

  test("bufferRowToFirstVisualRow with no wrapping: row N → visual row N", () => {
    const snap = makeSnapshot("abc\ndef\nghi");
    const wm = new WrapMap(snap, 80);
    expect(wm.bufferRowToFirstVisualRow(mbRow(0))).toBe(0);
    expect(wm.bufferRowToFirstVisualRow(mbRow(1))).toBe(1);
    expect(wm.bufferRowToFirstVisualRow(mbRow(2))).toBe(2);
  });

  test("bufferRowToFirstVisualRow with wrapping accounts for extra visual rows", () => {
    // prefix = [0, 1, 3, 4] for lines ["short","averylongline","x"] at wrapWidth=10
    const snap = makeSnapshot("short\naverylongline\nx");
    const wm = new WrapMap(snap, 10);
    expect(wm.bufferRowToFirstVisualRow(mbRow(0))).toBe(0);
    expect(wm.bufferRowToFirstVisualRow(mbRow(1))).toBe(1);
    // Line 1 wraps into 2 visual rows, so line 2 starts at visual row 3
    expect(wm.bufferRowToFirstVisualRow(mbRow(2))).toBe(3);
  });

  test("visualRowToBufferRow: no wrapping maps visual row to same buffer row", () => {
    const snap = makeSnapshot("abc\ndef\nghi");
    const wm = new WrapMap(snap, 80);

    const r0 = wm.visualRowToBufferRow(0);
    expect(num(r0.mbRow)).toBe(0);
    expect(r0.segment).toBe(0);

    const r1 = wm.visualRowToBufferRow(1);
    expect(num(r1.mbRow)).toBe(1);
    expect(r1.segment).toBe(0);

    const r2 = wm.visualRowToBufferRow(2);
    expect(num(r2.mbRow)).toBe(2);
    expect(r2.segment).toBe(0);
  });

  test("visualRowToBufferRow: wrapped line returns correct buffer row and segment index", () => {
    // ["short","averylongline","x"] at wrapWidth=10
    // visual row 0 → buffer row 0, segment 0
    // visual row 1 → buffer row 1, segment 0 (first wrap of "averylongline")
    // visual row 2 → buffer row 1, segment 1 (second wrap of "averylongline")
    // visual row 3 → buffer row 2, segment 0
    const snap = makeSnapshot("short\naverylongline\nx");
    const wm = new WrapMap(snap, 10);

    const r0 = wm.visualRowToBufferRow(0);
    expect(num(r0.mbRow)).toBe(0);
    expect(r0.segment).toBe(0);

    const r1 = wm.visualRowToBufferRow(1);
    expect(num(r1.mbRow)).toBe(1);
    expect(r1.segment).toBe(0);

    const r2 = wm.visualRowToBufferRow(2);
    expect(num(r2.mbRow)).toBe(1);
    expect(r2.segment).toBe(1);

    const r3 = wm.visualRowToBufferRow(3);
    expect(num(r3.mbRow)).toBe(2);
    expect(r3.segment).toBe(0);
  });

  test("contentHeight: total pixels = visual rows × line height", () => {
    const snap = makeSnapshot("abc\ndef\nghi");
    const wm = new WrapMap(snap, 80);
    expect(wm.contentHeight(20)).toBe(60); // 3 visual rows × 20px
  });

  test("contentHeight accounts for wrapped lines", () => {
    // 4 visual rows × 16px = 64px
    const snap = makeSnapshot("short\naverylongline\nx");
    const wm = new WrapMap(snap, 10);
    expect(wm.contentHeight(16)).toBe(64);
  });

  test("CJK lines wrap at visual width, not char count", () => {
    // "日日日日" vw=8 (4 chars × 2 cells), wrapWidth=4 → ["日日","日日"] → 2 visual rows
    const snap = makeSnapshot("日日日日");
    const wm = new WrapMap(snap, 4);
    expect(wm.visualRowsForLine(mbRow(0))).toBe(2);
    expect(wm.totalVisualRows).toBe(2);
  });
});
