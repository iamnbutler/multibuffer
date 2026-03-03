/**
 * Catppuccin Latte color theme for syntax highlighting.
 * Maps tree-sitter node types to CSS colors.
 */

const CATPPUCCIN_LATTE = {
  red: "#d20f39",
  green: "#40a02b",
  yellow: "#df8e1d",
  blue: "#1e66f5",
  purple: "#8839ef",
  pink: "#ea76cb",
  teal: "#179299",
  peach: "#fe640b",
  mauve: "#8839ef",
  gray: "#9ca0b0",
  fg: "#4c4f69",
  fg3: "#6c6f85",
} as const;

/** Broad highlight categories. */
const CATEGORY_COLORS: Record<string, string> = {
  keyword: CATPPUCCIN_LATTE.mauve,
  string: CATPPUCCIN_LATTE.green,
  number: CATPPUCCIN_LATTE.peach,
  comment: CATPPUCCIN_LATTE.gray,
  type: CATPPUCCIN_LATTE.yellow,
  function: CATPPUCCIN_LATTE.blue,
  property: CATPPUCCIN_LATTE.teal,
  operator: CATPPUCCIN_LATTE.teal,
  punctuation: CATPPUCCIN_LATTE.fg3,
  constant: CATPPUCCIN_LATTE.peach,
  variable_builtin: CATPPUCCIN_LATTE.red,
  default: CATPPUCCIN_LATTE.fg,
};

/**
 * Map a tree-sitter node type to a highlight category.
 * Tree-sitter TypeScript node types are quite granular;
 * this groups them into broad visual categories.
 */
function nodeTypeToCategory(nodeType: string): string {
  // Keywords
  if (
    nodeType === "const" ||
    nodeType === "let" ||
    nodeType === "var" ||
    nodeType === "function" ||
    nodeType === "return" ||
    nodeType === "if" ||
    nodeType === "else" ||
    nodeType === "for" ||
    nodeType === "while" ||
    nodeType === "do" ||
    nodeType === "switch" ||
    nodeType === "case" ||
    nodeType === "break" ||
    nodeType === "continue" ||
    nodeType === "throw" ||
    nodeType === "try" ||
    nodeType === "catch" ||
    nodeType === "finally" ||
    nodeType === "new" ||
    nodeType === "delete" ||
    nodeType === "typeof" ||
    nodeType === "instanceof" ||
    nodeType === "in" ||
    nodeType === "of" ||
    nodeType === "class" ||
    nodeType === "extends" ||
    nodeType === "implements" ||
    nodeType === "interface" ||
    nodeType === "enum" ||
    nodeType === "type" ||
    nodeType === "import" ||
    nodeType === "export" ||
    nodeType === "from" ||
    nodeType === "as" ||
    nodeType === "default" ||
    nodeType === "async" ||
    nodeType === "await" ||
    nodeType === "yield" ||
    nodeType === "void" ||
    nodeType === "readonly" ||
    nodeType === "declare" ||
    nodeType === "abstract" ||
    nodeType === "static" ||
    nodeType === "public" ||
    nodeType === "private" ||
    nodeType === "protected" ||
    nodeType === "override"
  ) {
    return "keyword";
  }

  // Strings
  if (
    nodeType === "string" ||
    nodeType === "string_fragment" ||
    nodeType === "template_string" ||
    nodeType === "template_literal_type" ||
    nodeType === "regex" ||
    nodeType === "regex_pattern"
  ) {
    return "string";
  }

  // String delimiters
  if (
    nodeType === '"' ||
    nodeType === "'" ||
    nodeType === "`" ||
    nodeType === "${" ||
    nodeType === "}"
  ) {
    return "string";
  }

  // Numbers
  if (nodeType === "number") {
    return "number";
  }

  // Comments
  if (nodeType === "comment" || nodeType === "line_comment" || nodeType === "block_comment") {
    return "comment";
  }

  // Types
  if (
    nodeType === "type_identifier" ||
    nodeType === "predefined_type" ||
    nodeType === "type_annotation"
  ) {
    return "type";
  }

  // Functions
  if (nodeType === "function_declaration" || nodeType === "method_definition") {
    return "function";
  }

  // Properties
  if (
    nodeType === "property_identifier" ||
    nodeType === "shorthand_property_identifier" ||
    nodeType === "shorthand_property_identifier_pattern"
  ) {
    return "property";
  }

  // Operators
  if (
    nodeType === "==" ||
    nodeType === "===" ||
    nodeType === "!=" ||
    nodeType === "!==" ||
    nodeType === ">" ||
    nodeType === "<" ||
    nodeType === ">=" ||
    nodeType === "<=" ||
    nodeType === "+" ||
    nodeType === "-" ||
    nodeType === "*" ||
    nodeType === "/" ||
    nodeType === "%" ||
    nodeType === "**" ||
    nodeType === "=" ||
    nodeType === "+=" ||
    nodeType === "-=" ||
    nodeType === "&&" ||
    nodeType === "||" ||
    nodeType === "!" ||
    nodeType === "??" ||
    nodeType === "?" ||
    nodeType === ":" ||
    nodeType === "=>" ||
    nodeType === "..." ||
    nodeType === "?." ||
    nodeType === "|" ||
    nodeType === "&"
  ) {
    return "operator";
  }

  // Punctuation
  if (
    nodeType === "(" ||
    nodeType === ")" ||
    nodeType === "[" ||
    nodeType === "]" ||
    nodeType === "{" ||
    nodeType === "}" ||
    nodeType === ";" ||
    nodeType === "," ||
    nodeType === "."
  ) {
    return "punctuation";
  }

  // Constants
  if (
    nodeType === "true" ||
    nodeType === "false" ||
    nodeType === "null" ||
    nodeType === "undefined"
  ) {
    return "constant";
  }

  // Built-in variables
  if (nodeType === "this" || nodeType === "super") {
    return "variable_builtin";
  }

  return "default";
}

/** Get the CSS color for a tree-sitter node type. */
export function colorForNodeType(nodeType: string): string {
  const category = nodeTypeToCategory(nodeType);
  return CATEGORY_COLORS[category] ?? CATEGORY_COLORS.default ?? CATPPUCCIN_LATTE.fg;
}
