/**
 * Python syntax highlighting queries.
 *
 * Maps tree-sitter-python node types to highlight categories.
 */

import type { HighlightCategory, LanguageQuery } from "./types.ts";

const nodeTypeCategory: ReadonlyMap<string, HighlightCategory> = new Map([
  // Keywords
  ["def", "keyword"],
  ["class", "keyword"],
  ["return", "keyword"],
  ["if", "keyword"],
  ["elif", "keyword"],
  ["else", "keyword"],
  ["for", "keyword"],
  ["while", "keyword"],
  ["break", "keyword"],
  ["continue", "keyword"],
  ["pass", "keyword"],
  ["import", "keyword"],
  ["from", "keyword"],
  ["as", "keyword"],
  ["with", "keyword"],
  ["try", "keyword"],
  ["except", "keyword"],
  ["finally", "keyword"],
  ["raise", "keyword"],
  ["yield", "keyword"],
  ["lambda", "keyword"],
  ["global", "keyword"],
  ["nonlocal", "keyword"],
  ["del", "keyword"],
  ["assert", "keyword"],
  ["async", "keyword"],
  ["await", "keyword"],
  ["in", "keyword"],
  ["not", "keyword"],
  ["and", "keyword"],
  ["or", "keyword"],
  ["is", "keyword"],

  // Strings
  ["string", "string"],
  ["string_content", "string"],
  ["string_start", "string"],
  ["string_end", "string"],
  ["escape_sequence", "string"],
  ["interpolation", "string"],

  // Numbers
  ["integer", "number"],
  ["float", "number"],

  // Comments
  ["comment", "comment"],

  // Functions
  ["function_definition", "function"],

  // Properties
  ["attribute", "property"],

  // Constants
  ["true", "constant"],
  ["false", "constant"],
  ["none", "constant"],
  ["True", "constant"],
  ["False", "constant"],
  ["None", "constant"],

  // Built-in variables
  ["self", "variable_builtin"],
  ["cls", "variable_builtin"],

  // Operators
  ["@", "operator"],

  // Punctuation
  ["(", "punctuation"],
  [")", "punctuation"],
  ["{", "punctuation"],
  ["}", "punctuation"],
  ["[", "punctuation"],
  ["]", "punctuation"],
  [":", "punctuation"],
  [",", "punctuation"],
  [".", "punctuation"],
]);

export const pythonQuery: LanguageQuery = {
  nodeTypeCategory,
};
