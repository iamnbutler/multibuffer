export type { DiffController, DiffControllerOptions } from "./controller.ts";
export { createDiffController } from "./controller.ts";
export type { DiffOptions, IntralineDiffOptions } from "./diff.ts";
export { computeIntralineDiff, diff, diffLines, pairDeleteInsertLines } from "./diff.ts";
export { formatHunkHeader, hunkToHeader } from "./helpers.ts";
export type {
  UnifiedDiffMultiBufferOptions,
  UnifiedDiffMultiBufferResult,
} from "./multibuffer.ts";
export { createUnifiedDiffMultiBuffer, HUNK_HEADER_STYLE } from "./multibuffer.ts";
export type { DiffHunk, DiffKind, DiffLine, DiffResult, HunkHeader, IntralineDiff, IntralineRange } from "./types.ts";
export type { DiffStats, UnifiedDiff, UnifiedDiffLine } from "./unified.ts";
export { createUnifiedDiff } from "./unified.ts";
