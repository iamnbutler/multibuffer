/**
 * Tree-sitter node type → highlight category map for Markdown.
 *
 * Based on Zed's markdown highlighting queries and tree-sitter-markdown node types.
 * Each entry maps a specific node type to a broad semantic category that
 * is then coloured by the theme layer.
 */
export const MARKDOWN_NODE_CATEGORIES: ReadonlyMap<string, string> = new Map([
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
]);
