/**
 * Language detection from file paths and extensions.
 *
 * Maps file extensions and special filenames to language identifiers
 * used by the syntax highlighting system.
 */

/** Map of file extensions (without dot) to language IDs. */
const EXTENSION_MAP: ReadonlyMap<string, string> = new Map([
  // TypeScript / JavaScript
  ["ts", "typescript"],
  ["tsx", "tsx"],
  ["js", "javascript"],
  ["jsx", "jsx"],
  ["mts", "typescript"],
  ["cts", "typescript"],
  ["mjs", "javascript"],
  ["cjs", "javascript"],

  // Systems languages
  ["rs", "rust"],
  ["go", "go"],
  ["c", "c"],
  ["h", "c"],
  ["cc", "cpp"],
  ["cpp", "cpp"],
  ["cxx", "cpp"],
  ["hpp", "cpp"],
  ["hxx", "cpp"],
  ["zig", "zig"],

  // Scripting languages
  ["py", "python"],
  ["pyi", "python"],
  ["rb", "ruby"],
  ["lua", "lua"],
  ["sh", "bash"],
  ["bash", "bash"],
  ["zsh", "bash"],
  ["fish", "bash"],

  // JVM languages
  ["java", "java"],
  ["kt", "kotlin"],
  ["kts", "kotlin"],
  ["swift", "swift"],

  // Web
  ["html", "html"],
  ["htm", "html"],
  ["css", "css"],
  ["scss", "css"],

  // Data formats
  ["json", "json"],
  ["jsonc", "json"],
  ["yaml", "yaml"],
  ["yml", "yaml"],
  ["toml", "toml"],
  ["xml", "html"],

  // Markup
  ["md", "markdown"],
  ["mdx", "markdown"],
  ["markdown", "markdown"],

  // Other
  ["sql", "sql"],
  ["dockerfile", "dockerfile"],
]);

/** Map of exact filenames (lowercased) to language IDs. */
const FILENAME_MAP: ReadonlyMap<string, string> = new Map([
  ["dockerfile", "dockerfile"],
  ["makefile", "bash"],
  ["rakefile", "ruby"],
  ["gemfile", "ruby"],
  [".bashrc", "bash"],
  [".bash_profile", "bash"],
  [".zshrc", "bash"],
  [".profile", "bash"],
  [".gitignore", "bash"],
  [".env", "bash"],
  ["justfile", "bash"],
]);

/**
 * Detect language from a file path or filename.
 *
 * Checks exact filename matches first, then falls back to extension matching.
 * Returns `null` if the language cannot be determined.
 *
 * @param filePath - Full file path or just a filename (e.g., "src/main.rs" or "Dockerfile")
 * @returns Language identifier (e.g., "rust", "python") or null
 *
 * @example
 * ```ts
 * detectLanguage("src/main.rs");       // "rust"
 * detectLanguage("app.py");            // "python"
 * detectLanguage("Dockerfile");        // "dockerfile"
 * detectLanguage("styles.css");        // "css"
 * detectLanguage("unknown.xyz");       // null
 * ```
 */
export function detectLanguage(filePath: string): string | null {
  // Extract filename from path
  const lastSlash = filePath.lastIndexOf("/");
  const filename = lastSlash >= 0 ? filePath.slice(lastSlash + 1) : filePath;
  const lowerFilename = filename.toLowerCase();

  // Check exact filename match
  const filenameMatch = FILENAME_MAP.get(lowerFilename);
  if (filenameMatch) return filenameMatch;

  // Check extension
  const lastDot = filename.lastIndexOf(".");
  if (lastDot >= 0) {
    const ext = filename.slice(lastDot + 1).toLowerCase();
    const extMatch = EXTENSION_MAP.get(ext);
    if (extMatch) return extMatch;
  }

  return null;
}

/**
 * Get all supported file extensions.
 * Useful for consumers to know which extensions are recognized.
 */
export function getSupportedExtensions(): readonly string[] {
  return Array.from(EXTENSION_MAP.keys());
}

/**
 * Get all supported language IDs.
 * Returns unique language identifiers that can be detected.
 */
export function getSupportedLanguages(): readonly string[] {
  return Array.from(new Set(EXTENSION_MAP.values()));
}
