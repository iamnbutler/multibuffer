/**
 * Property-based fuzz tests for the Rope data structure using fast-check.
 *
 * Properties verified:
 *   1. Text equivalence  — rope.text() matches naive string after any edits
 *   2. Length invariant  — rope.length === string.length at all times
 *   3. Line count        — rope.lineCount === string.split("\n").length
 *   4. Line access       — rope.line(n) === string.split("\n")[n]
 *   5. Lines range       — rope.lines(a, b) === string.split("\n").slice(a, b)
 *   6. Slice consistency — rope.slice(a, b) === rope.text().slice(a, b)
 *   7. Position round-trip — lineColToOffset(offsetToLineCol(o)) === o
 *   8. Reverse round-trip — offsetToLineCol(lineColToOffset(l, c)) === {l, c}
 *
 * @see https://github.com/iamnbutler/multibuffer/issues/80
 */

import { describe, expect, test } from "bun:test";
import * as fc from "fast-check";
import { Rope } from "../../src/buffer/rope.ts";
import {
  applyToString,
  clampEditOp,
  type EditOp,
  editOpArb,
  fcParams,
  surrogateStringArb,
  unicodeArb,
} from "./arbitraries.ts";

// ── Rope-specific operation helper ────────────────────────────────────────────

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

describe("Rope fuzz: text() and length match naive string", () => {
  test("insert/delete/replace sequences produce identical text", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 100 }),
        fc.array(editOpArb, { maxLength: 50 }),
        (initial, ops) => {
          let rope = Rope.from(initial);
          let naive = initial;

          for (const rawOp of ops) {
            const op = clampEditOp(rawOp, naive.length);
            naive = applyToString(naive, op);
            rope = applyToRope(rope, op);

            // Invariant: rope text must match naive string
            if (rope.text() !== naive) return false;
            if (rope.length !== naive.length) return false;
          }
          return true;
        },
      ),
      fcParams,
    );
  });

  test("unicode strings maintain text equivalence", () => {
    fc.assert(
      fc.property(
        unicodeArb,
        fc.array(editOpArb, { maxLength: 30 }),
        (initial, ops) => {
          let rope = Rope.from(initial);
          let naive = initial;

          for (const rawOp of ops) {
            const op = clampEditOp(rawOp, naive.length);
            naive = applyToString(naive, op);
            rope = applyToRope(rope, op);
          }

          return rope.text() === naive && rope.length === naive.length;
        },
      ),
      fcParams,
    );
  });

  test("surrogate pairs are preserved through edits", () => {
    fc.assert(
      fc.property(
        surrogateStringArb,
        fc.array(editOpArb, { maxLength: 20 }),
        (initial, ops) => {
          let rope = Rope.from(initial);
          let naive = initial;

          for (const rawOp of ops) {
            const op = clampEditOp(rawOp, naive.length);
            naive = applyToString(naive, op);
            rope = applyToRope(rope, op);
          }

          return rope.text() === naive;
        },
      ),
      fcParams,
    );
  });
});

// ── Property 3: lineCount ─────────────────────────────────────────────────────

describe("Rope fuzz: lineCount === text.split('\\n').length", () => {
  test("lineCount tracks newline count through edit sequences", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 100 }),
        fc.array(editOpArb, { maxLength: 50 }),
        (initial, ops) => {
          let rope = Rope.from(initial);
          let naive = initial;

          for (const rawOp of ops) {
            const op = clampEditOp(rawOp, naive.length);
            naive = applyToString(naive, op);
            rope = applyToRope(rope, op);

            const expectedLineCount = naive.split("\n").length;
            if (rope.lineCount !== expectedLineCount) return false;
          }
          return true;
        },
      ),
      fcParams,
    );
  });
});

// ── Property 4: line(n) ───────────────────────────────────────────────────────

describe("Rope fuzz: line(n) matches split-on-newline", () => {
  test("each line matches the corresponding segment of text", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 100 }),
        fc.array(editOpArb, { maxLength: 30 }),
        (initial, ops) => {
          let rope = Rope.from(initial);
          let naive = initial;

          for (const rawOp of ops) {
            const op = clampEditOp(rawOp, naive.length);
            naive = applyToString(naive, op);
            rope = applyToRope(rope, op);
          }

          // Verify every line
          const lines = naive.split("\n");
          for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
            const expected = lines[lineIdx];
            if (expected === undefined) return false;
            if (rope.line(lineIdx) !== expected) return false;
          }
          return true;
        },
      ),
      fcParams,
    );
  });
});

// ── Property 5: lines(a, b) ───────────────────────────────────────────────────

