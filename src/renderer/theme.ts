import { nodeTypeToCategory } from "./queries/index.ts";
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
  "--editor-gutter": GRUVBOX.gray,
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
  gutter: GRUVBOX.gray,
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
  // biome-ignore lint/plugin/no-type-assertion: expect: Object.keys returns string[] but we know keys are keyof Theme
  for (const key of Object.keys(theme) as Array<keyof Theme>) {
    const cssVar = THEME_CSS_VARIABLES[key];
    const value = theme[key];
    if (value !== undefined) {
      result[cssVar] = value;
    }
  }
  return result;
}
