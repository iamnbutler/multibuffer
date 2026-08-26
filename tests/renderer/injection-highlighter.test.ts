/**
 * Tests for InjectionHighlighter - syntax highlighting with language injections.
 */

import { beforeAll, describe, expect, it } from "bun:test";
import * as path from "node:path";
import { InjectionHighlighter } from "../../src/renderer/injection-highlighter.ts";
import { markdownQuery } from "../../src/renderer/queries/index.ts";

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
    highlighter = new InjectionHighlighter(markdownQuery);
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

  // An injection must cover exactly the rows its own text occupies. Tree-sitter
  // end positions are exclusive, so the row holding the *closing* delimiter used
  // to be routed into the injected language — which has no tokens there, leaving
  // the delimiter unhighlighted while its opening twin was styled.
  describe("closing delimiters stay with the primary language", () => {
    let h: InjectionHighlighter;

    /** The single delimiter color both fence and frontmatter markers use. */
    const delimiterColor = (tokens: { color: string }[]) => tokens.map((t) => t.color);

    beforeAll(async () => {
      h = new InjectionHighlighter(markdownQuery);
      await h.init(
        path.join(WASM_DIR, "tree-sitter.wasm"),
        path.join(WASM_DIR, "tree-sitter-markdown.wasm"),
        "markdown",
      );
      await h.loadLanguage("yaml", path.join(WASM_DIR, "tree-sitter-yaml.wasm"));
      await h.loadLanguage(
        "typescript",
        path.join(WASM_DIR, "tree-sitter-typescript.wasm"),
      );
    });

    it("highlights a closing code fence exactly like its opening fence", () => {
      h.parseBuffer("fence", "```typescript\nconst x = 1;\n```\n");

      const opening = h.getLineTokens("fence", 0);
      const closing = h.getLineTokens("fence", 2);

      expect(opening.length).toBeGreaterThan(0);
      expect(closing).toEqual(opening);
    });

    it("still highlights the fenced content with the injected language", () => {
      h.parseBuffer("fence-content", "```typescript\nconst x = 1;\n```\n");

      const content = h.getLineTokens("fence-content", 1);
      expect(content.length).toBeGreaterThan(0);
      expect(content.some((t) => t.color.includes("keyword"))).toBe(true);
    });

    it("highlights the closing fence of a multi-line block", () => {
      h.parseBuffer("fence-multi", "```typescript\nconst a = 1;\nconst b = 2;\n```\n");

      expect(h.getLineTokens("fence-multi", 1).length).toBeGreaterThan(0);
      expect(h.getLineTokens("fence-multi", 2).length).toBeGreaterThan(0);
      expect(delimiterColor(h.getLineTokens("fence-multi", 3))).toEqual(
        delimiterColor(h.getLineTokens("fence-multi", 0)),
      );
    });

    it("highlights a closing fence indented inside a list item", () => {
      // The content node ends at the fence's indentation column rather than at
      // column 0, so the closing row is only identifiable from the delimiter.
      h.parseBuffer("fence-indented", "- item\n\n  ```typescript\n  const a = 1;\n  ```\n");

      // The opening row also carries the list's continuation token, so compare
      // on the delimiter color rather than on the whole token list.
      const opening = delimiterColor(h.getLineTokens("fence-indented", 2));
      const closing = delimiterColor(h.getLineTokens("fence-indented", 4));

      expect(opening).toContain("var(--syntax-comment, #928374)");
      expect(closing).toContain("var(--syntax-comment, #928374)");
    });

    it("highlights a closing frontmatter delimiter like its opening one", () => {
      h.parseBuffer("fm", "---\ntitle: Test\n---\n\n# Heading\n");

      const opening = h.getLineTokens("fm", 0);
      const closing = h.getLineTokens("fm", 2);

      expect(opening.length).toBeGreaterThan(0);
      expect(closing).toEqual(opening);
    });

    it("does not feed the closing frontmatter delimiter to the YAML parser", () => {
      // Row 1 is the only YAML content row; row 2 is the closing "---".
      h.parseBuffer("fm-scope", "---\ntitle: Test\n---\n\n# Heading\n");

      expect(h.getLineTokens("fm-scope", 1).some((t) => t.color.includes("string"))).toBe(
        true,
      );
      expect(delimiterColor(h.getLineTokens("fm-scope", 2))).not.toContain(
        "var(--syntax-default, #ebdbb2)",
      );
    });

    it("keeps a blank final content row inside the frontmatter injection", () => {
      // The blank row 2 is real YAML content, not the trailing newline.
      h.parseBuffer("fm-blank", "---\ntitle: Test\n\n---\n\n# Heading\n");

      const closing = h.getLineTokens("fm-blank", 3);
      expect(delimiterColor(closing)).toEqual(delimiterColor(h.getLineTokens("fm-blank", 0)));
    });

    it("highlights a closing TOML frontmatter delimiter", () => {
      // No TOML grammar ships with the repo, so row 1 stays untokenised; the
      // delimiter rows are handled by the primary language either way.
      h.parseBuffer("toml", '+++\ntitle = "x"\n+++\n\n# Heading\n');

      expect(h.getLineTokens("toml", 2)).toEqual(h.getLineTokens("toml", 0));
    });

    it("leaves an unterminated fence covering its content row", () => {
      h.parseBuffer("fence-open", "```typescript\nconst x = 1;\n");

      expect(h.getLineTokens("fence-open", 1).length).toBeGreaterThan(0);
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
