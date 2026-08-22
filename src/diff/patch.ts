/**
 * Unified diff patch parser and MultiBuffer builder.
 *
 * Parses standard unified diff format (git diff output) and creates
 * MultiBuffers for rendering without requiring the full file contents.
 */

import { createBuffer } from "../buffer/buffer.ts";
import type { Buffer, BufferId } from "../buffer/types.ts";
import { createMultiBuffer } from "../multibuffer/multibuffer.ts";
import type { Decoration } from "../renderer/types.ts";
import {
  DELETE_STYLE,
  INSERT_STYLE,
  makeDecoration,
  makeExcerptRange,
} from "./diff-styles.ts";
import type {
  ParsedPatch,
  PatchFile,
  PatchFileStatus,
  PatchHunk,
  PatchLine,
  PatchMultiBufferResult,
} from "./types.ts";

// Patch parsing

/** Regex patterns for parsing unified diffs */
const DIFF_GIT_HEADER = /^diff --git a\/(.+) b\/(.+)$/;
const OLD_FILE_HEADER = /^--- (?:a\/)?(.+)$/;
const NEW_FILE_HEADER = /^\+\+\+ (?:b\/)?(.+)$/;
const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;
const SIMILARITY_INDEX = /^similarity index (\d+)%$/;
const RENAME_FROM = /^rename from (.+)$/;
const RENAME_TO = /^rename to (.+)$/;
const COPY_FROM = /^copy from (.+)$/;
const COPY_TO = /^copy to (.+)$/;
const NEW_FILE_MODE = /^new file mode \d+$/;
const DELETED_FILE_MODE = /^deleted file mode \d+$/;
const BINARY_FILES = /^Binary files .+ differ$/;
const GIT_BINARY_PATCH = /^GIT binary patch$/;

/**
 * Parse a unified diff patch string into structured data.
 *
 * Supports standard git diff output format including:
 * - Single and multi-file patches
 * - Renames with similarity detection
 * - New and deleted files
 * - Binary file markers
 *
 * @param patchString - The unified diff patch string (output of `git diff`)
 * @returns Parsed patch structure
 */
export function parsePatch(patchString: string): ParsedPatch {
  const lines = patchString.split("\n");
  const files: PatchFile[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (line === undefined) {
      i++;
      continue;
    }

    // Look for diff --git header
    const gitMatch = DIFF_GIT_HEADER.exec(line);
    if (gitMatch) {
      const result = parseGitDiffFile(lines, i);
      files.push(result.file);
      i = result.nextIndex;
      continue;
    }

    // Look for traditional unified diff (--- header without git prefix)
    if (line.startsWith("--- ")) {
      const result = parseTraditionalDiffFile(lines, i);
      if (result) {
        files.push(result.file);
        i = result.nextIndex;
        continue;
      }
    }

    i++;
  }

  return { files };
}

interface ParseFileResult {
  file: PatchFile;
  nextIndex: number;
}

/**
 * Parse a git diff file section starting at index i.
 */
