/**
 * Excerpt textSummary coverage.
 *
 * `computeExcerptSummary()` (src/multibuffer/excerpt.ts) walks an excerpt's lines
 * character by character to produce a UTF-8 byte count. Before this file the whole
 * repository asserted an excerpt-level summary in exactly one place —
 * `excerpt.test.ts:305`, three assertions over a single ASCII fixture — which left
 * both non-ASCII branches of the byte counter unexecuted (coverage reported
 * `src/multibuffer/excerpt.ts` lines 26-31 uncovered on a full suite run).
 *
 * Expected values come from an independent `TextEncoder` oracle rather than from the
 * implementation's own hand-rolled branch table, so a mistake shared between test and
 * implementation cannot make both sides agree.
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { createBuffer } from "../../src/buffer/buffer.ts";
import { createExcerpt } from "../../src/multibuffer/excerpt.ts";
import type { TextSummary } from "../../src/multibuffer/types.ts";
import {
  createBufferId,
  createExcerptId,
  excerptRange,
  resetCounters,
} from "../helpers.ts";

beforeEach(() => {
  resetCounters();
});

const encoder = new TextEncoder();

/**
 * Independent expected summary for a list of excerpt rows.
 *
 * Deliberately does not reuse `utf8ByteLength()`: the rows are joined and handed to
 * `TextEncoder`, which is the platform's own UTF-8 encoder. Separator accounting falls
 * out of the join — an N-row excerpt carries N-1 newlines.
 */
function oracleSummary(rows: readonly string[]): TextSummary {
  const text = rows.join("\n");
  return {
    lines: rows.length,
    bytes: encoder.encode(text).length,
    chars: text.length,
    lastLineLength: (rows[rows.length - 1] ?? "").length,
  };
}

/** Summary of the excerpt covering [startRow, endRow) of a buffer holding `text`. */
function summaryOf(text: string, startRow: number, endRow: number): TextSummary {
  const buf = createBuffer(createBufferId(), text);
  const excerpt = createExcerpt(
    createExcerptId(),
    buf.snapshot(),
    excerptRange(startRow, endRow),
    false,
  );
  return excerpt.textSummary;
}

describe("Excerpt textSummary - ASCII", () => {
  test("sub-range excerpt summarises only its own rows", () => {
    // Rows 1..3 of a 5-row buffer: "BB" and "CCC" — the surrounding rows must not count.
    const summary = summaryOf("A\nBB\nCCC\nDDDD\nE", 1, 3);

    expect(summary).toEqual(oracleSummary(["BB", "CCC"]));
    expect(summary.bytes).toBe(6); // "BB" + "\n" + "CCC"
    expect(summary.lines).toBe(2);
  });

  test("single-row excerpt carries no separator", () => {
    const summary = summaryOf("A\nBB\nCCC", 1, 2);

    expect(summary).toEqual(oracleSummary(["BB"]));
    expect(summary.bytes).toBe(2); // no trailing newline is counted
    expect(summary.chars).toBe(2);
  });

  test("excerpt ending on an empty row reports lastLineLength 0", () => {
    const summary = summaryOf("A\nBB\n\nCCC", 0, 3);

    expect(summary).toEqual(oracleSummary(["A", "BB", ""]));
    expect(summary.lastLineLength).toBe(0);
    expect(summary.bytes).toBe(5); // "A\nBB\n"
  });

  test("chars counts the newlines between rows", () => {
    const summary = summaryOf("A\nB\nC\nD", 0, 4);

    expect(summary.chars).toBe(7); // 4 rows + 3 separators
    expect(summary).toEqual(oracleSummary(["A", "B", "C", "D"]));
  });
});

