/**
 * CSS syntax highlighting queries.
 *
 * Maps tree-sitter-css node types to highlight categories.
 */

import type { HighlightCategory, LanguageQuery } from "./types.ts";

const nodeTypeCategory: ReadonlyMap<string, HighlightCategory> = new Map([
  // At-rules
  ["@media", "keyword"],
  ["@import", "keyword"],
  ["@charset", "keyword"],
  ["@keyframes", "keyword"],
  ["@supports", "keyword"],
  ["@font-face", "keyword"],
  ["at_keyword", "keyword"],

  // Selectors
  ["tag_name", "keyword"],
  ["class_name", "type"],
  ["id_name", "constant"],
  ["pseudo_class_selector", "function"],
  ["pseudo_element_selector", "function"],

  // Properties and values
  ["property_name", "property"],
  ["feature_name", "property"],
  ["plain_value", "constant"],

  // Strings and colors
  ["string_value", "string"],
  ["color_value", "number"],
  ["integer_value", "number"],
  ["float_value", "number"],

  // Functions
  ["function_name", "function"],
  ["call_expression", "function"],

  // Comments
  ["comment", "comment"],

  // Units
  ["unit", "type"],

  // Important
  ["important", "keyword"],

  // Punctuation
  ["{", "punctuation"],
  ["}", "punctuation"],
  ["(", "punctuation"],
  [")", "punctuation"],
  [";", "punctuation"],
  [":", "operator"],
  [",", "punctuation"],
]);

export const cssQuery: LanguageQuery = {
  nodeTypeCategory,
};