describe("Rope fuzz: lines(a, b) === text.split('\\n').slice(a, b)", () => {
  test("lines range returns correct subset", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 100 }),
        fc.array(editOpArb, { maxLength: 20 }),
        fc.nat(50),
        fc.nat(50),
        (initial, ops, a, b) => {
          let rope = Rope.from(initial);
          let naive = initial;

          for (const rawOp of ops) {
            const op = clampEditOp(rawOp, naive.length);
            naive = applyToString(naive, op);
            rope = applyToRope(rope, op);
          }

          const allLines = naive.split("\n");
          const startRow = Math.min(a, allLines.length);
          const endRow = Math.min(Math.max(b, startRow), allLines.length);

          const ropeLines = rope.lines(startRow, endRow);
          const expected = allLines.slice(startRow, endRow);

          if (ropeLines.length !== expected.length) return false;
          for (let i = 0; i < ropeLines.length; i++) {
            if (ropeLines[i] !== expected[i]) return false;
          }
          return true;
        },
      ),
      fcParams,
    );
  });
});

// ── Property 6: slice consistency ─────────────────────────────────────────────

describe("Rope fuzz: slice(a, b) === text().slice(a, b)", () => {
  test("slice returns correct substring", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 100 }),
        fc.array(editOpArb, { maxLength: 20 }),
        fc.nat(200),
        fc.nat(200),
        (initial, ops, a, b) => {
          let rope = Rope.from(initial);
          let naive = initial;

          for (const rawOp of ops) {
            const op = clampEditOp(rawOp, naive.length);
            naive = applyToString(naive, op);
            rope = applyToRope(rope, op);
          }

          const start = Math.min(a, naive.length);
          const end = Math.min(Math.max(b, start), naive.length);

          return rope.slice(start, end) === naive.slice(start, end);
        },
      ),
      fcParams,
    );
  });
});

// ── Property 7: Position round-trip ───────────────────────────────────────────

describe("Rope fuzz: position round-trips", () => {
  test("lineColToOffset(offsetToLineCol(offset)) === offset", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 100 }),
        fc.array(editOpArb, { maxLength: 20 }),
        fc.nat(200),
        (initial, ops, sampleOffset) => {
          let rope = Rope.from(initial);
          let naive = initial;

          for (const rawOp of ops) {
            const op = clampEditOp(rawOp, naive.length);
            naive = applyToString(naive, op);
            rope = applyToRope(rope, op);
          }

          // Test several offsets including the sampled one
          const offsets = [0, Math.min(sampleOffset, naive.length), naive.length];

          for (const offset of offsets) {
            const { line, col } = rope.offsetToLineCol(offset);
            const roundTripped = rope.lineColToOffset(line, col);
            if (roundTripped !== offset) return false;
          }
          return true;
        },
      ),
      fcParams,
    );
  });

  test("position round-trip at all valid offsets", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 50 }),
        (text) => {
          const rope = Rope.from(text);

          // Test all valid offsets
          for (let offset = 0; offset <= text.length; offset++) {
            const { line, col } = rope.offsetToLineCol(offset);
            const roundTripped = rope.lineColToOffset(line, col);
            if (roundTripped !== offset) return false;
          }
          return true;
        },
      ),
      fcParams,
    );
  });
});

// ── Property 8: Reverse round-trip ────────────────────────────────────────────

describe("Rope fuzz: offsetToLineCol(lineColToOffset(l, c)) === {l, c}", () => {
  test("valid line/col pairs round-trip correctly", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 50 }),
        (text) => {
          const rope = Rope.from(text);
          const lines = text.split("\n");

          // Test all valid line/col combinations
          for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
            const lineText = lines[lineIdx] ?? "";
            for (let col = 0; col <= lineText.length; col++) {
              const offset = rope.lineColToOffset(lineIdx, col);
              const { line: roundLine, col: roundCol } =
                rope.offsetToLineCol(offset);
              if (roundLine !== lineIdx || roundCol !== col) return false;
            }
          }
          return true;
        },
      ),
      fcParams,
    );
  });
});

// ── Structural invariants ─────────────────────────────────────────────────────

describe("Rope fuzz: structural invariants", () => {
  test("empty rope has correct properties", () => {
    const rope = Rope.from("");
    expect(rope.length).toBe(0);
    expect(rope.lineCount).toBe(1);
    expect(rope.text()).toBe("");
    expect(rope.line(0)).toBe("");
  });

  test("single line rope has correct properties", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 100 }).filter((s) => !s.includes("\n")),
        (text) => {
          const rope = Rope.from(text);
          return (
            rope.length === text.length &&
            rope.lineCount === 1 &&
            rope.text() === text &&
            rope.line(0) === text
          );
        },
      ),
      fcParams,
    );
  });

  test("multi-line rope has correct line count", () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ maxLength: 30 }), { minLength: 2, maxLength: 10 }),
        (lines) => {
          const text = lines.join("\n");
          const rope = Rope.from(text);
          return rope.lineCount === lines.length;
        },
      ),
      fcParams,
    );
  });
});
