/**
 * Position conversion across lines that are longer than the internal chunk size.
 *
 * `textToChunks` only breaks a chunk at a newline when one exists inside the
 * 1024-code-unit window. A line longer than that therefore spans several
 * chunks, and those continuation chunks do NOT begin at a line start.
 *
 * Three conversions used to assume "chunk i begins at line
 * `_chunkNewlinePrefixes[i]`", which that case violates:
 *   - `offsetToLineCol`   — column reset to 0 at every chunk boundary
 *   - `lineColToOffset`   — resolved to the wrong chunk entirely
 *   - `_findLineStartOffset` (via `offsetToLineCol` at end-of-rope)
 *
 * Every expectation here is checked against a brute-force scan of the raw
 * string rather than against the rope's own bookkeeping.
 */

import { describe, expect, test } from "bun:test";
import { createBuffer } from "../../src/buffer/buffer.ts";
import { Rope } from "../../src/buffer/rope.ts";
import { createBufferId, expectOffset, point } from "../helpers.ts";

/** Brute-force {line, col} for an offset, straight off the raw string. */
function oracleLineCol(text: string, offset: number): { line: number; col: number } {
  let line = 0;
  let lineStart = 0;
  for (let i = 0; i < offset; i++) {
    if (text.charCodeAt(i) === 10) {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, col: offset - lineStart };
}

/** Brute-force offset of the start of every line. */
function oracleLineStarts(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) starts.push(i + 1);
  }
  return starts;
}

// 3000 code units is comfortably past TARGET_CHUNK_SIZE (1024), so line 1
// alone spans four chunks. Line 0 is short, so line 1 also starts mid-chunk.
const LONG_LINE_DOC = `header\n${"x".repeat(3000)}\nfooter`;

describe("Rope - long lines spanning chunks", () => {
  test("column keeps counting across a chunk boundary inside a line", () => {
    const r = Rope.from(LONG_LINE_DOC);
    // Line 1 starts at offset 7; a chunk boundary falls between 1030 and 1031.
    expect(r.offsetToLineCol(1030)).toEqual({ line: 1, col: 1023 });
    expect(r.offsetToLineCol(1031)).toEqual({ line: 1, col: 1024 });
    expect(r.offsetToLineCol(2500)).toEqual({ line: 1, col: 2493 });
  });

  test("offsetToLineCol matches the oracle at every offset", () => {
    const r = Rope.from(LONG_LINE_DOC);
    for (let offset = 0; offset <= r.length; offset++) {
      expect(r.offsetToLineCol(offset)).toEqual(oracleLineCol(LONG_LINE_DOC, offset));
    }
  });

  test("lineColToOffset resolves a line that begins mid-chunk", () => {
    const r = Rope.from(LONG_LINE_DOC);
    // "header\n" occupies 7 units, then 3000 x's, then "\n" at offset 3007.
    expect(oracleLineStarts(LONG_LINE_DOC)).toEqual([0, 7, 3008]);
    expect(r.lineColToOffset(1, 0)).toBe(7);
    expect(r.lineColToOffset(1, 1500)).toBe(1507);
    expect(r.lineColToOffset(2, 0)).toBe(3008);
  });

  test("lineColToOffset matches the oracle for every line start", () => {
    const docs = [
      LONG_LINE_DOC,
      `${"y".repeat(2000)}\nb\nc`, // long line first
      `a\n${"q".repeat(3000)}`, // long line last, unterminated
      `a\n${"m".repeat(1200)}\n${"n".repeat(1200)}\nz`, // two long lines
      `${"p".repeat(5000)}`, // single long line, no newline at all
    ];
    for (const text of docs) {
      const r = Rope.from(text);
      const starts = oracleLineStarts(text);
      expect(r.lineCount).toBe(starts.length);
      expect(starts.map((_, line) => r.lineColToOffset(line, 0))).toEqual(starts);
    }
  });

  test("offsetToLineCol at end-of-rope when the last line spans chunks", () => {
    const text = `a\n${"q".repeat(3000)}`;
    const r = Rope.from(text);
    expect(r.offsetToLineCol(r.length)).toEqual({ line: 1, col: 3000 });
  });

  test("both round-trips hold on a document with a long line", () => {
    const r = Rope.from(LONG_LINE_DOC);
    for (let offset = 0; offset <= r.length; offset++) {
      const { line, col } = r.offsetToLineCol(offset);
      expect(r.lineColToOffset(line, col)).toBe(offset);
    }
    const starts = oracleLineStarts(LONG_LINE_DOC);
    for (let line = 0; line < starts.length; line++) {
      const off = r.lineColToOffset(line, 0);
      expect(r.offsetToLineCol(off)).toEqual({ line, col: 0 });
    }
  });

  test("short-line documents are unaffected", () => {
    const text = "AAA\nBBBB\nCC\n\nDD";
    const r = Rope.from(text);
    for (let offset = 0; offset <= r.length; offset++) {
      expect(r.offsetToLineCol(offset)).toEqual(oracleLineCol(text, offset));
    }
    const starts = oracleLineStarts(text);
    expect(starts.map((_, line) => r.lineColToOffset(line, 0))).toEqual(starts);
  });
});

describe("Buffer - point/offset conversion on long lines", () => {
  test("pointToOffset lands on the requested column", () => {
    const buffer = createBuffer(createBufferId(), LONG_LINE_DOC);
    const snapshot = buffer.snapshot();
    expectOffset(snapshot.pointToOffset(point(1, 0)), 7);
    expectOffset(snapshot.pointToOffset(point(1, 1500)), 1507);
    expectOffset(snapshot.pointToOffset(point(2, 0)), 3008);
  });

  test("editing at a point on a long line edits that point", () => {
    const buffer = createBuffer(createBufferId(), LONG_LINE_DOC);
    const snapshot = buffer.snapshot();
    const offset = snapshot.pointToOffset(point(1, 0));
    const text = snapshot.text();
    // The character at the resolved offset must be the first of line 1.
    expect(text[Number(offset)]).toBe("x");
    expect(text[Number(offset) - 1]).toBe("\n");
  });
});