describe("Excerpt textSummary - non-ASCII byte counts", () => {
  test("two-byte code points cost two bytes, one char", () => {
    // U+00E9 é — the 0x80..0x7FF branch of the byte counter.
    const summary = summaryOf("ascii\nhéllo\nascii", 1, 2);

    expect(summary).toEqual(oracleSummary(["héllo"]));
    expect(summary.bytes).toBe(6);
    expect(summary.chars).toBe(5);
  });

  test("two-byte/three-byte boundary is at U+07FF", () => {
    // U+07FF is the last two-byte code point; U+0800 is the first three-byte one.
    const twoByte = summaryOf("߿", 0, 1);
    const threeByte = summaryOf("ࠀ", 0, 1);

    expect(twoByte.bytes).toBe(2);
    expect(threeByte.bytes).toBe(3);
    expect(twoByte).toEqual(oracleSummary(["߿"]));
    expect(threeByte).toEqual(oracleSummary(["ࠀ"]));
  });

  test("three-byte CJK code points", () => {
    const summary = summaryOf("A\n日本語\nB", 1, 2);

    expect(summary).toEqual(oracleSummary(["日本語"]));
    expect(summary.bytes).toBe(9);
    expect(summary.chars).toBe(3);
  });

  test("surrogate pair counts four bytes and two chars", () => {
    // U+1F389 🎉 is a single code point stored as two UTF-16 code units.
    const summary = summaryOf("A\n🎉\nB", 1, 2);

    expect(summary).toEqual(oracleSummary(["🎉"]));
    expect(summary.bytes).toBe(4);
    expect(summary.chars).toBe(2); // chars is a UTF-16 code-unit count, not a code-point count
    expect(summary.lastLineLength).toBe(2);
  });

  test("bytes and chars diverge on a mixed multi-row excerpt", () => {
    const rows = ["café", "日本", "🎉x"];
    const summary = summaryOf(`skip\n${rows.join("\n")}\nskip`, 1, 4);

    expect(summary).toEqual(oracleSummary(rows));
    // "café" 5 + "日本" 6 + "🎉x" 5 + two separators
    expect(summary.bytes).toBe(18);
    expect(summary.chars).toBe(11);
  });
});

describe("Excerpt textSummary - full-buffer fast path", () => {
  test("full-range excerpt reuses the buffer's own summary object", () => {
    const buf = createBuffer(createBufferId(), "A\nBB\nCCC");
    const snapshot = buf.snapshot();
    const excerpt = createExcerpt(
      createExcerptId(),
      snapshot,
      excerptRange(0, snapshot.lineCount),
      false,
    );

    // Reference equality pins the O(1) shortcut: no rope walk for a whole-buffer excerpt.
    expect(excerpt.textSummary).toBe(snapshot.textSummary);
  });

  test("fast path agrees with the oracle for multibyte content", () => {
    const buf = createBuffer(createBufferId(), "café\n日本\n🎉");
    const snapshot = buf.snapshot();
    const excerpt = createExcerpt(
      createExcerptId(),
      snapshot,
      excerptRange(0, snapshot.lineCount),
      false,
    );

    expect(excerpt.textSummary).toEqual(oracleSummary(["café", "日本", "🎉"]));
  });

  test("fast path agrees with the oracle when the buffer ends in a newline", () => {
    const buf = createBuffer(createBufferId(), "A\nB\n");
    const snapshot = buf.snapshot();
    const excerpt = createExcerpt(
      createExcerptId(),
      snapshot,
      excerptRange(0, snapshot.lineCount),
      false,
    );

    // A trailing newline yields a final empty row, so the summary spans 3 rows.
    expect(excerpt.textSummary).toEqual(oracleSummary(["A", "B", ""]));
    expect(excerpt.textSummary.lines).toBe(3);
  });

  test("fast and slow paths produce identical summaries for identical content", () => {
    // Same two rows reached two ways: a whole-buffer excerpt (fast path, reuses the
    // buffer summary) and a sub-range excerpt of a longer buffer (per-line walk).
    const fast = summaryOf("café\n日本", 0, 2);
    const slow = summaryOf("café\n日本\ntrailing", 0, 2);

    expect(fast).toEqual(slow);
    expect(fast).toEqual(oracleSummary(["café", "日本"]));
  });
});
