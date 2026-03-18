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
import type { Buffer, BufferId } from "../buffer/types.ts";
import { createMultiBuffer } from "../multibuffer/multibuffer.ts";
import type { MultiBuffer } from "../multibuffer/types.ts";
import type { Decoration, DecorationStyle } from "../renderer/types.ts";
import type { DiffOptions, IntralineDiffOptions } from "./diff.ts";
import { computeIntralineDiff, diff, pairDeleteInsertLines } from "./diff.ts";
import {
  DELETE_STYLE,
  INSERT_STYLE,
  INTRALINE_DELETE_STYLE,
  INTRALINE_INSERT_STYLE,
  makeColumnDecoration,
  makeDecoration,
  makeExcerptRange,
} from "./diff-styles.ts";
import { formatHunkHeader, hunkToHeader } from "./helpers.ts";

export interface UnifiedDiffMultiBufferOptions {
  /** Make equal (context) lines editable. Default: true. */
  editableEqual?: boolean;
  /** Make insert lines editable. Default: true. */
  editableInsert?: boolean;
  /** Enable intraline (character-level) diff highlighting. Default: true. */
  intraline?: boolean;
  /** Options for intraline diff computation. */
  intralineOptions?: IntralineDiffOptions;
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
  const editableInsert = options?.editableInsert ?? true;
  const enableIntraline = options?.intraline ?? true;
  const intralineOptions = options?.intralineOptions;
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

    // Track hunk line indices to their multibuffer row mapping for intraline
    const hunkLineToMbRow: number[] = [];

    let i = 0;
    while (i < hunk.lines.length) {
      const firstLine = hunk.lines[i];
      if (firstLine === undefined) break;
      const kind = firstLine.kind;

      // Count consecutive lines of the same kind.
      const groupStart = i;
      let lineCount = 0;
      while (i < hunk.lines.length && hunk.lines[i]?.kind === kind) {
        hunkLineToMbRow[i] = mbRow + (i - groupStart);
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
          { editable: editableInsert },
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

    // Generate intraline decorations for paired delete/insert lines
    if (enableIntraline) {
      const pairs = pairDeleteInsertLines(hunk.lines);
      for (const pair of pairs) {
        const intraline = computeIntralineDiff(
          pair.deleteLine.text,
          pair.insertLine.text,
          intralineOptions,
        );

        const deleteMbRow = hunkLineToMbRow[pair.deleteIdx];
        const insertMbRow = hunkLineToMbRow[pair.insertIdx];

        // Add intraline delete decorations
        if (deleteMbRow !== undefined) {
          for (const range of intraline.deleteRanges) {
            decorations.push(
              makeColumnDecoration(deleteMbRow, range.startColumn, range.endColumn, INTRALINE_DELETE_STYLE),
            );
          }
        }

        // Add intraline insert decorations
        if (insertMbRow !== undefined) {
          for (const range of intraline.insertRanges) {
            decorations.push(
              makeColumnDecoration(insertMbRow, range.startColumn, range.endColumn, INTRALINE_INSERT_STYLE),
            );
          }
        }
      }
    }
  }

  return { multiBuffer: mb, decorations, isEqual: false, separatorBuffer };
}
