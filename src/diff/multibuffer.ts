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

import type { Buffer } from "../buffer/types.ts";
import { createMultiBuffer } from "../multibuffer/multibuffer.ts";
import type { MultiBuffer } from "../multibuffer/types.ts";
import type { Decoration } from "../renderer/types.ts";
import type { DiffOptions } from "./diff.ts";
import { diff } from "./diff.ts";
import {
  DELETE_STYLE,
  INSERT_STYLE,
  makeDecoration,
  makeExcerptRange,
} from "./diff-styles.ts";

export interface UnifiedDiffMultiBufferOptions {
  /** Make equal (context) lines editable. Default: true. */
  editableEqual?: boolean;
}

export interface UnifiedDiffMultiBufferResult {
  readonly multiBuffer: MultiBuffer;
  readonly decorations: readonly Decoration[];
  readonly isEqual: boolean;
}

/**
 * Build a MultiBuffer from a unified diff between two buffers.
 *
 * Only the changed hunks (plus context lines) are included — identical to how
 * `git diff` presents changes. Use `createUnifiedDiff` if you need a flat
 * line-by-line view of the full file instead.
 */
export function createUnifiedDiffMultiBuffer(
  oldBuffer: Buffer,
  newBuffer: Buffer,
  options?: DiffOptions & UnifiedDiffMultiBufferOptions,
): UnifiedDiffMultiBufferResult {
  const editableEqual = options?.editableEqual ?? true;
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

  for (const hunk of result.hunks) {
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

  return { multiBuffer: mb, decorations, isEqual: false };
}
