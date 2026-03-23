/**
 * Minimal glob pattern matching.
 *
 * Supports a subset of glob syntax sufficient for file filtering:
 * - `*` matches any characters except path separators
 * - `**` matches any characters including path separators (directory wildcard)
 * - `?` matches exactly one character except path separators
 * - `[abc]` matches any character in brackets
 * - `[!abc]` or `[^abc]` matches any character not in brackets
 * - `{a,b,c}` matches any of the alternatives (brace expansion)
 *
 * For more advanced glob features, inject a custom GlobMatcher.
 */

import type { GlobMatcher } from "./types.ts";

/**
 * Shared default glob matcher instance.
 *
 * Avoids creating a new matcher (and its cache) on every call
 * when no custom matcher is provided.
 */
const defaultGlobMatcher: GlobMatcher = createGlobMatcher();

/**
 * Compile a glob pattern to a RegExp.
 *
 * @param pattern - Glob pattern to compile
 * @returns RegExp that matches the pattern
 */
export function compileGlob(pattern: string): RegExp {
  // Handle brace expansion first (simple non-nested)
  const expanded = expandBraces(pattern);
  if (expanded.length > 1) {
    // Multiple patterns from brace expansion - combine with |
    const regexParts = expanded.map((p) => compileGlobToRegexString(p));
    return new RegExp(`^(?:${regexParts.join("|")})$`);
  }

  return new RegExp(`^${compileGlobToRegexString(pattern)}$`);
}

/**
 * Expand brace expressions like {a,b,c} into multiple patterns.
 * Only handles single-level (non-nested) braces.
 */
function expandBraces(pattern: string): string[] {
  const braceMatch = pattern.match(/^([^{]*)\{([^}]+)\}(.*)$/);
  if (!braceMatch) {
    return [pattern];
  }

  const [, prefix, alternatives, suffix] = braceMatch;
  if (prefix === undefined || alternatives === undefined || suffix === undefined) {
    return [pattern];
  }

  const parts = alternatives.split(",");
  const results: string[] = [];

  for (const part of parts) {
    // Recursively expand in case there are more braces in suffix
    const expanded = expandBraces(prefix + part + suffix);
    results.push(...expanded);
  }

  return results;
}

/**
 * Convert a single glob pattern (no braces) to regex string.
 */
function compileGlobToRegexString(pattern: string): string {
  let regex = "";
  let i = 0;

  while (i < pattern.length) {
    const char = pattern[i];

    // TypeScript narrowing: char is guaranteed to be defined due to loop condition
    if (char === undefined) {
      break;
    }

    if (char === "*") {
      // Check for **
      if (pattern[i + 1] === "*") {
        // ** matches anything including /
        // Check if it's surrounded by / or at boundaries
        const prevIsSlashOrStart = i === 0 || pattern[i - 1] === "/";
        const nextIsSlashOrEnd =
          i + 2 >= pattern.length || pattern[i + 2] === "/";

        if (prevIsSlashOrStart && nextIsSlashOrEnd) {
          // **/ matches "any path prefix including empty"
          i += 2;
          // Skip trailing slash if present
          if (pattern[i] === "/") {
            // **/ at start or middle: match any number of directories (including zero)
            // Example: **/*.ts should match index.ts, src/index.ts, a/b/index.ts
            regex += "(?:.*/)?";
            i++;
          } else {
            // Standalone ** at end: match anything
            regex += ".*";
          }
        } else {
          // ** not at path boundaries, treat as * followed by *
          regex += "[^/]*[^/]*";
          i += 2;
        }
      } else {
        // Single * matches anything except /
        regex += "[^/]*";
        i++;
      }
    } else if (char === "?") {
      // ? matches any single character except /
      regex += "[^/]";
      i++;
    } else if (char === "[") {
      // Character class
      const closeIdx = pattern.indexOf("]", i + 1);
      if (closeIdx === -1) {
        // No closing bracket, treat as literal
        regex += escapeRegex(char);
        i++;
      } else {
        let classContent = pattern.slice(i + 1, closeIdx);
        // Handle negation
        if (classContent.startsWith("!") || classContent.startsWith("^")) {
          classContent = `^${classContent.slice(1)}`;
        }
        // Escape special regex chars in class (but not - or ^)
        classContent = classContent.replace(
          /[\\\]]/g,
          (c) => `\\${c}`,
        );
        regex += `[${classContent}]`;
        i = closeIdx + 1;
      }
    } else if (char === "/") {
      regex += "/";
      i++;
    } else {
      // Escape regex special characters
      regex += escapeRegex(char);
      i++;
    }
  }

  return regex;
}

