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

// ============================================================================
// Patch parsing types (for parsing unified diff patch strings)
// ============================================================================

/**
 * A single line in a parsed patch hunk.
 */
export interface PatchLine {
  /** The kind of change: context, addition, or deletion. */
  readonly kind: "context" | "add" | "delete";
  /** The line content (without the leading +/-/space prefix). */
  readonly content: string;
  /** Line number in the old file (undefined for additions). */
  readonly oldLineNumber: number | undefined;
  /** Line number in the new file (undefined for deletions). */
  readonly newLineNumber: number | undefined;
}

/**
 * A parsed hunk from a unified diff.
 * Corresponds to an `@@ -a,b +c,d @@` block.
 */
export interface PatchHunk {
  /** Starting line in the old file (1-indexed). */
  readonly oldStart: number;
  /** Number of lines from the old file in this hunk. */
  readonly oldCount: number;
  /** Starting line in the new file (1-indexed). */
  readonly newStart: number;
  /** Number of lines from the new file in this hunk. */
  readonly newCount: number;
  /** Optional header context (e.g., function name after @@). */
  readonly header: string | undefined;
  /** The lines in this hunk. */
  readonly lines: readonly PatchLine[];
}

/**
 * File status in a patch.
 */
export type PatchFileStatus =
  | "modified"
  | "added"
  | "deleted"
  | "renamed"
  | "copied"
  | "binary";

/**
 * A single file's diff within a patch.
 */
export interface PatchFile {
  /** The old filename (may be /dev/null for new files). */
  readonly oldPath: string;
  /** The new filename (may be /dev/null for deleted files). */
  readonly newPath: string;
  /** The status of this file in the diff. */
  readonly status: PatchFileStatus;
  /** For renames/copies, the similarity percentage (0-100). */
  readonly similarity: number | undefined;
  /** Whether this is a binary file (no line-level diff available). */
  readonly isBinary: boolean;
  /** The hunks for this file (empty for binary files). */
  readonly hunks: readonly PatchHunk[];
}

/**
 * A complete parsed patch (may contain multiple files).
 */
export interface ParsedPatch {
  /** The files modified in this patch. */
  readonly files: readonly PatchFile[];
}

/**
 * Result of creating a MultiBuffer from a patch file.
 */
export interface PatchMultiBufferResult {
  /** The filename (resolved from old/new paths). */
  readonly filename: string;
  /** The old filename if different (for renames). */
  readonly oldFilename: string | undefined;
  /** The MultiBuffer containing the diff view. */
  readonly multiBuffer: import("../multibuffer/types.ts").MultiBuffer;
  /** Decorations for styling additions/deletions. */
  readonly decorations: readonly import("../renderer/types.ts").Decoration[];
  /** File status (modified, added, deleted, renamed, binary). */
  readonly status: PatchFileStatus;
  /** Whether this is a binary file (no content available). */
  readonly isBinary: boolean;
}
