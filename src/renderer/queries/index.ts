/**
 * Language query registry for syntax highlighting.
 *
 * Provides a unified interface for looking up node type categories
 * across all supported languages. Each language defines its own
 * tree-sitter node type → highlight category mappings.
 *
 * To add a new language:
 * 1. Create a new file (e.g., `rust.ts`) with a LanguageQuery export
 * 2. Import and register it in the LANGUAGE_QUERIES map below
 */

import { markdownQuery } from "./markdown.ts";
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
    const category = query.nodeTypeCategory.get(nodeType);
    if (category) return category;
  }
  // Fall back to combined lookup
  return COMBINED_NODE_TYPE_CATEGORY.get(nodeType) ?? "default";
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

/**
 * Get all registered language identifiers.
 */
export function getRegisteredLanguages(): readonly string[] {
  return Array.from(LANGUAGE_QUERIES.keys());
}

// Re-export individual queries for direct access
export { markdownQuery } from "./markdown.ts";
export { typescriptQuery } from "./typescript.ts";
export { yamlQuery } from "./yaml.ts";