/**
 * Escape special regex characters.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Create the default glob matcher.
 *
 * Caches compiled patterns for performance.
 */
export function createGlobMatcher(): GlobMatcher {
  const cache = new Map<string, RegExp>();

  return (pattern: string, path: string): boolean => {
    let regex = cache.get(pattern);
    if (!regex) {
      regex = compileGlob(pattern);
      cache.set(pattern, regex);
    }
    return regex.test(path);
  };
}

/**
 * Check if a path matches any of the given glob patterns.
 *
 * @param patterns - Glob patterns to match against
 * @param path - Path to test
 * @param matcher - Glob matcher function (defaults to built-in)
 * @returns true if path matches any pattern
 */
export function matchesAny(
  patterns: readonly string[],
  path: string,
  matcher: GlobMatcher = defaultGlobMatcher,
): boolean {
  for (const pattern of patterns) {
    if (matcher(pattern, path)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if a path should be included based on include/exclude patterns.
 *
 * @param path - Relative path to test
 * @param include - Patterns to include (if empty, all are included)
 * @param exclude - Patterns to exclude
 * @param matcher - Glob matcher function
 * @returns true if path passes filters
 */
export function shouldInclude(
  path: string,
  include: readonly string[],
  exclude: readonly string[],
  matcher: GlobMatcher = defaultGlobMatcher,
): boolean {
  // Check exclusions first
  if (exclude.length > 0) {
    // Check glob patterns
    if (matchesAny(exclude, path, matcher)) {
      return false;
    }
    // Also check if path is inside an excluded directory
    // e.g., exclude "node_modules" should exclude "node_modules/foo/index.ts"
    for (const pattern of exclude) {
      // Simple directory name (no glob chars)
      if (!pattern.includes("*") && !pattern.includes("?") && !pattern.includes("[")) {
        // Check if path starts with this directory
        if (path === pattern || path.startsWith(`${pattern}/`)) {
          return false;
        }
      }
    }
  }

  // If no include patterns, include everything not excluded
  if (include.length === 0) {
    return true;
  }

  // Check inclusions
  return matchesAny(include, path, matcher);
}

/**
 * Check if a directory should be traversed based on patterns.
 *
 * For directory traversal, we need to be more lenient:
 * - A directory should be traversed if any include pattern *could* match
 *   files within it (pattern starts with or contains the directory path)
 * - A directory should be skipped if it exactly matches an exclude pattern
 *
 * @param dirPath - Relative directory path
 * @param include - Include patterns
 * @param exclude - Exclude patterns
 * @param matcher - Glob matcher function
 */
export function shouldTraverseDirectory(
  dirPath: string,
  include: readonly string[],
  exclude: readonly string[],
  matcher: GlobMatcher = defaultGlobMatcher,
): boolean {
  // Check if directory itself is excluded (exact match or directory patterns)
  for (const pattern of exclude) {
    // Exact match of directory name
    if (matcher(pattern, dirPath)) {
      return false;
    }
    // Check if pattern is just a directory name (like "node_modules")
    if (!pattern.includes("/") && !pattern.includes("*")) {
      // Simple name pattern - check if it matches the last component
      const dirName = dirPath.split("/").pop() ?? dirPath;
      if (dirName === pattern) {
        return false;
      }
    }
  }

  // If no include patterns, traverse all non-excluded directories
  if (include.length === 0) {
    return true;
  }

  // Check if any include pattern could potentially match files in this directory
  for (const pattern of include) {
    // Check if pattern starts with ** (matches any directory)
    if (pattern.startsWith("**/") || pattern === "**") {
      return true;
    }

    // Check if pattern starts with the directory path.
    // Use exact match (pattern === dirPath) or slash-bounded prefix
    // (pattern.startsWith(`${dirPath}/`)) to avoid false positives where
    // dirPath is a non-path-boundary prefix of another directory name
    // (e.g. dirPath="lib" matching pattern="library/**").
    if (pattern.startsWith(`${dirPath}/`) || pattern === dirPath) {
      return true;
    }

    // Check if directory path is a prefix of the pattern
    const patternParts = pattern.split("/");
    const dirParts = dirPath.split("/");

    let couldMatch = true;
    for (let i = 0; i < dirParts.length && i < patternParts.length; i++) {
      const patternPart = patternParts[i];
      const dirPart = dirParts[i];
      if (patternPart === undefined || dirPart === undefined) {
        break;
      }
      // Check if this pattern segment could match the directory segment
      if (
        patternPart !== "*" &&
        patternPart !== "**" &&
        !patternPart.includes("*") &&
        patternPart !== dirPart
      ) {
        couldMatch = false;
        break;
      }
    }

    if (couldMatch) {
      return true;
    }
  }

  return false;
}
