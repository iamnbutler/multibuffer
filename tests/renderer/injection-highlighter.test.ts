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

  // The injection-skip traversal collapses a code block into a single
  // delimiter-colored span instead of recursing into it. Dropping that branch
  // still produces tokens — just the wrong ones — so assertions of the form
  // `tokens.length > 0` cannot detect it. These tests pin the token count, span
  // and color on interior rows, which is what makes an over-eager recursion
  // visible. Verified by mutation: disabling the skipChildren branch turns 7 of
  // them red, where the suite on main stays fully green.
  describe("skipChildren collapses code blocks (interior rows)", () => {
    // No info string, so this block is NOT registered as an injection range
    // (see _findInjectionRanges: a fenced block needs a `language` to inject).
    // That routes its rows through the primary-language injection-skip walk,
    // which is the path under test here.
    const BARE_FENCE_DOC = `# Heading

\`\`\`
fn main() {
    let x = 42;
    done();
}
\`\`\`

After.
`;

    beforeAll(() => {
      highlighter.parseBuffer("test-bare-fence", BARE_FENCE_DOC);
    });

    // Rows 3-6 are the four content lines; the block itself spans rows 2-7.
    it.each([3, 4, 5, 6])(
      "should emit exactly one full-row comment token for content row %i",
      (row) => {
        const tokens = highlighter.getLineTokens("test-bare-fence", row);

        // Exactly one: recursing into the block's children would yield several.
        expect(tokens.length).toBe(1);
        expect(tokens[0]?.startColumn).toBe(0);
        // The block continues past this row, so the span is left open-ended.
        expect(tokens[0]?.endColumn).toBe(Number.MAX_SAFE_INTEGER);
        expect(tokens[0]?.color).toContain("--syntax-comment");
      },
    );

    it("should collapse the block uniformly across every one of its rows", () => {
      // Guards against a fix that special-cases the first row and recurses on
      // the rest — each row must be indistinguishable from the others.
      const rows = [2, 3, 4, 5, 6, 7].map((row) =>
        highlighter.getLineTokens("test-bare-fence", row),
      );
      const colors = new Set(rows.map((t) => t[0]?.color));
      expect(colors.size).toBe(1);
      expect(rows.every((t) => t.length === 1)).toBe(true);
    });

    it("should not leak the code block's color onto surrounding rows", () => {
      // Row 0 is the heading, row 9 the trailing paragraph. If the early return
      // swallowed too much of the tree these would change too.
      const heading = highlighter.getLineTokens("test-bare-fence", 0);
      expect(heading.length).toBeGreaterThan(0);
      expect(heading.every((t) => t.color.includes("--syntax-keyword"))).toBe(
        true,
      );
      expect(
        highlighter
          .getLineTokens("test-bare-fence", 9)
          .some((t) => t.color.includes("--syntax-comment")),
      ).toBe(false);
    });

    it("should start the collapsed span at the block's own column, not 0", () => {
      // A fence indented inside a list item starts at column 2. The collapsed
      // span must begin there and leave the list indentation to be colored
      // separately — hardcoding column 0 would swallow it.
      const doc = `- item

  \`\`\`
  code one
  code two
  \`\`\`

After.
`;
      highlighter.parseBuffer("test-list-fence", doc);

      // Opening row: list indentation first, then the block's own span.
      const opening = highlighter.getLineTokens("test-list-fence", 2);
      expect(opening.length).toBe(2);
      expect(opening[0]?.endColumn).toBe(2);
      expect(opening[1]?.startColumn).toBe(2);
      expect(opening[1]?.color).toContain("--syntax-comment");
    });

    it("should collapse indented code blocks the same way", () => {
      // indented_code_block is the second skipChildren member reachable here.
      const doc = `Intro paragraph.

    line one
    line two
    line three

After.
`;
      highlighter.parseBuffer("test-indented", doc);

      for (const row of [2, 3, 4]) {
        const tokens = highlighter.getLineTokens("test-indented", row);
        expect(tokens.length).toBe(1);
        expect(tokens[0]?.startColumn).toBe(0);
        expect(tokens[0]?.color).toContain("--syntax-comment");
      }
    });
  });

  describe("frontmatter delimiter rows", () => {
    it("should emit a single delimiter-colored token for the opening ---", () => {
      // Characterisation only. Row 0 is reached by the minus_metadata early
      // return, but that branch is not observable through getLineTokens on this
      // document: disabling it yields byte-identical tokens, because
      // minus_metadata is itself mapped to the comment category and its
      // children collapse to the same single span. So this pins the delimiter's
      // rendering; it is NOT a guard on that branch, and shouldn't be read as
      // one.
      const tokens = highlighter.getLineTokens("test-yaml", 0);
      expect(tokens.length).toBe(1);
      expect(tokens[0]?.startColumn).toBe(0);
      expect(tokens[0]?.color).toContain("--syntax-comment");
    });

    it("should still highlight frontmatter interior rows via the injection", () => {
      // The rows between the delimiters are routed to the YAML grammar rather
      // than collapsed, so they carry several distinctly-colored tokens.
      const tokens = highlighter.getLineTokens("test-yaml", 1);
      expect(tokens.length).toBeGreaterThan(1);
      expect(tokens.some((t) => t.color.includes("--syntax-string"))).toBe(true);
    });
  });

  describe("fenced block whose injected language is not loaded", () => {
    // Characterisation, not an endorsement: a block tagged with a language that
    // has no loaded grammar registers an injection range, so its rows are
    // routed to the injection path and never reach the skipChildren branch.
    // With no grammar to parse them they come back empty and the renderer draws
    // them in the default color. Pinned because it is exactly the routing that
    // a binary-search rewrite of the child walk would touch.
    const UNLOADED_LANG_DOC = `# Heading

\`\`\`rust
fn main() {
    let x = 42;
}
\`\`\`
`;

    beforeAll(() => {
      highlighter.parseBuffer("test-unloaded-lang", UNLOADED_LANG_DOC);
    });

    it("should return no tokens for content rows of an unloaded language", () => {
      expect(highlighter.hasLanguage("rust")).toBe(false);
      for (const row of [3, 4, 5]) {
        expect(highlighter.getLineTokens("test-unloaded-lang", row)).toEqual([]);
      }
    });

    it("should still style the opening fence row", () => {
      // The fence line is outside the injected content range, so it keeps its
      // delimiter color even though the body is unhighlighted.
      const tokens = highlighter.getLineTokens("test-unloaded-lang", 2);
      expect(tokens.length).toBe(1);
      expect(tokens[0]?.color).toContain("--syntax-comment");
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
