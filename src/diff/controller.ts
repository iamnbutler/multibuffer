/**
 * DiffController - manages a diff view between two buffers.
 *
 * Provides:
 * - Re-diff on edit via reDiff() or debounced notifyChange()
 * - Decoration updates for visual styling
 * - Subscriber notifications when diff changes
 */

import { createBuffer } from "../buffer/buffer.ts";
import type { Buffer, BufferId, BufferRange, BufferRow } from "../buffer/types.ts";
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
import type { UnifiedDiffMultiBufferOptions } from "./multibuffer.ts";
import { createUnifiedDiffMultiBuffer, HUNK_HEADER_STYLE } from "./multibuffer.ts";

export interface DiffControllerOptions
  extends DiffOptions,
    UnifiedDiffMultiBufferOptions {
  /** Debounce delay in milliseconds. Default: 150. */
  debounceMs?: number;
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
  const editableEqual = options?.editableEqual ?? true;
  const showHunkSeparators = options?.showHunkSeparators ?? true;

  // Initial diff
  const result = createUnifiedDiffMultiBuffer(oldBuffer, newBuffer, options);
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

        let i = 0;
        while (i < hunk.lines.length) {
          const firstLine = hunk.lines[i];
          if (firstLine === undefined) break;
          const kind = firstLine.kind;

          // Count consecutive lines of the same kind
          let lineCount = 0;
          while (i < hunk.lines.length && hunk.lines[i]?.kind === kind) {
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
                options: { editable: true },
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

// Styles duplicated from multibuffer.ts - could be extracted to shared module
const DELETE_STYLE = {
  backgroundColor: "rgba(255, 80, 80, 0.10)",
  gutterBackground: "rgba(255, 80, 80, 0.18)",
  gutterSign: "−",
  gutterSignColor: "#f87171",
};

const INSERT_STYLE = {
  backgroundColor: "rgba(80, 200, 80, 0.10)",
  gutterBackground: "rgba(80, 200, 80, 0.18)",
  gutterSign: "+",
  gutterSignColor: "#4ade80",
};

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
