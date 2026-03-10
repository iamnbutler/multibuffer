/**
 * Custom fast-check arbitraries for fuzz testing multibuffer.
 */

import * as fc from "fast-check";
import type { Direction, EditorCommand, Granularity } from "../../src/editor/types.ts";
import { Bias } from "../../src/multibuffer/types.ts";

/** Edit operation for testing rope/buffer mutations. */
export interface EditOp {
  readonly type: "insert" | "delete" | "replace";
  readonly offset: number;
  readonly endOffset?: number;
  readonly text?: string;
}

/** Generate an edit operation. */
export const editOpArb: fc.Arbitrary<EditOp> = fc.oneof(
  fc.record({
    type: fc.constant("insert" as const),
    offset: fc.nat({ max: 10000 }),
    text: fc.string({ maxLength: 100 }),
  }),
  fc.record({
    type: fc.constant("delete" as const),
    offset: fc.nat({ max: 10000 }),
    endOffset: fc.nat({ max: 10000 }),
  }),
  fc.record({
    type: fc.constant("replace" as const),
    offset: fc.nat({ max: 10000 }),
    endOffset: fc.nat({ max: 10000 }),
    text: fc.string({ maxLength: 100 }),
  }),
);

/** Generate a direction for cursor movement. */
export const directionArb: fc.Arbitrary<Direction> = fc.constantFrom(
  "left",
  "right",
  "up",
  "down",
);

/** Generate a movement granularity. */
export const granularityArb: fc.Arbitrary<Granularity> = fc.constantFrom(
  "character",
  "word",
  "line",
);

/** Generate a bias value. */
export const biasArb: fc.Arbitrary<typeof Bias.Left | typeof Bias.Right> = fc.constantFrom(
  Bias.Left,
  Bias.Right,
);

/** Generate editor commands (subset that modifies text). */
export const editingCommandArb: fc.Arbitrary<EditorCommand> = fc.oneof(
  fc.record({
    type: fc.constant("insertText" as const),
    text: fc.string({ maxLength: 50 }),
  }),
  fc.constant({ type: "insertNewline" as const }),
  fc.constant({ type: "insertTab" as const }),
  fc.record({
    type: fc.constant("deleteBackward" as const),
    granularity: granularityArb,
  }),
  fc.record({
    type: fc.constant("deleteForward" as const),
    granularity: granularityArb,
  }),
);

/** Generate editor commands (navigation only). */
export const navigationCommandArb: fc.Arbitrary<EditorCommand> = fc.oneof(
  fc.record({
    type: fc.constant("moveCursor" as const),
    direction: directionArb,
    granularity: granularityArb,
  }),
  fc.record({
    type: fc.constant("extendSelection" as const),
    direction: directionArb,
    granularity: granularityArb,
  }),
  fc.constant({ type: "selectAll" as const }),
);

/** Generate any editor command. */
export const editorCommandArb: fc.Arbitrary<EditorCommand> = fc.oneof(
  editingCommandArb,
  navigationCommandArb,
);

/** Generate strings with interesting Unicode content. */
export const unicodeStringArb: fc.Arbitrary<string> = fc.oneof(
  { weight: 5, arbitrary: fc.string({ maxLength: 200 }) },
  { weight: 2, arbitrary: fc.string16bits({ maxLength: 100 }) },
  { weight: 2, arbitrary: fc.unicodeString({ maxLength: 100 }) },
  // Specific edge cases
  { weight: 1, arbitrary: fc.constant("") },
  { weight: 1, arbitrary: fc.constant("\n") },
  { weight: 1, arbitrary: fc.constant("\n\n\n") },
  { weight: 1, arbitrary: fc.constant("a\nb\nc") },
  { weight: 1, arbitrary: fc.constant("\r\n\r\n") },
  { weight: 1, arbitrary: fc.constant("🎉👨‍👩‍👧‍👦🏳️‍🌈") }, // Emoji with ZWJ
  { weight: 1, arbitrary: fc.constant("𐐷𐐸") }, // Surrogate pairs (Deseret alphabet)
  { weight: 1, arbitrary: fc.constant("café") }, // Combining characters
);

/** Generate text that's likely to have multiple lines. */
export const multilineTextArb: fc.Arbitrary<string> = fc.oneof(
  fc.array(fc.string({ maxLength: 80 }), { minLength: 1, maxLength: 20 }).map(
    (lines) => lines.join("\n"),
  ),
  unicodeStringArb,
);

/** Number of runs based on environment. */
export const NUM_RUNS = process.env.CI ? 100 : 500;
