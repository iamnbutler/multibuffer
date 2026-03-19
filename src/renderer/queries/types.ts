/**
 * Types for language-specific syntax highlighting queries.
 *
 * Each language module exports a LanguageQuery containing:
 * - nodeTypeCategory: Maps tree-sitter node types to highlight categories
 * - styledParents: Node types that propagate styling to children (optional)
 * - skipChildren: Node types whose children should not be highlighted (optional)
 */

/** Highlight categories that map to CSS variables (--syntax-*). */
export type HighlightCategory =
  | "keyword"
  | "string"
  | "number"
  | "comment"
  | "type"
  | "function"
  | "property"
  | "operator"
  | "punctuation"
  | "constant"
  | "variable_builtin"
  | "default";

/**
 * Language-specific query data for syntax highlighting.
 */
export interface LanguageQuery {
  /** Maps tree-sitter node type strings to highlight categories. */
  readonly nodeTypeCategory: ReadonlyMap<string, HighlightCategory>;

  /**
   * Node types that should propagate their styling to all children.
   * Used for nodes like headings and emphasis in Markdown.
   */
  readonly styledParents?: ReadonlySet<string>;

  /**
   * Node types whose children should not be highlighted separately.
   * Used for code blocks where content is handled by injection or shown as-is.
   */
  readonly skipChildren?: ReadonlySet<string>;
}
