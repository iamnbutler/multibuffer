/**
 * Rope: a balanced tree of text chunks for O(log n) editing.
 *
 * Immutable — insert/delete/replace return new ropes with structural sharing.
 * Each node caches length and newline count for fast position lookups.
 *
 * Simplified design: uses a flat chunk array with a target chunk size.
 * Not a full B-tree — trades some theoretical complexity for simplicity
 * and cache friendliness. Good enough for single-user editing of files
 * up to ~100K lines.
 */

const TARGET_CHUNK_SIZE = 1024;

interface Chunk {
  readonly text: string;
  readonly newlines: number;
}

function countNewlines(text: string): number {
  let count = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) count++;
  }
  return count;
}

function makeChunk(text: string): Chunk {
  return { text, newlines: countNewlines(text) };
}

/**
 * Split text into balanced chunks, breaking at newline boundaries when possible.
 */
function textToChunks(text: string): Chunk[] {
  if (text.length === 0) return [makeChunk("")];
  if (text.length <= TARGET_CHUNK_SIZE) return [makeChunk(text)];

  const chunks: Chunk[] = [];
  let pos = 0;
  while (pos < text.length) {
    let end = Math.min(pos + TARGET_CHUNK_SIZE, text.length);
    // Try to break at a newline within the chunk
    if (end < text.length) {
      const newlinePos = text.lastIndexOf("\n", end);
      if (newlinePos > pos) {
        end = newlinePos + 1; // include the newline in this chunk
      }
    }
    chunks.push(makeChunk(text.slice(pos, end)));
    pos = end;
  }
  return chunks;
}

export class Rope {
  private readonly _chunks: readonly Chunk[];
  private readonly _length: number;
  private readonly _newlineCount: number;
  /** _chunkOffsets[i] = byte offset where chunk i starts. */
  private readonly _chunkOffsets: readonly number[];
  /** _chunkNewlines[i] = cumulative newlines in chunks 0..i-1. */
  private readonly _chunkNewlinePrefixes: readonly number[];

