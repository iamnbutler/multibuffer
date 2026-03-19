/**
 * Property-based fuzz tests for Unicode edge cases using fast-check.
 *
 * Properties verified:
 *   1. Surrogate pairs — editing around surrogate pairs doesn't corrupt text
 *   2. ZWJ sequences — emoji with joiners handled correctly
 *   3. CRLF — Windows line endings don't break line counting
 *   4. Combining characters — text with combining marks handles correctly
 *   5. Mixed encodings — text with various Unicode ranges
 *
 * @see https://github.com/iamnbutler/multibuffer/issues/80
 */

import { describe, expect, test } from "bun:test";
import * as fc from "fast-check";
import { createBuffer } from "../../src/buffer/buffer.ts";
import { Rope } from "../../src/buffer/rope.ts";
import type { BufferId, BufferOffset } from "../../src/buffer/types.ts";
import { createSingleBufferEditor } from "../../src/editor/factories.ts";
import type { MultiBufferRow } from "../../src/multibuffer/types.ts";
import {
  crlfStringArb,
  fcParams,
  string16bitsArb,
  surrogateStringArb,
  unicodeArb,
  zwjStringArb,
} from "./arbitraries.ts";

// ── Helpers ───────────────────────────────────────────────────────────────────

let bufferIdCounter = 0;

function createBufferId(): BufferId {
  // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction for test
  return `fuzz-unicode-buffer-${++bufferIdCounter}` as BufferId;
}

function offset(n: number): BufferOffset {
  // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction for test
  return n as BufferOffset;
}

function mbRow(n: number): MultiBufferRow {
  // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction for test
  return n as MultiBufferRow;
}

// ── Property 1: Surrogate pairs ───────────────────────────────────────────────

describe("Unicode fuzz: surrogate pairs", () => {
  test("rope preserves surrogate pairs through edits", () => {
    fc.assert(
      fc.property(
        surrogateStringArb,
        fc.nat(100),
        fc.string({ maxLength: 20 }),
        (text, insertPos, insertText) => {
          const rope = Rope.from(text);

          // Insert at a position within bounds
          const pos = Math.min(insertPos, text.length);
          const newRope = rope.insert(pos, insertText);

          // The result should be equivalent to naive string operation
          const expected = text.slice(0, pos) + insertText + text.slice(pos);
          return newRope.text() === expected;
        },
      ),
      fcParams,
    );
  });

  test("buffer preserves surrogate pairs through edits", () => {
    fc.assert(
      fc.property(
        surrogateStringArb,
        fc.nat(100),
        fc.string({ maxLength: 20 }),
        (text, insertPos, insertText) => {
          const buffer = createBuffer(createBufferId(), text);

          const pos = Math.min(insertPos, text.length);
          buffer.insert(offset(pos), insertText);

          const expected = text.slice(0, pos) + insertText + text.slice(pos);
          return buffer.snapshot().text() === expected;
        },
      ),
      fcParams,
    );
  });

  test("editor preserves surrogate pairs through typing", () => {
    fc.assert(
      fc.property(
        surrogateStringArb,
        fc.string({ minLength: 1, maxLength: 10 }),
        (initialText, insertText) => {
          const editor = createSingleBufferEditor(initialText);

          // Insert at cursor position (start of buffer)
          editor.dispatch({ type: "insertText", text: insertText });

          // Text should contain the inserted text (at the start since cursor starts at 0,0)
          const resultLines = editor.multiBuffer.snapshot().lines(
            mbRow(0),
            mbRow(editor.multiBuffer.lineCount),
          );
          const resultText = resultLines.join("\n");
          return resultText.includes(insertText);
        },
      ),
      fcParams,
    );
  });

  test("deleting around surrogate pairs maintains valid UTF-16", () => {
    const emoji = "\uD83D\uDE00"; // U+1F600 grinning face (2 code units)
    const text = `a${emoji}b`;

    const rope = Rope.from(text);

    // Delete the emoji (positions 1-3 in UTF-16)
    const afterDelete = rope.delete(1, 3);
    expect(afterDelete.text()).toBe("ab");

    // Insert at position 1 (between 'a' and what was the emoji)
    const rope2 = Rope.from(text);
    const afterInsert = rope2.insert(1, "X");
    expect(afterInsert.text()).toBe(`aX${emoji}b`);
  });

  test("splitting surrogate pairs produces valid strings", () => {
    fc.assert(
      fc.property(
        string16bitsArb,
        (text) => {
          const rope = Rope.from(text);

          // Rope should preserve the exact text
          if (rope.text() !== text) return false;

          // Line count should match split
          if (rope.lineCount !== text.split("\n").length) return false;

          return true;
        },
      ),
      fcParams,
    );
  });
});

