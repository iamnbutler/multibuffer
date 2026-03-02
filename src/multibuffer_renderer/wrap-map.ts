/**
 * WrapMap: maps buffer rows ↔ visual rows for soft-wrapped text.
 *
 * Uses a prefix sum array for O(1) buffer-row → visual-row conversion
 * and binary search for O(log n) visual-row → buffer-row conversion.
 */

import type { MultiBufferRow, MultiBufferSnapshot } from "../multibuffer/types.ts";

/**
 * Returns the display cell width (1 or 2) for a Unicode code point.
 * Wide and fullwidth characters (CJK, emoji, fullwidth forms) occupy
 * two cells in a fixed-width monospace font.
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

/**
 * Visual display width of a string in fixed-width monospace cells.
 * Wide/fullwidth characters (CJK, emoji) count as 2 cells; all others as 1.
 */
export function visualWidth(text: string): number {
  let w = 0;
  for (const char of text) {
    w += codePointWidth(char.codePointAt(0) ?? 0);
  }
  return w;
}

/**
 * Convert a UTF-16 code-unit column index to a visual column
 * (number of display cells from the start of the string).
 */
export function charColToVisualCol(text: string, charCol: number): number {
  let visual = 0;
  let i = 0;
  for (const char of text) {
    if (i >= charCol) break;
    visual += codePointWidth(char.codePointAt(0) ?? 0);
    i += char.length;
  }
  return visual;
}

/**
 * Convert a visual column (display cell offset) to a UTF-16 code-unit
 * column index. Snaps to the next character boundary when landing
 * in the middle of a wide glyph. Clamps to the end of the string.
 */
export function visualColToCharCol(text: string, visualCol: number): number {
  let visual = 0;
  let i = 0;
  for (const char of text) {
    if (visual >= visualCol) break;
    visual += codePointWidth(char.codePointAt(0) ?? 0);
    i += char.length;
  }
  return i;
}

/**
 * Split a line into visual-width segments at wrapWidth display cells.
 * Correctly handles wide characters (CJK, emoji) that occupy 2 cells.
 * Never splits in the middle of a wide glyph.
 */
export function wrapLine(text: string, wrapWidth: number): string[] {
  if (wrapWidth <= 0 || visualWidth(text) <= wrapWidth) {
    return [text];
  }
  const segments: string[] = [];
  let segStart = 0; // UTF-16 code-unit index of current segment start
  let segVW = 0; // accumulated visual width of current segment
  let i = 0; // current UTF-16 code-unit index
  for (const char of text) {
    const cw = codePointWidth(char.codePointAt(0) ?? 0);
    if (segVW + cw > wrapWidth && segVW > 0) {
      // Adding this glyph would exceed the wrap width: cut before it
      segments.push(text.slice(segStart, i));
      segStart = i;
      segVW = cw;
    } else {
      segVW += cw;
    }
    i += char.length; // char.length is 2 for surrogate pairs, 1 for BMP
  }
  segments.push(text.slice(segStart));
  return segments;
}

export class WrapMap {
  /** prefix[i] = total visual rows for buffer rows 0..i-1. prefix[0] = 0. */
  private _prefix: Uint32Array;
  private _wrapWidth: number;
  readonly totalVisualRows: number;

  constructor(snapshot: MultiBufferSnapshot, wrapWidth: number) {
    this._wrapWidth = wrapWidth;
    const lineCount = snapshot.lineCount;

    // Build prefix sum
    this._prefix = new Uint32Array(lineCount + 1);
    this._prefix[0] = 0;

    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction for iteration
    const startRow = 0 as MultiBufferRow;
    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction for iteration
    const endRow = lineCount as MultiBufferRow;
    const lines = snapshot.lines(startRow, endRow);

    for (let i = 0; i < lineCount; i++) {
      const line = lines[i] ?? "";
      const visualRows = wrapLine(line, wrapWidth).length;
      this._prefix[i + 1] = (this._prefix[i] ?? 0) + visualRows;
    }

    this.totalVisualRows = this._prefix[lineCount] ?? 0;
  }

  /** How many visual rows does a buffer row occupy? */
  visualRowsForLine(mbRow: MultiBufferRow): number {
    const next = this._prefix[mbRow + 1];
    const curr = this._prefix[mbRow];
    if (next === undefined || curr === undefined) return 1;
    return next - curr;
  }

  /** First visual row for a given buffer row. O(1). */
  bufferRowToFirstVisualRow(mbRow: MultiBufferRow): number {
    return this._prefix[mbRow] ?? 0;
  }

  /** Convert a visual row to { buffer row, segment index }. O(log n). */
  visualRowToBufferRow(visualRow: number): { mbRow: MultiBufferRow; segment: number } {
    // Binary search: find largest i where prefix[i] <= visualRow
    let lo = 0;
    let hi = this._prefix.length - 2; // last valid buffer row index
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((this._prefix[mid] ?? 0) <= visualRow) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    const segment = visualRow - (this._prefix[lo] ?? 0);
    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
    return { mbRow: lo as MultiBufferRow, segment };
  }

  /** Total content height in pixels. */
  contentHeight(lineHeight: number): number {
    return this.totalVisualRows * lineHeight;
  }

  get wrapWidth(): number {
    return this._wrapWidth;
  }

}
