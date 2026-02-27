/**
 * Anchor utilities: pure functions for offset adjustment, comparison,
 * and construction of AnchorRange / Selection.
 */

import type {
  Anchor,
  AnchorRange,
  BufferOffset,
  EditEntry,
  MultiBufferPoint,
  MultiBufferSnapshot,
  Selection,
} from "./types.ts";
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

export function anchorsEqual(a: Anchor, b: Anchor): boolean {
  return (
    a.excerptId.index === b.excerptId.index &&
    a.excerptId.generation === b.excerptId.generation &&
    a.textAnchor.offset === b.textAnchor.offset &&
    a.textAnchor.bias === b.textAnchor.bias
  );
}

export function compareAnchors(a: Anchor, b: Anchor): number {
  if (a.excerptId.index !== b.excerptId.index) {
    return a.excerptId.index - b.excerptId.index;
  }
  if (a.excerptId.generation !== b.excerptId.generation) {
    return a.excerptId.generation - b.excerptId.generation;
  }
  // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic for offset comparison
  if ((a.textAnchor.offset as number) !== (b.textAnchor.offset as number)) {
    // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic for offset comparison
    return (a.textAnchor.offset as number) - (b.textAnchor.offset as number);
  }
  return a.textAnchor.bias - b.textAnchor.bias;
}

export function createAnchorRange(start: Anchor, end: Anchor): AnchorRange {
  return { start, end };
}

export function createSelection(
  range: AnchorRange,
  head: "start" | "end",
): Selection {
  return { range, head };
}

export function reverseSelection(selection: Selection): Selection {
  return {
    range: selection.range,
    head: selection.head === "start" ? "end" : "start",
  };
}

export function resolveAnchorRange(
  snapshot: MultiBufferSnapshot,
  range: AnchorRange,
): { start: MultiBufferPoint; end: MultiBufferPoint } | undefined {
  const start = snapshot.resolveAnchor(range.start);
  const end = snapshot.resolveAnchor(range.end);
  if (start === undefined || end === undefined) return undefined;
  return { start, end };
}
