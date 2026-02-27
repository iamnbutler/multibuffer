/**
 * Selection management: pure functions for creating, extending,
 * and collapsing selections using anchors.
 */

import { createAnchorRange, createSelection } from "../multibuffer/anchor.ts";
import type {
  Anchor,
  MultiBufferPoint,
  MultiBufferRow,
  MultiBufferSnapshot,
  Selection,
} from "../multibuffer/types.ts";
import { Bias } from "../multibuffer/types.ts";
import { moveCursor } from "./cursor.ts";
import type { Direction, Granularity } from "./types.ts";

/**
 * Create a collapsed selection (cursor) at a point.
 * The anchor and head are the same position.
 */
export function selectionAtPoint(
  mb: { createAnchor(point: MultiBufferPoint, bias: Bias): Anchor | undefined },
  point: MultiBufferPoint,
): Selection | undefined {
  const anchor = mb.createAnchor(point, Bias.Right);
  if (!anchor) return undefined;
  return createSelection(createAnchorRange(anchor, anchor), "end");
}

/**
 * Extend a selection in a direction by moving the head.
 * The anchor (non-head) end stays fixed.
 */
export function extendSelection(
  snapshot: MultiBufferSnapshot,
  mb: { createAnchor(point: MultiBufferPoint, bias: Bias): Anchor | undefined },
  selection: Selection,
  direction: Direction,
  granularity: Granularity,
): Selection | undefined {
  // Resolve the current head position
  const headAnchor =
    selection.head === "end" ? selection.range.end : selection.range.start;
  const headPoint = snapshot.resolveAnchor(headAnchor);
  if (!headPoint) return undefined;

  // Move the head
  const newHeadPoint = moveCursor(snapshot, headPoint, direction, granularity);
  const newHeadAnchor = mb.createAnchor(newHeadPoint, Bias.Right);
  if (!newHeadAnchor) return undefined;

  // Keep the anchor end fixed
  const anchorEnd =
    selection.head === "end" ? selection.range.start : selection.range.end;

  // Determine ordering: start should be before end in the document
  const anchorPoint = snapshot.resolveAnchor(anchorEnd);
  if (!anchorPoint) return undefined;

  if (
    newHeadPoint.row < anchorPoint.row ||
    (newHeadPoint.row === anchorPoint.row && newHeadPoint.column <= anchorPoint.column)
  ) {
    // Head is before anchor → head is "start"
    return createSelection(createAnchorRange(newHeadAnchor, anchorEnd), "start");
  }
  // Head is after anchor → head is "end"
  return createSelection(createAnchorRange(anchorEnd, newHeadAnchor), "end");
}

/**
 * Collapse a selection to the start or end point.
 */
export function collapseSelection(
  snapshot: MultiBufferSnapshot,
  mb: { createAnchor(point: MultiBufferPoint, bias: Bias): Anchor | undefined },
  selection: Selection,
  to: "start" | "end",
): Selection | undefined {
  const anchor = to === "start" ? selection.range.start : selection.range.end;
  const point = snapshot.resolveAnchor(anchor);
  if (!point) return undefined;
  return selectionAtPoint(mb, point);
}

/**
 * Select all content in the multibuffer.
 */
export function selectAll(
  snapshot: MultiBufferSnapshot,
  mb: { createAnchor(point: MultiBufferPoint, bias: Bias): Anchor | undefined },
): Selection | undefined {
  // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
  const startPoint: MultiBufferPoint = { row: 0 as MultiBufferRow, column: 0 };

  // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic
  const lastRow = (snapshot.lineCount - 1) as MultiBufferRow;
  // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic
  const endRowNext = Math.min(lastRow + 1, snapshot.lineCount) as MultiBufferRow;
  const lastLineText = snapshot.lines(lastRow, endRowNext);
  const lastCol = lastLineText[0]?.length ?? 0;
  const endPoint: MultiBufferPoint = { row: lastRow, column: lastCol };

  const startAnchor = mb.createAnchor(startPoint, Bias.Left);
  const endAnchor = mb.createAnchor(endPoint, Bias.Right);
  if (!startAnchor || !endAnchor) return undefined;

  return createSelection(createAnchorRange(startAnchor, endAnchor), "end");
}

/**
 * Check if a selection is collapsed (zero-width, i.e. just a cursor).
 */
export function isCollapsed(
  snapshot: MultiBufferSnapshot,
  selection: Selection,
): boolean {
  const start = snapshot.resolveAnchor(selection.range.start);
  const end = snapshot.resolveAnchor(selection.range.end);
  if (!start || !end) return true;
  return start.row === end.row && start.column === end.column;
}
