/**
 * Tests for MultiLanguageHighlighter - multi-language syntax highlighting
 * with tree-sitter.
 */

import { beforeAll, describe, expect, it } from "bun:test";
import * as path from "node:path";
import { MultiLanguageHighlighter } from "../../src/renderer/highlighter.ts";

const WASM_DIR = path.join(import.meta.dir, "../../playground/wasm");

const TYPESCRIPT_SOURCE = `const x: number = 42;
function greet(name: string): string {
  return "hello " + name;
}
`;

const YAML_SOURCE = `name: multibuffer
version: 1.0.0
features:
  - syntax highlighting
  - multi-language
enabled: true
count: 42
`;

const MARKDOWN_SOURCE = `# Heading

Some **bold** and *italic* text.

\`\`\`typescript
const x = 1;
\`\`\`
`;

describe("MultiLanguageHighlighter", () => {
  let highlighter: MultiLanguageHighlighter;

  beforeAll(async () => {
    highlighter = new MultiLanguageHighlighter();
    await highlighter.init({
      treeSitterWasmUrl: path.join(WASM_DIR, "tree-sitter.wasm"),
      languages: {
        typescript: path.join(WASM_DIR, "tree-sitter-typescript.wasm"),
        yaml: path.join(WASM_DIR, "tree-sitter-yaml.wasm"),
        markdown: path.join(WASM_DIR, "tree-sitter-markdown.wasm"),
      },
    });
  });

  describe("initialization", () => {
    it("should be ready after init", () => {
      expect(highlighter.ready).toBe(true);
    });

    it("should have loaded configured languages", () => {
      expect(highlighter.hasLanguage("typescript")).toBe(true);
      expect(highlighter.hasLanguage("yaml")).toBe(true);
      expect(highlighter.hasLanguage("markdown")).toBe(true);
    });

    it("should not have unconfigured languages", () => {
      expect(highlighter.hasLanguage("rust")).toBe(false);
      expect(highlighter.hasLanguage("python")).toBe(false);
    });

    it("should return loaded languages set", () => {
      const loaded = highlighter.loadedLanguages;
      expect(loaded.has("typescript")).toBe(true);
      expect(loaded.has("yaml")).toBe(true);
      expect(loaded.has("markdown")).toBe(true);
      expect(loaded.size).toBe(3);
    });
  });

  describe("parseBuffer with explicit language", () => {
    it("should parse TypeScript with explicit language", () => {
      highlighter.parseBuffer("test-ts", TYPESCRIPT_SOURCE, undefined, "typescript");
      const tokens = highlighter.getLineTokens("test-ts", 0);
      expect(tokens.length).toBeGreaterThan(0);
      // First token should be "const" keyword
      expect(tokens[0]?.startColumn).toBe(0);
      expect(tokens[0]?.color).toContain("var(--syntax-keyword");
    });

    it("should parse YAML with explicit language", () => {
      highlighter.parseBuffer("test-yaml", YAML_SOURCE, undefined, "yaml");
      const tokens = highlighter.getLineTokens("test-yaml", 0);
      expect(tokens.length).toBeGreaterThan(0);
    });

    it("should parse Markdown with explicit language", () => {
      highlighter.parseBuffer("test-md", MARKDOWN_SOURCE, undefined, "markdown");
      const tokens = highlighter.getLineTokens("test-md", 0);
      expect(tokens.length).toBeGreaterThan(0);
      // First line is heading, should have keyword color
      expect(tokens[0]?.color).toContain("var(--syntax-keyword");
    });
  });

  describe("parseBufferWithPath (auto-detection)", () => {
    it("should auto-detect TypeScript from .ts extension", () => {
      highlighter.parseBufferWithPath("src/app.ts", TYPESCRIPT_SOURCE);
      const tokens = highlighter.getLineTokens("src/app.ts", 0);
      expect(tokens.length).toBeGreaterThan(0);
      expect(tokens[0]?.color).toContain("var(--syntax-keyword");
    });

    it("should auto-detect YAML from .yaml extension", () => {
      highlighter.parseBufferWithPath("config.yaml", YAML_SOURCE);
      const tokens = highlighter.getLineTokens("config.yaml", 0);
      expect(tokens.length).toBeGreaterThan(0);
    });

    it("should auto-detect YAML from .yml extension", () => {
      highlighter.parseBufferWithPath("docker-compose.yml", YAML_SOURCE);
      const tokens = highlighter.getLineTokens("docker-compose.yml", 0);
      expect(tokens.length).toBeGreaterThan(0);
    });

    it("should auto-detect Markdown from .md extension", () => {
      highlighter.parseBufferWithPath("README.md", MARKDOWN_SOURCE);
      const tokens = highlighter.getLineTokens("README.md", 0);
      expect(tokens.length).toBeGreaterThan(0);
    });
  });

  describe("buffer language association", () => {
    it("should remember language for subsequent parses", () => {
      highlighter.parseBuffer("remember-test", TYPESCRIPT_SOURCE, undefined, "typescript");
      expect(highlighter.getBufferLanguage("remember-test")).toBe("typescript");

      // Re-parse without specifying language - should use stored language
      highlighter.parseBuffer("remember-test", TYPESCRIPT_SOURCE);
      const tokens = highlighter.getLineTokens("remember-test", 0);
      expect(tokens.length).toBeGreaterThan(0);
      expect(tokens[0]?.color).toContain("var(--syntax-keyword");
    });

    it("should allow changing buffer language", () => {
      highlighter.parseBuffer("change-lang", TYPESCRIPT_SOURCE, undefined, "typescript");
      expect(highlighter.getBufferLanguage("change-lang")).toBe("typescript");

      // Change to YAML (even though it's TypeScript code - just testing language switch)
      highlighter.setBufferLanguage("change-lang", "yaml");
      expect(highlighter.getBufferLanguage("change-lang")).toBe("yaml");
    });
  });

  describe("unsupported language handling", () => {
    it("should return empty tokens for unsupported language", () => {
      highlighter.parseBuffer("rust-file", "fn main() {}", undefined, "rust");
      const tokens = highlighter.getLineTokens("rust-file", 0);
      expect(tokens).toEqual([]);
    });

    it("should return empty tokens for plaintext", () => {
      highlighter.parseBuffer("plaintext-file", "hello world", undefined, "plaintext");
      const tokens = highlighter.getLineTokens("plaintext-file", 0);
      expect(tokens).toEqual([]);
    });
  });

  describe("removeBuffer", () => {
    it("should remove buffer tree and language association", () => {
      highlighter.parseBuffer("to-remove", TYPESCRIPT_SOURCE, undefined, "typescript");
      expect(highlighter.getBufferLanguage("to-remove")).toBe("typescript");
      expect(highlighter.getLineTokens("to-remove", 0).length).toBeGreaterThan(0);

      highlighter.removeBuffer("to-remove");
      expect(highlighter.getBufferLanguage("to-remove")).toBeUndefined();
      expect(highlighter.getLineTokens("to-remove", 0)).toEqual([]);
    });
  });

  describe("multiple buffers with different languages", () => {
    it("should highlight multiple buffers with different languages correctly", () => {
      // Parse TypeScript
      highlighter.parseBuffer("multi-ts", TYPESCRIPT_SOURCE, undefined, "typescript");
      // Parse YAML
      highlighter.parseBuffer("multi-yaml", YAML_SOURCE, undefined, "yaml");
      // Parse Markdown
      highlighter.parseBuffer("multi-md", MARKDOWN_SOURCE, undefined, "markdown");

      // Verify each buffer has correct highlighting
      const tsTokens = highlighter.getLineTokens("multi-ts", 0);
      const yamlTokens = highlighter.getLineTokens("multi-yaml", 0);
      const mdTokens = highlighter.getLineTokens("multi-md", 0);

      expect(tsTokens.length).toBeGreaterThan(0);
      expect(yamlTokens.length).toBeGreaterThan(0);
      expect(mdTokens.length).toBeGreaterThan(0);

      // TypeScript first line should have keyword ("const")
      expect(tsTokens[0]?.color).toContain("var(--syntax-keyword");

      // Markdown first line is heading, should have keyword style
      expect(mdTokens[0]?.color).toContain("var(--syntax-keyword");
    });
  });
});

describe("MultiLanguageHighlighter dynamic loading", () => {
  it("should allow loading languages after init", async () => {
    const highlighter = new MultiLanguageHighlighter();
    await highlighter.init({
      treeSitterWasmUrl: path.join(WASM_DIR, "tree-sitter.wasm"),
      languages: {
        typescript: path.join(WASM_DIR, "tree-sitter-typescript.wasm"),
      },
    });

    expect(highlighter.hasLanguage("yaml")).toBe(false);

    // Dynamically load YAML
    await highlighter.loadLanguage("yaml", path.join(WASM_DIR, "tree-sitter-yaml.wasm"));

    expect(highlighter.hasLanguage("yaml")).toBe(true);

    // Now we can parse YAML
    highlighter.parseBuffer("dynamic-yaml", YAML_SOURCE, undefined, "yaml");
    const tokens = highlighter.getLineTokens("dynamic-yaml", 0);
    expect(tokens.length).toBeGreaterThan(0);
  });
});
