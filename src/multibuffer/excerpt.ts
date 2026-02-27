/**
 * Excerpt: a view into a contiguous range of lines within a buffer.
 *
 * Excerpts reference a BufferSnapshot (not a copy of text).
 * TextSummary is computed from the buffer's lines within the range.
 */

import type {
  BufferSnapshot,
  Excerpt,
  ExcerptId,
  ExcerptInfo,
  ExcerptRange,
  MultiBufferRow,
  TextSummary,
} from "./types.ts";

// =============================================================================
// Helpers
// =============================================================================

/** UTF-8 byte length without allocating a Uint8Array. */
function utf8ByteLength(str: string): number {
  let bytes = 0;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code <= 0x7f) {
      bytes += 1;
    } else if (code <= 0x7ff) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4;
      i++;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

/**
 * Compute TextSummary for lines within an excerpt range.
 * Range is [context.start.row, context.end.row) in buffer coordinates.
 */
function computeExcerptSummary(
  buffer: BufferSnapshot,
  range: ExcerptRange,
): TextSummary {
  const startRow = range.context.start.row;
  const endRow = range.context.end.row;
  const lines = buffer.lines(startRow, endRow);

  let totalBytes = 0;
  let totalChars = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    totalBytes += utf8ByteLength(line);
    totalChars += line.length;
    if (i < lines.length - 1) {
      totalBytes += 1;
      totalChars += 1;
    }
  }

  const lastLine = lines[lines.length - 1] ?? "";
  return {
    lines: lines.length,
    bytes: totalBytes,
    lastLineLength: lastLine.length,
    chars: totalChars,
  };
}

/** Number of lines an excerpt occupies in the multibuffer view. */
export function excerptLineCount(excerpt: Excerpt): number {
  const rangeLines =
    excerpt.range.context.end.row - excerpt.range.context.start.row;
  return rangeLines + (excerpt.hasTrailingNewline ? 1 : 0);
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create an excerpt from a buffer snapshot and a range.
 * Throws if the range extends beyond buffer bounds.
 */
export function createExcerpt(
  id: ExcerptId,
  buffer: BufferSnapshot,
  range: ExcerptRange,
  hasTrailingNewline: boolean,
): Excerpt {
  const endRow = range.context.end.row;
  if (endRow > buffer.lineCount) {
    throw new RangeError(
      `Excerpt range end row ${endRow} exceeds buffer line count ${buffer.lineCount}`,
    );
  }

  return {
    id,
    bufferId: buffer.id,
    buffer,
    range,
    hasTrailingNewline,
    textSummary: computeExcerptSummary(buffer, range),
  };
}

/**
 * Convert an internal Excerpt to a public ExcerptInfo.
 * Requires the excerpt's starting row in the multibuffer view.
 */
export function toExcerptInfo(
  excerpt: Excerpt,
  startRow: MultiBufferRow,
): ExcerptInfo {
  const lineCount = excerptLineCount(excerpt);
  // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
  const endRow = (startRow + lineCount) as MultiBufferRow;
  return {
    id: excerpt.id,
    bufferId: excerpt.bufferId,
    range: excerpt.range,
    startRow,
    endRow,
    hasTrailingNewline: excerpt.hasTrailingNewline,
  };
}
