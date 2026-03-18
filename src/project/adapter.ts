/**
 * Filesystem adapter implementations.
 *
 * Provides default adapters for Bun and Node.js runtimes.
 */

import type { FsAdapter, FsDirEntry, FsStat } from "./types.ts";

/**
 * Create a filesystem adapter for Bun runtime.
 *
 * Uses Bun's native file APIs for optimal performance.
 *
 * @example
 * ```ts
 * const tree = createProjectTree('/path/to/project', {
 *   adapter: createBunFsAdapter(),
 * });
 * ```
 */
export function createBunFsAdapter(): FsAdapter {
  return {
    async readdir(path: string): Promise<readonly FsDirEntry[]> {
      const { readdir } = await import("node:fs/promises");
      const entries = await readdir(path, { withFileTypes: true });
      return entries.map((entry) => ({
        name: entry.name,
        isDirectory: entry.isDirectory(),
      }));
    },

    async stat(path: string): Promise<FsStat> {
      const { stat } = await import("node:fs/promises");
      const stats = await stat(path);
      return {
        size: stats.size,
        mtime: stats.mtimeMs,
      };
    },
  };
}

/**
 * Create a filesystem adapter for Node.js runtime.
 *
 * Uses Node's fs/promises API.
 *
 * @example
 * ```ts
 * const tree = createProjectTree('/path/to/project', {
 *   adapter: createNodeFsAdapter(),
 * });
 * ```
 */
export function createNodeFsAdapter(): FsAdapter {
  // Same implementation as Bun - both support node:fs/promises
  return createBunFsAdapter();
}

/**
 * Create a memory-based filesystem adapter for testing.
 *
 * @param files - Map of path to file content or directory marker
 *
 * @example
 * ```ts
 * const adapter = createMemoryFsAdapter({
 *   '/root/src': { type: 'directory' },
 *   '/root/src/index.ts': { type: 'file', content: 'export {}', size: 10 },
 *   '/root/package.json': { type: 'file', content: '{}', size: 2 },
 * });
 * ```
 */
export function createMemoryFsAdapter(
  files: Record<string, MemoryFsEntry>,
): FsAdapter {
  return {
    async readdir(path: string): Promise<readonly FsDirEntry[]> {
      const normalizedPath = normalizePath(path);

      // Check if the path exists and is a directory
      const pathEntry = files[normalizedPath];
      if (pathEntry && pathEntry.type === "file") {
        throw new Error(`ENOTDIR: not a directory: ${path}`);
      }

      const entries: FsDirEntry[] = [];
      const seen = new Set<string>();

      for (const filePath of Object.keys(files)) {
        const normalizedFilePath = normalizePath(filePath);
        // Check if this file is a direct child of the requested directory
        if (isDirectChild(normalizedPath, normalizedFilePath)) {
          const name = getBasename(normalizedFilePath);
          if (!seen.has(name)) {
            seen.add(name);
            const entry = files[filePath];
            entries.push({
              name,
              isDirectory: entry?.type === "directory",
            });
          }
        }
      }

      if (entries.length === 0 && !files[normalizedPath]) {
        throw new Error(`ENOENT: no such file or directory: ${path}`);
      }

      return entries;
    },

    async stat(path: string): Promise<FsStat> {
      const normalizedPath = normalizePath(path);
      const entry = files[normalizedPath];

      if (!entry) {
        throw new Error(`ENOENT: no such file or directory: ${path}`);
      }

      return {
        size: entry.size ?? 0,
        mtime: entry.mtime ?? Date.now(),
      };
    },
  };
}

/** Entry in the memory filesystem */
export interface MemoryFsEntry {
  type: "file" | "directory";
  content?: string;
  size?: number;
  mtime?: number;
}

/** Normalize a path by removing trailing slashes */
function normalizePath(path: string): string {
  // Remove trailing slashes except for root
  return path === "/" ? path : path.replace(/\/+$/, "");
}

/** Check if childPath is a direct child of parentPath */
function isDirectChild(parentPath: string, childPath: string): boolean {
  const normalizedParent = parentPath === "/" ? "" : parentPath;
  if (!childPath.startsWith(`${normalizedParent}/`)) {
    return false;
  }
  const relativePart = childPath.slice(normalizedParent.length + 1);
  // Direct child has no further slashes
  return relativePart.length > 0 && !relativePart.includes("/");
}

/** Get basename of a path */
function getBasename(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] ?? "";
}

/**
 * Detect runtime and return appropriate default adapter.
 */
export function getDefaultFsAdapter(): FsAdapter {
  // Both Bun and Node support node:fs/promises
  return createBunFsAdapter();
}
