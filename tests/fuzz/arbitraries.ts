/**
 * Shared custom arbitraries for property-based fuzz testing.
 *
 * Provides generators for:
 * - Edit operations (insert, delete, replace)
 * - Unicode edge cases (surrogates, ZWJ sequences, CRLF)
 *
 * @see https://github.com/iamnbutler/multibuffer/issues/80
 */

import * as fc from "fast-check";

// ── Edit Operations ────────────────────────────────────────────────────────────

/** A text edit operation for Rope/Buffer */
export type EditOp =
  | { type: "insert"; offset: number; text: string }
  | { type: "delete"; start: number; end: number }
  | { type: "replace"; start: number; end: number; text: string };

/** Generate an insert operation */
const insertArb = fc.record({
  type: fc.constant("insert" as const),
  offset: fc.nat(),
  text: fc.string({ maxLength: 50 }),
});

/** Generate a delete operation */
const deleteArb = fc.record({
  type: fc.constant("delete" as const),
  start: fc.nat(),
  end: fc.nat(),
});

/** Generate a replace operation */
const replaceArb = fc.record({
  type: fc.constant("replace" as const),
  start: fc.nat(),
  end: fc.nat(),
  text: fc.string({ maxLength: 50 }),
});

/** Generate any edit operation */
export const editOpArb: fc.Arbitrary<EditOp> = fc.oneof(
  insertArb,
  deleteArb,
  replaceArb,
);

/**
 * Clamp an edit operation to valid bounds for a given text length.
 * Ensures start <= end for delete/replace, offset within bounds, etc.
 */
export function clampEditOp(op: EditOp, length: number): EditOp {
  switch (op.type) {
    case "insert": {
      const offset = Math.min(op.offset, length);
      return { ...op, offset };
    }
    case "delete": {
      const start = Math.min(op.start, length);
      const end = Math.min(Math.max(op.end, start), length);
      return { ...op, start, end };
    }
    case "replace": {
      const start = Math.min(op.start, length);
      const end = Math.min(Math.max(op.end, start), length);
      return { ...op, start, end };
    }
  }
}

/** Apply an edit operation to a plain string (naive reference implementation) */
export function applyToString(s: string, op: EditOp): string {
  switch (op.type) {
    case "insert":
      return s.slice(0, op.offset) + op.text + s.slice(op.offset);
    case "delete":
      return s.slice(0, op.start) + s.slice(op.end);
    case "replace":
      return s.slice(0, op.start) + op.text + s.slice(op.end);
  }
}

// ── Unicode Strings ────────────────────────────────────────────────────────────

/** Unicode edge case strings for testing */
export const unicodeEdgeCases = [
  // Surrogate pairs (emoji outside BMP)
  "\uD83D\uDE00", // U+1F600 (grinning face)
  "\uD83C\uDF89", // U+1F389 (party popper)
  "\uD83D\uDC69\u200D\uD83D\uDC68\u200D\uD83D\uDC67\u200D\uD83D\uDC66", // Family emoji with ZWJ
  // ZWJ sequences
  "\uD83D\uDC68\u200D\uD83D\uDCBB", // Man technologist
  "\uD83C\uDFF3\uFE0F\u200D\uD83C\uDF08", // Rainbow flag
  // Combining characters
  "e\u0301", // e with combining acute accent
  "n\u0303", // n with combining tilde
  // CRLF
  "\r\n",
  "\r\n\r\n",
  // Mixed
  "Hello\r\nWorld",
  "Test\nLine\r\nMixed",
  // Empty and whitespace
  "",
  " ",
  "\t",
  "\n",
  "\n\n\n",
];

/**
 * Generate arbitrary UTF-16 strings including potentially invalid sequences.
 * This replaces fc.string16bits() which was removed in fast-check v4.
 */
export const string16bitsArb: fc.Arbitrary<string> = fc
  .array(fc.integer({ min: 0, max: 0xffff }), { maxLength: 50 })
  .map((codes) => String.fromCharCode(...codes));

/**
 * Generate unicode strings with various Unicode characters.
 * This replaces fc.unicodeString() which was removed in fast-check v4.
 */
const unicodeStringArb: fc.Arbitrary<string> = fc.oneof(
  fc.string(),
  fc.array(
    fc.oneof(
      fc.integer({ min: 0x0000, max: 0x007f }), // ASCII
      fc.integer({ min: 0x0080, max: 0x07ff }), // Latin Extended
      fc.integer({ min: 0x0800, max: 0xd7ff }), // BMP (before surrogates)
      fc.integer({ min: 0xe000, max: 0xffff }), // BMP (after surrogates)
    ),
    { maxLength: 50 },
  ).map((codes) => String.fromCharCode(...codes)),
);

/** Generate strings with potential Unicode edge cases */
export const unicodeArb: fc.Arbitrary<string> = fc.oneof(
  { weight: 5, arbitrary: fc.string() },
  { weight: 3, arbitrary: string16bitsArb },
  { weight: 2, arbitrary: unicodeStringArb },
  { weight: 1, arbitrary: fc.constantFrom(...unicodeEdgeCases) },
);

/** Generate strings specifically with surrogate pairs */
export const surrogateStringArb: fc.Arbitrary<string> = fc.oneof(
  string16bitsArb,
  fc.constant("\uD83D\uDE00"),
  fc.constant("\uD83C\uDF89\uD83C\uDF89"),
  fc.array(fc.constantFrom("\uD83D\uDE00", "\uD83C\uDF89", "a", "b", "\n"), {
    minLength: 0,
    maxLength: 30,
  }).map((chars) => chars.join("")),
);

/** Generate strings with ZWJ sequences */
export const zwjStringArb: fc.Arbitrary<string> = fc.array(
  fc.constantFrom(
    "\uD83D\uDC68", // Man
    "\uD83D\uDC69", // Woman
    "\uD83D\uDC67", // Girl
    "\uD83D\uDC66", // Boy
    "\u200D", // ZWJ
    "a",
    " ",
    "\n",
  ),
  { minLength: 0, maxLength: 20 },
).map((chars) => chars.join(""));

/** Generate strings with CRLF line endings */
export const crlfStringArb: fc.Arbitrary<string> = fc
  .array(
    fc.oneof(
      fc.string({ minLength: 1, maxLength: 10 }),
      fc.constant("\r\n"),
      fc.constant("\n"),
      fc.constant("\r"),
    ),
    { minLength: 0, maxLength: 15 },
  )
  .map((parts) => parts.join(""));

// ── CI Configuration ───────────────────────────────────────────────────────────

/** Number of test iterations (fewer in CI for speed) */
export const NUM_RUNS = process.env.CI ? 100 : 1000;

/** Shared fast-check parameters */
export const fcParams = {
  numRuns: NUM_RUNS,
};
