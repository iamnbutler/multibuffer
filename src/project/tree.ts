/**
 * ProjectTree implementation for file discovery.
 *
 * Provides lazy enumeration of files in a directory tree with glob filtering.
 */

import { getDefaultFsAdapter } from "./adapter.ts";
import {
  createGlobMatcher,
  shouldInclude,
  shouldTraverseDirectory,
} from "./glob.ts";
import type {
  FsAdapter,
  GlobMatcher,
  ProjectDirectoryEntry,
  ProjectEntry,
  ProjectFileEntry,
  ProjectTree,
  ProjectTreeOptions,
} from "./types.ts";

/**
 * Create a project tree for discovering files in a directory.
 *
 * @param root - Root directory path (absolute)
 * @param options - Configuration options
 * @returns ProjectTree instance
 *
 * @example
 * ```ts
 * const tree = createProjectTree('/path/to/project', {
 *   include: ['**\/*.ts', '**\/*.tsx'],
 *   exclude: ['node_modules', 'dist'],
 * });
 *
 * // Iterate all entries
 * for await (const entry of tree.entries()) {
 *   console.log(entry.path);
 * }
 *
 * // Lazy expand directories
 * for await (const entry of tree.children('/')) {
 *   if (entry.type === 'directory') {
 *     // Only expanded when iterated
 *     for await (const child of entry.children()) {
 *       console.log(child.path);
 *     }
 *   }
 * }
 * ```
 */
export function createProjectTree(
  root: string,
  options: ProjectTreeOptions = {},
): ProjectTree {
  const adapter = options.adapter ?? getDefaultFsAdapter();
  const include = options.include ?? [];
  const exclude = options.exclude ?? [];
  const globMatcher = options.globMatcher ?? createGlobMatcher();
  const includeMetadata = options.includeMetadata ?? false;
  const maxDepth = options.maxDepth;

  // Normalize root path (resolve "." / ".." and drop redundant separators)
  const normalizedRoot = normalizePathSegments(root);

  return new ProjectTreeImpl(
    normalizedRoot,
    adapter,
    include,
    exclude,
    globMatcher,
    includeMetadata,
    maxDepth,
  );
}

class ProjectTreeImpl implements ProjectTree {
  constructor(
    readonly root: string,
    private readonly adapter: FsAdapter,
    private readonly include: readonly string[],
    private readonly exclude: readonly string[],
    private readonly globMatcher: GlobMatcher,
    private readonly includeMetadata: boolean,
    private readonly maxDepth: number | undefined,
  ) {}

  async *entries(): AsyncIterable<ProjectEntry> {
    yield* this.walkDirectory(this.root, "", 0);
  }

  async *children(path: string): AsyncIterable<ProjectEntry> {
    const absolutePath = this.toAbsolutePath(path);
    const relativePath = this.toRelativePath(absolutePath);
    const depth = relativePath === "" ? 0 : relativePath.split("/").length;

    yield* this.enumerateChildren(absolutePath, relativePath, depth);
  }

  async get(path: string): Promise<ProjectEntry | undefined> {
    const absolutePath = this.toAbsolutePath(path);
    const relativePath = this.toRelativePath(absolutePath);

    // Check if path passes filters
    if (!this.passesFilters(relativePath)) {
      return undefined;
    }

    try {
      // Check if it exists by trying to stat or readdir
      if (this.adapter.stat) {
        const stat = await this.adapter.stat(absolutePath);
        // Determine if it's a file or directory by trying to readdir
        try {
          await this.adapter.readdir(absolutePath);
          // It's a directory
          return this.createDirectoryEntry(
            absolutePath,
            relativePath,
            this.getBasename(absolutePath),
          );
        } catch (error: unknown) {
          // Only treat ENOTDIR as "this is a file"; re-throw other errors
          if (getErrorCode(error) === "ENOTDIR") {
            return this.createFileEntry(
              absolutePath,
              relativePath,
              this.getBasename(absolutePath),
              stat.size,
              stat.mtime,
            );
          }
          throw error;
        }
      }

      // Without stat, try readdir to check if it's a directory
      try {
        await this.adapter.readdir(absolutePath);
        return this.createDirectoryEntry(
          absolutePath,
          relativePath,
          this.getBasename(absolutePath),
        );
      } catch (error: unknown) {
        // Only treat ENOTDIR as "this is a file"; re-throw other errors
        if (getErrorCode(error) === "ENOTDIR") {
          return this.createFileEntry(
            absolutePath,
            relativePath,
            this.getBasename(absolutePath),
          );
        }
        throw error;
      }
    } catch (error: unknown) {
      // ENOENT means the path doesn't exist — return undefined
      if (getErrorCode(error) === "ENOENT") {
        return undefined;
      }
      throw error;
    }
  }

