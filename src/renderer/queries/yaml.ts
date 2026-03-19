/**
 * YAML syntax highlighting queries.
 *
 * Maps tree-sitter-yaml node types to highlight categories.
 */

import type { HighlightCategory, LanguageQuery } from "./types.ts";

/**
 * Tree-sitter node type → highlight category for YAML.
 */
const nodeTypeCategory: ReadonlyMap<string, HighlightCategory> = new Map([
  // Strings
  ["string_scalar", "string"],
  ["double_quote_scalar", "string"],
  ["single_quote_scalar", "string"],
  ["block_scalar", "string"],

  // Numbers
  ["integer_scalar", "number"],
  ["float_scalar", "number"],

  // Booleans and null
  ["boolean_scalar", "constant"],
  ["null_scalar", "constant"],

  // Anchors, aliases, tags (type-like)
  ["anchor_name", "type"],
  ["alias_name", "type"],
  ["tag", "type"],

  // Escape sequences
  ["escape_sequence", "operator"],
]);

export const yamlQuery: LanguageQuery = {
  nodeTypeCategory,
};
