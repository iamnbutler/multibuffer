/**
 * TOML syntax highlighting queries.
 *
 * Maps tree-sitter-toml node types to highlight categories.
 */

import type { HighlightCategory, LanguageQuery } from "./types.ts";

const nodeTypeCategory: ReadonlyMap<string, HighlightCategory> = new Map([
  // Keys
  ["bare_key", "property"],
  ["dotted_key", "property"],
  ["quoted_key", "property"],

  // Strings
  ["string", "string"],
  ["basic_string", "string"],
  ["literal_string", "string"],
  ["multiline_basic_string", "string"],
  ["multiline_literal_string", "string"],
  ["escape_sequence", "string"],

  // Numbers
  ["integer", "number"],
  ["float", "number"],
  ["local_date", "number"],
  ["local_time", "number"],
  ["local_date_time", "number"],
  ["offset_date_time", "number"],

  // Constants
  ["boolean", "constant"],
  ["true", "constant"],
  ["false", "constant"],

  // Comments
  ["comment", "comment"],

  // Tables / sections
  ["table", "type"],
  ["table_array_element", "type"],

  // Punctuation
  ["[", "punctuation"],
  ["]", "punctuation"],
  ["[[", "punctuation"],
  ["]]", "punctuation"],
  ["{", "punctuation"],
  ["}", "punctuation"],
  [",", "punctuation"],
  [".", "punctuation"],
  ["=", "operator"],
]);

export const tomlQuery: LanguageQuery = {
  nodeTypeCategory,
};
