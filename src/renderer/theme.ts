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

  // ── Rust ────────────────────────────────────────────────────────────
  // Keywords
  ["fn", "keyword"], ["let", "keyword"], ["mut", "keyword"],
  ["pub", "keyword"], ["mod", "keyword"], ["use", "keyword"],
  ["struct", "keyword"], ["impl", "keyword"], ["trait", "keyword"],
  ["where", "keyword"], ["self", "keyword"], ["Self", "type"],
  ["crate", "keyword"], ["extern", "keyword"], ["unsafe", "keyword"],
  ["async", "keyword"], ["await", "keyword"], ["move", "keyword"],
  ["ref", "keyword"], ["match", "keyword"], ["loop", "keyword"],
  ["dyn", "keyword"], ["const", "keyword"], ["static", "keyword"],
  ["enum", "keyword"], ["union", "keyword"], ["type", "keyword"],
  ["as", "keyword"], ["impl", "keyword"], ["macro_rules!", "keyword"],
  // Types
  ["primitive_type", "type"], ["type_identifier", "type"],
  ["generic_type", "type"], ["scoped_type_identifier", "type"],
  // Strings and chars
  ["string_literal", "string"], ["char_literal", "string"],
  ["raw_string_literal", "string"],
  // Numbers
  ["integer_literal", "number"], ["float_literal", "number"],
  // Booleans
  ["boolean_literal", "constant"],
  // Lifetime
  ["lifetime", "type"],
  // Attributes
  ["attribute_item", "comment"], ["inner_attribute_item", "comment"],
  // Macros
  ["macro_invocation", "function"],
  ["identifier", "default"], ["field_identifier", "property"],
  ["scoped_identifier", "default"],

  // ── Go ──────────────────────────────────────────────────────────────
  // Keywords
  ["func", "keyword"], ["package", "keyword"], ["import", "keyword"],
  ["go", "keyword"], ["defer", "keyword"], ["chan", "keyword"],
  ["select", "keyword"], ["fallthrough", "keyword"], ["range", "keyword"],
  ["map", "keyword"], ["struct", "keyword"], ["interface", "keyword"],
  // Types
  ["type_identifier", "type"], ["qualified_type", "type"],
  ["pointer_type", "type"], ["slice_type", "type"], ["array_type", "type"],
  ["map_type", "type"], ["channel_type", "type"],
  // Strings
  ["raw_string_literal", "string"], ["interpreted_string_literal", "string"],
  ["rune_literal", "string"],
  // Numbers
  ["int_literal", "number"], ["float_literal", "number"],
  ["imaginary_literal", "number"],
  // Booleans and nil
  ["true", "constant"], ["false", "constant"], ["nil", "constant"],
  ["iota", "constant"],
  // Fields
  ["field_identifier", "property"],

  // ── Python ──────────────────────────────────────────────────────────
  // Keywords
  ["def", "keyword"], ["class", "keyword"], ["lambda", "keyword"],
  ["pass", "keyword"], ["nonlocal", "keyword"], ["global", "keyword"],
  ["with", "keyword"], ["as", "keyword"], ["from", "keyword"],
  ["import", "keyword"], ["assert", "keyword"], ["raise", "keyword"],
  ["except", "keyword"], ["finally", "keyword"], ["is", "keyword"],
  ["not", "keyword"], ["and", "keyword"], ["or", "keyword"],
  ["in", "keyword"], ["del", "keyword"], ["print", "keyword"],
  ["exec", "keyword"], ["async", "keyword"], ["await", "keyword"],
  // Identifiers (Python-specific node types use more specific names)
  ["identifier", "default"],
  // Strings
  ["string", "string"], ["concatenated_string", "string"],
  ["string_content", "string"], ["interpolation", "string"],
  // Numbers
  ["integer", "number"], ["float", "number"],
  // Booleans and None
  ["True", "constant"], ["False", "constant"], ["None", "constant"],
  // Decorators
  ["decorator", "function"],
  // Self
  ["self", "variable_builtin"],
  // Attribute
  ["attribute", "property"],

  // ── Ruby ────────────────────────────────────────────────────────────
  // Keywords
  ["def", "keyword"], ["end", "keyword"], ["class", "keyword"],
  ["module", "keyword"], ["begin", "keyword"], ["rescue", "keyword"],
  ["ensure", "keyword"], ["raise", "keyword"], ["yield", "keyword"],
  ["alias", "keyword"], ["undef", "keyword"], ["defined?", "keyword"],
  ["BEGIN", "keyword"], ["END", "keyword"], ["__FILE__", "constant"],
  ["__LINE__", "constant"], ["__ENCODING__", "constant"],
  // Strings
  ["string", "string"], ["subshell", "string"],
  ["heredoc_beginning", "string"], ["heredoc_end", "string"],
  ["heredoc_body", "string"], ["heredoc_content", "string"],
  ["string_content", "string"],
  // Symbols
  ["symbol", "constant"], ["simple_symbol", "constant"],
  ["hash_key_symbol", "constant"],
  // Numbers
  ["integer", "number"], ["float", "number"], ["rational", "number"],
  ["complex", "number"],
  // Booleans and nil
  ["true", "constant"], ["false", "constant"], ["nil", "constant"],
  // Instance/class variables
  ["instance_variable", "variable_builtin"],
  ["class_variable", "variable_builtin"],
  ["global_variable", "variable_builtin"],
  // Regex
  ["regex", "string"],

  // ── HTML ────────────────────────────────────────────────────────────
  // Tags
  ["tag_name", "keyword"], ["start_tag", "keyword"], ["end_tag", "keyword"],
  ["self_closing_tag", "keyword"],
  // Attributes
  ["attribute_name", "property"], ["attribute_value", "string"],
  ["quoted_attribute_value", "string"],
  // Text
  ["text", "default"], ["raw_text", "default"],
  // Special
  ["doctype", "comment"], ["comment", "comment"],
  ["erroneous_end_tag_name", "keyword"],

  // ── CSS ─────────────────────────────────────────────────────────────
  // Selectors
  ["tag_name", "keyword"], ["class_name", "type"],
  ["id_name", "constant"], ["attribute_name", "property"],
  ["pseudo_class_selector", "function"], ["pseudo_element_selector", "function"],
  // Properties
  ["property_name", "property"], ["feature_name", "property"],
  // Values
  ["plain_value", "default"], ["color_value", "constant"],
  ["integer_value", "number"], ["float_value", "number"],
  ["string_value", "string"], ["unit", "keyword"],
  // Functions
  ["function_name", "function"], ["call_expression", "function"],
  // At-rules
  ["at_keyword", "keyword"], ["keyword_query", "keyword"],
  // Important
  ["important", "keyword"],

  // ── JSON ────────────────────────────────────────────────────────────
  // Strings (keys and values)
  ["string", "string"], ["string_content", "string"],
  ["pair", "default"],
  // Numbers
  ["number", "number"],
  // Booleans and null
  ["true", "constant"], ["false", "constant"], ["null", "constant"],
  // Escape sequences
  ["escape_sequence", "operator"],

  // ── TOML ────────────────────────────────────────────────────────────
  // Keys
  ["bare_key", "property"], ["dotted_key", "property"],
  ["quoted_key", "property"],
  // Strings
  ["string", "string"], ["basic_string", "string"],
  ["literal_string", "string"], ["multiline_basic_string", "string"],
  ["multiline_literal_string", "string"],
  // Numbers
  ["integer", "number"], ["float", "number"],
  ["local_date", "number"], ["local_time", "number"],
  ["local_date_time", "number"], ["offset_date_time", "number"],
  // Booleans
  ["boolean", "constant"],
  // Tables
  ["table", "keyword"], ["table_array_element", "keyword"],

  // ── Bash / Shell ────────────────────────────────────────────────────
  // Commands
  ["command_name", "function"], ["function_definition", "function"],
  // Variables
  ["variable_name", "variable_builtin"], ["special_variable_name", "variable_builtin"],
  ["simple_expansion", "variable_builtin"], ["expansion", "variable_builtin"],
  // Strings
  ["string", "string"], ["raw_string", "string"],
  ["ansi_c_string", "string"], ["heredoc_body", "string"],
  ["string_content", "string"],
  // Numbers
  ["number", "number"],
  // Keywords
  ["if", "keyword"], ["then", "keyword"], ["else", "keyword"],
  ["elif", "keyword"], ["fi", "keyword"], ["case", "keyword"],
  ["esac", "keyword"], ["for", "keyword"], ["while", "keyword"],
  ["until", "keyword"], ["do", "keyword"], ["done", "keyword"],
  ["in", "keyword"], ["function", "keyword"],
  // Operators
  ["test_operator", "operator"], ["regex", "string"],
  // Comments
  ["comment", "comment"],

  // ── C / C++ ─────────────────────────────────────────────────────────
  // Keywords
  ["sizeof", "keyword"], ["typedef", "keyword"], ["struct", "keyword"],
  ["union", "keyword"], ["enum", "keyword"], ["extern", "keyword"],
  ["static", "keyword"], ["register", "keyword"], ["volatile", "keyword"],
  ["inline", "keyword"], ["restrict", "keyword"], ["_Atomic", "keyword"],
  ["_Bool", "keyword"], ["_Complex", "keyword"], ["_Imaginary", "keyword"],
  // C++ specific
  ["namespace", "keyword"], ["template", "keyword"], ["typename", "keyword"],
  ["virtual", "keyword"], ["explicit", "keyword"], ["friend", "keyword"],
  ["mutable", "keyword"], ["constexpr", "keyword"], ["consteval", "keyword"],
  ["constinit", "keyword"], ["concept", "keyword"], ["requires", "keyword"],
  ["co_await", "keyword"], ["co_return", "keyword"], ["co_yield", "keyword"],
  ["noexcept", "keyword"], ["nullptr", "constant"],
  // Types
  ["primitive_type", "type"], ["type_identifier", "type"],
  ["sized_type_specifier", "type"], ["type_qualifier", "keyword"],
  // Strings
  ["string_literal", "string"], ["char_literal", "string"],
  ["raw_string_literal", "string"], ["system_lib_string", "string"],
  // Numbers
  ["number_literal", "number"],
  // Preprocessor
  ["preproc_directive", "keyword"], ["preproc_include", "keyword"],
  ["preproc_def", "keyword"], ["preproc_ifdef", "keyword"],
  ["preproc_else", "keyword"], ["preproc_elif", "keyword"],
  ["preproc_if", "keyword"], ["preproc_defined", "keyword"],
  // Fields
  ["field_identifier", "property"],

  // ── Java ────────────────────────────────────────────────────────────
  // Keywords
  ["package", "keyword"], ["import", "keyword"], ["class", "keyword"],
  ["interface", "keyword"], ["extends", "keyword"], ["implements", "keyword"],
  ["public", "keyword"], ["private", "keyword"], ["protected", "keyword"],
  ["static", "keyword"], ["final", "keyword"], ["abstract", "keyword"],
  ["synchronized", "keyword"], ["volatile", "keyword"], ["transient", "keyword"],
  ["native", "keyword"], ["strictfp", "keyword"], ["throws", "keyword"],
  ["instanceof", "keyword"], ["assert", "keyword"],
  // Types
  ["type_identifier", "type"], ["generic_type", "type"],
  ["scoped_type_identifier", "type"], ["integral_type", "type"],
  ["floating_point_type", "type"], ["boolean_type", "type"],
  ["void_type", "type"],
  // Strings
  ["string_literal", "string"], ["character_literal", "string"],
  ["text_block", "string"],
  // Numbers
  ["decimal_integer_literal", "number"], ["hex_integer_literal", "number"],
  ["octal_integer_literal", "number"], ["binary_integer_literal", "number"],
  ["decimal_floating_point_literal", "number"], ["hex_floating_point_literal", "number"],
  // Booleans and null
  ["true", "constant"], ["false", "constant"], ["null_literal", "constant"],
  // Annotations
  ["annotation", "function"], ["marker_annotation", "function"],
  // This/super
  ["this", "variable_builtin"], ["super", "variable_builtin"],

  // ── Kotlin ──────────────────────────────────────────────────────────
  // Keywords
  ["fun", "keyword"], ["val", "keyword"], ["var", "keyword"],
  ["object", "keyword"], ["companion", "keyword"], ["data", "keyword"],
  ["sealed", "keyword"], ["inner", "keyword"], ["open", "keyword"],
  ["lateinit", "keyword"], ["by", "keyword"], ["where", "keyword"],
  ["suspend", "keyword"], ["inline", "keyword"], ["noinline", "keyword"],
  ["crossinline", "keyword"], ["reified", "keyword"], ["tailrec", "keyword"],
  ["operator", "keyword"], ["infix", "keyword"], ["external", "keyword"],
  ["annotation", "keyword"], ["actual", "keyword"], ["expect", "keyword"],
  // Types
  ["type_identifier", "type"], ["user_type", "type"],
  // Strings
  ["line_string_literal", "string"], ["multi_line_string_literal", "string"],
  ["character_literal", "string"],
  // Numbers
  ["integer_literal", "number"], ["long_literal", "number"],
  ["hex_literal", "number"], ["bin_literal", "number"],
  ["real_literal", "number"],
  // Booleans and null
  ["boolean_literal", "constant"], ["null", "constant"],
  // This/super
  ["this", "variable_builtin"], ["super", "variable_builtin"],

  // ── Swift ───────────────────────────────────────────────────────────
  // Keywords
  ["func", "keyword"], ["let", "keyword"], ["var", "keyword"],
  ["class", "keyword"], ["struct", "keyword"], ["enum", "keyword"],
  ["protocol", "keyword"], ["extension", "keyword"], ["typealias", "keyword"],
  ["import", "keyword"], ["init", "keyword"], ["deinit", "keyword"],
  ["get", "keyword"], ["set", "keyword"], ["willSet", "keyword"],
  ["didSet", "keyword"], ["subscript", "keyword"], ["static", "keyword"],
  ["class", "keyword"], ["final", "keyword"], ["mutating", "keyword"],
  ["nonmutating", "keyword"], ["lazy", "keyword"], ["weak", "keyword"],
  ["unowned", "keyword"], ["required", "keyword"], ["optional", "keyword"],
  ["indirect", "keyword"], ["infix", "keyword"], ["prefix", "keyword"],
  ["postfix", "keyword"], ["precedence", "keyword"], ["associativity", "keyword"],
  ["operator", "keyword"], ["async", "keyword"], ["await", "keyword"],
  ["actor", "keyword"], ["isolated", "keyword"], ["nonisolated", "keyword"],
  // Types
  ["type_identifier", "type"], ["simple_identifier", "default"],
  // Strings
  ["line_str_text", "string"], ["multi_line_string_literal", "string"],
  ["string_literal", "string"],
  // Numbers
  ["integer_literal", "number"], ["real_literal", "number"],
  // Booleans and nil
  ["boolean_literal", "constant"], ["nil", "constant"],
  // Self
  ["self", "variable_builtin"], ["Self", "type"],

  // ── Zig ─────────────────────────────────────────────────────────────
  // Keywords
  ["fn", "keyword"], ["const", "keyword"], ["var", "keyword"],
  ["pub", "keyword"], ["comptime", "keyword"], ["inline", "keyword"],
  ["noinline", "keyword"], ["extern", "keyword"], ["export", "keyword"],
  ["linksection", "keyword"], ["align", "keyword"], ["callconv", "keyword"],
  ["packed", "keyword"], ["struct", "keyword"], ["enum", "keyword"],
  ["union", "keyword"], ["opaque", "keyword"], ["error", "keyword"],
  ["orelse", "keyword"], ["catch", "keyword"], ["unreachable", "keyword"],
  ["nosuspend", "keyword"], ["noasync", "keyword"], ["suspend", "keyword"],
  ["resume", "keyword"], ["async", "keyword"], ["await", "keyword"],
  ["try", "keyword"], ["anyframe", "keyword"], ["anytype", "keyword"],
  ["threadlocal", "keyword"], ["test", "keyword"], ["usingnamespace", "keyword"],
  // Types
  ["identifier", "default"], ["builtin_type", "type"],
  // Strings
  ["string_literal", "string"], ["multiline_string_literal", "string"],
  ["char_literal", "string"],
  // Numbers
  ["integer_literal", "number"], ["float_literal", "number"],
  // Booleans and null
  ["true", "constant"], ["false", "constant"], ["null", "constant"],
  ["undefined", "constant"],

  // ── Lua ─────────────────────────────────────────────────────────────
  // Keywords
  ["function", "keyword"], ["local", "keyword"], ["end", "keyword"],
  ["do", "keyword"], ["then", "keyword"], ["elseif", "keyword"],
  ["repeat", "keyword"], ["until", "keyword"], ["goto", "keyword"],
  ["in", "keyword"], ["not", "keyword"], ["and", "keyword"], ["or", "keyword"],
  // Strings
  ["string", "string"],
  // Numbers
  ["number", "number"],
  // Booleans and nil
  ["true", "constant"], ["false", "constant"], ["nil", "constant"],
  // Self
  ["self", "variable_builtin"],

  // ── SQL ─────────────────────────────────────────────────────────────
  // Keywords
  ["select", "keyword"], ["SELECT", "keyword"],
  ["from", "keyword"], ["FROM", "keyword"],
  ["where", "keyword"], ["WHERE", "keyword"],
  ["insert", "keyword"], ["INSERT", "keyword"],
  ["update", "keyword"], ["UPDATE", "keyword"],
  ["delete", "keyword"], ["DELETE", "keyword"],
  ["create", "keyword"], ["CREATE", "keyword"],
  ["drop", "keyword"], ["DROP", "keyword"],
  ["alter", "keyword"], ["ALTER", "keyword"],
  ["table", "keyword"], ["TABLE", "keyword"],
  ["index", "keyword"], ["INDEX", "keyword"],
  ["join", "keyword"], ["JOIN", "keyword"],
  ["inner", "keyword"], ["INNER", "keyword"],
  ["outer", "keyword"], ["OUTER", "keyword"],
  ["left", "keyword"], ["LEFT", "keyword"],
  ["right", "keyword"], ["RIGHT", "keyword"],
  ["on", "keyword"], ["ON", "keyword"],
  ["group", "keyword"], ["GROUP", "keyword"],
  ["by", "keyword"], ["BY", "keyword"],
  ["order", "keyword"], ["ORDER", "keyword"],
  ["having", "keyword"], ["HAVING", "keyword"],
  ["limit", "keyword"], ["LIMIT", "keyword"],
  ["offset", "keyword"], ["OFFSET", "keyword"],
  ["union", "keyword"], ["UNION", "keyword"],
  ["all", "keyword"], ["ALL", "keyword"],
  ["distinct", "keyword"], ["DISTINCT", "keyword"],
  ["as", "keyword"], ["AS", "keyword"],
  ["and", "keyword"], ["AND", "keyword"],
  ["or", "keyword"], ["OR", "keyword"],
  ["not", "keyword"], ["NOT", "keyword"],
  ["null", "constant"], ["NULL", "constant"],
  ["true", "constant"], ["TRUE", "constant"],
  ["false", "constant"], ["FALSE", "constant"],
  // Types (SQL-specific type keywords)
  ["keyword_int", "type"], ["keyword_varchar", "type"],
  // Strings
  ["string", "string"], ["literal", "string"],
  // Numbers
  ["number", "number"],
  // Functions
  ["function_name", "function"],

  // ── Dockerfile ──────────────────────────────────────────────────────
  // Instructions
  ["instruction", "keyword"],
  ["from_instruction", "keyword"], ["FROM", "keyword"],
  ["run_instruction", "keyword"], ["RUN", "keyword"],
  ["cmd_instruction", "keyword"], ["CMD", "keyword"],
  ["label_instruction", "keyword"], ["LABEL", "keyword"],
  ["expose_instruction", "keyword"], ["EXPOSE", "keyword"],
  ["env_instruction", "keyword"], ["ENV", "keyword"],
  ["add_instruction", "keyword"], ["ADD", "keyword"],
  ["copy_instruction", "keyword"], ["COPY", "keyword"],
  ["entrypoint_instruction", "keyword"], ["ENTRYPOINT", "keyword"],
  ["volume_instruction", "keyword"], ["VOLUME", "keyword"],
  ["user_instruction", "keyword"], ["USER", "keyword"],
  ["workdir_instruction", "keyword"], ["WORKDIR", "keyword"],
  ["arg_instruction", "keyword"], ["ARG", "keyword"],
  ["onbuild_instruction", "keyword"], ["ONBUILD", "keyword"],
  ["stopsignal_instruction", "keyword"], ["STOPSIGNAL", "keyword"],
  ["healthcheck_instruction", "keyword"], ["HEALTHCHECK", "keyword"],
  ["shell_instruction", "keyword"], ["SHELL", "keyword"],
  // Values
  ["image_name", "type"], ["image_tag", "constant"],
  ["path", "string"], ["unquoted_string", "string"],
  // Variables
  ["expansion", "variable_builtin"], ["variable", "variable_builtin"],
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
