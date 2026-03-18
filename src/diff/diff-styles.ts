/**
 * Shared decoration styles and helpers for diff MultiBuffer construction.
 *
 * Used by both `multibuffer.ts` (buffer-based diff) and `patch.ts` (patch string parser).
 */

import type { BufferRange, BufferRow } from "../buffer/types.ts";
import type {
  ExcerptRange,
  MultiBufferRange,
  MultiBufferRow,
} from "../multibuffer/types.ts";
import type { Decoration, DecorationStyle } from "../renderer/types.ts";

export const DELETE_STYLE: Partial<DecorationStyle> = {
  backgroundColor: "rgba(255, 80, 80, 0.10)",
  gutterBackground: "rgba(255, 80, 80, 0.18)",
  gutterSign: "\u2212",
  gutterSignColor: "#f87171",
};

export const INSERT_STYLE: Partial<DecorationStyle> = {
  backgroundColor: "rgba(80, 200, 80, 0.10)",
  gutterBackground: "rgba(80, 200, 80, 0.18)",
  gutterSign: "+",
  gutterSignColor: "#4ade80",
};

/** Intraline delete highlighting (stronger opacity than line-level). */
export const INTRALINE_DELETE_STYLE: Partial<DecorationStyle> = {
  backgroundColor: "rgba(255, 80, 80, 0.25)",
};

/** Intraline insert highlighting (stronger opacity than line-level). */
export const INTRALINE_INSERT_STYLE: Partial<DecorationStyle> = {
  backgroundColor: "rgba(80, 200, 80, 0.25)",
};

/** Build an ExcerptRange covering [startRow, endRow) in buffer coordinates. */
export function makeExcerptRange(startRow: number, endRow: number): ExcerptRange {
  const bufRange: BufferRange = {
    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction for buffer row
    start: { row: startRow as BufferRow, column: 0 },
    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction for buffer row
    end: { row: endRow as BufferRow, column: 0 },
  };
  return { context: bufRange, primary: bufRange };
}

/** Build a line-range decoration covering [startMbRow, startMbRow + lineCount - 1]. */
export function makeDecoration(
  startMbRow: number,
  lineCount: number,
  style: Partial<DecorationStyle>,
): Decoration {
  const range: MultiBufferRange = {
    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction for multibuffer row
    start: { row: startMbRow as MultiBufferRow, column: 0 },
    end: {
      // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction for multibuffer row
      row: (startMbRow + lineCount - 1) as MultiBufferRow,
      column: Number.MAX_SAFE_INTEGER,
    },
  };
  return { range, style };
}

/** Build a column-range decoration for intraline highlighting. */
export function makeColumnDecoration(
  mbRow: number,
  startColumn: number,
  endColumn: number,
  style: Partial<DecorationStyle>,
): Decoration {
  const range: MultiBufferRange = {
    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction for multibuffer row
    start: { row: mbRow as MultiBufferRow, column: startColumn },
    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction for multibuffer row
    end: { row: mbRow as MultiBufferRow, column: endColumn },
  };
  return { range, style };
}
