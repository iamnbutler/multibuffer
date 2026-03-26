/**
 * Go syntax highlighting queries.
 *
 * Maps tree-sitter-go node types to highlight categories.
 */

import type { HighlightCategory, LanguageQuery } from "./types.ts";

const nodeTypeCategory: ReadonlyMap<string, HighlightCategory> = new Map([
  // Keywords
  ["func", "keyword"],
  ["var", "keyword"],
  ["const", "keyword"],
  ["type", "keyword"],
  ["struct", "keyword"],
  ["interface", "keyword"],
  ["package", "keyword"],
  ["import", "keyword"],
  ["return", "keyword"],
  ["if", "keyword"],
  ["else", "keyword"],
  ["for", "keyword"],
  ["range", "keyword"],
  ["switch", "keyword"],
  ["case", "keyword"],
  ["default", "keyword"],
  ["select", "keyword"],
  ["defer", "keyword"],
  ["go", "keyword"],
  ["chan", "keyword"],
  ["map", "keyword"],
  ["break", "keyword"],
  ["continue", "keyword"],
  ["fallthrough", "keyword"],
  ["goto", "keyword"],

  // Strings
  ["raw_string_literal", "string"],
  ["interpreted_string_literal", "string"],
  ["rune_literal", "string"],
  ["escape_sequence", "string"],

  // Numbers
  ["int_literal", "number"],
  ["float_literal", "number"],
  ["imaginary_literal", "number"],

  // Comments
  ["comment", "comment"],

  // Types
  ["type_identifier", "type"],

  // Functions
  ["function_declaration", "function"],
  ["method_declaration", "function"],

  // Properties / fields
  ["field_identifier", "property"],

  // Constants
  ["true", "constant"],
  ["false", "constant"],
  ["nil", "constant"],
  ["iota", "constant"],

  // Operators
  [":=", "operator"],
  ["<-", "operator"],
  ["...", "operator"],

  // Punctuation
  ["(", "punctuation"],
  [")", "punctuation"],
  ["{", "punctuation"],
  ["}", "punctuation"],
  ["[", "punctuation"],
  ["]", "punctuation"],
  [";", "punctuation"],
  [",", "punctuation"],
  [".", "punctuation"],
]);

export const goQuery: LanguageQuery = {
  nodeTypeCategory,
};
