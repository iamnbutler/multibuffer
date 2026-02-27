/**
 * Buffer: mutable text storage backed by a line array.
 *
 * Snapshots are immutable views created by copying the line array.
 * Position conversion uses a precomputed prefix-sum array for O(1) lookup.
 */

import type {
  Bias,
  Buffer,
  BufferId,
  BufferOffset,
  BufferPoint,
  BufferRow,
  BufferSnapshot,
  EditEntry,
  TextSummary,
} from "./types.ts";

// =============================================================================
// Helpers
// =============================================================================

/**
 * Compute the cumulative byte offset of each line's start.
 * lineStarts[i] = sum of (lines[0..i-1].length + 1) for the newlines.
 */
function computeLineStarts(lines: readonly string[]): number[] {
  const starts = new Array<number>(lines.length);
  let offset = 0;
  for (let i = 0; i < lines.length; i++) {
    starts[i] = offset;
    offset += (lines[i] ?? "").length + 1;
  }
  return starts;
}

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
      // High surrogate — next char is low surrogate, together they encode 4 bytes.
      bytes += 4;
      i++;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

function computeTextSummary(lines: readonly string[]): TextSummary {
  let totalBytes = 0;
  let totalChars = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    totalBytes += utf8ByteLength(line);
    totalChars += line.length;
    if (i < lines.length - 1) {
      totalBytes += 1; // newline byte
      totalChars += 1; // newline char
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

// =============================================================================
// BufferSnapshot
// =============================================================================

class BufferSnapshotImpl implements BufferSnapshot {
  readonly id: BufferId;
  readonly lineCount: number;
  readonly textSummary: TextSummary;
  readonly version: number;
  private readonly _lines: readonly string[];
  private readonly _lineStarts: readonly number[];
  private readonly _textLength: number;

  constructor(
    id: BufferId,
    lines: readonly string[],
    lineStarts: readonly number[],
    textSummary: TextSummary,
    textLength: number,
    version: number,
  ) {
    this.id = id;
    this._lines = lines;
    this._lineStarts = lineStarts;
    this.lineCount = lines.length;
    this.textSummary = textSummary;
    this._textLength = textLength;
    this.version = version;
  }

  line(row: BufferRow): string {
    return this._lines[row] ?? "";
  }

  lines(startRow: BufferRow, endRow: BufferRow): readonly string[] {
    return this._lines.slice(startRow, endRow);
  }

  text(): string {
    return this._lines.join("\n");
  }

  pointToOffset(point: BufferPoint): BufferOffset {
    const lineStart = this._lineStarts[point.row] ?? 0;
    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
    return (lineStart + point.column) as BufferOffset;
  }

  offsetToPoint(offset: BufferOffset): BufferPoint {
    // Binary search for the row containing this offset.
    let lo = 0;
    let hi = this._lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((this._lineStarts[mid] ?? 0) <= offset) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    const column = offset - (this._lineStarts[lo] ?? 0);
    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
    return { row: lo as BufferRow, column };
  }

  clipPoint(point: BufferPoint, _bias: Bias): BufferPoint {
    const r = point.row;
    if (r >= this.lineCount) {
      // Past end of buffer → clamp to end of last line.
      const lastRow = this.lineCount - 1;
      const lastLineLen = (this._lines[lastRow] ?? "").length;
      // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
      return { row: lastRow as BufferRow, column: lastLineLen };
    }
    if (r < 0) {
      // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
      return { row: 0 as BufferRow, column: 0 };
    }

    const lineLen = (this._lines[r] ?? "").length;
    let col = point.column;
    if (col < 0) col = 0;
    if (col > lineLen) col = lineLen;

    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
    return { row: r as BufferRow, column: col };
  }

  clipOffset(offset: BufferOffset, _bias: Bias): BufferOffset {
    if (offset < 0) {
      // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
      return 0 as BufferOffset;
    }
    if (offset > this._textLength) {
      // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
      return this._textLength as BufferOffset;
    }
    return offset;
  }
}

// =============================================================================
// Buffer
// =============================================================================

class BufferImpl implements Buffer {
  readonly id: BufferId;
  private _lines: string[];
  private _lineStarts: number[];
  private _textSummary: TextSummary;
  private _textLength: number;
  private _version = 0;
  private _editLog: EditEntry[] = [];

  constructor(id: BufferId, text: string) {
    this.id = id;
    this._lines = text.split("\n");
    this._lineStarts = computeLineStarts(this._lines);
    this._textSummary = computeTextSummary(this._lines);
    this._textLength = text.length;
  }

  get version(): number {
    return this._version;
  }

  editsSince(version: number): readonly EditEntry[] {
    if (version >= this._version) return [];
    if (version < 0) return this._editLog;
    return this._editLog.slice(version);
  }

  snapshot(): BufferSnapshot {
    return new BufferSnapshotImpl(
      this.id,
      this._lines.slice(),
      this._lineStarts.slice(),
      this._textSummary,
      this._textLength,
      this._version,
    );
  }

  insert(at: BufferOffset, text: string): void {
    this._editLog.push({
      offset: at,
      deletedLength: 0,
      insertedLength: text.length,
    });
    this._version++;
    const current = this._lines.join("\n");
    const updated = current.slice(0, at) + text + current.slice(at);
    this._applyText(updated);
  }

  delete(start: BufferOffset, end: BufferOffset): void {
    // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic for offset difference
    const deletedLength = (end as number) - (start as number);
    this._editLog.push({
      offset: start,
      deletedLength,
      insertedLength: 0,
    });
    this._version++;
    const current = this._lines.join("\n");
    const updated = current.slice(0, start) + current.slice(end);
    this._applyText(updated);
  }

  replace(start: BufferOffset, end: BufferOffset, text: string): void {
    // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic for offset difference
    const deletedLength = (end as number) - (start as number);
    this._editLog.push({
      offset: start,
      deletedLength,
      insertedLength: text.length,
    });
    this._version++;
    const current = this._lines.join("\n");
    const updated = current.slice(0, start) + text + current.slice(end);
    this._applyText(updated);
  }

  private _applyText(text: string): void {
    this._lines = text.split("\n");
    this._lineStarts = computeLineStarts(this._lines);
    this._textSummary = computeTextSummary(this._lines);
    this._textLength = text.length;
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createBuffer(id: BufferId, text: string): Buffer {
  return new BufferImpl(id, text);
}