function parseGitDiffFile(lines: string[], startIndex: number): ParseFileResult {
  let i = startIndex;
  const line = lines[i];
  if (line === undefined) {
    throw new Error("Expected diff --git header");
  }

  const gitMatch = DIFF_GIT_HEADER.exec(line);
  if (!gitMatch) {
    throw new Error("Expected diff --git header");
  }

  let oldPath = gitMatch[1] ?? "";
  let newPath = gitMatch[2] ?? "";
  let status: PatchFileStatus = "modified";
  let similarity: number | undefined;
  let isBinary = false;
  i++;

  // Parse extended headers
  while (i < lines.length) {
    const headerLine = lines[i];
    if (headerLine === undefined) break;

    if (NEW_FILE_MODE.test(headerLine)) {
      status = "added";
      i++;
      continue;
    }

    if (DELETED_FILE_MODE.test(headerLine)) {
      status = "deleted";
      i++;
      continue;
    }

    const simMatch = SIMILARITY_INDEX.exec(headerLine);
    if (simMatch) {
      similarity = parseInt(simMatch[1] ?? "0", 10);
      i++;
      continue;
    }

    const renameFromMatch = RENAME_FROM.exec(headerLine);
    if (renameFromMatch) {
      status = "renamed";
      oldPath = renameFromMatch[1] ?? oldPath;
      i++;
      continue;
    }

    const renameToMatch = RENAME_TO.exec(headerLine);
    if (renameToMatch) {
      status = "renamed";
      newPath = renameToMatch[1] ?? newPath;
      i++;
      continue;
    }

    const copyFromMatch = COPY_FROM.exec(headerLine);
    if (copyFromMatch) {
      status = "copied";
      oldPath = copyFromMatch[1] ?? oldPath;
      i++;
      continue;
    }

    const copyToMatch = COPY_TO.exec(headerLine);
    if (copyToMatch) {
      status = "copied";
      newPath = copyToMatch[1] ?? newPath;
      i++;
      continue;
    }

    if (BINARY_FILES.test(headerLine) || GIT_BINARY_PATCH.test(headerLine)) {
      isBinary = true;
      status = "binary";
      i++;
      // Skip binary patch data
      while (i < lines.length) {
        const binaryLine = lines[i];
        if (
          binaryLine === undefined ||
          binaryLine.startsWith("diff --git") ||
          binaryLine.startsWith("--- ")
        ) {
          break;
        }
        i++;
      }
      return {
        file: { oldPath, newPath, status, similarity, isBinary, hunks: [] },
        nextIndex: i,
      };
    }

    // Check for index line (e.g., "index abc123..def456 100644")
    if (headerLine.startsWith("index ")) {
      i++;
      continue;
    }

    // Check for --- header (start of actual diff content)
    if (headerLine.startsWith("--- ")) {
      break;
    }

    // Unknown header, skip
    i++;
  }

  // Parse --- and +++ headers if present
  if (i < lines.length) {
    const oldFileMatch = lines[i] !== undefined ? OLD_FILE_HEADER.exec(lines[i] ?? "") : null;
    if (oldFileMatch) {
      const parsedOldPath = oldFileMatch[1] ?? "";
      if (parsedOldPath !== "/dev/null") {
        oldPath = parsedOldPath;
      } else if (status === "modified") {
        status = "added";
      }
      i++;
    }
  }

  if (i < lines.length) {
    const newFileMatch = lines[i] !== undefined ? NEW_FILE_HEADER.exec(lines[i] ?? "") : null;
    if (newFileMatch) {
      const parsedNewPath = newFileMatch[1] ?? "";
      if (parsedNewPath !== "/dev/null") {
        newPath = parsedNewPath;
      } else if (status === "modified") {
        status = "deleted";
      }
      i++;
    }
  }

  // Parse hunks
  const hunks: PatchHunk[] = [];
  while (i < lines.length) {
    const hunkLine = lines[i];
    if (hunkLine === undefined) break;

    // Stop at next file
    if (hunkLine.startsWith("diff --git")) {
      break;
    }

    const hunkMatch = HUNK_HEADER.exec(hunkLine);
    if (hunkMatch) {
      const result = parseHunk(lines, i, hunkMatch);
      hunks.push(result.hunk);
      i = result.nextIndex;
      continue;
    }

    i++;
  }

  return {
    file: { oldPath, newPath, status, similarity, isBinary, hunks },
    nextIndex: i,
  };
}

/**
 * Parse a traditional unified diff file section (no git prefix).
 */
function parseTraditionalDiffFile(
  lines: string[],
  startIndex: number,
): ParseFileResult | null {
  let i = startIndex;
  const oldFileLine = lines[i];
  if (oldFileLine === undefined) return null;

  const oldFileMatch = OLD_FILE_HEADER.exec(oldFileLine);
  if (!oldFileMatch) return null;

  let oldPath = oldFileMatch[1] ?? "";
  i++;

  if (i >= lines.length) return null;
  const newFileLine = lines[i];
  if (newFileLine === undefined) return null;

  const newFileMatch = NEW_FILE_HEADER.exec(newFileLine);
  if (!newFileMatch) return null;

  let newPath = newFileMatch[1] ?? "";
  i++;

  // Determine status based on paths
  let status: PatchFileStatus = "modified";
  if (oldPath === "/dev/null") {
    status = "added";
    oldPath = newPath;
  } else if (newPath === "/dev/null") {
    status = "deleted";
    newPath = oldPath;
  }

  // Parse hunks
  const hunks: PatchHunk[] = [];
  while (i < lines.length) {
    const hunkLine = lines[i];
    if (hunkLine === undefined) break;

    // Stop at next file
    if (hunkLine.startsWith("diff --git") || hunkLine.startsWith("--- ")) {
      break;
    }

    const hunkMatch = HUNK_HEADER.exec(hunkLine);
    if (hunkMatch) {
      const result = parseHunk(lines, i, hunkMatch);
      hunks.push(result.hunk);
      i = result.nextIndex;
      continue;
    }

    i++;
  }

  return {
    file: {
      oldPath,
      newPath,
      status,
      similarity: undefined,
      isBinary: false,
      hunks,
    },
    nextIndex: i,
  };
}

