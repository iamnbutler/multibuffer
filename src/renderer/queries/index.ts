/**
 * Language query registry for syntax highlighting.
 *
 * Provides a unified interface for looking up node type categories
 * across all supported languages. Each language defines its own
 * tree-sitter node type → highlight category mappings.
 *
 * To add a new language:
 * 1. Create a new file (e.g., `swift.ts`) with a LanguageQuery export
 * 2. Import and register it in the LANGUAGE_QUERIES map below
 */

import { bashQuery } from "./bash.ts";
import { cQuery } from "./c.ts";
import { cssQuery } from "./css.ts";
import { goQuery } from "./go.ts";
import { htmlQuery } from "./html.ts";
import { jsonQuery } from "./json.ts";
import { markdownQuery } from "./markdown.ts";
import { pythonQuery } from "./python.ts";
import { rubyQuery } from "./ruby.ts";
import { rustQuery } from "./rust.ts";
import { tomlQuery } from "./toml.ts";
import type { HighlightCategory, LanguageQuery } from "./types.ts";
import { typescriptQuery } from "./typescript.ts";
import { yamlQuery } from "./yaml.ts";

export type { HighlightCategory, LanguageQuery } from "./types.ts";

/** Registry of all language queries. */
const LANGUAGE_QUERIES: ReadonlyMap<string, LanguageQuery> = new Map([
  ["typescript", typescriptQuery],
  ["javascript", typescriptQuery], // JS uses same queries as TS
  ["tsx", typescriptQuery],
  ["jsx", typescriptQuery],
  ["markdown", markdownQuery],
  ["yaml", yamlQuery],
  ["yml", yamlQuery],
  ["rust", rustQuery],
  ["go", goQuery],
  ["python", pythonQuery],
  ["ruby", rubyQuery],
  ["html", htmlQuery],
  ["css", cssQuery],
  ["json", jsonQuery],
  ["toml", tomlQuery],
  ["bash", bashQuery],
  ["c", cQuery],
  ["cpp", cQuery], // C++ uses same queries as C
]);

/**
 * Combined map of all node types across all languages.
 * Built once at module load time for O(1) lookups.
 * When node types conflict between languages, later languages win.
 */
const COMBINED_NODE_TYPE_CATEGORY: ReadonlyMap<string, HighlightCategory> = (() => {
  const combined = new Map<string, HighlightCategory>();
  for (const query of LANGUAGE_QUERIES.values()) {
    for (const [nodeType, category] of query.nodeTypeCategory) {
      combined.set(nodeType, category);
    }
  }
  return combined;
})();

/**
 * Get the highlight category for a node type.
 *
 * Searches across all registered languages. Use this when the
 * language is unknown or when mixing content from multiple languages.
 *
 * @param nodeType - Tree-sitter node type string
 * @returns The highlight category, or "default" if not found
 */
export function nodeTypeToCategory(nodeType: string): HighlightCategory {
  return COMBINED_NODE_TYPE_CATEGORY.get(nodeType) ?? "default";
}

/**
 * Get the highlight category for a node type within a specific language.
 *
 * Only returns categories defined by the specified language's query.
 * Returns "default" for unknown languages or unrecognized node types,
 * without falling back to other languages' mappings.
 *
 * @param language - Language identifier (e.g., "typescript", "markdown")
 * @param nodeType - Tree-sitter node type string
 * @returns The highlight category, or "default" if not found
 */
export function nodeTypeToCategoryForLanguage(
  language: string,
  nodeType: string,
): HighlightCategory {
  const query = LANGUAGE_QUERIES.get(language);
  if (query) {
    return query.nodeTypeCategory.get(nodeType) ?? "default";
  }
  return "default";
}

/**
 * Get the language query for a specific language.
 *
 * @param language - Language identifier
 * @returns The LanguageQuery or undefined if not registered
 */
export function getLanguageQuery(language: string): LanguageQuery | undefined {
  return LANGUAGE_QUERIES.get(language);
}

/**
 * Check if a language has a registered query.
 */
export function hasLanguageQuery(language: string): boolean {
  return LANGUAGE_QUERIES.has(language);
}

/** Cached array of registered language identifiers (built once). */
const REGISTERED_LANGUAGES: readonly string[] = Array.from(LANGUAGE_QUERIES.keys());

/**
 * Get all registered language identifiers.
 */
export function getRegisteredLanguages(): readonly string[] {
  return REGISTERED_LANGUAGES;
}

// Re-export individual queries for direct access
export { bashQuery } from "./bash.ts";
export { cQuery } from "./c.ts";
export { cssQuery } from "./css.ts";
export { goQuery } from "./go.ts";
export { htmlQuery } from "./html.ts";
export { jsonQuery } from "./json.ts";
export { markdownQuery } from "./markdown.ts";
export { pythonQuery } from "./python.ts";
export { rubyQuery } from "./ruby.ts";
export { rustQuery } from "./rust.ts";
export { tomlQuery } from "./toml.ts";
export { typescriptQuery } from "./typescript.ts";
export { yamlQuery } from "./yaml.ts";
