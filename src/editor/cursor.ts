/**
 * Cursor movement: pure functions that compute a new position
 * from a current position, direction, and granularity.
 */

import type {
  MultiBufferPoint,
  MultiBufferRow,
  MultiBufferSnapshot,
} from "../multibuffer/types.ts";
import {
  charColToVisualCol,
  visualColToCharCol,
  type WrapMap,
} from "../renderer/wrap-map.ts";
import type { Direction, Granularity } from "./types.ts";

/**
 * Compute a new cursor position from the current position.
 * Pure function — no side effects.
 */
export function moveCursor(
  snapshot: MultiBufferSnapshot,
  current: MultiBufferPoint,
  direction: Direction,
  granularity: Granularity,
): MultiBufferPoint {
  switch (granularity) {
    case "character":
      return moveCharacter(snapshot, current, direction);
    case "word":
      return moveWord(snapshot, current, direction);
    case "line":
      return moveLine(snapshot, current, direction);
    case "page":
      return movePage(snapshot, current, direction);
    case "buffer":
      return moveBuffer(snapshot, direction);
  }
}

/**
 * Move cursor accounting for soft line wrapping.
 * For up/down with character granularity, respects visual rows rather
 * than buffer rows.  For horizontal movement, delegates to standard
 * moveCursor.
 *
 * Callers must only pass character granularity for up/down — other
 * granularities (word, line, page, buffer) are handled by the Editor
 * before reaching this function.
 */
export function moveCursorVisual(
  snapshot: MultiBufferSnapshot,
  current: MultiBufferPoint,
  direction: Direction,
  granularity: Granularity,
  wrapMap: WrapMap,
): MultiBufferPoint {
  // For horizontal movement, use standard cursor movement
  if (direction === "left" || direction === "right") {
    return moveCursor(snapshot, current, direction, granularity);
  }

  // For character granularity up/down, use visual row movement
  return moveVisualRow(snapshot, current, direction, wrapMap);
}

/**
 * Move up or down by one visual row, accounting for soft line wrapping.
 * This is the core visual navigation logic.
 */
function moveVisualRow(
  snapshot: MultiBufferSnapshot,
  current: MultiBufferPoint,
  direction: "up" | "down",
  wrapMap: WrapMap,
): MultiBufferPoint {
  const { row, column } = current;
  const lineCount = snapshot.lineCount;

  // Get the current line text
  const lineText = snapshot.lines(row, nextRow(row, lineCount));
  const text = lineText[0] ?? "";

  // Compute current visual row and segment within the buffer row
  const firstVisualRow = wrapMap.bufferRowToFirstVisualRow(row);
  const visualRowsForLine = wrapMap.visualRowsForLine(row);

  // Find which segment the cursor is in by checking segment char starts
  let currentSegment = 0;
  for (let seg = 0; seg < visualRowsForLine; seg++) {
    const segStart = wrapMap.segmentCharStart(row, seg);
    const nextSegStart =
      seg + 1 < visualRowsForLine
        ? wrapMap.segmentCharStart(row, seg + 1)
        : text.length;
    if (column >= segStart && column < nextSegStart) {
      currentSegment = seg;
      break;
    }
    if (seg === visualRowsForLine - 1 && column >= segStart) {
      currentSegment = seg;
    }
  }

  // Calculate the visual column within the current segment
  const segStart = wrapMap.segmentCharStart(row, currentSegment);
  const visualColInSegment = charColToVisualCol(text, column) - charColToVisualCol(text, segStart);

  const currentVisualRow = firstVisualRow + currentSegment;

  if (direction === "down") {
    if (currentVisualRow + 1 >= wrapMap.totalVisualRows) {
      return current; // Stay put at end
    }
    const target = resolveTargetVisualRow(snapshot, wrapMap, currentVisualRow + 1, visualColInSegment, lineCount);
    // Skip trailing newline rows (excerpt headers) just like moveCharacter does
    const skippedRow = skipTrailingNewlineRow(snapshot, target.row, "down", lineCount);
    if (skippedRow !== target.row) {
      // Re-resolve on the skipped-to row so visualColInSegment is applied correctly
      const skippedFirstVisualRow = wrapMap.bufferRowToFirstVisualRow(skippedRow);
      return resolveTargetVisualRow(snapshot, wrapMap, skippedFirstVisualRow, visualColInSegment, lineCount);
    }
    return target;
  }

  // direction === "up"
  if (currentVisualRow <= 0) {
    return current; // Stay put at start
  }
  const target = resolveTargetVisualRow(snapshot, wrapMap, currentVisualRow - 1, visualColInSegment, lineCount);
  // Skip trailing newline rows (excerpt headers) just like moveCharacter does
  const skippedRow = skipTrailingNewlineRow(snapshot, target.row, "up", lineCount);
  if (skippedRow !== target.row) {
    // Re-resolve on the skipped-to row so visualColInSegment is applied correctly
    const skippedFirstVisualRow = wrapMap.bufferRowToFirstVisualRow(skippedRow);
    return resolveTargetVisualRow(snapshot, wrapMap, skippedFirstVisualRow, visualColInSegment, lineCount);
  }
  return target;
}

