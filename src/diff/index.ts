export type { DiffController, DiffControllerOptions } from "./controller.ts";
export { createDiffController } from "./controller.ts";
export type { DiffOptions } from "./diff.ts";
export { diff, diffLines } from "./diff.ts";
export { formatHunkHeader, hunkToHeader } from "./helpers.ts";
export type {
  UnifiedDiffMultiBufferOptions,
  UnifiedDiffMultiBufferResult,
} from "./multibuffer.ts";
export { createUnifiedDiffMultiBuffer, HUNK_HEADER_STYLE } from "./multibuffer.ts";
export type { DiffHunk, DiffKind, DiffLine, DiffResult, HunkHeader } from "./types.ts";
export type { DiffStats, UnifiedDiff, UnifiedDiffLine } from "./unified.ts";
export { createUnifiedDiff } from "./unified.ts";
