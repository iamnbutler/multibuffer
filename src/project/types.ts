/**
 * Types for project structure discovery.
 *
 * This module provides types for walking directory trees, filtering files,
 * and building hierarchical file tree UIs.
 *
 * ## Design
 *
 * - **Data layer only**: Consumers implement their own UI renderers
 * - **Lazy enumeration**: Only walk directories on demand to handle large repos
 * - **Platform-agnostic**: FsAdapter interface allows Bun/Node/browser/virtual FS
 */

/**
 * Filesystem adapter interface for platform portability.
 *
 * Implement this interface to use ProjectTree with different backends:
 * - Bun/Node: Use the provided `createFsAdapter()`
 * - Browser: Implement using File System Access API or a virtual FS
 * - Testing: Use `createMemoryFsAdapter()` with in-memory filesystem
 */
export interface FsAdapter {
  /**
   * Read directory entries.
   * @param path - Absolute path to the directory
   * @returns Array of directory entries with name and type
   */
  readdir(path: string): Promise<readonly FsDirEntry[]>;

  /**
   * Get file/directory metadata. Optional for basic tree enumeration.
   * @param path - Absolute path to the file or directory
   * @returns File metadata (size, modification time)
   */
  stat?(path: string): Promise<FsStat>;
}

/** Directory entry returned by FsAdapter.readdir */
export interface FsDirEntry {
  /** File or directory name (not full path) */
  readonly name: string;
  /** True if entry is a directory */
  readonly isDirectory: boolean;
}

/** File/directory metadata returned by FsAdapter.stat */
export interface FsStat {
  /** File size in bytes */
  readonly size: number;
  /** Modification time as Unix timestamp (milliseconds) */
  readonly mtime: number;
}

/**
 * A glob pattern matcher function.
 *
 * Inject a custom glob implementation if you need advanced features
 * beyond the built-in minimal matcher.
 */
export type GlobMatcher = (pattern: string, path: string) => boolean;

/** Options for creating a ProjectTree */
export interface ProjectTreeOptions {
  /**
   * Filesystem adapter for platform portability.
   * Defaults to Bun filesystem adapter when running in Bun.
   */
  adapter?: FsAdapter;

  /**
   * Glob patterns to include. Files/directories matching any pattern are included.
   * Uses path relative to root for matching.
   * @example ['**\/*.ts', '**\/*.tsx']
   */
  include?: readonly string[];

  /**
   * Glob patterns to exclude. Files/directories matching any pattern are excluded.
   * Exclusions are applied after inclusions.
   * @example ['node_modules', 'dist', '**\/*.test.ts']
   */
  exclude?: readonly string[];

  /**
   * Custom glob matcher function.
   * If not provided, uses the built-in minimal glob implementation.
   */
  globMatcher?: GlobMatcher;

  /**
   * Whether to include file metadata (size, mtime).
   * Requires adapter.stat to be implemented.
   * Default: false
   */
  includeMetadata?: boolean;

  /**
   * Maximum directory depth to traverse. 0 = root only, undefined = unlimited.
   */
  maxDepth?: number;
}

/**
 * A file entry in the project tree.
 */
export interface ProjectFileEntry {
  readonly type: "file";
  /** File name (not full path) */
  readonly name: string;
  /** Absolute path to the file */
  readonly path: string;
  /** Relative path from project root */
  readonly relativePath: string;
  /** File size in bytes (only if includeMetadata option is true) */
  readonly size?: number;
  /** Modification time as Unix timestamp in ms (only if includeMetadata option is true) */
  readonly mtime?: number;
}

/**
 * A directory entry in the project tree.
 */
export interface ProjectDirectoryEntry {
  readonly type: "directory";
  /** Directory name (not full path) */
  readonly name: string;
  /** Absolute path to the directory */
  readonly path: string;
  /** Relative path from project root */
  readonly relativePath: string;
  /**
   * Async iterator for children. Only walks directory when iterated.
   * This enables lazy enumeration for large repositories.
   */
  children(): AsyncIterable<ProjectEntry>;
}

/**
 * A project entry: either a file or directory.
 * Discriminated union on the `type` field.
 */
export type ProjectEntry = ProjectFileEntry | ProjectDirectoryEntry;

/**
 * Project tree interface for discovering files in a directory.
 */
export interface ProjectTree {
  /** Root path of the project */
  readonly root: string;

  /**
   * Iterate over all entries in the project tree.
   * Walks directories lazily as you iterate.
   */
  entries(): AsyncIterable<ProjectEntry>;

  /**
   * Iterate over children of a specific directory.
   * @param path - Absolute or relative path to the directory
   */
  children(path: string): AsyncIterable<ProjectEntry>;

  /**
   * Get a single entry by path.
   * @param path - Absolute or relative path
   * @returns The entry if it exists and passes filters, undefined otherwise
   */
  get(path: string): Promise<ProjectEntry | undefined>;

  /**
   * Check if a path exists and passes filters.
   * @param path - Absolute or relative path
   */
  has(path: string): Promise<boolean>;
}
