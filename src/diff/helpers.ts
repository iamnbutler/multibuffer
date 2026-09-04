/**
 * Shared helper functions for the diff module.
 *
 * Runtime utilities that operate on diff types live here,
 * keeping `types.ts` as a pure type-declaration module.
 */

import type { DiffHunk, HunkHeader } from "./types.ts";

/**
 * Create a HunkHeader from a DiffHunk.
 * Converts 0-based internal indices to 1-based display values.
 *
 * An empty range is the exception: the unified diff format anchors it to the
 * line *before* it rather than to a line of its own, so a zero count keeps the
 * 0-based start. That is what makes `git diff` print `@@ -0,0 +1,2 @@` for a
 * new file and `@@ -1,2 +0,0 @@` for a deleted one.
 */
export function hunkToHeader(hunk: DiffHunk): HunkHeader {
  return {
    // Convert to 1-based, except for an empty range (see above).
    oldStart: hunk.oldCount === 0 ? hunk.oldStart : hunk.oldStart + 1,
    oldCount: hunk.oldCount,
    newStart: hunk.newCount === 0 ? hunk.newStart : hunk.newStart + 1,
    newCount: hunk.newCount,
  };
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
