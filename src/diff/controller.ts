/**
 * DiffController - manages a diff view between two buffers.
 *
 * Provides:
 * - Re-diff on edit via reDiff() or debounced notifyChange()
 * - Decoration updates for visual styling
 * - Subscriber notifications when diff changes
 */

import { createBuffer } from "../buffer/buffer.ts";
import type { Buffer, BufferId } from "../buffer/types.ts";
import type {
  MultiBuffer,
} from "../multibuffer/types.ts";
import type { Decoration } from "../renderer/types.ts";
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
import type { UnifiedDiffMultiBufferOptions } from "./multibuffer.ts";
import { createUnifiedDiffMultiBuffer, HUNK_HEADER_STYLE } from "./multibuffer.ts";

export interface DiffControllerOptions
  extends DiffOptions,
    UnifiedDiffMultiBufferOptions {
  /** Debounce delay in milliseconds. Default: 150. */
  debounceMs?: number;
  /** Enable intraline (character-level) diff highlighting. Default: true. */
  intraline?: boolean;
  /** Options for intraline diff computation. */
  intralineOptions?: IntralineDiffOptions;
  /**
   * When true, all excerpts are non-editable (both insert and equal lines).
   * Use this for read-only diff viewers. Default: false.
   */
  readOnly?: boolean;
}

export interface DiffController {
  readonly multiBuffer: MultiBuffer;
  readonly decorations: readonly Decoration[];
  readonly isEqual: boolean;
  readonly oldBuffer: Buffer;
  readonly newBuffer: Buffer;

  /** Manually trigger re-diff. Returns new isEqual state. */
  reDiff(): boolean;
  /** Schedule debounced re-diff. */
  notifyChange(): void;
  /** Subscribe to decoration updates. Returns unsubscribe function. */
  onUpdate(callback: (decorations: readonly Decoration[]) => void): () => void;
  /** Clean up timers and subscriptions. */
  dispose(): void;
}

/** Unique buffer ID counter for separator buffers in controllers. */
let controllerSeparatorBufferCounter = 0;
function createControllerSeparatorBufferId(): BufferId {
  // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction for BufferId
  return `__controller_hunk_separator_${++controllerSeparatorBufferCounter}__` as BufferId;
}

