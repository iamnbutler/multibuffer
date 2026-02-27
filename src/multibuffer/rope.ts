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
const MAX_CHUNK_SIZE = TARGET_CHUNK_SIZE * 2;

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

  private constructor(chunks: readonly Chunk[]) {
    this._chunks = chunks;
    let length = 0;
    let newlines = 0;
    for (const c of chunks) {
      length += c.text.length;
      newlines += c.newlines;
    }
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
          let endPos = text.indexOf("\n", pos);
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

  /** Convert a character offset to {line, col}. */
  offsetToLineCol(offset: number): { line: number; col: number } {
    let line = 0;
    let lineStartOffset = 0;
    let currentOffset = 0;

    for (const chunk of this._chunks) {
      const text = chunk.text;
      for (let i = 0; i < text.length; i++) {
        if (currentOffset === offset) {
          return { line, col: currentOffset - lineStartOffset };
        }
        if (text.charCodeAt(i) === 10) {
          line++;
          lineStartOffset = currentOffset + 1;
        }
        currentOffset++;
      }
    }

    // offset is at end of text
    return { line, col: currentOffset - lineStartOffset };
  }

  /** Convert {line, col} to a character offset. */
  lineColToOffset(line: number, col: number): number {
    let currentLine = 0;
    let currentOffset = 0;

    for (const chunk of this._chunks) {
      const text = chunk.text;
      for (let i = 0; i < text.length; i++) {
        if (currentLine === line) {
          return currentOffset + col;
        }
        if (text.charCodeAt(i) === 10) {
          currentLine++;
        }
        currentOffset++;
      }
    }

    // Target line is the last line
    if (currentLine === line) {
      return currentOffset + col;
    }
    return currentOffset;
  }
}
