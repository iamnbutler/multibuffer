/**
 * Build a MultiBuffer from a unified diff between two buffers.
 *
 * Groups consecutive same-kind diff lines into excerpts:
 * - delete groups: from `oldBuffer`, non-editable
 * - insert/equal groups: from `newBuffer`, editable (equal editability configurable)
 *
 * Returns the MultiBuffer together with a decorations array that can be passed
 * directly to DomRenderer (colors delete/insert rows with gutter signs).
 */

import { createBuffer } from "../buffer/buffer.ts";
import type { Buffer, BufferId, BufferRange, BufferRow } from "../buffer/types.ts";
import { createMultiBuffer } from "../multibuffer/multibuffer.ts";
import type {
  ExcerptRange,
  MultiBuffer,
  MultiBufferRange,
  MultiBufferRow,
} from "../multibuffer/types.ts";
import type { Decoration, DecorationStyle } from "../renderer/types.ts";
import type { DiffOptions } from "./diff.ts";
import { diff } from "./diff.ts";
import { formatHunkHeader, hunkToHeader } from "./helpers.ts";

export interface UnifiedDiffMultiBufferOptions {
  /** Make equal (context) lines editable. Default: true. */
  editableEqual?: boolean;
  /** Show hunk separator lines between non-adjacent hunks. Default: true. */
  showHunkSeparators?: boolean;
}

export interface UnifiedDiffMultiBufferResult {
  readonly multiBuffer: MultiBuffer;
  readonly decorations: readonly Decoration[];
  readonly isEqual: boolean;
  /**
   * Buffer holding hunk separator text lines.
   * Only present when there are multiple hunks and showHunkSeparators is true.
   * Keep a reference to prevent garbage collection while the MultiBuffer is in use.
   */
  readonly separatorBuffer?: Buffer;
}

const DELETE_STYLE: Partial<DecorationStyle> = {
  backgroundColor: "rgba(255, 80, 80, 0.10)",
  gutterBackground: "rgba(255, 80, 80, 0.18)",
  gutterSign: "−",
  gutterSignColor: "#f87171",
};

const INSERT_STYLE: Partial<DecorationStyle> = {
  backgroundColor: "rgba(80, 200, 80, 0.10)",
  gutterBackground: "rgba(80, 200, 80, 0.18)",
  gutterSign: "+",
  gutterSignColor: "#4ade80",
};

/**
 * Style for hunk separator lines.
 * Muted background, italic text, full-width gutter (no line numbers).
 */
export const HUNK_HEADER_STYLE: Partial<DecorationStyle> = {
  backgroundColor: "rgba(128, 128, 128, 0.08)",
  gutterBackground: "rgba(128, 128, 128, 0.12)",
  color: "#888888",
  fontStyle: "italic",
  isHunkSeparator: true,
};

/** Unique buffer ID for hunk separator buffers. */
let separatorBufferCounter = 0;
function createSeparatorBufferId(): BufferId {
  // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction for BufferId
  return `__hunk_separator_${++separatorBufferCounter}__` as BufferId;
}

/**
 * Build a MultiBuffer from a unified diff between two buffers.
 *
 * Only the changed hunks (plus context lines) are included — identical to how
 * `git diff` presents changes. Use `createUnifiedDiff` if you need a flat
 * line-by-line view of the full file instead.
 *
 * When there are multiple non-adjacent hunks and showHunkSeparators is true,
 * separator lines are inserted between hunks showing the hunk header
 * (e.g., "@@ -10,5 +12,7 @@").
 */
