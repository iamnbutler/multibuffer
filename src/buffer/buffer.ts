/**
 * Buffer: mutable text storage backed by a Rope.
 *
 * Snapshots are immutable views sharing the underlying Rope (structural sharing).
 * Position conversion uses the Rope's line/offset tracking.
 */

import { Rope } from "./rope.ts";
import type {
  Buffer,
  BufferId,
  BufferOffset,
  BufferPoint,
  BufferRow,
  BufferSnapshot,
  EditEntry,
  TextSummary,
} from "./types.ts";
import { Bias } from "./types.ts";

function computeTextSummary(rope: Rope): TextSummary {
  // lines and chars are O(1) from rope metadata — no allocation or iteration needed.
  const lines = rope.lineCount;
  const chars = rope.length;
  // biome-ignore lint/plugin/no-type-assertion: expect: BufferRow brand for last-row index
  const lastLineLength = rope.line((lines - 1) as BufferRow).length;
  // byteLength() scans chunks in-place — no full-text allocation.
  const bytes = rope.byteLength();
  return { lines, bytes, lastLineLength, chars };
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

  clipPoint(point: BufferPoint, bias: Bias): BufferPoint {
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

    const lineText = this._rope.line(r);
    const lineLen = lineText.length;
    let col = point.column;
    if (col < 0) col = 0;
    if (col > lineLen) col = lineLen;

    // Snap out of the middle of a UTF-16 surrogate pair.
    // A low surrogate (0xDC00–0xDFFF) at col means col is inside a 2-unit pair.
    // Bias.Left  → step back to the high surrogate (col - 1)
    // Bias.Right → step past the low surrogate (col + 1, clamped to lineLen)
    if (col > 0 && col < lineLen) {
      const code = lineText.charCodeAt(col);
      if (code >= 0xdc00 && code <= 0xdfff) {
        col = bias === Bias.Left ? col - 1 : Math.min(col + 1, lineLen);
      }
    }

    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
    return { row: r as BufferRow, column: col };
  }

  clipOffset(offset: BufferOffset, bias: Bias): BufferOffset {
    const clamped = Math.max(0, Math.min(offset, this._rope.length));

    // Snap out of the middle of a UTF-16 surrogate pair.
    // rope.slice(pos, pos+1) gives the code unit at that offset in O(1).
    if (clamped > 0 && clamped < this._rope.length) {
      const code = this._rope.slice(clamped, clamped + 1).charCodeAt(0);
      if (code >= 0xdc00 && code <= 0xdfff) {
        const snapped = bias === Bias.Left ? clamped - 1 : clamped + 1;
        // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
        return snapped as BufferOffset;
      }
    }

    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
    return clamped as BufferOffset;
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