/**
 * Resolve a target visual row and visual column offset into a concrete
 * MultiBufferPoint. Shared by both the up and down branches of
 * moveVisualRow to avoid duplicating the buffer-position calculation.
 */
function resolveTargetVisualRow(
  snapshot: MultiBufferSnapshot,
  wrapMap: WrapMap,
  targetVisualRow: number,
  visualColInSegment: number,
  lineCount: number,
): MultiBufferPoint {
  // Convert target visual row to buffer position
  const { mbRow: targetBufferRow, segment: targetSegment } =
    wrapMap.visualRowToBufferRow(targetVisualRow);

  // Get target line text
  const targetLineText = snapshot.lines(
    targetBufferRow,
    nextRow(targetBufferRow, lineCount),
  );
  const targetText = targetLineText[0] ?? "";

  // Find the target column based on visual column
  const targetSegStart = wrapMap.segmentCharStart(targetBufferRow, targetSegment);
  const targetSegVisualRowsForLine = wrapMap.visualRowsForLine(targetBufferRow);
  const targetNextSegStart =
    targetSegment + 1 < targetSegVisualRowsForLine
      ? wrapMap.segmentCharStart(targetBufferRow, targetSegment + 1)
      : targetText.length;

  // Calculate target char column from visual column
  const targetSegText = targetText.slice(targetSegStart, targetNextSegStart);
  const targetCharCol = visualColToCharCol(targetSegText, visualColInSegment);
  const finalColumn = Math.min(targetSegStart + targetCharCol, targetNextSegStart);

  return { row: targetBufferRow, column: finalColumn };
}

function moveCharacter(
  snapshot: MultiBufferSnapshot,
  current: MultiBufferPoint,
  direction: Direction,
): MultiBufferPoint {
  const { row, column } = current;
  const lineCount = snapshot.lineCount;

  if (direction === "right") {
    const lineText = snapshot.lines(row, nextRow(row, lineCount));
    const text = lineText[0] ?? "";
    if (column < text.length) {
      // Advance by the full code point width (2 for surrogate pairs, 1 for BMP)
      const cp = text.codePointAt(column) ?? 0;
      return { row, column: column + (cp > 0xffff ? 2 : 1) };
    }
    // At end of line — wrap to start of next line
    if (row + 1 < lineCount) {
      // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic
      return { row: (row + 1) as MultiBufferRow, column: 0 };
    }
    return current;
  }

  if (direction === "left") {
    if (column > 0) {
      // Step back by the full code point width (2 for surrogate pairs, 1 for BMP)
      const lineText = snapshot.lines(row, nextRow(row, lineCount));
      return { row, column: prevCpStart(lineText[0] ?? "", column) };
    }
    // At start of line — wrap to end of previous line
    if (row > 0) {
      // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic
      const prevRow = (row - 1) as MultiBufferRow;
      const prevLineText = snapshot.lines(prevRow, row);
      const prevLen = prevLineText[0]?.length ?? 0;
      return { row: prevRow, column: prevLen };
    }
    return current;
  }

  if (direction === "down") {
    if (row + 1 >= lineCount) return current;
    // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic
    const rawRow = (row + 1) as MultiBufferRow;
    const newRow = skipTrailingNewlineRow(snapshot, rawRow, "down", lineCount);
    const newLineText = snapshot.lines(newRow, nextRow(newRow, lineCount));
    const newLen = newLineText[0]?.length ?? 0;
    return { row: newRow, column: Math.min(column, newLen) };
  }

  if (direction === "up") {
    if (row <= 0) return current;
    // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic
    const rawRow = (row - 1) as MultiBufferRow;
    const newRow = skipTrailingNewlineRow(snapshot, rawRow, "up", lineCount);
    const newLineText = snapshot.lines(newRow, nextRow(newRow, lineCount));
    const newLen = newLineText[0]?.length ?? 0;
    return { row: newRow, column: Math.min(column, newLen) };
  }

  return current;
}

/**
 * Scan forward from `pos` within `text`, skipping word chars then non-word chars.
 * Returns the new position (start of the next word, or text.length).
 */
