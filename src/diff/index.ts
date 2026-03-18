export type { DiffController, DiffControllerOptions } from "./controller.ts";
export { createDiffController } from "./controller.ts";
export type { DiffEditorView, DiffEditorViewOptions } from "./diff-editor-view.ts";
export {
  createDiffEditorView,
  createDiffEditorViewFromBuffers,
  mergeDiffDecorations,
  resolveDiffReadOnlyOptions,
  resetDiffEditorViewCounter,
} from "./diff-editor-view.ts";
export type { DiffOptions, IntralineDiffOptions } from "./diff.ts";
export { computeIntralineDiff, diff, diffLines, pairDeleteInsertLines } from "./diff.ts";
export { formatHunkHeader, hunkToHeader } from "./helpers.ts";
export { createMultiFileDiff, resetMultiFileDiffCounter } from "./multi-file.ts";
export type {
  UnifiedDiffMultiBufferOptions,
  UnifiedDiffMultiBufferResult,
} from "./multibuffer.ts";
export { createUnifiedDiffMultiBuffer, HUNK_HEADER_STYLE } from "./multibuffer.ts";
export type { CreateMultiBufferFromPatchOptions } from "./patch.ts";
export {
  createMultiBufferFromPatch,
  createMultiBuffersFromDiff,
  parsePatch,
  resetPatchBufferIdCounter,
} from "./patch.ts";
export type {
  DiffHunk,
  DiffKind,
  DiffLine,
  DiffResult,
  FileDiffEntry,
  FileDiffState,
  FileDiffStats,
  HunkHeader,
  IntralineDiff,
  IntralineRange,
  MultiFileDiff,
  MultiFileDiffOptions,
  MultiFileDiffStats,
  ParsedPatch,
  PatchFile,
  PatchFileStatus,
  PatchHunk,
  PatchLine,
  PatchMultiBufferResult,
} from "./types.ts";
export type { DiffStats, UnifiedDiff, UnifiedDiffLine } from "./unified.ts";
export { createUnifiedDiff } from "./unified.ts";
