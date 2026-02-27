/**
 * Buffer: mutable text storage backed by a Rope.
 *
 * Snapshots are immutable views sharing the underlying Rope (structural sharing).
 * Position conversion uses the Rope's line/offset tracking.
 */

import { Rope } from "./rope.ts";
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

function computeTextSummary(rope: Rope): TextSummary {
  const text = rope.text();
  const lines = text.split("\n");
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

class BufferSnapshotImpl implements BufferSnapshot {
  readonly id: BufferId;
  readonly lineCount: number;
  readonly textSummary: TextSummary;
  readonly version: number;
  private readonly _rope: Rope;

  constructor(id: BufferId, rope: Rope, textSummary: TextSummary, version: number) {
    this.id = id;
    this._rope = rope;
    this.lineCount = rope.lineCount;
    this.textSummary = textSummary;
    this.version = version;
  }

  line(row: BufferRow): string {
    return this._rope.line(row);
  }

  lines(startRow: BufferRow, endRow: BufferRow): readonly string[] {
    return this._rope.lines(startRow, endRow);
  }

  text(): string {
    return this._rope.text();
  }

  pointToOffset(point: BufferPoint): BufferOffset {
    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
    return this._rope.lineColToOffset(point.row, point.column) as BufferOffset;
  }

  offsetToPoint(offset: BufferOffset): BufferPoint {
    const { line, col } = this._rope.offsetToLineCol(offset);
    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
    return { row: line as BufferRow, column: col };
  }

  clipPoint(point: BufferPoint, _bias: Bias): BufferPoint {
    const r = point.row;
    if (r >= this.lineCount) {
      const lastRow = this.lineCount - 1;
      const lastLineLen = this._rope.line(lastRow).length;
      // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
      return { row: lastRow as BufferRow, column: lastLineLen };
    }
    if (r < 0) {
      // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
      return { row: 0 as BufferRow, column: 0 };
    }

    const lineLen = this._rope.line(r).length;
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
    if (offset > this._rope.length) {
      // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
      return this._rope.length as BufferOffset;
    }
    return offset;
  }
}

class BufferImpl implements Buffer {
  readonly id: BufferId;
  private _rope: Rope;
  private _textSummary: TextSummary;
  private _version = 0;
  private _editLog: EditEntry[] = [];

  constructor(id: BufferId, text: string) {
    this.id = id;
    this._rope = Rope.from(text);
    this._textSummary = computeTextSummary(this._rope);
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
    // Rope is immutable — safe to share without copying
    return new BufferSnapshotImpl(
      this.id,
      this._rope,
      this._textSummary,
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
    this._rope = this._rope.insert(at, text);
    this._textSummary = computeTextSummary(this._rope);
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
    this._rope = this._rope.delete(start, end);
    this._textSummary = computeTextSummary(this._rope);
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
    this._rope = this._rope.replace(start, end, text);
    this._textSummary = computeTextSummary(this._rope);
  }
}

export function createBuffer(id: BufferId, text: string): Buffer {
  return new BufferImpl(id, text);
}