interface ParseHunkResult {
  hunk: PatchHunk;
  nextIndex: number;
}

/**
 * Parse a single hunk starting at index i.
 */
function parseHunk(
  lines: string[],
  startIndex: number,
  hunkMatch: RegExpExecArray,
): ParseHunkResult {
  const oldStart = parseInt(hunkMatch[1] ?? "1", 10);
  const oldCount = parseInt(hunkMatch[2] ?? "1", 10);
  const newStart = parseInt(hunkMatch[3] ?? "1", 10);
  const newCount = parseInt(hunkMatch[4] ?? "1", 10);
  const header = hunkMatch[5]?.trim() || undefined;

  let i = startIndex + 1;
  const hunkLines: PatchLine[] = [];
  let oldLineNum = oldStart;
  let newLineNum = newStart;

  while (i < lines.length) {
    const line = lines[i];
    if (line === undefined) break;

    // Stop at next hunk or file.
    //
    // "--- " is ambiguous: deleting a line whose content starts with "-- "
    // (a SQL/Haskell/Lua comment, an email signature marker) produces a body
    // line that is textually identical to a traditional diff's old-file
    // header. The declared hunk counts are the only way to tell them apart,
    // so only treat it as a header once this hunk has consumed every line it
    // said it would. "diff --git" and "@@ " are unambiguous - a body line
    // always carries a " ", "-", "+" or "\" prefix, so neither can appear at
    // column 0 inside a hunk.
    const hunkComplete =
      oldLineNum - oldStart >= oldCount && newLineNum - newStart >= newCount;
    if (
      line.startsWith("diff --git") ||
      (hunkComplete && line.startsWith("--- ")) ||
      HUNK_HEADER.test(line)
    ) {
      break;
    }

    // Handle "\ No newline at end of file" marker
    if (line.startsWith("\\ ")) {
      i++;
      continue;
    }

    const prefix = line[0];
    const content = line.slice(1);

    if (prefix === " ") {
      // Context line
      hunkLines.push({
        kind: "context",
        content,
        oldLineNumber: oldLineNum,
        newLineNumber: newLineNum,
      });
      oldLineNum++;
      newLineNum++;
    } else if (prefix === "-") {
      // Deletion
      hunkLines.push({
        kind: "delete",
        content,
        oldLineNumber: oldLineNum,
        newLineNumber: undefined,
      });
      oldLineNum++;
    } else if (prefix === "+") {
      // Addition
      hunkLines.push({
        kind: "add",
        content,
        oldLineNumber: undefined,
        newLineNumber: newLineNum,
      });
      newLineNum++;
    } else {
      // Unknown line (possibly empty line without prefix, or end of hunk)
      // If the line is completely empty, treat it as a context line with empty content
      if (line === "") {
        // This might be an empty context line that's missing its space prefix
        // Or it could be the end of the patch - check if we've consumed all expected lines
        const consumedOld = oldLineNum - oldStart;
        const consumedNew = newLineNum - newStart;
        if (consumedOld < oldCount || consumedNew < newCount) {
          // Still expecting more lines, treat as empty context
          hunkLines.push({
            kind: "context",
            content: "",
            oldLineNumber: oldLineNum,
            newLineNumber: newLineNum,
          });
          oldLineNum++;
          newLineNum++;
        } else {
          // We've consumed all expected lines, this is the end
          break;
        }
      } else {
        // Not a recognized diff line, end of hunk
        break;
      }
    }

    i++;
  }

  return {
    hunk: { oldStart, oldCount, newStart, newCount, header, lines: hunkLines },
    nextIndex: i,
  };
}

