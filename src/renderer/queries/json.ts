/**
 * JSON syntax highlighting queries.
 *
 * Maps tree-sitter-json node types to highlight categories.
 */

import type { HighlightCategory, LanguageQuery } from "./types.ts";

const nodeTypeCategory: ReadonlyMap<string, HighlightCategory> = new Map([
  // Strings (keys are also strings in JSON)
  ["string", "string"],
  ["string_content", "string"],
  ["escape_sequence", "string"],

  // Keys (pair first child)
  ["pair", "property"],

  // Numbers
  ["number", "number"],

  // Constants
  ["true", "constant"],
  ["false", "constant"],
  ["null", "constant"],

  // Punctuation
  ["{", "punctuation"],
  ["}", "punctuation"],
  ["[", "punctuation"],
  ["]", "punctuation"],
  [",", "punctuation"],
  [":", "operator"],
  ["\"", "string"],

  // Comments (JSONC)
  ["comment", "comment"],
]);

export const jsonQuery: LanguageQuery = {
  nodeTypeCategory,
};
