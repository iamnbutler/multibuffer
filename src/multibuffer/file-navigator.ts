/**
 * FileNavigator: maps file paths to MultiBuffer excerpts.
 *
 * Bridges file selection (e.g. from a file tree) and excerpt management.
 * Load files on demand, track which paths are open, and remove them cleanly.
 *
 * @example
 * ```ts
 * import { createFileNavigator } from "multibuffer/multibuffer";
 *
 * const navigator = createFileNavigator(multiBuffer, {
 *   readFile: (path) => Bun.file(path).text(),
 * });
 *
 * // Open a file — loads content and adds excerpt to multiBuffer
 * const excerptId = await navigator.openFile("/src/main.ts");
 *
 * // Scroll to the excerpt (using renderer)
 * const info = multiBuffer.excerpts.find((e) => e.id === excerptId);
 * if (info) renderer.scrollTo({ row: info.startRow, strategy: "top" });
 *
 * // Close the file
 * navigator.closeFile("/src/main.ts");
 * ```
 */

import { createBuffer } from "../buffer/buffer.ts";
import type { BufferId, BufferRow } from "../buffer/types.ts";
import { keysEqual } from "./slot_map.ts";
import type { ExcerptId, ExcerptRange, MultiBuffer } from "./types.ts";

/** A function that reads file content given a path. Platform-agnostic. */
export type ReadFileFn = (path: string) => Promise<string>;

/** Options for creating a FileNavigator. */
export interface FileNavigatorOptions {
  /**
   * How to read file contents. Used by `openFile`.
   *
   * @example Bun: `(path) => Bun.file(path).text()`
   * @example Node: `(path) => fs.promises.readFile(path, "utf8")`
   * @example In-memory: `(path) => Promise.resolve(files[path])`
   */
  readFile: ReadFileFn;

  /**
   * Factory for creating buffer IDs. Defaults to an internal counter.
   * Override when integrating with an existing buffer ID scheme.
   */
  createBufferId?: () => BufferId;
}

/** Info about a file that is currently open in the navigator. */
export interface OpenedFileInfo {
  /** The path passed to `openFile`. */
  readonly filePath: string;
  /** The ExcerptId in the MultiBuffer for this file. */
  readonly excerptId: ExcerptId;
}

/**
 * A FileNavigator manages a mapping from file paths to MultiBuffer excerpts.
 *
 * - `openFile` loads a file and adds it as a full-file excerpt.
 * - Re-opening an already-open file returns the existing ExcerptId without duplication.
 * - External excerpt removal (via `multiBuffer.removeExcerpt`) is detected automatically.
 */
export interface FileNavigator {
  /**
   * Open a file: read its content and add it as a full-file excerpt.
   * If the file is already open, returns the existing ExcerptId immediately.
   *
   * @returns The ExcerptId for the file's excerpt in the MultiBuffer.
   */
  openFile(filePath: string): Promise<ExcerptId>;

  /**
   * Check if a file is currently open (has an excerpt in the MultiBuffer).
   */
  hasFile(filePath: string): boolean;

  /**
   * Get info about an open file, or `undefined` if the file is not open.
   */
  getExcerptForFile(filePath: string): OpenedFileInfo | undefined;

  /**
   * Close a file: remove its excerpt from the MultiBuffer and stop tracking it.
   * No-op if the file is not currently open.
   */
  closeFile(filePath: string): void;

  /**
   * All currently open files.
   * Keys are file paths as passed to `openFile`; values are `OpenedFileInfo`.
   */
  readonly files: ReadonlyMap<string, OpenedFileInfo>;
}

let _navigatorBufferIdCounter = 0;

function _defaultCreateBufferId(): BufferId {
  // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction for FileNavigator-internal buffer IDs
  return `file-navigator-buffer-${_navigatorBufferIdCounter++}` as BufferId;
}

function _makeFullFileRange(lineCount: number): ExcerptRange {
  // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction for BufferRow range endpoints
  const startRow = 0 as BufferRow;
  // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction for BufferRow range endpoints
  const endRow = lineCount as BufferRow;
  const start = { row: startRow, column: 0 };
  const end = { row: endRow, column: 0 };
  return { context: { start, end }, primary: { start, end } };
}

/**
 * Create a FileNavigator backed by the given MultiBuffer.
 *
 * @example
 * ```ts
 * const navigator = createFileNavigator(multiBuffer, {
 *   readFile: (path) => Bun.file(path).text(),
 * });
 * ```
 */
export function createFileNavigator(
  multiBuffer: MultiBuffer,
  options: FileNavigatorOptions,
): FileNavigator {
  const { readFile, createBufferId = _defaultCreateBufferId } = options;
  const loaded = new Map<string, OpenedFileInfo>();

  // Keep tracking in sync when excerpts are removed externally.
  const onExcerptRemoved = (id: ExcerptId): void => {
    for (const [path, info] of loaded) {
      if (keysEqual(info.excerptId, id)) {
        loaded.delete(path);
        break;
      }
    }
  };
  multiBuffer.on("excerptRemoved", onExcerptRemoved);

  return {
    async openFile(filePath: string): Promise<ExcerptId> {
      const existing = loaded.get(filePath);
      if (existing !== undefined) {
        return existing.excerptId;
      }
      const text = await readFile(filePath);
      const lineCount = text.split("\n").length;
      const buffer = createBuffer(createBufferId(), text);
      const range = _makeFullFileRange(lineCount);
      const excerptId = multiBuffer.addExcerpt(buffer, range, {
        metadata: { filePath },
      });
      const info: OpenedFileInfo = { filePath, excerptId };
      loaded.set(filePath, info);
      return excerptId;
    },

    hasFile(filePath: string): boolean {
      return loaded.has(filePath);
    },

    getExcerptForFile(filePath: string): OpenedFileInfo | undefined {
      return loaded.get(filePath);
    },

    closeFile(filePath: string): void {
      const info = loaded.get(filePath);
      if (info === undefined) return;
      loaded.delete(filePath);
      multiBuffer.removeExcerpt(info.excerptId);
    },

    get files(): ReadonlyMap<string, OpenedFileInfo> {
      return loaded;
    },
  };
}