  async has(path: string): Promise<boolean> {
    const entry = await this.get(path);
    return entry !== undefined;
  }

  /**
   * Walk a directory recursively, yielding all entries.
   */
  private async *walkDirectory(
    absolutePath: string,
    relativePath: string,
    depth: number,
  ): AsyncIterable<ProjectEntry> {
    // Check depth limit
    if (this.maxDepth !== undefined && depth > this.maxDepth) {
      return;
    }

    // Enumerate immediate children
    for await (const entry of this.enumerateChildren(
      absolutePath,
      relativePath,
      depth,
    )) {
      yield entry;

      // Recurse into directories
      if (entry.type === "directory") {
        yield* this.walkDirectory(entry.path, entry.relativePath, depth + 1);
      }
    }
  }

  /**
   * Enumerate immediate children of a directory.
   */
  private async *enumerateChildren(
    absolutePath: string,
    relativePath: string,
    depth: number,
  ): AsyncIterable<ProjectEntry> {
    // Check if directory should be traversed
    if (
      relativePath !== "" &&
      !shouldTraverseDirectory(
        relativePath,
        this.include,
        this.exclude,
        this.globMatcher,
      )
    ) {
      return;
    }

    let entries: readonly { name: string; isDirectory: boolean }[];
    try {
      entries = await this.adapter.readdir(absolutePath);
    } catch {
      return;
    }

    // Sort entries in place: directories first, then alphabetically
    const sortedEntries = entries.slice().sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) {
        return a.isDirectory ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    for (const entry of sortedEntries) {
      const childAbsolutePath = this.joinPath(absolutePath, entry.name);
      const childRelativePath =
        relativePath === ""
          ? entry.name
          : this.joinPath(relativePath, entry.name);

      if (entry.isDirectory) {
        // Check if directory should be included in results
        // For directories, check if they could contain matching files
        if (
          !shouldTraverseDirectory(
            childRelativePath,
            this.include,
            this.exclude,
            this.globMatcher,
          )
        ) {
          continue;
        }

        // With maxDepth, we only show directories we would recurse into.
        // Exception: at root level (depth 0), always show directories for "root only" view.
        const willRecurse =
          this.maxDepth === undefined || depth + 1 <= this.maxDepth;
        if (!willRecurse && depth > 0) {
          continue;
        }

        yield this.createDirectoryEntry(
          childAbsolutePath,
          childRelativePath,
          entry.name,
        );
      } else {
        // Check if file passes filters
        if (!this.passesFilters(childRelativePath)) {
          continue;
        }

        // Get metadata if requested
        let size: number | undefined;
        let mtime: number | undefined;

        if (this.includeMetadata && this.adapter.stat) {
          try {
            const stat = await this.adapter.stat(childAbsolutePath);
            size = stat.size;
            mtime = stat.mtime;
          } catch {
            // Ignore stat errors
          }
        }

        yield this.createFileEntry(
          childAbsolutePath,
          childRelativePath,
          entry.name,
          size,
          mtime,
        );
      }
    }
  }

  /**
   * Check if a path passes include/exclude filters.
   */
  private passesFilters(relativePath: string): boolean {
    return shouldInclude(
      relativePath,
      this.include,
      this.exclude,
      this.globMatcher,
    );
  }

