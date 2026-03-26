/**
 * Bash/Shell syntax highlighting queries.
 *
 * Maps tree-sitter-bash node types to highlight categories.
 */

import type { HighlightCategory, LanguageQuery } from "./types.ts";

const nodeTypeCategory: ReadonlyMap<string, HighlightCategory> = new Map([
  // Keywords
  ["if", "keyword"],
  ["then", "keyword"],
  ["elif", "keyword"],
  ["else", "keyword"],
  ["fi", "keyword"],
  ["for", "keyword"],
  ["while", "keyword"],
  ["do", "keyword"],
  ["done", "keyword"],
  ["case", "keyword"],
  ["esac", "keyword"],
  ["in", "keyword"],
  ["function", "keyword"],
  ["select", "keyword"],
  ["until", "keyword"],
  ["local", "keyword"],
  ["declare", "keyword"],
  ["export", "keyword"],
  ["readonly", "keyword"],
  ["unset", "keyword"],

  // Strings
  ["string", "string"],
  ["raw_string", "string"],
  ["ansi_c_string", "string"],
  ["string_content", "string"],
  ["heredoc_body", "string"],

  // Numbers
  ["number", "number"],

  // Comments
  ["comment", "comment"],

  // Commands
  ["command_name", "function"],

  // Variables
  ["variable_name", "property"],
  ["special_variable_name", "variable_builtin"],
  ["simple_expansion", "variable_builtin"],
  ["expansion", "variable_builtin"],

  // Operators
  ["|", "operator"],
  ["||", "operator"],
  ["&&", "operator"],
  [">", "operator"],
  [">>", "operator"],
  ["<", "operator"],
  ["&", "operator"],
  [";", "punctuation"],

  // Punctuation
  ["(", "punctuation"],
  [")", "punctuation"],
  ["{", "punctuation"],
  ["}", "punctuation"],
  ["[", "punctuation"],
  ["]", "punctuation"],
  ["[[", "punctuation"],
  ["]]", "punctuation"],
]);

export const bashQuery: LanguageQuery = {
  nodeTypeCategory,
};
