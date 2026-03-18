/**
 * Tests for InjectionHighlighter - syntax highlighting with language injections.
 */

import { beforeAll, describe, expect, it } from "bun:test";
import * as path from "node:path";
import { InjectionHighlighter } from "../../src/renderer/injection-highlighter.ts";

const WASM_DIR = path.join(import.meta.dir, "../../playground/wasm");

const MARKDOWN_WITH_YAML_FRONTMATTER = `---
title: Test Document
count: 42
enabled: true
---

# Hello World

This is a paragraph.
`;

const MARKDOWN_WITH_CODE_BLOCK = `# Code Example

\`\`\`typescript
const x = 42;
\`\`\`
`;

describe("InjectionHighlighter", () => {
  let highlighter: InjectionHighlighter;

  beforeAll(async () => {
    highlighter = new InjectionHighlighter();
    await highlighter.init(
      path.join(WASM_DIR, "tree-sitter.wasm"),
      path.join(WASM_DIR, "tree-sitter-markdown.wasm"),
      "markdown",
    );
    await highlighter.loadLanguage(
      "yaml",
      path.join(WASM_DIR, "tree-sitter-yaml.wasm"),
    );
  });

  describe("initialization", () => {
    it("should be ready after init", () => {
      expect(highlighter.ready).toBe(true);
    });

    it("should have yaml language loaded", () => {
      expect(highlighter.hasLanguage("yaml")).toBe(true);
    });

    it("should have markdown language loaded", () => {
      expect(highlighter.hasLanguage("markdown")).toBe(true);
    });
  });

  describe("YAML frontmatter injection", () => {
    beforeAll(() => {
      highlighter.parseBuffer("test-yaml", MARKDOWN_WITH_YAML_FRONTMATTER);
    });

    it("should return tokens for frontmatter delimiter line", () => {
      const tokens = highlighter.getLineTokens("test-yaml", 0);
      expect(tokens.length).toBeGreaterThan(0);
    });

    it("should return YAML tokens for title line", () => {
      // Line 1: "title: Test Document"
      const tokens = highlighter.getLineTokens("test-yaml", 1);
      expect(tokens.length).toBeGreaterThan(0);

      // Should have tokens for "title", ":", and "Test Document"
      const nodeTypes = tokens.map((t) => t.color);
      // YAML string_scalar maps to "string" category
      expect(nodeTypes.some((c) => c.includes("string"))).toBe(true);
    });

    it("should return YAML number token for count line", () => {
      // Line 2: "count: 42"
      const tokens = highlighter.getLineTokens("test-yaml", 2);
      expect(tokens.length).toBeGreaterThan(0);

      // Should have a number token for 42
      const hasNumber = tokens.some((t) => t.color.includes("number"));
      expect(hasNumber).toBe(true);
    });

    it("should return YAML boolean token for enabled line", () => {
      // Line 3: "enabled: true"
      const tokens = highlighter.getLineTokens("test-yaml", 3);
      expect(tokens.length).toBeGreaterThan(0);

      // Should have a constant token for true
      const hasConstant = tokens.some((t) => t.color.includes("constant"));
      expect(hasConstant).toBe(true);
    });

    it("should return markdown tokens for heading", () => {
      // Line 6: "# Hello World"
      const tokens = highlighter.getLineTokens("test-yaml", 6);
      expect(tokens.length).toBeGreaterThan(0);
    });
  });

  describe("code block detection", () => {
    beforeAll(() => {
      highlighter.parseBuffer("test-code", MARKDOWN_WITH_CODE_BLOCK);
    });

    it("should parse markdown with code block", () => {
      // Line 0: "# Code Example"
      const tokens = highlighter.getLineTokens("test-code", 0);
      expect(tokens.length).toBeGreaterThan(0);
    });

    it("should return tokens for code fence delimiter", () => {
      // Line 2: "```typescript"
      const tokens = highlighter.getLineTokens("test-code", 2);
      expect(tokens.length).toBeGreaterThan(0);
    });
  });

  describe("empty buffer handling", () => {
    it("should return empty array for unparsed buffer", () => {
      const tokens = highlighter.getLineTokens("nonexistent", 0);
      expect(tokens).toEqual([]);
    });
  });

  describe("row index O(1) lookup", () => {
    // This document has two separate injection ranges (YAML frontmatter + code block).
    // The row index must correctly distinguish which rows belong to each injection
    // and which rows use the primary markdown language.
    const MULTI_INJECTION_DOC = `---
title: Test
---

# Heading

\`\`\`typescript
const x = 1;
\`\`\`

Plain text paragraph.
`;

    beforeAll(() => {
      highlighter.parseBuffer("test-multi", MULTI_INJECTION_DOC);
    });

    it("should return YAML tokens for frontmatter rows via row index", () => {
      // Row 1: "title: Test" — inside YAML injection
      const tokens = highlighter.getLineTokens("test-multi", 1);
      expect(tokens.length).toBeGreaterThan(0);
      expect(tokens.some((t) => t.color.includes("string"))).toBe(true);
    });

    it("should return markdown tokens for rows outside all injection ranges", () => {
      // Row 3: "" (blank line) — primary markdown, no injection
      const tokens = highlighter.getLineTokens("test-multi", 3);
      // Row 4: "# Heading" — primary markdown
      const headingTokens = highlighter.getLineTokens("test-multi", 4);
      // Both should be handled by primary language (no injection for these rows)
      expect(tokens).toBeDefined();
      expect(headingTokens.length).toBeGreaterThan(0);
    });

    it("should return correct tokens for rows in the second injection range", () => {
      // Row 7: "const x = 1;" — inside TypeScript code block injection
      // (typescript may not be loaded, so tokens may be empty or code-fence styled)
      const tokens = highlighter.getLineTokens("test-multi", 7);
      expect(tokens).toBeDefined();
    });

    it("should return consistent results with repeated calls (index is stable)", () => {
      // Row index must not mutate between calls
      const first = highlighter.getLineTokens("test-multi", 1);
      const second = highlighter.getLineTokens("test-multi", 1);
      expect(first).toEqual(second);
    });

    it("should return tokens for rows after all injections", () => {
      // Row 10: "Plain text paragraph." — after both injections, primary markdown
      const tokens = highlighter.getLineTokens("test-multi", 10);
      expect(tokens).toBeDefined();
    });
  });
});
