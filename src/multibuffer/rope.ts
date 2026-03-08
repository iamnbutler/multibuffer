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
  /** _chunkOffsets[i] = UTF-16 code unit offset where chunk i starts. */
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

    // Find where line `row` starts by locating the (row-1)th newline.
    // Binary search on chunk newline prefix sums: O(log n_chunks) instead of O(n_chunks).
    let startCi: number;
    let startPos: number;

    if (row === 0) {
      startCi = 0;
      startPos = 0;
    } else {
      // _findChunkByLine(row-1) returns the chunk containing the (row-1)th newline.
      const ci = this._findChunkByLine(row - 1);
      const chunk = this._chunks[ci];
      if (!chunk) return "";

      const linesBeforeChunk = this._chunkNewlinePrefixes[ci] ?? 0;
      const targetNlInChunk = row - 1 - linesBeforeChunk;

      // Scan forward to the targetNlInChunk-th newline within this chunk.
      let nlCount = 0;
      let searchFrom = 0;
      let nlPos = -1;
      while (nlCount <= targetNlInChunk) {
        const found = chunk.text.indexOf("\n", searchFrom);
        if (found === -1) break;
        nlPos = found;
        nlCount++;
        searchFrom = found + 1;
      }

      // Line `row` starts immediately after the located newline.
      startPos = nlPos + 1;
      startCi = ci;
      // If the newline was the last char of the chunk, line starts at the next chunk.
      if (startPos >= chunk.text.length) {
        startCi = ci + 1;
        startPos = 0;
      }
    }

    if (startCi >= this._chunks.length) return "";
    const startChunk = this._chunks[startCi];
    if (!startChunk) return "";

    const endPos = startChunk.text.indexOf("\n", startPos);
    if (endPos === -1) {
      // Line spans into next chunk(s)
      let result = startChunk.text.slice(startPos);
      let nextCi = startCi + 1;
      while (nextCi < this._chunks.length) {
        const nextChunk = this._chunks[nextCi];
        if (!nextChunk) break;
        const nl = nextChunk.text.indexOf("\n");
        if (nl === -1) {
          result += nextChunk.text;
          nextCi++;
        } else {
          result += nextChunk.text.slice(0, nl);
          break;
        }
      }
      return result;
    }
    return startChunk.text.slice(startPos, endPos);
  }

  /** Get lines in range [startRow, endRow).
   *
   * Single-pass forward scan: binary-searches once to find where startRow
   * begins, then advances chunk-by-chunk without further binary searches.
   * O(n_chars_in_range) vs the naive O(k · log n_chunks) of calling line() k times.
   */
  lines(startRow: number, endRow: number): string[] {
    const clampedEnd = Math.min(endRow, this.lineCount);
    if (startRow >= clampedEnd) return [];

    const count = clampedEnd - startRow;
    const result: string[] = [];

    // ── Step 1: locate where startRow begins ──────────────────────────────
    let ci: number; // current chunk index
    let pos: number; // position within that chunk

    if (startRow === 0) {
      ci = 0;
      pos = 0;
    } else {
      // Binary search for the chunk containing the (startRow-1)th newline.
      const startCi = this._findChunkByLine(startRow - 1);
      const startChunk = this._chunks[startCi];
      if (!startChunk) return result;

      const nlsBefore = this._chunkNewlinePrefixes[startCi] ?? 0;
      const targetNl = startRow - 1 - nlsBefore;

      let nlFound = 0;
      let searchFrom = 0;
      let nlPos = -1;
      while (nlFound <= targetNl) {
        const found = startChunk.text.indexOf("\n", searchFrom);
        if (found === -1) break;
        nlPos = found;
        nlFound++;
        searchFrom = found + 1;
      }

      pos = nlPos + 1;
      ci = startCi;
      if (pos >= startChunk.text.length) {
        ci = startCi + 1;
        pos = 0;
      }
    }

    // ── Step 2: forward scan — collect `count` lines without binary search ─
    while (result.length < count) {
      if (ci >= this._chunks.length) break;
      const chunk = this._chunks[ci];
      if (!chunk) {
        ci++;
        pos = 0;
        continue;
      }

      const nl = chunk.text.indexOf("\n", pos);
      if (nl !== -1) {
        // Line ends within this chunk.
        result.push(chunk.text.slice(pos, nl));
        pos = nl + 1;
        if (pos >= chunk.text.length) {
          ci++;
          pos = 0;
        }
      } else {
        // Line continues into following chunk(s).
        let line = chunk.text.slice(pos);
        ci++;
        pos = 0;
        while (ci < this._chunks.length) {
          const next = this._chunks[ci];
          if (!next) {
            ci++;
            continue;
          }
          const nextNl = next.text.indexOf("\n");
          if (nextNl !== -1) {
            line += next.text.slice(0, nextNl);
            pos = nextNl + 1;
            if (pos >= next.text.length) {
              ci++;
              pos = 0;
            }
            break;
          }
          line += next.text;
          ci++;
        }
        result.push(line);
      }
    }

    // Trailing empty lines after the last newline (e.g. "Hello\n" has line 1 = "").
    // count is clamped to lineCount, so any remaining lines must be empty.
    while (result.length < count) {
      result.push("");
    }

    return result;
  }

  /** Get a substring by UTF-16 code unit offset range. */
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

  /** Convert a UTF-16 code unit offset to {line, col}. Binary search on chunk offsets. */
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

    // Count newlines within this chunk up to posInChunk.
    // indexOf is faster than a charCodeAt loop: ~38 native calls vs ~512 JS iterations.
    let lineInChunk = 0;
    let lastNlPos = -1;
    let searchFrom = 0;
    while (searchFrom < posInChunk) {
      const found = chunk.text.indexOf("\n", searchFrom);
      if (found === -1 || found >= posInChunk) break;
      lineInChunk++;
      lastNlPos = found;
      searchFrom = found + 1;
    }

    const line = linesBeforeChunk + lineInChunk;
    const col = posInChunk - (lastNlPos + 1);
    return { line, col };
  }

  /** Convert {line, col} to a UTF-16 code unit offset. Binary search on chunk newline prefixes. */
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

    // Skip targetLineInChunk newlines using indexOf: O(targetLineInChunk) native calls
    // instead of O(chars_before_target_line) JS iterations.
    let lineStart = 0;
    for (let n = 0; n < targetLineInChunk; n++) {
      const nlPos = chunk.text.indexOf("\n", lineStart);
      if (nlPos === -1) break;
      lineStart = nlPos + 1;
    }

    return chunkStart + lineStart + col;
  }

  /** Binary search: find chunk index containing the given UTF-16 code unit offset. */
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

    // Skip targetLineInChunk newlines using indexOf (same pattern as lineColToOffset).
    let searchFrom = 0;
    for (let n = 0; n < targetLineInChunk; n++) {
      const nlPos = chunk.text.indexOf("\n", searchFrom);
      if (nlPos === -1) return chunkStart + chunk.text.length;
      searchFrom = nlPos + 1;
    }
    return chunkStart + searchFrom;
  }
}