function scanWordForward(text: string, pos: number): number {
  while (pos < text.length) {
    const cp = text.codePointAt(pos) ?? 0;
    if (!isWordChar(String.fromCodePoint(cp))) break;
    pos += cp > 0xffff ? 2 : 1;
  }
  while (pos < text.length) {
    const cp = text.codePointAt(pos) ?? 0;
    if (isWordChar(String.fromCodePoint(cp))) break;
    pos += cp > 0xffff ? 2 : 1;
  }
  return pos;
}

/**
 * Scan backward from `pos` within `text`, skipping non-word chars then word chars.
 * Returns the new position (start of the current/previous word, or 0).
 */
function scanWordBackward(text: string, pos: number): number {
  while (pos > 0) {
    const prev = prevCpStart(text, pos);
    const cp = text.codePointAt(prev) ?? 0;
    if (isWordChar(String.fromCodePoint(cp))) break;
    pos = prev;
  }
  while (pos > 0) {
    const prev = prevCpStart(text, pos);
    const cp = text.codePointAt(prev) ?? 0;
    if (!isWordChar(String.fromCodePoint(cp))) break;
    pos = prev;
  }
  return pos;
}

function moveWord(
  snapshot: MultiBufferSnapshot,
  current: MultiBufferPoint,
  direction: Direction,
): MultiBufferPoint {
  if (direction === "right" || direction === "left") {
    const lineText = snapshot.lines(current.row, nextRow(current.row, snapshot.lineCount));
    const text = lineText[0] ?? "";
    const col = current.column;

    if (direction === "right") {
      const pos = scanWordForward(text, col);
      // Cross line boundary: cursor started at end of line, continue on next line
      if (col === text.length && current.row + 1 < snapshot.lineCount) {
        // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic
        const nextRowIdx = (current.row + 1) as MultiBufferRow;
        const nextLineText = snapshot.lines(nextRowIdx, nextRow(nextRowIdx, snapshot.lineCount));
        const nextText = nextLineText[0] ?? "";
        const nextPos = scanWordForward(nextText, 0);
        return { row: nextRowIdx, column: nextPos };
      }
      return { row: current.row, column: pos };
    }

    // left: skip non-word chars, then skip word chars
    const pos = scanWordBackward(text, col);
    // Cross line boundary: at column 0, continue word movement on previous line
    if (pos === 0 && col === 0 && current.row > 0) {
      // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic
      const prevRowIdx = (current.row - 1) as MultiBufferRow;
      const prevLineText = snapshot.lines(prevRowIdx, current.row);
      const prevText = prevLineText[0] ?? "";
      const prevPos = scanWordBackward(prevText, prevText.length);
      return { row: prevRowIdx, column: prevPos };
    }
    return { row: current.row, column: pos };
  }

  // For up/down with word granularity, just do character movement
  return moveCharacter(snapshot, current, direction);
}

/**
 * Move to the next word boundary by skipping one contiguous class of characters.
 *
 * Unlike `moveWord` (which skips two classes to reach the next word start),
 * this stops at the first class transition. Used for word-granularity deletion
 * so that e.g. deleting forward from the end of a word removes only the
 * whitespace, not the whitespace AND the following word.
 */
export function moveWordBoundary(
  snapshot: MultiBufferSnapshot,
  current: MultiBufferPoint,
  direction: Direction,
): MultiBufferPoint {
  if (direction === "right" || direction === "left") {
    const lineText = snapshot.lines(current.row, nextRow(current.row, snapshot.lineCount));
    const text = lineText[0] ?? "";
    const col = current.column;

    if (direction === "right") {
      if (col >= text.length) {
        // At end of line — cross to start of next line
        if (current.row + 1 < snapshot.lineCount) {
          // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic
          return { row: (current.row + 1) as MultiBufferRow, column: 0 };
        }
        return current;
      }
      // Determine the class of the first character, then skip that class
      const firstCp = text.codePointAt(col) ?? 0;
      const firstIsWord = isWordChar(String.fromCodePoint(firstCp));
      let pos = col;
      while (pos < text.length) {
        const cp = text.codePointAt(pos) ?? 0;
        if (isWordChar(String.fromCodePoint(cp)) !== firstIsWord) break;
        pos += cp > 0xffff ? 2 : 1;
      }
      return { row: current.row, column: pos };
    }

    // left: determine the class of the character immediately before the cursor
    if (col <= 0) {
      // At start of line — cross to end of previous line
      if (current.row > 0) {
        // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic
        const prevRow = (current.row - 1) as MultiBufferRow;
        const prevLineText = snapshot.lines(prevRow, current.row);
        const prevLen = prevLineText[0]?.length ?? 0;
        return { row: prevRow, column: prevLen };
      }
      return current;
    }
    const prevStart = prevCpStart(text, col);
    const firstCp = text.codePointAt(prevStart) ?? 0;
    const firstIsWord = isWordChar(String.fromCodePoint(firstCp));
    let pos = col;
    while (pos > 0) {
      const prev = prevCpStart(text, pos);
      const cp = text.codePointAt(prev) ?? 0;
      if (isWordChar(String.fromCodePoint(cp)) !== firstIsWord) break;
      pos = prev;
    }
    return { row: current.row, column: pos };
  }

  // For up/down with word granularity, just do character movement
  return moveCharacter(snapshot, current, direction);
}

