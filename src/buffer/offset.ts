/**
 * Pure offset adjustment through edits.
 * Used by multibuffer's anchor resolution to track positions across mutations.
 */

import type { BufferOffset, EditEntry } from "./types.ts";
import { Bias } from "./types.ts";

/**
 * Adjust a buffer offset through a single edit.
 *
 * - Before edit: unchanged
 * - After edit's deleted range: shift by (inserted - deleted)
 * - At edit start with Bias.Right: move after inserted text
 * - Within deleted range or at edit start with Bias.Left: clamp to edit start
 */
function adjustOffsetSingle(
  offset: BufferOffset,
  bias: Bias,
  edit: EditEntry,
): BufferOffset {
  // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic for offset comparison
  const editEnd = ((edit.offset as number) + edit.deletedLength) as BufferOffset;

  if (offset < edit.offset) {
    return offset;
  }
  if (offset > editEnd) {
    // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic
    return ((offset as number) - edit.deletedLength + edit.insertedLength) as BufferOffset;
  }
  // offset is within [editStart, editEnd]
  if (offset === edit.offset && bias === Bias.Right) {
    // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic
    return ((edit.offset as number) + edit.insertedLength) as BufferOffset;
  }
  return edit.offset;
}

/**
 * Adjust a buffer offset through a sequence of edits (in chronological order).
 */
export function adjustOffset(
  offset: BufferOffset,
  bias: Bias,
  edits: readonly EditEntry[],
): BufferOffset {
  let current = offset;
  for (const edit of edits) {
    current = adjustOffsetSingle(current, bias, edit);
  }
  return current;
}
