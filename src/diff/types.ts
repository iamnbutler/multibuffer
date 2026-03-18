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
// Multi-file diff types
// ============================================================================

/**
 * Aggregate statistics for a multi-file diff.
 */
export interface MultiFileDiffStats {
  /** Total lines added across all files. */
  readonly totalAdditions: number;
  /** Total lines deleted across all files. */
  readonly totalDeletions: number;
  /** Number of files in the diff. */
  readonly fileCount: number;
}

/**
 * Per-file statistics.
 */
export interface FileDiffStats {
  /** Lines added in this file. */
  readonly additions: number;
  /** Lines deleted in this file. */
  readonly deletions: number;
}

/**
 * Description of a single file to diff.
 */
export interface FileDiffEntry {
  /** The filename (path) to display. */
  readonly filename: string;
  /** The old/before content. Empty string for new files. */
  readonly oldContent: string;
  /** The new/after content. Empty string for deleted files. */
  readonly newContent: string;
  /** Previous filename if this is a rename. */
  readonly previousFilename?: string;
}

/**
 * State of a single file within the multi-file diff.
 */
export interface FileDiffState {
  /** The filename (path). */
  readonly filename: string;
  /** Previous filename if this is a rename. */
  readonly previousFilename?: string;
  /** Per-file diff statistics. */
  readonly stats: FileDiffStats;
  /** Whether this file's diff is collapsed. */
  readonly collapsed: boolean;
  /** Whether this file's diff has been initialized (lazy rendering). */
  readonly initialized: boolean;
  /** Whether old and new content are identical. */
  readonly isEqual: boolean;
}

/**
 * Options for creating a multi-file diff view.
 */
export interface MultiFileDiffOptions {
  /** The files to diff. */
  readonly files: readonly FileDiffEntry[];
  /** Container element for rendering. */
  readonly container: HTMLElement;
  /** Whether to lazily render files (default: true). */
  readonly lazyRender?: boolean;
  /** Number of context lines around changes (default: 3). */
  readonly context?: number;
  /** Callback when a file's collapsed state changes. */
  readonly onFileToggle?: (filename: string, collapsed: boolean) => void;
  /** Callback when aggregate stats change. */
  readonly onStatsChange?: (stats: MultiFileDiffStats) => void;
}

/**
 * Multi-file diff controller interface.
 */
export interface MultiFileDiff {
  /** Aggregate statistics for all files. */
  readonly stats: MultiFileDiffStats;
  /** State of each file in the diff. */
  readonly files: readonly FileDiffState[];

  /** Scroll to a specific file by filename. */
  scrollToFile(filename: string): void;
  /** Collapse a specific file's diff. */
  collapseFile(filename: string): void;
  /** Expand a specific file's diff. */
  expandFile(filename: string): void;
  /** Collapse all files. */
  collapseAll(): void;
  /** Expand all files. */
  expandAll(): void;
  /** Toggle a file's collapsed state. */
  toggleFile(filename: string): void;
  /** Clean up resources. */
  dispose(): void;
}
