/**
 * FileNavigator: bridge between file selection and excerpt management.
 *
 * Provides a high-level API for:
 * - Opening files (creates excerpt if needed, returns navigation info)
 * - Checking if a file is currently shown
 * - Getting excerpt info for a file
 * - Closing files (removes their excerpts)
 *
 * The navigator tracks which files are loaded and manages excerpt lifecycle,
 * so consumers don't need to manually track buffer IDs and excerpt IDs.
 */

import { createBuffer } from "../buffer/buffer.ts";
import type {
  Buffer,
  BufferId,
  BufferRow,
  ExcerptId,
  ExcerptRange,
  MultiBuffer,
  MultiBufferRow,
} from "../multibuffer/types.ts";

/**
 * Options for creating a FileNavigator.
 */
export interface FileNavigatorOptions {
  /**
   * Function to read file contents. Required.
   * Receives the file path and returns a promise resolving to the file content.
   */
  readFile: (path: string) => Promise<string>;

  /**
   * Optional function to generate buffer IDs.
   * Defaults to using the file path as the buffer ID.
   */
  createBufferId?: () => BufferId;
}

/**
 * Options for opening a file.
 */
export interface OpenFileOptions {
  /**
   * Specific line to navigate to (1-indexed).
   * If provided, the result will include the target row.
   */
  line?: number;
}

/**
 * Result of opening a file.
 */
export interface OpenFileResult {
  /** The excerpt ID for this file */
  excerptId: ExcerptId;
  /** The buffer ID for this file */
  bufferId: BufferId;
  /** The starting row of the excerpt in the multibuffer */
  startRow: MultiBufferRow;
  /** The target row to scroll to (if line option was provided) */
  targetRow?: MultiBufferRow;
}

/**
 * Excerpt information for a file.
 */
export interface FileExcerptInfo {
  /** The excerpt ID */
  excerptId: ExcerptId;
  /** The buffer ID */
  bufferId: BufferId;
  /** The starting row in the multibuffer */
  startRow: MultiBufferRow;
  /** The ending row (exclusive) in the multibuffer */
  endRow: MultiBufferRow;
}

/**
 * FileNavigator interface.
 */
export interface FileNavigator {
  /** The underlying multibuffer */
  readonly multiBuffer: MultiBuffer;

  /**
   * Check if a file is currently loaded in the multibuffer.
   */
  hasFile(path: string): boolean;

  /**
   * Open a file in the multibuffer.
   * If the file is already open, returns the existing excerpt info.
   * If not, loads the file, creates a buffer and excerpt, and returns the info.
   *
   * @param path - The file path
   * @param options - Optional settings (e.g., specific line to navigate to)
   * @returns Promise resolving to the open file result
   */
  openFile(path: string, options?: OpenFileOptions): Promise<OpenFileResult>;

  /**
   * Get excerpt info for an open file.
   * Returns null if the file is not currently loaded.
   */
  getExcerptForFile(path: string): FileExcerptInfo | null;

  /**
   * Close a file by removing its excerpt from the multibuffer.
   * No-op if the file is not currently loaded.
   */
  closeFile(path: string): void;

  /**
   * Get a list of all currently open file paths.
   */
  getOpenFiles(): readonly string[];
}

// Internal state for a loaded file
interface LoadedFile {
  path: string;
  buffer: Buffer;
  excerptId: ExcerptId;
}

// Pending load state to handle concurrent opens
interface PendingLoad {
  promise: Promise<OpenFileResult>;
}

let _defaultBufferIdCounter = 0;

function defaultCreateBufferId(): BufferId {
  // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
  return `file-buffer-${_defaultBufferIdCounter++}` as BufferId;
}

class FileNavigatorImpl implements FileNavigator {
  readonly multiBuffer: MultiBuffer;
  private readonly _readFile: (path: string) => Promise<string>;
  private readonly _createBufferId: () => BufferId;

  /** Map from file path to loaded file info */
  private readonly _files = new Map<string, LoadedFile>();

  /** Map from file path to pending load promise (for concurrent open handling) */
  private readonly _pendingLoads = new Map<string, PendingLoad>();

