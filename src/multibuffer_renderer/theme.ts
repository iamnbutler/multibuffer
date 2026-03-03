/**
 * One Dark color theme for syntax highlighting.
 * Maps tree-sitter node types to CSS colors.
 */

const ONE_DARK = {
  red: "#e06c75",
  green: "#98c379",
  yellow: "#e5c07b",
  blue: "#61afef",
  purple: "#c678dd",
  cyan: "#56b6c2",
  orange: "#d19a66",
  gray: "#5c6370",
  fg: "#abb2bf",
  fg3: "#828997",
} as const;

/** Broad highlight categories. */
const CATEGORY_COLORS: Record<string, string> = {
  keyword: ONE_DARK.purple,
  string: ONE_DARK.green,
  number: ONE_DARK.orange,
  comment: ONE_DARK.gray,
  type: ONE_DARK.yellow,
  function: ONE_DARK.blue,
  property: ONE_DARK.red,
  operator: ONE_DARK.cyan,
  punctuation: ONE_DARK.fg3,
  constant: ONE_DARK.orange,
  variable_builtin: ONE_DARK.red,
  default: ONE_DARK.fg,
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
  return CATEGORY_COLORS[category] ?? CATEGORY_COLORS.default ?? ONE_DARK.fg;
}
