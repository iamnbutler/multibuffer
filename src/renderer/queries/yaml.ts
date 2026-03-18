/**
 * Tree-sitter node type → highlight category map for YAML.
 *
 * Based on tree-sitter-yaml node types.
 * Each entry maps a specific node type to a broad semantic category that
 * is then coloured by the theme layer.
 */
export const YAML_NODE_CATEGORIES: ReadonlyMap<string, string> = new Map([
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
