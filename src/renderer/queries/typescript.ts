/**
 * Tree-sitter node type → highlight category map for TypeScript and JavaScript.
 *
 * Covers the granular node type names produced by tree-sitter-typescript.
 * Each entry maps a specific node type to a broad semantic category that
 * is then coloured by the theme layer.
 */
export const TYPESCRIPT_NODE_CATEGORIES: ReadonlyMap<string, string> = new Map([
  // Keywords
  ["const", "keyword"], ["let", "keyword"], ["var", "keyword"],
  ["function", "keyword"], ["return", "keyword"], ["if", "keyword"],
  ["else", "keyword"], ["for", "keyword"], ["while", "keyword"],
  ["do", "keyword"], ["switch", "keyword"], ["case", "keyword"],
  ["break", "keyword"], ["continue", "keyword"], ["throw", "keyword"],
  ["try", "keyword"], ["catch", "keyword"], ["finally", "keyword"],
  ["new", "keyword"], ["delete", "keyword"], ["typeof", "keyword"],
  ["instanceof", "keyword"], ["in", "keyword"], ["of", "keyword"],
  ["class", "keyword"], ["extends", "keyword"], ["implements", "keyword"],
  ["interface", "keyword"], ["enum", "keyword"], ["type", "keyword"],
  ["import", "keyword"], ["export", "keyword"], ["from", "keyword"],
  ["as", "keyword"], ["default", "keyword"], ["async", "keyword"],
  ["await", "keyword"], ["yield", "keyword"], ["void", "keyword"],
  ["readonly", "keyword"], ["declare", "keyword"], ["abstract", "keyword"],
  ["static", "keyword"], ["public", "keyword"], ["private", "keyword"],
  ["protected", "keyword"], ["override", "keyword"],
  // Strings (and string delimiters / template literal tokens)
  ["string", "string"], ["string_fragment", "string"],
  ["template_string", "string"], ["template_literal_type", "string"],
  ["regex", "string"], ["regex_pattern", "string"],
  ['"', "string"], ["'", "string"], ["`", "string"],
  ["${", "string"], ["}", "string"],
  // Numbers
  ["number", "number"],
  // Comments
  ["comment", "comment"], ["line_comment", "comment"], ["block_comment", "comment"],
  // Types
  ["type_identifier", "type"], ["predefined_type", "type"], ["type_annotation", "type"],
  // Functions
  ["function_declaration", "function"], ["method_definition", "function"],
  // Properties
  ["property_identifier", "property"],
  ["shorthand_property_identifier", "property"],
  ["shorthand_property_identifier_pattern", "property"],
  // Operators
  ["==", "operator"], ["===", "operator"], ["!=", "operator"], ["!==", "operator"],
  [">", "operator"], ["<", "operator"], [">=", "operator"], ["<=", "operator"],
  ["+", "operator"], ["-", "operator"], ["*", "operator"], ["/", "operator"],
  ["%", "operator"], ["**", "operator"], ["=", "operator"],
  ["+=", "operator"], ["-=", "operator"], ["&&", "operator"], ["||", "operator"],
  ["!", "operator"], ["??", "operator"], ["?", "operator"], [":", "operator"],
  ["=>", "operator"], ["...", "operator"], ["?.", "operator"],
  ["|", "operator"], ["&", "operator"],
  // Punctuation
  ["(", "punctuation"], [")", "punctuation"], ["[", "punctuation"], ["]", "punctuation"],
  ["{", "punctuation"], [";", "punctuation"], [",", "punctuation"], [".", "punctuation"],
  // Constants
  ["true", "constant"], ["false", "constant"], ["null", "constant"], ["undefined", "constant"],
  // Built-in variables
  ["this", "variable_builtin"], ["super", "variable_builtin"],
]);