// MultiBuffer creation from patches

let patchBufferIdCounter = 0;

function createPatchBufferId(): BufferId {
  // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
  return `patch-buffer-${++patchBufferIdCounter}` as BufferId;
}

/**
 * Reset the internal buffer ID counter. Useful for test isolation.
 * @internal
 */
export function resetPatchBufferIdCounter(): void {
  patchBufferIdCounter = 0;
}

export interface CreateMultiBufferFromPatchOptions {
  /** Filename for the result (overrides parsed filename). */
  filename?: string;
}

/**
 * Create a MultiBuffer from a single-file patch.
 *
 * The patch is parsed and the hunks are displayed as excerpts.
 * Deletions and additions are styled with appropriate decorations.
 * The resulting MultiBuffer is read-only since patch data cannot be edited.
 *
 * @param patchString - A unified diff patch string for a single file
 * @param options - Optional configuration
 * @returns MultiBuffer result with decorations
 */
export function createMultiBufferFromPatch(
  patchString: string,
  options?: CreateMultiBufferFromPatchOptions,
): PatchMultiBufferResult {
  const parsed = parsePatch(patchString);

  if (parsed.files.length === 0) {
    // Empty patch - create empty result
    const mb = createMultiBuffer();
    return {
      filename: options?.filename ?? "unknown",
      oldFilename: undefined,
      multiBuffer: mb,
      decorations: [],
      status: "modified",
      isBinary: false,
    };
  }

  if (parsed.files.length > 1) {
    throw new Error(
      `createMultiBufferFromPatch received a multi-file patch (${parsed.files.length} files). ` +
        "Use createMultiBuffersFromDiff for multi-file patches.",
    );
  }

  const file = parsed.files[0];
  if (!file) {
    throw new Error("Unexpected: no file in parsed patch");
  }

  return createMultiBufferFromPatchFile(file, options?.filename);
}

/**
 * Create MultiBuffers from a multi-file patch (e.g., full git diff output).
 *
 * @param patchString - A unified diff patch string containing one or more files
 * @returns Array of MultiBuffer results, one per file
 */
export function createMultiBuffersFromDiff(
  patchString: string,
): readonly PatchMultiBufferResult[] {
  const parsed = parsePatch(patchString);
  return parsed.files.map((file) => createMultiBufferFromPatchFile(file));
}

/**
 * Internal: Create a MultiBuffer from a parsed PatchFile.
 */