// ── Property 2: ZWJ sequences ─────────────────────────────────────────────────

describe("Unicode fuzz: ZWJ sequences", () => {
  test("rope preserves ZWJ sequences", () => {
    fc.assert(
      fc.property(
        zwjStringArb,
        (text) => {
          const rope = Rope.from(text);
          return rope.text() === text;
        },
      ),
      fcParams,
    );
  });

  test("editing around ZWJ sequences preserves them", () => {
    // Family emoji: man + ZWJ + woman + ZWJ + girl + ZWJ + boy
    const family = "\uD83D\uDC68\u200D\uD83D\uDC69\u200D\uD83D\uDC67\u200D\uD83D\uDC66";
    const text = `Hello ${family} World`;

    const rope = Rope.from(text);

    // Insert before the family
    const afterInsert = rope.insert(6, "!");
    expect(afterInsert.text()).toBe(`Hello !${family} World`);

    // Insert after the family
    const afterInsert2 = rope.insert(6 + family.length, "!");
    expect(afterInsert2.text()).toBe(`Hello ${family}! World`);
  });

  test("buffer handles ZWJ sequences correctly", () => {
    fc.assert(
      fc.property(
        zwjStringArb,
        fc.nat(100),
        fc.string({ maxLength: 10 }),
        (text, pos, insert) => {
          const buffer = createBuffer(createBufferId(), text);
          const clampedPos = Math.min(pos, text.length);

          buffer.insert(offset(clampedPos), insert);

          const expected = text.slice(0, clampedPos) + insert + text.slice(clampedPos);
          return buffer.snapshot().text() === expected;
        },
      ),
      fcParams,
    );
  });
});

// ── Property 3: CRLF ──────────────────────────────────────────────────────────

describe("Unicode fuzz: CRLF line endings", () => {
  test("rope lineCount handles CRLF correctly", () => {
    // CRLF should count as single line ending (one \n)
    const text = "Line1\r\nLine2\r\nLine3";
    const rope = Rope.from(text);

    // Each \n (including those in \r\n) creates a line boundary
    // So "Line1\r\nLine2\r\nLine3" has 3 lines
    const expectedLineCount = text.split("\n").length;
    expect(rope.lineCount).toBe(expectedLineCount);
  });

  test("rope line() returns correct content with CRLF", () => {
    const text = "Line1\r\nLine2\r\nLine3";
    const rope = Rope.from(text);

    // Lines include trailing \r from \r\n
    expect(rope.line(0)).toBe("Line1\r");
    expect(rope.line(1)).toBe("Line2\r");
    expect(rope.line(2)).toBe("Line3");
  });

  test("editing CRLF text preserves structure", () => {
    fc.assert(
      fc.property(
        crlfStringArb,
        fc.nat(100),
        fc.string({ maxLength: 20 }),
        (text, pos, insert) => {
          const rope = Rope.from(text);
          const clampedPos = Math.min(pos, text.length);

          const afterInsert = rope.insert(clampedPos, insert);
          const expected = text.slice(0, clampedPos) + insert + text.slice(clampedPos);

          return afterInsert.text() === expected;
        },
      ),
      fcParams,
    );
  });

  test("buffer lineCount with CRLF", () => {
    fc.assert(
      fc.property(
        crlfStringArb,
        (text) => {
          const buffer = createBuffer(createBufferId(), text);
          const snap = buffer.snapshot();
          const expectedLineCount = text.split("\n").length;
          return snap.lineCount === expectedLineCount;
        },
      ),
      fcParams,
    );
  });
});

// ── Property 4: Combining characters ──────────────────────────────────────────

