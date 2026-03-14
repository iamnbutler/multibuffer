import type { Theme } from "./types.ts";

/**
 * Theme configuration for syntax highlighting.
 * Maps tree-sitter node types to CSS colors.
 *
 * Supports theming via CSS custom properties with Gruvbox dark fallbacks.
 *
 * CSS Variables for syntax highlighting:
 *   --syntax-keyword     - Keywords (const, let, function, if, etc.)
 *   --syntax-string      - String literals
 *   --syntax-number      - Numeric literals
 *   --syntax-comment     - Comments
 *   --syntax-type        - Type identifiers
 *   --syntax-function    - Function names
 *   --syntax-property    - Property identifiers
 *   --syntax-operator    - Operators (+, -, =, etc.)
 *   --syntax-punctuation - Punctuation (brackets, semicolons, etc.)
 *   --syntax-constant    - Constants (true, false, null)
 *   --syntax-variable-builtin - Built-in variables (this, super)
 *   --syntax-default     - Default text color
 *
 * CSS Variables for editor chrome:
 *   --editor-cursor       - Cursor color
 *   --editor-selection    - Selection background
 *   --editor-gutter       - Gutter text color
 *   --editor-header-bg    - Excerpt header background
 *   --editor-header-border - Excerpt header border
 *   --editor-header-text  - Excerpt header text
 *   --editor-line-bg      - Line background (default: transparent)
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

/** CSS variable names for each highlight category. */
const CATEGORY_CSS_VARS: Record<string, string> = {
  keyword: "--syntax-keyword",
  string: "--syntax-string",
  number: "--syntax-number",
  comment: "--syntax-comment",
  type: "--syntax-type",
  function: "--syntax-function",
  property: "--syntax-property",
  operator: "--syntax-operator",
  punctuation: "--syntax-punctuation",
  constant: "--syntax-constant",
  variable_builtin: "--syntax-variable-builtin",
  default: "--syntax-default",
};

/** Fallback colors (Gruvbox dark) for each highlight category. */
const CATEGORY_FALLBACKS: Record<string, string> = {
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

  // ── Markdown ────────────────────────────────────────────────────────
  // Based on Zed's markdown highlighting queries

  // Headings (title.markup)
  if (
    nodeType === "atx_heading" ||
    nodeType === "setext_heading" ||
    nodeType === "atx_h1_marker" ||
    nodeType === "atx_h2_marker" ||
    nodeType === "atx_h3_marker" ||
    nodeType === "atx_h4_marker" ||
    nodeType === "atx_h5_marker" ||
    nodeType === "atx_h6_marker" ||
    nodeType === "heading_content" ||
    nodeType === "thematic_break"
  ) {
    return "keyword";
  }

  // Code spans (text.literal.markup)
  if (nodeType === "code_span") {
    return "string";
  }

  // Code fence delimiters and info (punctuation.embedded.markup)
  if (
    nodeType === "fenced_code_block_delimiter" ||
    nodeType === "info_string" ||
    nodeType === "language"
  ) {
    return "comment";
  }

  // Link text (link_text.markup)
  if (
    nodeType === "inline_link" ||
    nodeType === "shortcut_link" ||
    nodeType === "collapsed_reference_link" ||
    nodeType === "full_reference_link" ||
    nodeType === "image" ||
    nodeType === "link_text" ||
    nodeType === "link_label" ||
    nodeType === "link_reference_definition"
  ) {
    return "function";
  }

  // Link URIs (link_uri.markup)
  if (
    nodeType === "link_destination" ||
    nodeType === "uri_autolink" ||
    nodeType === "email_autolink"
  ) {
    return "property";
  }

  // Emphasis (emphasis.markup)
  if (nodeType === "emphasis") {
    return "type";
  }

  // Strong emphasis (emphasis.strong.markup)
  if (nodeType === "strong_emphasis") {
    return "constant";
  }

  // Strikethrough
  if (nodeType === "strikethrough") {
    return "comment";
  }

  // List markers (punctuation.list_marker.markup)
  if (
    nodeType === "list_marker_minus" ||
    nodeType === "list_marker_plus" ||
    nodeType === "list_marker_star" ||
    nodeType === "list_marker_dot" ||
    nodeType === "list_marker_parenthesis" ||
    nodeType === "task_list_marker_checked" ||
    nodeType === "task_list_marker_unchecked"
  ) {
    return "operator";
  }

  // Block quote and table punctuation (punctuation.markup)
  if (
    nodeType === "block_quote_marker" ||
    nodeType === "pipe_table_delimiter_cell"
  ) {
    return "punctuation";
  }

  // HTML in markdown
  if (nodeType === "html_block" || nodeType === "html_tag") {
    return "variable_builtin";
  }

  // Front matter delimiters (yaml/toml)
  if (
    nodeType === "minus_metadata" ||
    nodeType === "plus_metadata"
  ) {
    return "comment";
  }

  // ── YAML ─────────────────────────────────────────────────────────────
  // Based on tree-sitter-yaml node types

  // YAML strings (keys and string values)
  if (
    nodeType === "string_scalar" ||
    nodeType === "double_quote_scalar" ||
    nodeType === "single_quote_scalar" ||
    nodeType === "block_scalar"
  ) {
    return "string";
  }

  // YAML numbers
  if (
    nodeType === "integer_scalar" ||
    nodeType === "float_scalar"
  ) {
    return "number";
  }

  // YAML booleans and null
  if (
    nodeType === "boolean_scalar" ||
    nodeType === "null_scalar"
  ) {
    return "constant";
  }

  // YAML anchors, aliases, tags (type-like)
  if (
    nodeType === "anchor_name" ||
    nodeType === "alias_name" ||
    nodeType === "tag"
  ) {
    return "type";
  }

  // YAML escape sequences
  if (nodeType === "escape_sequence") {
    return "operator";
  }

  // YAML comments
  if (nodeType === "comment" && nodeType === "comment") {
    return "comment";
  }

  return "default";
}