  constructor(multiBuffer: MultiBuffer, options: FileNavigatorOptions) {
    if (!options.readFile) {
      throw new Error("FileNavigator requires a readFile function");
    }
    this.multiBuffer = multiBuffer;
    this._readFile = options.readFile;
    this._createBufferId = options.createBufferId ?? defaultCreateBufferId;
  }

  hasFile(path: string): boolean {
    return this._files.has(path);
  }

  async openFile(
    path: string,
    options?: OpenFileOptions,
  ): Promise<OpenFileResult> {
    // Check if file is already loaded
    const existing = this._files.get(path);
    if (existing) {
      return this._buildResult(existing, options);
    }

    // Check if there's already a pending load for this file
    const pending = this._pendingLoads.get(path);
    if (pending) {
      return pending.promise;
    }

    // Start a new load
    const loadPromise = this._loadFile(path, options);
    this._pendingLoads.set(path, { promise: loadPromise });

    try {
      const result = await loadPromise;
      return result;
    } finally {
      this._pendingLoads.delete(path);
    }
  }

  private async _loadFile(
    path: string,
    options?: OpenFileOptions,
  ): Promise<OpenFileResult> {
    // Read the file content
    const content = await this._readFile(path);

    // Check again if file was loaded while we were reading (concurrent load finished first)
    const existing = this._files.get(path);
    if (existing) {
      return this._buildResult(existing, options);
    }

    // Create buffer and excerpt
    const bufferId = this._createBufferId();
    const buffer = createBuffer(bufferId, content);
    const lineCount = content.split("\n").length;

    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
    const startRow = 0 as BufferRow;
    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
    const endRow = lineCount as BufferRow;

    const range: ExcerptRange = {
      context: {
        start: { row: startRow, column: 0 },
        end: { row: endRow, column: 0 },
      },
      primary: {
        start: { row: startRow, column: 0 },
        end: { row: endRow, column: 0 },
      },
    };

    const excerptId = this.multiBuffer.addExcerpt(buffer, range, {
      metadata: { filePath: path },
    });

    // Store the loaded file info
    const loadedFile: LoadedFile = { path, buffer, excerptId };
    this._files.set(path, loadedFile);

    return this._buildResult(loadedFile, options);
  }

  private _buildResult(
    file: LoadedFile,
    options?: OpenFileOptions,
  ): OpenFileResult {
    const startRow = this.multiBuffer.rowForExcerpt(file.excerptId);
    if (startRow === undefined) {
      // This shouldn't happen if the file is in _files, but handle gracefully
      throw new Error(`Excerpt not found for file: ${file.path}`);
    }

    const result: OpenFileResult = {
      excerptId: file.excerptId,
      bufferId: file.buffer.id,
      startRow,
    };

    // Add target row if line option was provided
    if (options?.line !== undefined) {
      // Convert 1-indexed line to 0-indexed row offset
      const lineOffset = Math.max(0, options.line - 1);
      // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic
      result.targetRow = (startRow + lineOffset) as MultiBufferRow;
    }

    return result;
  }

  getExcerptForFile(path: string): FileExcerptInfo | null {
    const file = this._files.get(path);
    if (!file) {
      return null;
    }

    // Get current excerpt info from multibuffer
    const excerpt = this.multiBuffer.excerpts.find(
      (e) =>
        e.id.index === file.excerptId.index &&
        e.id.generation === file.excerptId.generation,
    );

    if (!excerpt) {
      // Excerpt was removed externally, clean up our state
      this._files.delete(path);
      return null;
    }

    return {
      excerptId: file.excerptId,
      bufferId: file.buffer.id,
      startRow: excerpt.startRow,
      endRow: excerpt.endRow,
    };
  }

  closeFile(path: string): void {
    const file = this._files.get(path);
    if (!file) {
      return;
    }

    this.multiBuffer.removeExcerpt(file.excerptId);
    this._files.delete(path);
  }

  getOpenFiles(): readonly string[] {
    return [...this._files.keys()];
  }
}

/**
 * Create a FileNavigator for a multibuffer.
 *
 * @param multiBuffer - The multibuffer to manage
 * @param options - Configuration options including the file reader
 * @returns A FileNavigator instance
 */
export function createFileNavigator(
  multiBuffer: MultiBuffer,
  options: FileNavigatorOptions,
): FileNavigator {
  return new FileNavigatorImpl(multiBuffer, options);
}