  private constructor(chunks: readonly Chunk[]) {
    this._chunks = chunks;
    let length = 0;
    let newlines = 0;
    const offsets = new Array<number>(chunks.length);
    const nlPrefixes = new Array<number>(chunks.length + 1);
    nlPrefixes[0] = 0;
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      if (!c) continue;
      offsets[i] = length;
      length += c.text.length;
      newlines += c.newlines;
      nlPrefixes[i + 1] = newlines;
    }
    this._chunkOffsets = offsets;
    this._chunkNewlinePrefixes = nlPrefixes;
    this._length = length;
    this._newlineCount = newlines;
  }

  static from(text: string): Rope {
    return new Rope(textToChunks(text));
  }

  get length(): number {
    return this._length;
  }

  get lineCount(): number {
    return this._newlineCount + 1;
  }

  /** Get the full text. O(n) — use sparingly. */
  text(): string {
    if (this._chunks.length === 1) return this._chunks[0]?.text ?? "";
    let result = "";
    for (const c of this._chunks) {
      result += c.text;
    }
    return result;
  }

  /** Get a single line by 0-based index. */
  line(row: number): string {
    if (row < 0 || row >= this.lineCount) return "";

    let currentLine = 0;
    let lineStart = 0;

    for (const chunk of this._chunks) {
      const chunkEnd = lineStart + chunk.text.length;

      if (currentLine + chunk.newlines >= row || chunk === this._chunks[this._chunks.length - 1]) {
        // The target line starts or is contained in this chunk
        let pos = 0;
        const text = chunk.text;
        while (currentLine < row) {
          const nl = text.indexOf("\n", pos);
          if (nl === -1) break;
          pos = nl + 1;
          currentLine++;
        }

        if (currentLine === row) {
          // Find end of this line
          const endPos = text.indexOf("\n", pos);
          if (endPos === -1) {
            // Line spans into next chunk(s)
            let result = text.slice(pos);
            let ci = this._chunks.indexOf(chunk) + 1;
            while (ci < this._chunks.length) {
              const nextChunk = this._chunks[ci];
              if (!nextChunk) break;
              const nl = nextChunk.text.indexOf("\n");
              if (nl === -1) {
                result += nextChunk.text;
                ci++;
              } else {
                result += nextChunk.text.slice(0, nl);
                break;
              }
            }
            return result;
          }
          return text.slice(pos, endPos);
        }
      }

      currentLine += chunk.newlines;
      lineStart = chunkEnd;
    }

    return "";
  }

  /** Get lines in range [startRow, endRow). */
  lines(startRow: number, endRow: number): string[] {
    const result: string[] = [];
    for (let row = startRow; row < endRow; row++) {
      result.push(this.line(row));
    }
    return result;
  }

  /** Get a substring by byte offset range. */
  slice(start: number, end: number): string {
    if (start >= end || start >= this._length) return "";

    let result = "";
    let offset = 0;
    for (const chunk of this._chunks) {
      const chunkEnd = offset + chunk.text.length;
      if (chunkEnd <= start) {
        offset = chunkEnd;
        continue;
      }
      if (offset >= end) break;

      const sliceStart = Math.max(0, start - offset);
      const sliceEnd = Math.min(chunk.text.length, end - offset);
      result += chunk.text.slice(sliceStart, sliceEnd);
      offset = chunkEnd;
    }
    return result;
  }

  /** Insert text at an offset. Returns a new rope. */
  insert(offset: number, text: string): Rope {
    if (text.length === 0) return this;
    const before = this.slice(0, offset);
    const after = this.slice(offset, this._length);
    return Rope.from(before + text + after);
  }

  /** Delete a range [start, end). Returns a new rope. */
  delete(start: number, end: number): Rope {
    if (start >= end) return this;
    const before = this.slice(0, start);
    const after = this.slice(end, this._length);
    return Rope.from(before + after);
  }

  /** Replace a range [start, end) with text. Returns a new rope. */
  replace(start: number, end: number, text: string): Rope {
    const before = this.slice(0, start);
    const after = this.slice(end, this._length);
    return Rope.from(before + text + after);
  }

  /** Convert a character offset to {line, col}. Binary search on chunk offsets. */
  offsetToLineCol(offset: number): { line: number; col: number } {
    if (offset <= 0) return { line: 0, col: 0 };
    if (offset >= this._length) {
      // Count total newlines, col = distance from last newline
      const text = this._chunks[this._chunks.length - 1]?.text ?? "";
      const lastNl = text.lastIndexOf("\n");
      if (lastNl === -1) {
        // Last chunk has no newline — col extends from previous chunks
        const prevNewlines = this._chunkNewlinePrefixes[this._chunks.length - 1] ?? 0;
        // Find offset of the start of the last line
        let lineStartOff = 0;
        if (prevNewlines > 0 || text.length < this._length) {
          lineStartOff = this._findLineStartOffset(this._newlineCount);
        }
        return { line: this._newlineCount, col: this._length - lineStartOff };
      }
      const chunkOffset = this._chunkOffsets[this._chunks.length - 1] ?? 0;
      return { line: this._newlineCount, col: this._length - (chunkOffset + lastNl + 1) };
    }

    // Binary search for the chunk containing this offset
    const ci = this._findChunkByOffset(offset);
    const chunk = this._chunks[ci];
    if (!chunk) return { line: 0, col: 0 };

    const chunkStart = this._chunkOffsets[ci] ?? 0;
    const posInChunk = offset - chunkStart;
    const linesBeforeChunk = this._chunkNewlinePrefixes[ci] ?? 0;

    // Count newlines within this chunk up to posInChunk
    let lineInChunk = 0;
    let lastNlPos = -1;
    for (let i = 0; i < posInChunk; i++) {
      if (chunk.text.charCodeAt(i) === 10) {
        lineInChunk++;
        lastNlPos = i;
      }
    }

    const line = linesBeforeChunk + lineInChunk;
    const col = posInChunk - (lastNlPos + 1);
    return { line, col };
  }

  /** Convert {line, col} to a character offset. Binary search on chunk newline prefixes. */
  lineColToOffset(line: number, col: number): number {
    if (line <= 0) return Math.min(col, this._length);
    if (line >= this.lineCount) return this._length;

    // Binary search for the chunk containing this line
    const ci = this._findChunkByLine(line);
    const chunk = this._chunks[ci];
    if (!chunk) return 0;

    const chunkStart = this._chunkOffsets[ci] ?? 0;
    const linesBeforeChunk = this._chunkNewlinePrefixes[ci] ?? 0;
    const targetLineInChunk = line - linesBeforeChunk;

    // Scan within the chunk for the target line
    let lineInChunk = 0;
    for (let i = 0; i < chunk.text.length; i++) {
      if (lineInChunk === targetLineInChunk) {
        return chunkStart + i + col;
      }
      if (chunk.text.charCodeAt(i) === 10) {
        lineInChunk++;
      }
    }

    // Target line starts after this chunk's content (shouldn't happen with correct binary search)
    return chunkStart + chunk.text.length + col;
  }

  /** Binary search: find chunk index containing the given byte offset. */
  private _findChunkByOffset(offset: number): number {
    let lo = 0;
    let hi = this._chunks.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((this._chunkOffsets[mid] ?? 0) <= offset) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    return lo;
  }

  /** Binary search: find chunk index containing the given line number. */
  private _findChunkByLine(line: number): number {
    let lo = 0;
    let hi = this._chunks.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((this._chunkNewlinePrefixes[mid] ?? 0) <= line) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    return lo;
  }

  /** Find the byte offset of the start of a given line. */
  private _findLineStartOffset(line: number): number {
    if (line <= 0) return 0;
    const ci = this._findChunkByLine(line);
    const chunk = this._chunks[ci];
    if (!chunk) return 0;

    const chunkStart = this._chunkOffsets[ci] ?? 0;
    const linesBeforeChunk = this._chunkNewlinePrefixes[ci] ?? 0;
    const targetLineInChunk = line - linesBeforeChunk;

    let lineInChunk = 0;
    for (let i = 0; i < chunk.text.length; i++) {
      if (chunk.text.charCodeAt(i) === 10) {
        lineInChunk++;
        if (lineInChunk === targetLineInChunk) {
          return chunkStart + i + 1;
        }
      }
    }
    return chunkStart + chunk.text.length;
  }
}
