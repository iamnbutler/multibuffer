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
 * Flat map from tree-sitter node type → highlight category.
 * Replaces a linear if-else chain with an O(1) Map lookup.
 * Tree-sitter TypeScript node types are quite granular;
 * this groups them into broad visual categories.
 *
 * Note: "}" maps to "string" (template literal close `${...}`) rather than
 * "punctuation", matching tree-sitter's token representation.
 */
const NODE_TYPE_CATEGORY: ReadonlyMap<string, string> = new Map([
  // ── TypeScript / JavaScript ──────────────────────────────────────────
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

  // ── Markdown ─────────────────────────────────────────────────────────
  // Based on Zed's markdown highlighting queries
  // Headings (title.markup)
  ["atx_heading", "keyword"], ["setext_heading", "keyword"],
  ["atx_h1_marker", "keyword"], ["atx_h2_marker", "keyword"],
  ["atx_h3_marker", "keyword"], ["atx_h4_marker", "keyword"],
  ["atx_h5_marker", "keyword"], ["atx_h6_marker", "keyword"],
  ["heading_content", "keyword"], ["thematic_break", "keyword"],
  // Code (text.literal.markup / punctuation.embedded.markup)
  ["code_span", "string"],
  ["fenced_code_block_delimiter", "comment"], ["info_string", "comment"], ["language", "comment"],
  // Link text (link_text.markup)
  ["inline_link", "function"], ["shortcut_link", "function"],
  ["collapsed_reference_link", "function"], ["full_reference_link", "function"],
  ["image", "function"], ["link_text", "function"],
  ["link_label", "function"], ["link_reference_definition", "function"],
  // Link URIs (link_uri.markup)
  ["link_destination", "property"], ["uri_autolink", "property"], ["email_autolink", "property"],
  // Emphasis
  ["emphasis", "type"], ["strong_emphasis", "constant"], ["strikethrough", "comment"],
  // List markers (punctuation.list_marker.markup)
  ["list_marker_minus", "operator"], ["list_marker_plus", "operator"],
  ["list_marker_star", "operator"], ["list_marker_dot", "operator"],
  ["list_marker_parenthesis", "operator"],
  ["task_list_marker_checked", "operator"], ["task_list_marker_unchecked", "operator"],
  // Block quote and table (punctuation.markup)
  ["block_quote_marker", "punctuation"], ["pipe_table_delimiter_cell", "punctuation"],
  // HTML in markdown
  ["html_block", "variable_builtin"], ["html_tag", "variable_builtin"],
  // Front matter delimiters (yaml/toml)
  ["minus_metadata", "comment"], ["plus_metadata", "comment"],

  // ── YAML ─────────────────────────────────────────────────────────────
  // Based on tree-sitter-yaml node types
  // Strings
  ["string_scalar", "string"], ["double_quote_scalar", "string"],
  ["single_quote_scalar", "string"], ["block_scalar", "string"],
  // Numbers
  ["integer_scalar", "number"], ["float_scalar", "number"],
  // Booleans and null
  ["boolean_scalar", "constant"], ["null_scalar", "constant"],
  // Anchors, aliases, tags (type-like)
  ["anchor_name", "type"], ["alias_name", "type"], ["tag", "type"],
  // Escape sequences
  ["escape_sequence", "operator"],
]);

function nodeTypeToCategory(nodeType: string): string {
  return NODE_TYPE_CATEGORY.get(nodeType) ?? "default";
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
 * Default Gruvbox dark theme values. Consumers can use this as a reference
 * or to apply the default theme programmatically.
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
