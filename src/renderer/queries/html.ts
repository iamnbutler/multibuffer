/**
 * HTML syntax highlighting queries.
 *
 * Maps tree-sitter-html node types to highlight categories.
 */

import type { HighlightCategory, LanguageQuery } from "./types.ts";

const nodeTypeCategory: ReadonlyMap<string, HighlightCategory> = new Map([
  // Tags
  ["tag_name", "keyword"],
  ["erroneous_end_tag_name", "keyword"],

  // Attributes
  ["attribute_name", "property"],
  ["attribute_value", "string"],
  ["quoted_attribute_value", "string"],

  // Strings
  ["\"", "string"],
  ["'", "string"],

  // Comments
  ["comment", "comment"],

  // Doctype
  ["doctype", "keyword"],

  // Entity references
  ["entity", "constant"],

  // Punctuation
  ["<", "punctuation"],
  [">", "punctuation"],
  ["</", "punctuation"],
  ["/>", "punctuation"],
  ["=", "operator"],
]);

export const htmlQuery: LanguageQuery = {
  nodeTypeCategory,
};
