/**
 * Unified diff view.
 *
 * Takes two texts and produces a flat list of lines suitable for rendering
 * in a single scrollable view. Deleted lines, inserted lines, and unchanged
 * context are interleaved — like `git diff` output.
 *
 * Each line tracks which source buffer it came from and its row in that buffer,
 * so the renderer can map clicks/selections back to the original files.
 */

import type { BufferId } from "../buffer/types.ts";
import type { DiffOptions } from "./diff.ts";
import { diff } from "./diff.ts";
import type { DiffKind } from "./types.ts";

/** A single line in the unified diff view. */
export interface UnifiedDiffLine {
  /** Whether this line is equal, inserted, or deleted. */
  readonly kind: DiffKind;
  /** The line text. */
  readonly text: string;
  /** Which buffer this line comes from. */
  readonly bufferId: BufferId;
  /** Row in the source buffer. */
  readonly sourceRow: number;
}

/** Summary statistics for a diff. */
export interface DiffStats {
  readonly inserts: number;
  readonly deletes: number;
  readonly equal: number;
}

/** The result of building a unified diff view. */
export interface UnifiedDiff {
  /** All lines in display order. */
  readonly lines: readonly UnifiedDiffLine[];
  /** Total number of lines in the unified view. */
  readonly lineCount: number;
  /** Change statistics. */
  readonly stats: DiffStats;
  /** True if old and new are identical. */
  readonly isEqual: boolean;
}

/**
 * Create a unified diff view from two texts.
 *
 * For equal files, returns all lines as "equal" referencing the new buffer.
 * For changed files, interleaves delete/insert/equal lines with context.
 */
export function createUnifiedDiff(
  oldBufferId: BufferId,
  oldText: string,
  newBufferId: BufferId,
  newText: string,
  options?: DiffOptions,
): UnifiedDiff {
  const result = diff(oldText, newText, options);

  if (result.isEqual) {
    // Identical — show all lines as equal, referencing new buffer
    const newLines = newText === "" ? [] : newText.split("\n");
    const lines: UnifiedDiffLine[] = newLines.map((text, i) => ({
      kind: "equal" as const,
      text,
      bufferId: newBufferId,
      sourceRow: i,
    }));
    return {
      lines,
      lineCount: lines.length,
      stats: { inserts: 0, deletes: 0, equal: lines.length },
      isEqual: true,
    };
  }

  // Build unified view from hunks
  const lines: UnifiedDiffLine[] = [];
  let inserts = 0;
  let deletes = 0;
  let equal = 0;

  for (const hunk of result.hunks) {
    for (const line of hunk.lines) {
      switch (line.kind) {
        case "delete":
          lines.push({
            kind: "delete",
            text: line.text,
            bufferId: oldBufferId,
            // biome-ignore lint/plugin/no-type-assertion: expect: oldRow is always defined for deletes
            sourceRow: line.oldRow as number,
          });
          deletes++;
          break;
        case "insert":
          lines.push({
            kind: "insert",
            text: line.text,
            bufferId: newBufferId,
            // biome-ignore lint/plugin/no-type-assertion: expect: newRow is always defined for inserts
            sourceRow: line.newRow as number,
          });
          inserts++;
          break;
        case "equal":
          lines.push({
            kind: "equal",
            text: line.text,
            bufferId: newBufferId,
            // biome-ignore lint/plugin/no-type-assertion: expect: newRow is always defined for equal lines
            sourceRow: line.newRow as number,
          });
          equal++;
          break;
      }
    }
  }

  return {
    lines,
    lineCount: lines.length,
    stats: { inserts, deletes, equal },
    isEqual: false,
  };
}