function moveLine(
  snapshot: MultiBufferSnapshot,
  current: MultiBufferPoint,
  direction: Direction,
): MultiBufferPoint {
  if (direction === "left") {
    // Home
    return { row: current.row, column: 0 };
  }
  if (direction === "right") {
    // End
    const lineText = snapshot.lines(current.row, nextRow(current.row, snapshot.lineCount));
    const lineLen = lineText[0]?.length ?? 0;
    return { row: current.row, column: lineLen };
  }
  // up/down with line granularity = same as character
  return moveCharacter(snapshot, current, direction);
}

function movePage(
  snapshot: MultiBufferSnapshot,
  current: MultiBufferPoint,
  direction: Direction,
): MultiBufferPoint {
  const pageSize = 30; // rows per page
  const lineCount = snapshot.lineCount;

  if (direction === "down") {
    // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic
    const rawRow = Math.min(current.row + pageSize, lineCount - 1) as MultiBufferRow;
    const newRow = skipTrailingNewlineRow(snapshot, rawRow, "down", lineCount);
    const lineText = snapshot.lines(newRow, nextRow(newRow, lineCount));
    const lineLen = lineText[0]?.length ?? 0;
    return { row: newRow, column: Math.min(current.column, lineLen) };
  }

  if (direction === "up") {
    // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic
    const rawRow = Math.max(current.row - pageSize, 0) as MultiBufferRow;
    const newRow = skipTrailingNewlineRow(snapshot, rawRow, "up", lineCount);
    const lineText = snapshot.lines(newRow, nextRow(newRow, lineCount));
    const lineLen = lineText[0]?.length ?? 0;
    return { row: newRow, column: Math.min(current.column, lineLen) };
  }

  return moveLine(snapshot, current, direction);
}

function moveBuffer(
  snapshot: MultiBufferSnapshot,
  direction: Direction,
): MultiBufferPoint {
  if (direction === "left" || direction === "up") {
    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
    return { row: 0 as MultiBufferRow, column: 0 };
  }
  // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic
  const lastRow = (snapshot.lineCount - 1) as MultiBufferRow;
  const lineText = snapshot.lines(lastRow, nextRow(lastRow, snapshot.lineCount));
  const lineLen = lineText[0]?.length ?? 0;
  return { row: lastRow, column: lineLen };
}

/**
 * If `row` is a trailing-newline row (the visual header separator between two excerpts),
 * skip to the adjacent content row in the given movement direction.
 *
 * Trailing-newline rows are the last row of an excerpt with `hasTrailingNewline: true`.
 * The DOM renderer places the file-path header on this row, so the cursor should
 * never stop there during up/down navigation.
 */
function skipTrailingNewlineRow(
  snapshot: MultiBufferSnapshot,
  row: MultiBufferRow,
  direction: "down" | "up",
  lineCount: number,
): MultiBufferRow {
  const excerpt = snapshot.excerptAt(row);
  if (!excerpt || !excerpt.hasTrailingNewline || row !== excerpt.endRow - 1) {
    return row;
  }
  if (direction === "down") {
    // Skip forward to the first row of the next excerpt.
    // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic
    const next = excerpt.endRow as MultiBufferRow;
    return next < lineCount ? next : row;
  }
  // direction === "up": skip back to the last content row of the current excerpt.
  // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic
  return row > 0 ? ((row - 1) as MultiBufferRow) : row;
}

function nextRow(row: MultiBufferRow, lineCount: number): MultiBufferRow {
  // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic
  return Math.min(row + 1, lineCount) as MultiBufferRow;
}

/** Return the UTF-16 offset at which the code point immediately before pos begins. */
function prevCpStart(text: string, pos: number): number {
  const lo = text.charCodeAt(pos - 1);
  if (lo >= 0xdc00 && lo <= 0xdfff && pos >= 2) {
    const hi = text.charCodeAt(pos - 2);
    if (hi >= 0xd800 && hi <= 0xdbff) return pos - 2;
  }
  return pos - 1;
}

/**
 * Returns true if the given character is a word character.
 * Recognises Unicode letters (\\p{L}), Unicode digits (\\p{N}), and underscore.
 * This covers Latin, CJK, Cyrillic, Arabic, and all other Unicode script letters.
 */
export function isWordChar(char: string): boolean {
  return /^[\p{L}\p{N}_]$/u.test(char);
}
