export type { DiffController, DiffControllerOptions } from "./controller.ts";
export { createDiffController } from "./controller.ts";
export type { DiffOptions } from "./diff.ts";
export { diff, diffLines } from "./diff.ts";
export type {
  UnifiedDiffMultiBufferOptions,
  UnifiedDiffMultiBufferResult,
} from "./multibuffer.ts";
export { createUnifiedDiffMultiBuffer } from "./multibuffer.ts";
export type { CreateMultiBufferFromPatchOptions } from "./patch.ts";
export {
  createMultiBufferFromPatch,
  createMultiBuffersFromDiff,
  parsePatch,
} from "./patch.ts";
export type {
  DiffHunk,
  DiffKind,
  DiffLine,
  DiffResult,
  ParsedPatch,
  PatchFile,
  PatchFileStatus,
  PatchHunk,
  PatchLine,
  PatchMultiBufferResult,
} from "./types.ts";
export type { DiffStats, UnifiedDiff, UnifiedDiffLine } from "./unified.ts";
export { createUnifiedDiff } from "./unified.ts";
