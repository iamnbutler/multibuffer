/**
 * Types for the diff module.
 *
 * A diff operates on two text snapshots (old and new) and produces
 * a sequence of hunks describing how they differ.
 */

/** The kind of change a diff line represents. */
export type DiffKind = "equal" | "insert" | "delete";

/** A single line in a diff result with its origin. */
export interface DiffLine {
  readonly kind: DiffKind;
  /** The line text (without trailing newline). */
  readonly text: string;
  /** Line number in the old buffer (undefined for inserts). */
  readonly oldRow: number | undefined;
  /** Line number in the new buffer (undefined for deletes). */
  readonly newRow: number | undefined;
}

/**
 * A contiguous group of diff lines with shared context.
 * Analogous to a unified diff hunk (`@@ -a,b +c,d @@`).
 */
export interface DiffHunk {
  /** Starting line in the old buffer. */
  readonly oldStart: number;
  /** Number of lines from the old buffer in this hunk. */
  readonly oldCount: number;
  /** Starting line in the new buffer. */
  readonly newStart: number;
  /** Number of lines from the new buffer in this hunk. */
  readonly newCount: number;
  /** The lines in this hunk (context + changes). */
  readonly lines: readonly DiffLine[];
}

/**
 * Complete diff result between two texts.
 */
export interface DiffResult {
  /** The hunks describing all changes. */
  readonly hunks: readonly DiffHunk[];
  /** True if the two texts are identical. */
  readonly isEqual: boolean;
}

/**
 * Metadata for a hunk separator line displayed between non-adjacent hunks.
 * Contains the information needed to render the `@@ -X,Y +A,B @@ context` line.
 */
export interface HunkHeader {
  /** Starting line in the old buffer (1-based for display). */
  readonly oldStart: number;
  /** Number of lines from the old buffer in this hunk. */
  readonly oldCount: number;
  /** Starting line in the new buffer (1-based for display). */
  readonly newStart: number;
  /** Number of lines from the new buffer in this hunk. */
  readonly newCount: number;
  /** Optional function/class context extracted from the hunk header. */
  readonly context?: string;
}

/**
 * Format a HunkHeader into the standard unified diff header string.
 * Example: "@@ -10,5 +12,7 @@ function handleClick()"
 */
export function formatHunkHeader(header: HunkHeader): string {
  const oldPart = header.oldCount === 1
    ? `${header.oldStart}`
    : `${header.oldStart},${header.oldCount}`;
  const newPart = header.newCount === 1
    ? `${header.newStart}`
    : `${header.newStart},${header.newCount}`;
  const contextPart = header.context ? ` ${header.context}` : "";
  return `@@ -${oldPart} +${newPart} @@${contextPart}`;
}
