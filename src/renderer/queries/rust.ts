/**
 * Rust syntax highlighting queries.
 *
 * Maps tree-sitter-rust node types to highlight categories.
 */

import type { HighlightCategory, LanguageQuery } from "./types.ts";

const nodeTypeCategory: ReadonlyMap<string, HighlightCategory> = new Map([
  // Keywords
  ["fn", "keyword"],
  ["let", "keyword"],
  ["mut", "keyword"],
  ["const", "keyword"],
  ["static", "keyword"],
  ["pub", "keyword"],
  ["mod", "keyword"],
  ["use", "keyword"],
  ["struct", "keyword"],
  ["enum", "keyword"],
  ["impl", "keyword"],
  ["trait", "keyword"],
  ["type", "keyword"],
  ["where", "keyword"],
  ["as", "keyword"],
  ["if", "keyword"],
  ["else", "keyword"],
  ["match", "keyword"],
  ["for", "keyword"],
  ["while", "keyword"],
  ["loop", "keyword"],
  ["break", "keyword"],
  ["continue", "keyword"],
  ["return", "keyword"],
  ["async", "keyword"],
  ["await", "keyword"],
  ["move", "keyword"],
  ["ref", "keyword"],
  ["unsafe", "keyword"],
  ["extern", "keyword"],
  ["crate", "keyword"],
  ["self", "keyword"],
  ["dyn", "keyword"],
  ["in", "keyword"],

  // Strings
  ["string_literal", "string"],
  ["string_content", "string"],
  ["raw_string_literal", "string"],
  ["char_literal", "string"],
  ["escape_sequence", "string"],

  // Numbers
  ["integer_literal", "number"],
  ["float_literal", "number"],

  // Comments
  ["line_comment", "comment"],
  ["block_comment", "comment"],

  // Types
  ["type_identifier", "type"],
  ["primitive_type", "type"],
  ["scoped_type_identifier", "type"],

  // Functions
  ["function_item", "function"],

  // Properties / fields
  ["field_identifier", "property"],

  // Constants
  ["boolean_literal", "constant"],
  ["true", "constant"],
  ["false", "constant"],

  // Built-in variables
  ["self", "variable_builtin"],

  // Operators
  ["=>", "operator"],
  ["::", "operator"],
  ["->", "operator"],
  ["..", "operator"],
  ["..=", "operator"],

  // Punctuation
  ["(", "punctuation"],
  [")", "punctuation"],
  ["{", "punctuation"],
  ["}", "punctuation"],
  ["[", "punctuation"],
  ["]", "punctuation"],
  [";", "punctuation"],
  [",", "punctuation"],

  // Macros
  ["macro_invocation", "function"],
  ["macro_definition", "function"],
  ["!", "operator"],

  // Attributes
  ["attribute_item", "comment"],
  ["inner_attribute_item", "comment"],

  // Lifetime
  ["lifetime", "type"],
]);

export const rustQuery: LanguageQuery = {
  nodeTypeCategory,
};
