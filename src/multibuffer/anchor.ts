/**
 * Anchor utilities: comparison, construction of AnchorRange / Selection,
 * and anchor range resolution against multibuffer snapshots.
 *
 * Offset adjustment (adjustOffset) lives in ../buffer/offset.ts since
 * it operates purely on buffer-level types.
 */

import type {
  Anchor,
  AnchorRange,
  MultiBufferPoint,
  MultiBufferSnapshot,
  Selection,
} from "./types.ts";

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
