/**
 * Property-based tests for the Rope data structure.
 *
 * Tests that rope operations produce the same results as equivalent naive
 * string operations across randomised edit sequences. This is a dependency-free
 * precursor to the full fast-check suite proposed in issue #80.
 *
 * Properties verified:
 *   1. Text equivalence  — rope.text() matches naive string after any edits
 *   2. Length invariant  — rope.length === string.length at all times
 *   3. lineCount         — rope.lineCount === string.split("\n").length
 *   4. line(n)           — rope.line(n) === string.split("\n")[n]
 *   5. Position round-trip — lineColToOffset(offsetToLineCol(o)) === o
 *   6. Reverse round-trip  — offsetToLineCol(lineColToOffset(l, c)) === {l, c}
 */

import { describe, expect, test } from "bun:test";
import { Rope } from "../../src/buffer/rope.ts";

// ── Deterministic PRNG ────────────────────────────────────────────────────────

/**
 * Mulberry32 PRNG: deterministic, fast, reasonable statistical properties.
 * Returns values in [0, 1).
 */
function mulberry32(seed: number): () => number {
  let s = seed;
  return (): number => {
    s = (s + 0x6d2b79f5) | 0;
    let z = Math.imul(s ^ (s >>> 15), 1 | s);
    z ^= z + Math.imul(z ^ (z >>> 7), 61 | z);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Random value generators ───────────────────────────────────────────────────

/** ASCII printable chars plus newline (heavy on newlines to exercise multi-line paths). */
const CHARSET = "abcde fg\n\n\n";

function randomString(rng: () => number, maxLen: number): string {
  const len = Math.floor(rng() * (maxLen + 1));
  let result = "";
  for (let i = 0; i < len; i++) {
    result += CHARSET[Math.floor(rng() * CHARSET.length)];
  }
  return result;
}

type EditOp =
  | { type: "insert"; offset: number; text: string }
  | { type: "delete"; start: number; end: number }
  | { type: "replace"; start: number; end: number; text: string };

function randomOp(rng: () => number, len: number): EditOp {
  const kind = Math.floor(rng() * 3);
  // Clamp to valid range (len may be 0)
  const a = len > 0 ? Math.floor(rng() * (len + 1)) : 0;
  const b = len > 0 ? Math.floor(rng() * (len + 1)) : 0;
  const start = Math.min(a, b);
  const end = Math.max(a, b);
  const text = randomString(rng, 8);

  switch (kind) {
    case 0:
      return { type: "insert", offset: start, text };
    case 1:
      return { type: "delete", start, end };
    default:
      return { type: "replace", start, end, text };
  }
}

// ── Operation helpers ─────────────────────────────────────────────────────────

function applyToString(s: string, op: EditOp): string {
  switch (op.type) {
    case "insert":
      return s.slice(0, op.offset) + op.text + s.slice(op.offset);
    case "delete":
      return s.slice(0, op.start) + s.slice(op.end);
    case "replace":
      return s.slice(0, op.start) + op.text + s.slice(op.end);
  }
}

function applyToRope(rope: Rope, op: EditOp): Rope {
  switch (op.type) {
    case "insert":
      return rope.insert(op.offset, op.text);
    case "delete":
      return rope.delete(op.start, op.end);
    case "replace":
      return rope.replace(op.start, op.end, op.text);
  }
}

// ── Property 1 & 2: Text equivalence and length ───────────────────────────────

describe("Rope property: text() and length match naive string", () => {
  test("insert/delete/replace sequences produce identical text", () => {
    const rng = mulberry32(0xdeadbeef);
    const NUM_SEQUENCES = 60;
    const EDITS_PER_SEQ = 25;

    for (let seq = 0; seq < NUM_SEQUENCES; seq++) {
      let str = randomString(rng, 30);
      let rope = Rope.from(str);

      for (let i = 0; i < EDITS_PER_SEQ; i++) {
        const op = randomOp(rng, str.length);
        str = applyToString(str, op);
        rope = applyToRope(rope, op);

        expect(rope.text()).toBe(str);
        expect(rope.length).toBe(str.length);
      }
    }
  });

  test("large initial text with edits maintains text equivalence", () => {
    const rng = mulberry32(0xc0ffee42);
    // Build a large string > TARGET_CHUNK_SIZE (1024) to exercise multi-chunk paths
    let str = "line content\n".repeat(100); // ~1300 chars
    let rope = Rope.from(str);
    expect(rope.text()).toBe(str);

    const NUM_EDITS = 50;
    for (let i = 0; i < NUM_EDITS; i++) {
      const op = randomOp(rng, str.length);
      str = applyToString(str, op);
      rope = applyToRope(rope, op);
      expect(rope.text()).toBe(str);
    }
  });
});

// ── Property 3: lineCount ─────────────────────────────────────────────────────

describe("Rope property: lineCount === text.split('\\n').length", () => {
  test("lineCount tracks newline count through edit sequences", () => {
    const rng = mulberry32(0xfeedface);
    const NUM_SEQUENCES = 60;
    const EDITS_PER_SEQ = 25;

    for (let seq = 0; seq < NUM_SEQUENCES; seq++) {
      let str = randomString(rng, 30);
      let rope = Rope.from(str);

      for (let i = 0; i < EDITS_PER_SEQ; i++) {
        const op = randomOp(rng, str.length);
        str = applyToString(str, op);
        rope = applyToRope(rope, op);

        expect(rope.lineCount).toBe(str.split("\n").length);
      }
    }
  });
});

// ── Property 4: line(n) ───────────────────────────────────────────────────────

describe("Rope property: line(n) matches split-on-newline", () => {
  test("each line matches the corresponding segment of text", () => {
    const rng = mulberry32(0xbadcafe0);
    const NUM_SEQUENCES = 40;
    const EDITS_PER_SEQ = 20;

    for (let seq = 0; seq < NUM_SEQUENCES; seq++) {
      let str = randomString(rng, 30);
      let rope = Rope.from(str);

      for (let i = 0; i < EDITS_PER_SEQ; i++) {
        const op = randomOp(rng, str.length);
        str = applyToString(str, op);
        rope = applyToRope(rope, op);
      }

      // Verify every line
      const lines = str.split("\n");
      for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
        const expected = lines[lineIdx];
        if (expected === undefined) throw new Error(`Expected line at index ${lineIdx}`);
        expect(rope.line(lineIdx) ?? "").toBe(expected);
      }
    }
  });
});

// ── Properties 5 & 6: Position round-trips ───────────────────────────────────

describe("Rope property: position round-trips", () => {
  test("lineColToOffset(offsetToLineCol(offset)) === offset", () => {
    const rng = mulberry32(0xcafebabe);
    const NUM_SEQUENCES = 40;
    const EDITS_PER_SEQ = 20;

    for (let seq = 0; seq < NUM_SEQUENCES; seq++) {
      let str = randomString(rng, 50);
      let rope = Rope.from(str);

      for (let i = 0; i < EDITS_PER_SEQ; i++) {
        const op = randomOp(rng, str.length);
        str = applyToString(str, op);
        rope = applyToRope(rope, op);
      }

      // Sample offsets spread across the buffer
      const step = Math.max(1, Math.floor(str.length / 15));
      for (let offset = 0; offset <= str.length; offset += step) {
        const { line, col } = rope.offsetToLineCol(offset);
        const roundTripped = rope.lineColToOffset(line, col);
        expect(roundTripped).toBe(offset);
      }
    }
  });

  test("offsetToLineCol(lineColToOffset(line, col)) returns same {line, col}", () => {
    const rng = mulberry32(0xabcd1234);
    const NUM_SEQUENCES = 40;
    const EDITS_PER_SEQ = 20;

    for (let seq = 0; seq < NUM_SEQUENCES; seq++) {
      let str = randomString(rng, 50);
      let rope = Rope.from(str);

      for (let i = 0; i < EDITS_PER_SEQ; i++) {
        const op = randomOp(rng, str.length);
        str = applyToString(str, op);
        rope = applyToRope(rope, op);
      }

      // Sample line/col pairs across the buffer
      const lines = str.split("\n");
      const lineStep = Math.max(1, Math.floor(lines.length / 5));
      for (let lineIdx = 0; lineIdx < lines.length; lineIdx += lineStep) {
        const lineText = lines[lineIdx] ?? "";
        const colStep = Math.max(1, Math.floor(lineText.length / 4));
        for (let col = 0; col <= lineText.length; col += colStep) {
          const offset = rope.lineColToOffset(lineIdx, col);
          const { line: roundLine, col: roundCol } = rope.offsetToLineCol(offset);
          expect(roundLine).toBe(lineIdx);
          expect(roundCol).toBe(col);
        }
      }
    }
  });
});
