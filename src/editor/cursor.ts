/**
 * Cursor movement: pure functions that compute a new position
 * from a current position, direction, and granularity.
 */

import type {
  MultiBufferPoint,
  MultiBufferRow,
  MultiBufferSnapshot,
} from "../multibuffer/types.ts";
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

function moveCharacter(
  snapshot: MultiBufferSnapshot,
  current: MultiBufferPoint,
  direction: Direction,
): MultiBufferPoint {
  const { row, column } = current;
  const lineCount = snapshot.lineCount;

  if (direction === "right") {
    const lineText = snapshot.lines(row, nextRow(row, lineCount));
    const lineLen = lineText[0]?.length ?? 0;
    if (column < lineLen) {
      return { row, column: column + 1 };
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
      return { row, column: column - 1 };
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
    const newRow = (row + 1) as MultiBufferRow;
    const newLineText = snapshot.lines(newRow, nextRow(newRow, lineCount));
    const newLen = newLineText[0]?.length ?? 0;
    return { row: newRow, column: Math.min(column, newLen) };
  }

  if (direction === "up") {
    if (row <= 0) return current;
    // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic
    const newRow = (row - 1) as MultiBufferRow;
    const newLineText = snapshot.lines(newRow, row);
    const newLen = newLineText[0]?.length ?? 0;
    return { row: newRow, column: Math.min(column, newLen) };
  }

  return current;
}

function moveWord(
  snapshot: MultiBufferSnapshot,
  current: MultiBufferPoint,
  direction: Direction,
): MultiBufferPoint {
  // Simplified word movement — skip to next/prev word boundary
  if (direction === "right" || direction === "left") {
    const lineText = snapshot.lines(current.row, nextRow(current.row, snapshot.lineCount));
    const text = lineText[0] ?? "";
    const col = current.column;

    if (direction === "right") {
      // Skip current word chars, then skip whitespace
      let pos = col;
      while (pos < text.length && isWordChar(text.charCodeAt(pos))) pos++;
      while (pos < text.length && !isWordChar(text.charCodeAt(pos))) pos++;
      return { row: current.row, column: pos };
    }

    // left: skip whitespace, then skip word chars
    let pos = col;
    while (pos > 0 && !isWordChar(text.charCodeAt(pos - 1))) pos--;
    while (pos > 0 && isWordChar(text.charCodeAt(pos - 1))) pos--;
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
    const newRow = Math.min(current.row + pageSize, lineCount - 1) as MultiBufferRow;
    const lineText = snapshot.lines(newRow, nextRow(newRow, lineCount));
    const lineLen = lineText[0]?.length ?? 0;
    return { row: newRow, column: Math.min(current.column, lineLen) };
  }

  if (direction === "up") {
    // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic
    const newRow = Math.max(current.row - pageSize, 0) as MultiBufferRow;
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

function nextRow(row: MultiBufferRow, lineCount: number): MultiBufferRow {
  // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic
  return Math.min(row + 1, lineCount) as MultiBufferRow;
}

function isWordChar(charCode: number): boolean {
  return (
    (charCode >= 48 && charCode <= 57) || // 0-9
    (charCode >= 65 && charCode <= 90) || // A-Z
    (charCode >= 97 && charCode <= 122) || // a-z
    charCode === 95 // _
  );
}