export function createDiffController(
  oldBuffer: Buffer,
  newBuffer: Buffer,
  options?: DiffControllerOptions,
): DiffController {
  const debounceMs = options?.debounceMs ?? 150;
  const readOnly = options?.readOnly ?? false;
  const enableIntraline = options?.intraline ?? true;
  const intralineOptions = options?.intralineOptions;
  // In readOnly mode, force all excerpts to be non-editable
  const editableEqual = readOnly ? false : (options?.editableEqual ?? true);
  const editableInsert = readOnly ? false : (options?.editableInsert ?? true);
  const showHunkSeparators = options?.showHunkSeparators ?? true;

  // Compute editableEqual/editableInsert from readOnly and pass them explicitly,
  // overriding any values in options.
  const result = createUnifiedDiffMultiBuffer(oldBuffer, newBuffer, {
    ...options,
    editableEqual,
    editableInsert,
  });
  const _multiBuffer = result.multiBuffer;
  let _decorations = result.decorations;
  let _isEqual = result.isEqual;
  // Keep a reference to separator buffer to prevent GC
  let _separatorBuffer: Buffer | undefined = result.separatorBuffer;

  let _debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const _subscribers: Set<(decorations: readonly Decoration[]) => void> =
    new Set();

  function reDiff(): boolean {
    // Get current text from both buffers
    const oldSnap = oldBuffer.snapshot();
    const newSnap = newBuffer.snapshot();

    // Run diff
    const diffResult = diff(oldSnap.text(), newSnap.text(), options);

    if (diffResult.isEqual) {
      // Replace all excerpts atomically (single _rebuildCache call).
      // textSummary.chars is O(1) — avoids a redundant text() call.
      const entries =
        newSnap.textSummary.chars > 0
          ? [
              {
                buffer: newBuffer,
                range: makeExcerptRange(0, newSnap.lineCount),
                options: { editable: editableEqual },
              },
            ]
          : [];
      _multiBuffer.setExcerpts(entries);
      _decorations = [];
      _isEqual = true;
      _separatorBuffer = undefined;
    } else {
      // Build the full excerpt list and decoration list up front, then set
      // all excerpts in one call (single _rebuildCache instead of N+1).
      type ExcerptEntry = Parameters<typeof _multiBuffer.setExcerpts>[0][number];
      const entries: ExcerptEntry[] = [];
      const newDecorations: Decoration[] = [];
      let mbRow = 0;

      // Create separator buffer if needed (multiple hunks and separators enabled)
      const hunkCount = diffResult.hunks.length;
      let separatorBuffer: Buffer | undefined;
      if (showHunkSeparators && hunkCount > 1) {
        const separatorLines: string[] = [];
        for (let h = 1; h < hunkCount; h++) {
          const hunk = diffResult.hunks[h];
          if (hunk) {
            separatorLines.push(formatHunkHeader(hunkToHeader(hunk)));
          }
        }
        separatorBuffer = createBuffer(
          createControllerSeparatorBufferId(),
          separatorLines.join("\n"),
        );
      }

      let separatorLineIndex = 0;

      for (let hunkIndex = 0; hunkIndex < diffResult.hunks.length; hunkIndex++) {
        const hunk = diffResult.hunks[hunkIndex];
        if (!hunk) continue;

        // Insert hunk separator before all hunks except the first
        if (showHunkSeparators && hunkIndex > 0 && separatorBuffer) {
          entries.push({
            buffer: separatorBuffer,
            range: makeExcerptRange(separatorLineIndex, separatorLineIndex + 1),
            options: { editable: false },
          });
          newDecorations.push(makeDecoration(mbRow, 1, HUNK_HEADER_STYLE));
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

          // Count consecutive lines of the same kind
          const groupStart = i;
          let lineCount = 0;
          while (i < hunk.lines.length && hunk.lines[i]?.kind === kind) {
            hunkLineToMbRow[i] = mbRow + (i - groupStart);
            i++;
            lineCount++;
          }

          if (kind === "delete") {
            const firstRow = firstLine.oldRow;
            if (firstRow !== undefined) {
              entries.push({
                buffer: oldBuffer,
                range: makeExcerptRange(firstRow, firstRow + lineCount),
                options: { editable: false },
              });
              newDecorations.push(makeDecoration(mbRow, lineCount, DELETE_STYLE));
            }
          } else if (kind === "insert") {
            const firstRow = firstLine.newRow;
            if (firstRow !== undefined) {
              entries.push({
                buffer: newBuffer,
                range: makeExcerptRange(firstRow, firstRow + lineCount),
                options: { editable: editableInsert },
              });
              newDecorations.push(makeDecoration(mbRow, lineCount, INSERT_STYLE));
            }
          } else {
            // equal (context lines)
            const firstRow = firstLine.newRow;
            if (firstRow !== undefined) {
              entries.push({
                buffer: newBuffer,
                range: makeExcerptRange(firstRow, firstRow + lineCount),
                options: { editable: editableEqual },
              });
              // no decoration for equal/context lines
            }
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
                newDecorations.push(
                  makeColumnDecoration(deleteMbRow, range.startColumn, range.endColumn, INTRALINE_DELETE_STYLE),
                );
              }
            }

            // Add intraline insert decorations
            if (insertMbRow !== undefined) {
              for (const range of intraline.insertRanges) {
                newDecorations.push(
                  makeColumnDecoration(insertMbRow, range.startColumn, range.endColumn, INTRALINE_INSERT_STYLE),
                );
              }
            }
          }
        }
      }

      _multiBuffer.setExcerpts(entries);
      _decorations = newDecorations;
      _isEqual = false;
      _separatorBuffer = separatorBuffer;
    }

    // Notify subscribers
    for (const callback of _subscribers) {
      callback(_decorations);
    }

    return _isEqual;
  }

  function notifyChange(): void {
    if (_debounceTimer !== null) {
      clearTimeout(_debounceTimer);
    }
    _debounceTimer = setTimeout(() => {
      _debounceTimer = null;
      reDiff();
    }, debounceMs);
  }

  function onUpdate(
    callback: (decorations: readonly Decoration[]) => void,
  ): () => void {
    _subscribers.add(callback);
    return () => {
      _subscribers.delete(callback);
    };
  }

  function dispose(): void {
    if (_debounceTimer !== null) {
      clearTimeout(_debounceTimer);
      _debounceTimer = null;
    }
    _subscribers.clear();
  }

  return {
    get multiBuffer() {
      return _multiBuffer;
    },
    get decorations() {
      return _decorations;
    },
    get isEqual() {
      return _isEqual;
    },
    get oldBuffer() {
      return oldBuffer;
    },
    get newBuffer() {
      return newBuffer;
    },
    reDiff,
    notifyChange,
    onUpdate,
    dispose,
  };
}