/** Get the CSS color for a tree-sitter node type. Uses CSS variables with Gruvbox fallbacks. */
export function colorForNodeType(nodeType: string): string {
  const category = nodeTypeToCategory(nodeType);
  const cssVar = CATEGORY_CSS_VARS[category] ?? CATEGORY_CSS_VARS.default;
  const fallback = CATEGORY_FALLBACKS[category] ?? CATEGORY_FALLBACKS.default ?? GRUVBOX.fg;
  return `var(${cssVar}, ${fallback})`;
}

/**
 * All available CSS variables for theming the editor.
 * Consumers can use this list to know which variables to set.
 */
export const THEME_CSS_VARIABLES = {
  // Editor chrome
  cursor: "--editor-cursor",
  selection: "--editor-selection",
  gutter: "--editor-gutter",
  headerBg: "--editor-header-bg",
  headerBorder: "--editor-header-border",
  headerText: "--editor-header-text",
  lineBg: "--editor-line-bg",
  // Syntax highlighting
  syntaxKeyword: "--syntax-keyword",
  syntaxString: "--syntax-string",
  syntaxNumber: "--syntax-number",
  syntaxComment: "--syntax-comment",
  syntaxType: "--syntax-type",
  syntaxFunction: "--syntax-function",
  syntaxProperty: "--syntax-property",
  syntaxOperator: "--syntax-operator",
  syntaxPunctuation: "--syntax-punctuation",
  syntaxConstant: "--syntax-constant",
  syntaxVariableBuiltin: "--syntax-variable-builtin",
  syntaxDefault: "--syntax-default",
} as const;

/**
 * Default Gruvbox dark theme values keyed by CSS variable name.
 * Consumers can use this as a reference or to apply the default theme programmatically
 * via direct CSS variable assignment.
 * @see GRUVBOX_DARK_THEME for the typed Theme object form.
 */
export const GRUVBOX_THEME = {
  // Editor chrome
  "--editor-cursor": "#ebdbb2",
  "--editor-selection": "rgba(214,153,46,0.25)",
  "--editor-gutter": "#665c54",
  "--editor-header-bg": "#3c3836",
  "--editor-header-border": "#504945",
  "--editor-header-text": "#a89984",
  "--editor-line-bg": "transparent",
  // Syntax highlighting
  "--syntax-keyword": GRUVBOX.red,
  "--syntax-string": GRUVBOX.green,
  "--syntax-number": GRUVBOX.purple,
  "--syntax-comment": GRUVBOX.gray,
  "--syntax-type": GRUVBOX.yellow,
  "--syntax-function": GRUVBOX.aqua,
  "--syntax-property": GRUVBOX.blue,
  "--syntax-operator": GRUVBOX.orange,
  "--syntax-punctuation": GRUVBOX.fg3,
  "--syntax-constant": GRUVBOX.purple,
  "--syntax-variable-builtin": GRUVBOX.orange,
  "--syntax-default": GRUVBOX.fg,
} as const;

/**
 * Gruvbox dark theme as a typed Theme object.
 * Pass to createDomRenderer or renderer.setTheme().
 */
export const GRUVBOX_DARK_THEME: Theme = {
  cursor: "#ebdbb2",
  selection: "rgba(214,153,46,0.25)",
  gutter: "#665c54",
  headerBg: "#3c3836",
  headerBorder: "#504945",
  headerText: "#a89984",
  lineBg: "transparent",
  syntaxKeyword: GRUVBOX.red,
  syntaxString: GRUVBOX.green,
  syntaxNumber: GRUVBOX.purple,
  syntaxComment: GRUVBOX.gray,
  syntaxType: GRUVBOX.yellow,
  syntaxFunction: GRUVBOX.aqua,
  syntaxProperty: GRUVBOX.blue,
  syntaxOperator: GRUVBOX.orange,
  syntaxPunctuation: GRUVBOX.fg3,
  syntaxConstant: GRUVBOX.purple,
  syntaxVariableBuiltin: GRUVBOX.orange,
  syntaxDefault: GRUVBOX.fg,
};

/**
 * GitHub-inspired light theme.
 * Pass to createDomRenderer or renderer.setTheme().
 */
export const LIGHT_THEME: Theme = {
  cursor: "#24292e",
  selection: "rgba(0,92,197,0.15)",
  gutter: "#959da5",
  headerBg: "#f6f8fa",
  headerBorder: "#e1e4e8",
  headerText: "#6a737d",
  lineBg: "transparent",
  syntaxKeyword: "#d73a49",
  syntaxString: "#032f62",
  syntaxNumber: "#005cc5",
  syntaxComment: "#6a737d",
  syntaxType: "#6f42c1",
  syntaxFunction: "#6f42c1",
  syntaxProperty: "#005cc5",
  syntaxOperator: "#d73a49",
  syntaxPunctuation: "#24292e",
  syntaxConstant: "#005cc5",
  syntaxVariableBuiltin: "#005cc5",
  syntaxDefault: "#24292e",
};

/**
 * Convert a Theme object to a CSS variable map (CSS var name → value).
 * Useful for bulk applying theme values via style.setProperty().
 */
export function themeToVars(theme: Partial<Theme>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of Object.keys(theme) as Array<keyof Theme>) {
    const cssVar = THEME_CSS_VARIABLES[key];
    const value = theme[key];
    if (value !== undefined) {
      result[cssVar] = value;
    }
  }
  return result;
}
