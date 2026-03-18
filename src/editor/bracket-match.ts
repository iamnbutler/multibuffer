/**
 * Bracket matching: finds the matching bracket pair for a cursor position.
 *
 * Given a cursor point, inspects the character at that position. If it is an
 * open bracket (`(`, `[`, `{`) it scans forward for the corresponding close;
 * if it is a close bracket (`)`, `]`, `}`) it scans backward for the open.
 * Nesting is handled by tracking depth. Returns null when no bracket is found
 * at the cursor, or when no matching partner exists within the scan limit.
 *
 * The scan is bounded to MAX_SCAN_LINES in each direction to keep the worst-case
 * cost proportional to the visible window, not the whole document.
 */

import type { MultiBufferPoint, MultiBufferRow, MultiBufferSnapshot } from "../multibuffer/types.ts";

/** The matched open and close positions for a bracket pair. */
export interface BracketMatch {
  readonly open: MultiBufferPoint;
  readonly close: MultiBufferPoint;
}

/** Maximum number of lines to scan in either direction when searching for a match. */
const MAX_SCAN_LINES = 1_000;

const OPEN_BRACKETS = new Set(["(", "[", "{"]);
const CLOSE_BRACKETS = new Set([")", "]", "}"]);

/** Maps each bracket character to its partner. */
const BRACKET_PARTNER: Record<string, string> = {
  "(": ")",
  "[": "]",
  "{": "}",
  ")": "(",
  "]": "[",
  "}": "{",
};

/**
 * Find the matching bracket for the character at `cursor` in `snapshot`.
 *
 * - If cursor is on an open bracket, scans forward for the matching close.
 * - If cursor is on a close bracket, scans backward for the matching open.
 * - Returns `null` if no bracket is at the cursor or no match is found.
 */
export function findMatchingBracket(
  snapshot: MultiBufferSnapshot,
  cursor: MultiBufferPoint,
): BracketMatch | null {
  // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction for row bounds
  const rowLines = snapshot.lines(cursor.row, (cursor.row + 1) as MultiBufferRow);
  const line = rowLines[0] ?? "";
  const ch = line[cursor.column] ?? "";

  if (OPEN_BRACKETS.has(ch)) {
    const close = scanForward(snapshot, cursor, ch);
    if (!close) return null;
    return { open: cursor, close };
  }

  if (CLOSE_BRACKETS.has(ch)) {
    const open = scanBackward(snapshot, cursor, ch);
    if (!open) return null;
    return { open, close: cursor };
  }

  return null;
}

/**
 * Scan forward from `start` (inclusive) looking for the matching close bracket.
 * `openChar` is the bracket at `start` that we are matching.
 */
function scanForward(
  snapshot: MultiBufferSnapshot,
  start: MultiBufferPoint,
  openChar: string,
): MultiBufferPoint | null {
  const closeChar = BRACKET_PARTNER[openChar];
  if (!closeChar) return null;

  const endRow = Math.min(start.row + MAX_SCAN_LINES + 1, snapshot.lineCount);
  // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction for row bounds
  const lines = snapshot.lines(start.row, endRow as MultiBufferRow);

  let depth = 0;
  for (let li = 0; li < lines.length; li++) {
    const lineText = lines[li] ?? "";
    const startCol = li === 0 ? start.column : 0;
    for (let col = startCol; col < lineText.length; col++) {
      const c = lineText[col];
      if (c === openChar) {
        depth++;
      } else if (c === closeChar) {
        depth--;
        if (depth === 0) {
          // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction for computed row
          return { row: (start.row + li) as MultiBufferRow, column: col };
        }
      }
    }
  }
  return null;
}

/**
 * Scan backward from `start` (inclusive) looking for the matching open bracket.
 * `closeChar` is the bracket at `start` that we are matching.
 */
function scanBackward(
  snapshot: MultiBufferSnapshot,
  start: MultiBufferPoint,
  closeChar: string,
): MultiBufferPoint | null {
  const openChar = BRACKET_PARTNER[closeChar];
  if (!openChar) return null;

  const firstRow = Math.max(0, start.row - MAX_SCAN_LINES);
  // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction for row bounds
  const lines = snapshot.lines(firstRow as MultiBufferRow, (start.row + 1) as MultiBufferRow);

  let depth = 0;
  // Iterate lines in reverse order
  for (let li = lines.length - 1; li >= 0; li--) {
    const lineText = lines[li] ?? "";
    const absoluteRow = firstRow + li;
    const endCol = absoluteRow === start.row ? start.column : lineText.length - 1;
    for (let col = endCol; col >= 0; col--) {
      const c = lineText[col];
      if (c === closeChar) {
        depth++;
      } else if (c === openChar) {
        depth--;
        if (depth === 0) {
          // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction for computed row
          return { row: absoluteRow as MultiBufferRow, column: col };
        }
      }
    }
  }
  return null;
}