  /**
   * Create a file entry.
   */
  private createFileEntry(
    path: string,
    relativePath: string,
    name: string,
    size?: number,
    mtime?: number,
  ): ProjectFileEntry {
    return {
      type: "file",
      name,
      path,
      relativePath,
      ...(size !== undefined ? { size } : {}),
      ...(mtime !== undefined ? { mtime } : {}),
    };
  }

  /**
   * Create a directory entry with lazy children iterator.
   */
  private createDirectoryEntry(
    path: string,
    relativePath: string,
    name: string,
  ): ProjectDirectoryEntry {
    const tree = this;
    const depth = relativePath === "" ? 0 : relativePath.split("/").length;

    return {
      type: "directory",
      name,
      path,
      relativePath,
      children(): AsyncIterable<ProjectEntry> {
        return tree.enumerateChildren(path, relativePath, depth);
      },
    };
  }

  /**
   * Convert a path to absolute.
   *
   * The result is canonical: `.` and `..` segments are resolved here, before
   * `toRelativePath` performs its containment check. That check is a string
   * prefix test, so it is only meaningful on a canonical path — `"/root/../etc"`
   * begins with `"/root/"` textually while naming something outside the root.
   */
  private toAbsolutePath(path: string): string {
    if (path.startsWith("/")) {
      return normalizePathSegments(path);
    }
    if (path === "" || path === ".") {
      return this.root;
    }
    return normalizePathSegments(this.joinPath(this.root, path));
  }

  /**
   * Convert an absolute path to relative (from root).
   * Throws if the path is outside the project root.
   */
  private toRelativePath(absolutePath: string): string {
    if (absolutePath === this.root) {
      return "";
    }
    const prefix = this.root.endsWith("/") ? this.root : `${this.root}/`;
    if (absolutePath.startsWith(prefix)) {
      return absolutePath.slice(prefix.length);
    }
    throw new Error(
      `Path "${absolutePath}" is outside project root "${this.root}"`,
    );
  }

  /**
   * Join path segments.
   */
  private joinPath(base: string, ...segments: string[]): string {
    let result = base;
    for (const segment of segments) {
      if (result.endsWith("/")) {
        result += segment;
      } else {
        result += `/${segment}`;
      }
    }
    return result;
  }

  /**
   * Get basename of a path.
   */
  private getBasename(path: string): string {
    const parts = path.split("/");
    return parts[parts.length - 1] ?? "";
  }
}

/**
 * Resolve `.` and `..` segments and collapse redundant separators.
 *
 * Filesystems resolve these before they read, so a path has to be canonical
 * before it can be compared against the project root — otherwise the
 * comparison and the read disagree about which file is meant.
 *
 * `..` above the filesystem root is dropped, matching POSIX, where `/..` is `/`.
 * A leading `..` in a relative path is kept, since there is nothing to pop.
 */
function normalizePathSegments(path: string): string {
  const isAbsolute = path.startsWith("/");
  const resolved: string[] = [];

  for (const segment of path.split("/")) {
    if (segment === "" || segment === ".") {
      continue;
    }
    if (segment === "..") {
      const last = resolved[resolved.length - 1];
      if (last !== undefined && last !== "..") {
        resolved.pop();
      } else if (!isAbsolute) {
        resolved.push("..");
      }
      continue;
    }
    resolved.push(segment);
  }

  const joined = resolved.join("/");
  return isAbsolute ? `/${joined}` : joined;
}

/**
 * Extract the error code from a Node.js-style errno exception.
 *
 * Checks for a string `code` property (real Node fs errors) and
 * falls back to parsing an "ECODE:" message prefix (memory adapter).
 * Returns undefined if neither is found.
 */
function getErrorCode(error: unknown): string | undefined {
  if (!(error instanceof Error)) return undefined;

  // Real Node.js errno exceptions carry a string `code` property
  if ("code" in error) {
    const code = error.code;
    if (typeof code === "string") return code;
  }

  // Memory adapter errors use an "ECODE: ..." message format
  const match = error.message.match(/^([A-Z]+):/);
  return match?.[1];
}
