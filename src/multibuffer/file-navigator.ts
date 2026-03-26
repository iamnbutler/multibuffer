/**
 * FileNavigator: bridges file selection and excerpt management.
 *
 * Maps file paths to excerpts in a MultiBuffer, creating them on demand
 * via an async `readFile` callback. Stays in sync with external excerpt
 * removal by listening to `excerptRemoved` events.
 */

import { createBuffer } from "../buffer/buffer.ts";
import type {
  BufferId,
  BufferRow,
  ExcerptId,
  ExcerptRange,
  MultiBuffer,
} from "./types.ts";

/** Info about an opened file tracked by the navigator. */
export interface OpenedFileInfo {
  readonly filePath: string;
  readonly excerptId: ExcerptId;
  readonly bufferId: BufferId;
}

/** Options for creating a FileNavigator. */
export interface FileNavigatorOptions {
  /** Async function to read file contents. Platform-agnostic. */
  readonly readFile: (path: string) => Promise<string>;
}

/** A file-to-excerpt navigation bridge over a MultiBuffer. */
export interface FileNavigator {
  /**
   * Open a file in the multibuffer. Creates a full-file excerpt if the file
   * is not already open; returns the existing excerpt ID otherwise.
   */
  openFile(filePath: string): Promise<ExcerptId>;

  /** Check if a file is currently shown as an excerpt. */
  hasFile(filePath: string): boolean;

  /** Get info for an opened file, or null if not open. */
  getExcerptForFile(filePath: string): OpenedFileInfo | null;

  /** Close/remove a file's excerpt. No-op if not open. */
  closeFile(filePath: string): void;

  /** Read-only view of all currently opened files. */
  readonly files: ReadonlyMap<string, OpenedFileInfo>;

  /** Clean up event listeners and internal state. */
  destroy(): void;
}

let nextId = 1;
function generateBufferId(): BufferId {
  // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction for internal buffer IDs
  return `file-nav-${nextId++}` as BufferId;
}

/**
 * Create a FileNavigator that bridges file paths to excerpts in a MultiBuffer.
 *
 * The navigator tracks which files are open, creates buffers + excerpts on
 * demand, and stays in sync when excerpts are removed externally.
 */
export function createFileNavigator(
  multiBuffer: MultiBuffer,
  options: FileNavigatorOptions,
): FileNavigator {
  const { readFile } = options;
  const fileMap = new Map<string, OpenedFileInfo>();
  // Reverse index: excerpt key → file path (for excerptRemoved sync)
  const excerptToFile = new Map<string, string>();

  function excerptKey(id: ExcerptId): string {
    return `${id.index}:${id.generation}`;
  }

  const onExcerptRemoved = (id: ExcerptId) => {
    const key = excerptKey(id);
    const filePath = excerptToFile.get(key);
    if (filePath !== undefined) {
      excerptToFile.delete(key);
      fileMap.delete(filePath);
    }
  };

  multiBuffer.on("excerptRemoved", onExcerptRemoved);

  return {
    async openFile(filePath: string): Promise<ExcerptId> {
      const existing = fileMap.get(filePath);
      if (existing) {
        return existing.excerptId;
      }

      const text = await readFile(filePath);
      const bufferId = generateBufferId();
      const buffer = createBuffer(bufferId, text);
      const lineCount = buffer.snapshot().lineCount;

      const range: ExcerptRange = {
        context: {
          // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
          start: { row: 0 as BufferRow, column: 0 },
          // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
          end: { row: lineCount as BufferRow, column: 0 },
        },
        primary: {
          // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
          start: { row: 0 as BufferRow, column: 0 },
          // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
          end: { row: lineCount as BufferRow, column: 0 },
        },
      };

      const excerptId = multiBuffer.addExcerpt(buffer, range, {
        metadata: { filePath },
      });

      const info: OpenedFileInfo = { filePath, excerptId, bufferId };
      fileMap.set(filePath, info);
      excerptToFile.set(excerptKey(excerptId), filePath);

      return excerptId;
    },

    hasFile(filePath: string): boolean {
      return fileMap.has(filePath);
    },

    getExcerptForFile(filePath: string): OpenedFileInfo | null {
      return fileMap.get(filePath) ?? null;
    },

    closeFile(filePath: string): void {
      const info = fileMap.get(filePath);
      if (!info) return;
      // removeExcerpt will trigger excerptRemoved event, which cleans up our maps
      multiBuffer.removeExcerpt(info.excerptId);
    },

    get files(): ReadonlyMap<string, OpenedFileInfo> {
      return fileMap;
    },

    destroy(): void {
      multiBuffer.off("excerptRemoved", onExcerptRemoved);
      fileMap.clear();
      excerptToFile.clear();
    },
  };
}
