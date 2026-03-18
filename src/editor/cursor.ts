/**
 * Cursor movement: pure functions that compute a new position
 * from a current position, direction, and granularity.
 */

import type {
  MultiBufferPoint,
  MultiBufferRow,
  MultiBufferSnapshot,
} from "../multibuffer/types.ts";
import type { WrapMap } from "../renderer/wrap-map.ts";
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
 * For up/down movement, respects visual rows rather than buffer rows.
 * For horizontal movement, delegates to standard moveCursor.
 *
 * When wrapMap is provided, up/down movement navigates between visual rows,
 * so pressing down on a wrapped line moves to the next visual row within
 * the same buffer line (if wrapped) rather than jumping to the next buffer line.
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
  if (granularity === "character") {
    return moveVisualRow(snapshot, current, direction, wrapMap);
  }

  // For other granularities (word, line, page, buffer), delegate to standard movement
  return moveCursor(snapshot, current, direction, granularity);
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
    const targetVisualRow = currentVisualRow + 1;

    // Check if we're past the end of the document
    if (targetVisualRow >= wrapMap.totalVisualRows) {
      return current; // Stay put at end
    }

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

  // direction === "up"
  if (currentVisualRow <= 0) {
    return current; // Stay put at start
  }

  const targetVisualRow = currentVisualRow - 1;

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

/**
 * Convert a character column to a visual column (display cells).
 * Accounts for wide characters (CJK, emoji) that occupy 2 display cells.
 */
function charColToVisualCol(text: string, charCol: number): number {
  let visual = 0;
  for (let i = 0; i < charCol && i < text.length; ) {
    const c = text.charCodeAt(i);
    if (c <= 0x7f) {
      visual++;
      i++;
    } else if (c >= 0xd800 && c <= 0xdbff) {
      // High surrogate: decode full code point
      const low = text.charCodeAt(i + 1);
      const cp = 0x10000 + ((c - 0xd800) << 10) + (low - 0xdc00);
      visual += codePointWidth(cp);
      i += 2;
    } else {
      visual += codePointWidth(c);
      i++;
    }
  }
  return visual;
}

/**
 * Convert a visual column to a character column.
 * Accounts for wide characters (CJK, emoji) that occupy 2 display cells.
 */
function visualColToCharCol(text: string, visualCol: number): number {
  let visual = 0;
  let i = 0;
  while (i < text.length) {
    if (visual >= visualCol) break;
    const c = text.charCodeAt(i);
    if (c <= 0x7f) {
      visual++;
      i++;
    } else if (c >= 0xd800 && c <= 0xdbff) {
      // High surrogate: decode full code point
      const low = text.charCodeAt(i + 1);
      const cp = 0x10000 + ((c - 0xd800) << 10) + (low - 0xdc00);
      visual += codePointWidth(cp);
      i += 2;
    } else {
      visual += codePointWidth(c);
      i++;
    }
  }
  return i;
}

/**
 * Returns the display cell width (1 or 2) for a Unicode code point.
 * Wide/fullwidth characters (CJK, emoji) occupy 2 cells.
 */
function codePointWidth(cp: number): 1 | 2 {
  if (
    (cp >= 0x1100 && cp <= 0x115f) || // Hangul Jamo
    cp === 0x2329 ||
    cp === 0x232a ||
    (cp >= 0x2e80 && cp <= 0x303e) || // CJK Radicals, Bopomofo, etc.
    (cp >= 0x3040 && cp <= 0x33ff) || // Hiragana, Katakana, CJK misc
    (cp >= 0x3400 && cp <= 0x4dbf) || // CJK Unified Extension A
    (cp >= 0x4e00 && cp <= 0x9fff) || // CJK Unified Ideographs
    (cp >= 0xa000 && cp <= 0xa4cf) || // Yi
    (cp >= 0xac00 && cp <= 0xd7af) || // Hangul Syllables
    (cp >= 0xf900 && cp <= 0xfaff) || // CJK Compatibility Ideographs
    (cp >= 0xfe10 && cp <= 0xfe1f) || // Vertical Forms
    (cp >= 0xfe30 && cp <= 0xfe6f) || // CJK Compatibility Forms, Small Forms
    (cp >= 0xff00 && cp <= 0xff60) || // Fullwidth Latin, Katakana, Hangul
    (cp >= 0xffe0 && cp <= 0xffe6) || // Fullwidth Signs
    (cp >= 0x1b000 && cp <= 0x1b0ff) || // Kana Supplement
    (cp >= 0x1f004 && cp <= 0x1f0cf) || // Mahjong/Playing Card Symbols
    (cp >= 0x1f200 && cp <= 0x1f2ff) || // Enclosed Ideographic Supplement
    (cp >= 0x1f300 && cp <= 0x1f64f) || // Misc Symbols, Emoticons
    (cp >= 0x1f900 && cp <= 0x1f9ff) || // Supplemental Symbols
    (cp >= 0x20000 && cp <= 0x2ffff) || // CJK Extensions B–F
    (cp >= 0x30000 && cp <= 0x3ffff) // CJK Extension G
  ) {
    return 2;
  }
  return 1;
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
      // Skip current word chars, then skip non-word chars
      let pos = col;
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
      return { row: current.row, column: pos };
    }

    // left: skip non-word chars, then skip word chars
    let pos = col;
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
