/**
 * Line-level diff using Myers' algorithm.
 *
 * Produces a minimal edit sequence between two texts, then groups
 * changes into hunks with configurable context lines.
 */

import type { DiffHunk, DiffLine, DiffResult } from "./types.ts";

export interface DiffOptions {
  /** Number of unchanged context lines around each change (default: 3). */
  context?: number;
}

/**
 * Compute a line-level diff between two texts.
 *
 * Uses Myers' O(ND) algorithm to find the shortest edit script,
 * then groups edits into hunks with surrounding context.
 */
export function diff(
  oldText: string,
  newText: string,
  options?: DiffOptions,
): DiffResult {
  const ctx = options?.context ?? 3;
  const oldLines = oldText === "" ? [] : oldText.split("\n");
  const newLines = newText === "" ? [] : newText.split("\n");

  const edits = myersDiff(oldLines, newLines);

  if (edits.every((e) => e.kind === "equal")) {
    return { hunks: [], isEqual: true };
  }

  const hunks = buildHunks(edits, ctx);
  return { hunks, isEqual: false };
}

/** A raw edit operation from Myers'. */
interface Edit {
  kind: "equal" | "insert" | "delete";
  oldRow: number | undefined;
  newRow: number | undefined;
  text: string;
}

/**
 * Myers' diff algorithm.
 * Returns a flat list of edit operations (equal/insert/delete).
 */
function myersDiff(oldLines: string[], newLines: string[]): Edit[] {
  const n = oldLines.length;
  const m = newLines.length;
  const max = n + m;

  if (max === 0) return [];

  // V[k] = furthest reaching x on diagonal k
  // We use offset to handle negative indices: v[k + offset]
  const offset = max;
  const size = 2 * max + 1;
  const v = new Int32Array(size);
  v.fill(-1);
  v[1 + offset] = 0;

  // Store the trace for backtracking
  const trace: Int32Array[] = [];

  // Forward pass: find shortest edit path
  let found = false;
  for (let d = 0; d <= max; d++) {
    trace.push(v.slice());

    for (let k = -d; k <= d; k += 2) {
      let x: number;
      if (k === -d || (k !== d && (v[k - 1 + offset] ?? -1) < (v[k + 1 + offset] ?? -1))) {
        x = v[k + 1 + offset] ?? 0; // move down (insert)
      } else {
        x = (v[k - 1 + offset] ?? 0) + 1; // move right (delete)
      }

      let y = x - k;

      // Follow diagonal (equal lines)
      while (x < n && y < m && oldLines[x] === newLines[y]) {
        x++;
        y++;
      }

      v[k + offset] = x;

      if (x >= n && y >= m) {
        found = true;
        break;
      }
    }

    if (found) break;
  }

  // Backtrack to recover the edit sequence
  return backtrack(trace, offset, oldLines, newLines);
}

function backtrack(
  trace: Int32Array[],
  offset: number,
  oldLines: string[],
  newLines: string[],
): Edit[] {
  const n = oldLines.length;
  const m = newLines.length;
  let x = n;
  let y = m;
  const edits: Edit[] = [];

  for (let d = trace.length - 1; d >= 0; d--) {
    const v = trace[d];
    if (!v) continue;
    const k = x - y;

    let prevK: number;
    if (k === -d || (k !== d && (v[k - 1 + offset] ?? -1) < (v[k + 1 + offset] ?? -1))) {
      prevK = k + 1;
    } else {
      prevK = k - 1;
    }

    const prevX = v[prevK + offset] ?? 0;
    const prevY = prevX - prevK;

    // Diagonal moves (equal lines) — walk backwards
    while (x > prevX && y > prevY) {
      x--;
      y--;
      edits.push({ kind: "equal", oldRow: x, newRow: y, text: oldLines[x] ?? "" });
    }

    if (d > 0) {
      if (x === prevX) {
        // Insert
        y--;
        edits.push({
          kind: "insert",
          oldRow: undefined,
          newRow: y,
          text: newLines[y] ?? "",
        });
      } else {
        // Delete
        x--;
        edits.push({
          kind: "delete",
          oldRow: x,
          newRow: undefined,
          text: oldLines[x] ?? "",
        });
      }
    }
  }

  edits.reverse();
  return edits;
}

/**
 * Group a flat edit list into hunks with context lines.
 * Adjacent changes within `2 * context` lines of each other merge into one hunk.
 */
function buildHunks(edits: Edit[], context: number): DiffHunk[] {
  // Find indices of change operations
  const changeIndices: number[] = [];
  for (let i = 0; i < edits.length; i++) {
    const edit = edits[i];
    if (edit && edit.kind !== "equal") {
      changeIndices.push(i);
    }
  }

  if (changeIndices.length === 0) return [];

  // Group changes that are close together
  const groups: { start: number; end: number }[] = [];
  let groupStart = changeIndices[0] ?? 0;
  let groupEnd = groupStart;

  for (let i = 1; i < changeIndices.length; i++) {
    const idx = changeIndices[i] ?? 0;
    // If the gap between changes is <= 2*context, merge into same group
    if (idx - groupEnd <= 2 * context) {
      groupEnd = idx;
    } else {
      groups.push({ start: groupStart, end: groupEnd });
      groupStart = idx;
      groupEnd = idx;
    }
  }
  groups.push({ start: groupStart, end: groupEnd });

  // Build hunks from groups with context
  const hunks: DiffHunk[] = [];
  for (const group of groups) {
    const hunkStart = Math.max(0, group.start - context);
    const hunkEnd = Math.min(edits.length - 1, group.end + context);

    const lines: DiffLine[] = [];
    let oldStart = Number.MAX_SAFE_INTEGER;
    let newStart = Number.MAX_SAFE_INTEGER;
    let oldCount = 0;
    let newCount = 0;

    for (let i = hunkStart; i <= hunkEnd; i++) {
      const edit = edits[i];
      if (!edit) continue;

      lines.push({
        kind: edit.kind,
        text: edit.text,
        oldRow: edit.oldRow,
        newRow: edit.newRow,
      });

      if (edit.kind !== "insert" && edit.oldRow !== undefined) {
        oldStart = Math.min(oldStart, edit.oldRow);
        oldCount++;
      }
      if (edit.kind !== "delete" && edit.newRow !== undefined) {
        newStart = Math.min(newStart, edit.newRow);
        newCount++;
      }
    }

    hunks.push({
      oldStart: oldStart === Number.MAX_SAFE_INTEGER ? 0 : oldStart,
      oldCount,
      newStart: newStart === Number.MAX_SAFE_INTEGER ? 0 : newStart,
      newCount,
      lines,
    });
  }

  return hunks;
}
