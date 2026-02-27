/**
 * Gruvbox dark color theme for syntax highlighting.
 * Maps tree-sitter node types to CSS colors.
 */

const GRUVBOX = {
  red: "#fb4934",
  green: "#b8bb26",
  yellow: "#fabd2f",
  blue: "#83a598",
  purple: "#d3869b",
  aqua: "#8ec07c",
  orange: "#fe8019",
  gray: "#928374",
  fg: "#ebdbb2",
  fg3: "#a89984",
} as const;

/** Broad highlight categories. */
const CATEGORY_COLORS: Record<string, string> = {
  keyword: GRUVBOX.red,
  string: GRUVBOX.green,
  number: GRUVBOX.purple,
  comment: GRUVBOX.gray,
  type: GRUVBOX.yellow,
  function: GRUVBOX.aqua,
  property: GRUVBOX.blue,
  operator: GRUVBOX.orange,
  punctuation: GRUVBOX.fg3,
  constant: GRUVBOX.purple,
  variable_builtin: GRUVBOX.orange,
  default: GRUVBOX.fg,
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
  return CATEGORY_COLORS[category] ?? CATEGORY_COLORS.default ?? GRUVBOX.fg;
}