function createMultiBufferFromPatchFile(
  file: PatchFile,
  filenameOverride?: string,
): PatchMultiBufferResult {
  const filename = filenameOverride ?? resolveFilename(file);
  const oldFilename =
    file.status === "renamed" || file.status === "copied"
      ? file.oldPath
      : undefined;

  // Handle binary files
  if (file.isBinary) {
    const mb = createMultiBuffer();
    return {
      filename,
      oldFilename,
      multiBuffer: mb,
      decorations: [],
      status: file.status,
      isBinary: true,
    };
  }

  // Handle empty hunks (e.g., pure rename with no content change)
  if (file.hunks.length === 0) {
    const mb = createMultiBuffer();
    return {
      filename,
      oldFilename,
      multiBuffer: mb,
      decorations: [],
      status: file.status,
      isBinary: false,
    };
  }

  // Build buffers for old and new content from the patch
  const { oldBuffer, newBuffer, lineMapping } = buildBuffersFromPatch(file);

  // Create the MultiBuffer with excerpts, batching consecutive same-kind lines
  // into single excerpts (matching the pattern in multibuffer.ts:82-128).
  const mb = createMultiBuffer();
  const decorations: Decoration[] = [];
  let mbRow = 0;

  // Flatten all hunk lines into a single array for batching across hunks.
  const allLines: PatchLine[] = [];
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      allLines.push(line);
    }
  }

  let i = 0;
  while (i < allLines.length) {
    const firstLine = allLines[i];
    if (firstLine === undefined) break;
    const kind = firstLine.kind;

    // Count consecutive lines of the same kind.
    let lineCount = 0;
    while (i < allLines.length && allLines[i]?.kind === kind) {
      i++;
      lineCount++;
    }

    if (kind === "delete") {
      // The parser guarantees oldLineNumber is defined for delete lines.
      if (firstLine.oldLineNumber === undefined) {
        throw new Error("Invariant violation: delete line missing oldLineNumber");
      }
      const firstBufferRow = lineMapping.oldLineToBufferRow.get(firstLine.oldLineNumber);
      if (firstBufferRow === undefined) {
        throw new Error(
          `Invariant violation: no buffer row mapping for old line ${firstLine.oldLineNumber}`,
        );
      }
      mb.addExcerpt(
        oldBuffer,
        makeExcerptRange(firstBufferRow, firstBufferRow + lineCount),
        { editable: false },
      );
      decorations.push(makeDecoration(mbRow, lineCount, DELETE_STYLE));
    } else if (kind === "add") {
      // The parser guarantees newLineNumber is defined for add lines.
      if (firstLine.newLineNumber === undefined) {
        throw new Error("Invariant violation: add line missing newLineNumber");
      }
      const firstBufferRow = lineMapping.newLineToBufferRow.get(firstLine.newLineNumber);
      if (firstBufferRow === undefined) {
        throw new Error(
          `Invariant violation: no buffer row mapping for new line ${firstLine.newLineNumber}`,
        );
      }
      mb.addExcerpt(
        newBuffer,
        makeExcerptRange(firstBufferRow, firstBufferRow + lineCount),
        { editable: false },
      );
      decorations.push(makeDecoration(mbRow, lineCount, INSERT_STYLE));
    } else {
      // Context lines: add from new buffer (represents current state).
      // The parser guarantees newLineNumber is defined for context lines.
      if (firstLine.newLineNumber === undefined) {
        throw new Error("Invariant violation: context line missing newLineNumber");
      }
      const firstBufferRow = lineMapping.newLineToBufferRow.get(firstLine.newLineNumber);
      if (firstBufferRow === undefined) {
        throw new Error(
          `Invariant violation: no buffer row mapping for new line ${firstLine.newLineNumber}`,
        );
      }
      mb.addExcerpt(
        newBuffer,
        makeExcerptRange(firstBufferRow, firstBufferRow + lineCount),
        { editable: false },
      );
      // No decoration for context lines.
    }

    mbRow += lineCount;
  }

  return {
    filename,
    oldFilename,
    multiBuffer: mb,
    decorations,
    status: file.status,
    isBinary: false,
  };
}

/**
 * Resolve the display filename from a PatchFile.
 */
function resolveFilename(file: PatchFile): string {
  // For deletions, use old path; otherwise use new path
  if (file.status === "deleted") {
    return file.oldPath === "/dev/null" ? file.newPath : file.oldPath;
  }
  return file.newPath === "/dev/null" ? file.oldPath : file.newPath;
}

interface LineMapping {
  oldLineToBufferRow: Map<number, number>;
  newLineToBufferRow: Map<number, number>;
}

interface BuildBuffersResult {
  oldBuffer: Buffer;
  newBuffer: Buffer;
  lineMapping: LineMapping;
}

/**
 * Build separate buffers for old and new content from patch hunks.
 *
 * Since a patch only contains hunks (not full file content), we reconstruct
 * just the lines that appear in the patch. Each line maps to its buffer row.
 */
function buildBuffersFromPatch(file: PatchFile): BuildBuffersResult {
  const oldLines: string[] = [];
  const newLines: string[] = [];
  const oldLineToBufferRow = new Map<number, number>();
  const newLineToBufferRow = new Map<number, number>();

  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      if (line.kind === "delete" || line.kind === "context") {
        // Line exists in old file
        if (line.oldLineNumber !== undefined) {
          oldLineToBufferRow.set(line.oldLineNumber, oldLines.length);
          oldLines.push(line.content);
        }
      }
      if (line.kind === "add" || line.kind === "context") {
        // Line exists in new file
        if (line.newLineNumber !== undefined) {
          newLineToBufferRow.set(line.newLineNumber, newLines.length);
          newLines.push(line.content);
        }
      }
    }
  }

  const oldBuffer = createBuffer(createPatchBufferId(), oldLines.join("\n"));
  const newBuffer = createBuffer(createPatchBufferId(), newLines.join("\n"));

  return {
    oldBuffer,
    newBuffer,
    lineMapping: { oldLineToBufferRow, newLineToBufferRow },
  };
}

