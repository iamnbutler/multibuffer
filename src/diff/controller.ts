/**
 * DiffController - manages a diff view between two buffers.
 *
 * Provides:
 * - Re-diff on edit via reDiff() or debounced notifyChange()
 * - Decoration updates for visual styling
 * - Subscriber notifications when diff changes
 */

import type { Buffer, BufferRange, BufferRow } from "../buffer/types.ts";
import type {
  ExcerptRange,
  MultiBuffer,
  MultiBufferRange,
  MultiBufferRow,
} from "../multibuffer/types.ts";
import type { Decoration, DecorationStyle } from "../renderer/types.ts";
import type { DiffOptions } from "./diff.ts";
import { diff } from "./diff.ts";
import type { UnifiedDiffMultiBufferOptions } from "./multibuffer.ts";
import { createUnifiedDiffMultiBuffer } from "./multibuffer.ts";

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

export function createDiffController(
  oldBuffer: Buffer,
  newBuffer: Buffer,
  options?: DiffControllerOptions,
): DiffController {
  const debounceMs = options?.debounceMs ?? 150;
  const editableEqual = options?.editableEqual ?? true;

  // Initial diff
  const result = createUnifiedDiffMultiBuffer(oldBuffer, newBuffer, options);
  const _multiBuffer = result.multiBuffer;
  let _decorations = result.decorations;
  let _isEqual = result.isEqual;

  let _debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const _subscribers: Set<(decorations: readonly Decoration[]) => void> =
    new Set();

  function reDiff(): boolean {
    // Get current text from both buffers
    const oldSnap = oldBuffer.snapshot();
    const newSnap = newBuffer.snapshot();

    // Run diff
    const diffResult = diff(oldSnap.text(), newSnap.text(), options);

    // Clear all excerpts
    _multiBuffer.clearExcerpts();

    if (diffResult.isEqual) {
      // Only add excerpt if buffer has actual content
      if (newSnap.text().length > 0) {
        _multiBuffer.addExcerpt(
          newBuffer,
          makeExcerptRange(0, newSnap.lineCount),
          { editable: editableEqual },
        );
      }
      _decorations = [];
      _isEqual = true;
    } else {
      // Rebuild excerpts from diff hunks
      const newDecorations: Decoration[] = [];
      let mbRow = 0;

      for (const hunk of diffResult.hunks) {
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
              _multiBuffer.addExcerpt(
                oldBuffer,
                makeExcerptRange(firstRow, firstRow + lineCount),
                { editable: false },
              );
              newDecorations.push(makeDecoration(mbRow, lineCount, DELETE_STYLE));
            }
          } else if (kind === "insert") {
            const firstRow = firstLine.newRow;
            if (firstRow !== undefined) {
              _multiBuffer.addExcerpt(
                newBuffer,
                makeExcerptRange(firstRow, firstRow + lineCount),
                { editable: true },
              );
              newDecorations.push(makeDecoration(mbRow, lineCount, INSERT_STYLE));
            }
          } else {
            // equal (context lines)
            const firstRow = firstLine.newRow;
            if (firstRow !== undefined) {
              _multiBuffer.addExcerpt(
                newBuffer,
                makeExcerptRange(firstRow, firstRow + lineCount),
                { editable: editableEqual },
              );
              // no decoration for equal/context lines
            }
          }

          mbRow += lineCount;
        }
      }

      _decorations = newDecorations;
      _isEqual = false;
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
