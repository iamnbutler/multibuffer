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
 */
export function hunkToHeader(hunk: DiffHunk): HunkHeader {
  return {
    oldStart: hunk.oldStart + 1, // Convert to 1-based
    oldCount: hunk.oldCount,
    newStart: hunk.newStart + 1, // Convert to 1-based
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
