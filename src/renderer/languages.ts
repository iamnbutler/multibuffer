/**
 * Language detection and configuration for syntax highlighting.
 *
 * Maps file extensions to language IDs and provides metadata about
 * supported languages for tree-sitter grammar loading.
 */

/** Supported language identifiers. */
export type LanguageId =
  | "typescript"
  | "tsx"
  | "javascript"
  | "jsx"
  | "rust"
  | "go"
  | "python"
  | "ruby"
  | "html"
  | "css"
  | "json"
  | "yaml"
  | "toml"
  | "bash"
  | "markdown"
  | "c"
  | "cpp"
  | "java"
  | "swift"
  | "kotlin"
  | "zig"
  | "lua"
  | "sql"
  | "dockerfile"
  | "plaintext";

/**
 * Map of file extensions to language IDs.
 * Extensions are lowercase without the leading dot.
 */
const EXTENSION_TO_LANGUAGE: ReadonlyMap<string, LanguageId> = new Map([
  // TypeScript / JavaScript
  ["ts", "typescript"],
  ["tsx", "tsx"],
  ["mts", "typescript"],
  ["cts", "typescript"],
  ["js", "javascript"],
  ["jsx", "jsx"],
  ["mjs", "javascript"],
  ["cjs", "javascript"],

  // Rust
  ["rs", "rust"],

  // Go
  ["go", "go"],

  // Python
  ["py", "python"],
  ["pyi", "python"],
  ["pyw", "python"],

  // Ruby
  ["rb", "ruby"],
  ["rake", "ruby"],
  ["gemspec", "ruby"],

  // Web
  ["html", "html"],
  ["htm", "html"],
  ["xhtml", "html"],
  ["css", "css"],
  ["scss", "css"],
  ["sass", "css"],

  // Data formats
  ["json", "json"],
  ["jsonc", "json"],
  ["yaml", "yaml"],
  ["yml", "yaml"],
  ["toml", "toml"],

  // Shell
  ["sh", "bash"],
  ["bash", "bash"],
  ["zsh", "bash"],
  ["fish", "bash"],

  // Markdown
  ["md", "markdown"],
  ["mdx", "markdown"],
  ["markdown", "markdown"],

  // C / C++
  ["c", "c"],
  ["h", "c"],
  ["cc", "cpp"],
  ["cpp", "cpp"],
  ["cxx", "cpp"],
  ["hpp", "cpp"],
  ["hxx", "cpp"],

  // Java
  ["java", "java"],

  // Swift
  ["swift", "swift"],

  // Kotlin
  ["kt", "kotlin"],
  ["kts", "kotlin"],

  // Zig
  ["zig", "zig"],

  // Lua
  ["lua", "lua"],

  // SQL
  ["sql", "sql"],

  // Docker
  ["dockerfile", "dockerfile"],
]);

/**
 * Map of special filenames (case-insensitive) to language IDs.
 */
const FILENAME_TO_LANGUAGE: ReadonlyMap<string, LanguageId> = new Map([
  ["dockerfile", "dockerfile"],
  ["makefile", "bash"],
  ["gemfile", "ruby"],
  ["rakefile", "ruby"],
  ["cmakelists.txt", "bash"],
  [".bashrc", "bash"],
  [".zshrc", "bash"],
  [".profile", "bash"],
  [".bash_profile", "bash"],
  [".gitignore", "plaintext"],
  [".env", "bash"],
]);

/**
 * Detect language ID from a file path or filename.
 *
 * Detection order:
 * 1. Special filename matches (Dockerfile, Makefile, etc.)
 * 2. File extension
 * 3. Falls back to "plaintext" if no match
 *
 * @param path - File path or filename (e.g., "src/main.rs", "Dockerfile")
 * @returns The detected language ID
 *
 * @example
 * ```ts
 * detectLanguage("src/lib.rs")      // "rust"
 * detectLanguage("package.json")    // "json"
 * detectLanguage("Dockerfile")      // "dockerfile"
 * detectLanguage("unknown.xyz")     // "plaintext"
 * ```
 */
export function detectLanguage(path: string): LanguageId {
  // Extract filename from path
  const filename = path.split("/").pop() ?? path;
  const lowerFilename = filename.toLowerCase();

  // Check special filenames first
  const filenameMatch = FILENAME_TO_LANGUAGE.get(lowerFilename);
  if (filenameMatch) {
    return filenameMatch;
  }

  // Extract and check extension
  const lastDot = filename.lastIndexOf(".");
  if (lastDot !== -1) {
    const ext = filename.slice(lastDot + 1).toLowerCase();
    const extMatch = EXTENSION_TO_LANGUAGE.get(ext);
    if (extMatch) {
      return extMatch;
    }
  }

  return "plaintext";
}

/**
 * Check if a language ID has tree-sitter grammar support.
 * "plaintext" is always unsupported (no syntax highlighting).
 */
export function isLanguageSupported(languageId: LanguageId): boolean {
  return languageId !== "plaintext";
}

/**
 * Get the canonical tree-sitter grammar name for a language ID.
 * Some languages share grammars (e.g., tsx uses typescript grammar with TSX dialect).
 *
 * @returns The grammar name, or null if the language has no grammar
 */
export function getGrammarName(languageId: LanguageId): string | null {
  switch (languageId) {
    case "typescript":
    case "tsx":
      return "typescript";
    case "javascript":
    case "jsx":
      return "javascript";
    case "plaintext":
      return null;
    default:
      return languageId;
  }
}

/**
 * Configuration for loading language grammars.
 * Used by the multi-language highlighter.
 */
export interface LanguageConfig {
  /** Language identifier */
  id: LanguageId;
  /** URL or path to the tree-sitter WASM grammar file */
  wasmUrl: string;
}

/**
 * Default grammar URLs using CDN paths.
 * Consumers can override these when initializing the highlighter.
 */
export const DEFAULT_GRAMMAR_URLS: Partial<Record<LanguageId, string>> = {
  // These are example paths - consumers should provide their own URLs
  // typescript: "/grammars/tree-sitter-typescript.wasm",
  // javascript: "/grammars/tree-sitter-javascript.wasm",
  // rust: "/grammars/tree-sitter-rust.wasm",
  // etc.
};
