/**
 * Project tree module for file/directory discovery.
 *
 * @example
 * ```ts
 * import { createProjectTree } from "multibuffer/project";
 *
 * const tree = createProjectTree('/path/to/project', {
 *   include: ['**\/*.ts', '**\/*.tsx'],
 *   exclude: ['node_modules', 'dist'],
 * });
 *
 * // Iterate all entries
 * for await (const entry of tree.entries()) {
 *   console.log(entry.path);
 * }
 * ```
 *
 * @packageDocumentation
 */


// Adapters
export type { MemoryFsEntry } from "./adapter.ts";
export {
  createBunFsAdapter,
  createMemoryFsAdapter,
  createNodeFsAdapter,
  getDefaultFsAdapter,
} from "./adapter.ts";
// Glob utilities
export {
  compileGlob,
  createGlobMatcher,
  matchesAny,
  shouldInclude,
  shouldTraverseDirectory,
} from "./glob.ts";
// Main API
export { createProjectTree } from "./tree.ts";
// Types
export type {
  FsAdapter,
  FsDirEntry,
  FsStat,
  GlobMatcher,
  ProjectDirectoryEntry,
  ProjectEntry,
  ProjectFileEntry,
  ProjectTree,
  ProjectTreeChangeCallback,
  ProjectTreeChangeEvent,
  ProjectTreeOptions,
} from "./types.ts";
