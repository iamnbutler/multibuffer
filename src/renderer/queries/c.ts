/**
 * C/C++ syntax highlighting queries.
 *
 * Maps tree-sitter-c/cpp node types to highlight categories.
 * C and C++ share most node types, so a single query covers both.
 */

import type { HighlightCategory, LanguageQuery } from "./types.ts";

const nodeTypeCategory: ReadonlyMap<string, HighlightCategory> = new Map([
  // Keywords
  ["if", "keyword"],
  ["else", "keyword"],
  ["for", "keyword"],
  ["while", "keyword"],
  ["do", "keyword"],
  ["switch", "keyword"],
  ["case", "keyword"],
  ["default", "keyword"],
  ["break", "keyword"],
  ["continue", "keyword"],
  ["return", "keyword"],
  ["goto", "keyword"],
  ["typedef", "keyword"],
  ["struct", "keyword"],
  ["union", "keyword"],
  ["enum", "keyword"],
  ["extern", "keyword"],
  ["static", "keyword"],
  ["const", "keyword"],
  ["volatile", "keyword"],
  ["inline", "keyword"],
  ["sizeof", "keyword"],
  ["register", "keyword"],
  ["auto", "keyword"],
  // C++ specific
  ["class", "keyword"],
  ["namespace", "keyword"],
  ["template", "keyword"],
  ["typename", "keyword"],
  ["public", "keyword"],
  ["private", "keyword"],
  ["protected", "keyword"],
  ["virtual", "keyword"],
  ["override", "keyword"],
  ["new", "keyword"],
  ["delete", "keyword"],
  ["using", "keyword"],
  ["try", "keyword"],
  ["catch", "keyword"],
  ["throw", "keyword"],
  ["constexpr", "keyword"],
  ["noexcept", "keyword"],

  // Strings
  ["string_literal", "string"],
  ["string_content", "string"],
  ["char_literal", "string"],
  ["system_lib_string", "string"],
  ["escape_sequence", "string"],

  // Numbers
  ["number_literal", "number"],

  // Comments
  ["comment", "comment"],

  // Types
  ["type_identifier", "type"],
  ["primitive_type", "type"],
  ["sized_type_specifier", "type"],

  // Functions
  ["function_declarator", "function"],

  // Properties / fields
  ["field_identifier", "property"],

  // Constants
  ["true", "constant"],
  ["false", "constant"],
  ["null", "constant"],
  ["nullptr", "constant"],

  // Built-in variables
  ["this", "variable_builtin"],

  // Preprocessor
  ["#include", "keyword"],
  ["#define", "keyword"],
  ["#ifdef", "keyword"],
  ["#ifndef", "keyword"],
  ["#endif", "keyword"],
  ["#if", "keyword"],
  ["#else", "keyword"],
  ["#elif", "keyword"],
  ["preproc_directive", "keyword"],

  // Operators
  ["->", "operator"],
  ["::", "operator"],
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
]);

export const cQuery: LanguageQuery = {
  nodeTypeCategory,
};
