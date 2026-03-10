/**
 * Fuzz tests for the Rope data structure.
 *
 * Properties tested:
 * - Text equivalence after edit sequences
 * - Line count invariant
 * - Line access consistency
 * - Position conversion round-trips
 */

import { describe, it, expect } from "bun:test";
import * as fc from "fast-check";
import { Rope } from "../../src/multibuffer/rope.ts";
import { editOpArb, unicodeStringArb, multilineTextArb, NUM_RUNS } from "./arbitraries.ts";

describe("Rope fuzz tests", () => {
  it("text() equals naive string after edit sequence", () => {
    fc.assert(
      fc.property(
        unicodeStringArb,
        fc.array(editOpArb, { maxLength: 30 }),
        (initial, ops) => {
          let rope = Rope.from(initial);
          let naive = initial;

          for (const op of ops) {
            if (op.type === "insert") {
              const offset = Math.min(op.offset, naive.length);
              const text = op.text ?? "";
              rope = rope.insert(offset, text);
              naive = naive.slice(0, offset) + text + naive.slice(offset);
            } else if (op.type === "delete") {
              const start = Math.min(op.offset, naive.length);
              const end = Math.min(Math.max(op.endOffset ?? start, start), naive.length);
              rope = rope.delete(start, end);
              naive = naive.slice(0, start) + naive.slice(end);
            } else if (op.type === "replace") {
              const start = Math.min(op.offset, naive.length);
              const end = Math.min(Math.max(op.endOffset ?? start, start), naive.length);
              const text = op.text ?? "";
              rope = rope.replace(start, end, text);
              naive = naive.slice(0, start) + text + naive.slice(end);
            }
          }

          return rope.text() === naive;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("lineCount equals text.split('\\n').length", () => {
    fc.assert(
      fc.property(multilineTextArb, (text) => {
        const rope = Rope.from(text);
        const expected = text.split("\n").length;
        return rope.lineCount === expected;
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("line(n) equals text.split('\\n')[n]", () => {
    fc.assert(
      fc.property(multilineTextArb, fc.nat({ max: 100 }), (text, row) => {
        const rope = Rope.from(text);
        const lines = text.split("\n");

        if (row >= lines.length) {
          // Out of bounds should return empty string
          return rope.line(row) === "";
        }

        return rope.line(row) === lines[row];
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("lines(a, b) equals text.split('\\n').slice(a, b)", () => {
    fc.assert(
      fc.property(
        multilineTextArb,
        fc.nat({ max: 50 }),
        fc.nat({ max: 50 }),
        (text, a, b) => {
          const rope = Rope.from(text);
          const allLines = text.split("\n");

          // Clamp to valid range
          const start = Math.min(a, allLines.length);
          const end = Math.min(Math.max(b, start), allLines.length);

          const ropeLines = rope.lines(start, end);
          const naiveLines = allLines.slice(start, end);

          if (ropeLines.length !== naiveLines.length) return false;
          for (let i = 0; i < ropeLines.length; i++) {
            if (ropeLines[i] !== naiveLines[i]) return false;
          }
          return true;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("offsetToLineCol → lineColToOffset round-trips", () => {
    fc.assert(
      fc.property(multilineTextArb, fc.nat({ max: 5000 }), (text, offset) => {
        const rope = Rope.from(text);
        const clampedOffset = Math.min(offset, rope.length);

        const { line, col } = rope.offsetToLineCol(clampedOffset);
        const roundTrip = rope.lineColToOffset(line, col);

        return roundTrip === clampedOffset;
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("lineColToOffset → offsetToLineCol round-trips for valid positions", () => {
    fc.assert(
      fc.property(
        multilineTextArb,
        fc.nat({ max: 100 }),
        fc.nat({ max: 200 }),
        (text, line, col) => {
          const rope = Rope.from(text);
          const lines = text.split("\n");

          // Clamp to valid line
          const clampedLine = Math.min(line, lines.length - 1);
          const lineText = lines[clampedLine] ?? "";
          // Clamp to valid column
          const clampedCol = Math.min(col, lineText.length);

          const offset = rope.lineColToOffset(clampedLine, clampedCol);
          const { line: rtLine, col: rtCol } = rope.offsetToLineCol(offset);

          return rtLine === clampedLine && rtCol === clampedCol;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("slice returns correct substring", () => {
    fc.assert(
      fc.property(
        unicodeStringArb,
        fc.nat({ max: 1000 }),
        fc.nat({ max: 1000 }),
        (text, start, end) => {
          const rope = Rope.from(text);
          const clampedStart = Math.min(start, text.length);
          const clampedEnd = Math.min(Math.max(end, clampedStart), text.length);

          return rope.slice(clampedStart, clampedEnd) === text.slice(clampedStart, clampedEnd);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("insert at offset 0 prepends text", () => {
    fc.assert(
      fc.property(unicodeStringArb, unicodeStringArb, (original, toInsert) => {
        const rope = Rope.from(original);
        const result = rope.insert(0, toInsert);
        return result.text() === toInsert + original;
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("insert at end appends text", () => {
    fc.assert(
      fc.property(unicodeStringArb, unicodeStringArb, (original, toInsert) => {
        const rope = Rope.from(original);
        const result = rope.insert(rope.length, toInsert);
        return result.text() === original + toInsert;
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("delete entire range produces empty string", () => {
    fc.assert(
      fc.property(unicodeStringArb, (text) => {
        const rope = Rope.from(text);
        const result = rope.delete(0, rope.length);
        return result.text() === "";
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("replace with same text is idempotent", () => {
    fc.assert(
      fc.property(
        unicodeStringArb,
        fc.nat({ max: 500 }),
        fc.nat({ max: 500 }),
        (text, start, end) => {
          const rope = Rope.from(text);
          const clampedStart = Math.min(start, text.length);
          const clampedEnd = Math.min(Math.max(end, clampedStart), text.length);
          const original = text.slice(clampedStart, clampedEnd);

          const result = rope.replace(clampedStart, clampedEnd, original);
          return result.text() === text;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