describe("Unicode fuzz: combining characters", () => {
  test("rope preserves combining characters", () => {
    // e + combining acute accent
    const eAcute = "e\u0301";
    const text = `caf${eAcute}`;

    const rope = Rope.from(text);
    expect(rope.text()).toBe(text);
    expect(rope.length).toBe(text.length);
  });

  test("editing around combining characters", () => {
    const eAcute = "e\u0301";
    const text = `caf${eAcute}`;

    const rope = Rope.from(text);

    // Insert before the combining sequence
    const afterInsert = rope.insert(3, "!");
    expect(afterInsert.text()).toBe(`caf!${eAcute}`);

    // Insert after the combining sequence
    const afterInsert2 = rope.insert(5, "!");
    expect(afterInsert2.text()).toBe(`caf${eAcute}!`);
  });

  test("buffer handles combining characters", () => {
    const nTilde = "n\u0303"; // n + combining tilde
    const text = `ma${nTilde}ana`;

    const buffer = createBuffer(createBufferId(), text);
    expect(buffer.snapshot().text()).toBe(text);

    // Insert in the middle
    buffer.insert(offset(3), "X");
    expect(buffer.snapshot().text()).toBe(`ma${nTilde.charAt(0)}X${nTilde.charAt(1)}ana`);
  });
});

// ── Property 5: Mixed Unicode ─────────────────────────────────────────────────

describe("Unicode fuzz: mixed Unicode text", () => {
  test("rope handles arbitrary unicode text", () => {
    fc.assert(
      fc.property(
        unicodeArb,
        (text) => {
          const rope = Rope.from(text);
          return rope.text() === text && rope.length === text.length;
        },
      ),
      fcParams,
    );
  });

  test("buffer handles arbitrary unicode text", () => {
    fc.assert(
      fc.property(
        unicodeArb,
        (text) => {
          const buffer = createBuffer(createBufferId(), text);
          return buffer.snapshot().text() === text;
        },
      ),
      fcParams,
    );
  });

  test("editor handles arbitrary unicode text", () => {
    fc.assert(
      fc.property(
        unicodeArb.filter((s) => s.length < 100),
        unicodeArb.filter((s) => s.length < 20 && s.length > 0),
        (initialText, insertText) => {
          const editor = createSingleBufferEditor(initialText);

          // Insert the unicode text
          editor.dispatch({ type: "insertText", text: insertText });

          // Text should contain the inserted text
          const resultLines = editor.multiBuffer.snapshot().lines(
            mbRow(0),
            mbRow(editor.multiBuffer.lineCount),
          );
          const resultText = resultLines.join("\n");
          return resultText.includes(insertText);
        },
      ),
      fcParams,
    );
  });

  test("position conversions work with unicode", () => {
    fc.assert(
      fc.property(
        unicodeArb.filter((s) => s.length > 0 && s.length < 100),
        (text) => {
          const rope = Rope.from(text);

          // Test position round-trip for all offsets
          for (let off = 0; off <= text.length; off++) {
            const { line, col } = rope.offsetToLineCol(off);
            const roundTripped = rope.lineColToOffset(line, col);
            if (roundTripped !== off) return false;
          }

          return true;
        },
      ),
      fcParams,
    );
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────────

describe("Unicode fuzz: edge cases", () => {
  test("empty string is handled correctly", () => {
    const rope = Rope.from("");
    expect(rope.text()).toBe("");
    expect(rope.length).toBe(0);
    expect(rope.lineCount).toBe(1);
  });

  test("single emoji is handled correctly", () => {
    const emoji = "\uD83D\uDE00";
    const rope = Rope.from(emoji);
    expect(rope.text()).toBe(emoji);
    expect(rope.length).toBe(2); // 2 UTF-16 code units
    expect(rope.lineCount).toBe(1);
  });

  test("lone surrogate is preserved", () => {
    // This is invalid UTF-16 but should still be preserved
    const loneSurrogate = "\uD83D"; // High surrogate without low surrogate
    const rope = Rope.from(loneSurrogate);
    expect(rope.text()).toBe(loneSurrogate);
    expect(rope.length).toBe(1);
  });

  test("null character is preserved", () => {
    const text = "hello\x00world";
    const rope = Rope.from(text);
    expect(rope.text()).toBe(text);
    expect(rope.length).toBe(11);
  });

  test("very long emoji sequence", () => {
    // Multiple emoji in sequence
    const emojis = "\uD83D\uDE00\uD83D\uDE01\uD83D\uDE02\uD83D\uDE03\uD83D\uDE04";
    const rope = Rope.from(emojis);
    expect(rope.text()).toBe(emojis);
    expect(rope.length).toBe(10); // 5 emoji × 2 code units each
  });

  test("mixed script text", () => {
    const mixed = "Hello 世界 Привет مرحبا 🎉";
    const rope = Rope.from(mixed);
    expect(rope.text()).toBe(mixed);
    expect(rope.lineCount).toBe(1);
  });
});