export function createUnifiedDiffMultiBuffer(
  oldBuffer: Buffer,
  newBuffer: Buffer,
  options?: DiffOptions & UnifiedDiffMultiBufferOptions,
): UnifiedDiffMultiBufferResult {
  const editableEqual = options?.editableEqual ?? true;
  const showHunkSeparators = options?.showHunkSeparators ?? true;
  const oldSnap = oldBuffer.snapshot();
  const newSnap = newBuffer.snapshot();
  const result = diff(oldSnap.text(), newSnap.text(), options);
  const mb = createMultiBuffer();

  if (result.isEqual) {
    // Only add excerpt if buffer has actual content (empty buffer has lineCount=1 but no text).
    // textSummary.chars is O(1) — avoids a redundant text() call.
    if (newSnap.textSummary.chars > 0) {
      mb.addExcerpt(newBuffer, makeExcerptRange(0, newSnap.lineCount), {
        editable: editableEqual,
      });
    }
    return { multiBuffer: mb, decorations: [], isEqual: true };
  }

  const decorations: Decoration[] = [];
  // Track current multibuffer row offset as we add excerpts.
  let mbRow = 0;

  // Create separator buffer if needed (multiple hunks and separators enabled)
  let separatorBuffer: Buffer | undefined;
  const hunkCount = result.hunks.length;
  if (showHunkSeparators && hunkCount > 1) {
    // Build separator text: one line per hunk after the first
    const separatorLines: string[] = [];
    for (let h = 1; h < hunkCount; h++) {
      const hunk = result.hunks[h];
      if (hunk) {
        separatorLines.push(formatHunkHeader(hunkToHeader(hunk)));
      }
    }
    separatorBuffer = createBuffer(
      createSeparatorBufferId(),
      separatorLines.join("\n"),
    );
  }

  let separatorLineIndex = 0; // Index into separator buffer lines

  for (let hunkIndex = 0; hunkIndex < result.hunks.length; hunkIndex++) {
    const hunk = result.hunks[hunkIndex];
    if (!hunk) continue;

    // Insert hunk separator before all hunks except the first
    if (showHunkSeparators && hunkIndex > 0 && separatorBuffer) {
      mb.addExcerpt(
        separatorBuffer,
        makeExcerptRange(separatorLineIndex, separatorLineIndex + 1),
        { editable: false },
      );
      decorations.push(makeDecoration(mbRow, 1, HUNK_HEADER_STYLE));
      mbRow += 1;
      separatorLineIndex += 1;
    }

    let i = 0;
    while (i < hunk.lines.length) {
      const firstLine = hunk.lines[i];
      if (firstLine === undefined) break;
      const kind = firstLine.kind;

      // Count consecutive lines of the same kind.
      let lineCount = 0;
      while (i < hunk.lines.length && hunk.lines[i]?.kind === kind) {
        i++;
        lineCount++;
      }

      if (kind === "delete") {
        // biome-ignore lint/plugin/no-type-assertion: expect: oldRow is always defined for delete lines
        const firstRow = firstLine.oldRow as number;
        mb.addExcerpt(
          oldBuffer,
          makeExcerptRange(firstRow, firstRow + lineCount),
          { editable: false },
        );
        decorations.push(makeDecoration(mbRow, lineCount, DELETE_STYLE));
      } else if (kind === "insert") {
        // biome-ignore lint/plugin/no-type-assertion: expect: newRow is always defined for insert lines
        const firstRow = firstLine.newRow as number;
        mb.addExcerpt(
          newBuffer,
          makeExcerptRange(firstRow, firstRow + lineCount),
          { editable: true },
        );
        decorations.push(makeDecoration(mbRow, lineCount, INSERT_STYLE));
      } else {
        // equal (context lines)
        // biome-ignore lint/plugin/no-type-assertion: expect: newRow is always defined for equal lines
        const firstRow = firstLine.newRow as number;
        mb.addExcerpt(
          newBuffer,
          makeExcerptRange(firstRow, firstRow + lineCount),
          { editable: editableEqual },
        );
        // no decoration for equal/context lines
      }

      mbRow += lineCount;
    }
  }

  return { multiBuffer: mb, decorations, isEqual: false, separatorBuffer };
}

/** Build an ExcerptRange covering [startRow, endRow) in buffer coordinates. */
function makeExcerptRange(startRow: number, endRow: number): ExcerptRange {
  const bufRange: BufferRange = {
    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction for buffer row
    start: { row: startRow as BufferRow, column: 0 },
    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction for buffer row
    end: { row: endRow as BufferRow, column: 0 },
  };
  return { context: bufRange, primary: bufRange };
}

/** Build a line-range decoration covering [startMbRow, startMbRow + lineCount - 1]. */
function makeDecoration(
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
