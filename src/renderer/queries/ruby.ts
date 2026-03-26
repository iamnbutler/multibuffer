/**
 * Ruby syntax highlighting queries.
 *
 * Maps tree-sitter-ruby node types to highlight categories.
 */

import type { HighlightCategory, LanguageQuery } from "./types.ts";

const nodeTypeCategory: ReadonlyMap<string, HighlightCategory> = new Map([
  // Keywords
  ["def", "keyword"],
  ["end", "keyword"],
  ["class", "keyword"],
  ["module", "keyword"],
  ["if", "keyword"],
  ["elsif", "keyword"],
  ["else", "keyword"],
  ["unless", "keyword"],
  ["case", "keyword"],
  ["when", "keyword"],
  ["while", "keyword"],
  ["until", "keyword"],
  ["for", "keyword"],
  ["do", "keyword"],
  ["begin", "keyword"],
  ["rescue", "keyword"],
  ["ensure", "keyword"],
  ["raise", "keyword"],
  ["return", "keyword"],
  ["yield", "keyword"],
  ["block_given?", "keyword"],
  ["require", "keyword"],
  ["include", "keyword"],
  ["extend", "keyword"],
  ["attr_reader", "keyword"],
  ["attr_writer", "keyword"],
  ["attr_accessor", "keyword"],
  ["then", "keyword"],
  ["in", "keyword"],
  ["and", "keyword"],
  ["or", "keyword"],
  ["not", "keyword"],

  // Strings
  ["string", "string"],
  ["string_content", "string"],
  ["heredoc_body", "string"],
  ["heredoc_content", "string"],
  ["escape_sequence", "string"],
  ["interpolation", "string"],
  ["regex", "string"],

  // Numbers
  ["integer", "number"],
  ["float", "number"],

  // Comments
  ["comment", "comment"],

  // Types (constants used as types)
  ["constant", "type"],

  // Symbols
  ["symbol", "constant"],
  ["simple_symbol", "constant"],
  ["hash_key_symbol", "constant"],

  // Constants
  ["true", "constant"],
  ["false", "constant"],
  ["nil", "constant"],

  // Built-in variables
  ["self", "variable_builtin"],

  // Operators
  ["=>", "operator"],
  ["..", "operator"],
  ["...", "operator"],

  // Punctuation
  ["(", "punctuation"],
  [")", "punctuation"],
  ["{", "punctuation"],
  ["}", "punctuation"],
  ["[", "punctuation"],
  ["]", "punctuation"],
  [",", "punctuation"],
  [".", "punctuation"],
]);

export const rubyQuery: LanguageQuery = {
  nodeTypeCategory,
};
