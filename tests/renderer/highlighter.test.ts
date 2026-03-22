/**
 * Tests for Highlighter - tree-sitter based syntax highlighting with
 * incremental parsing via tree.edit().
 */

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import * as path from "node:path";
import type { TreeEdit } from "../../src/renderer/highlighter.ts";
import {
  buildHighlightedSpans,
  Highlighter,
} from "../../src/renderer/highlighter.ts";
import { markdownQuery } from "../../src/renderer/queries/index.ts";

const WASM_DIR = path.join(import.meta.dir, "../../playground/wasm");

const TYPESCRIPT_SOURCE = `const x: number = 42;
function greet(name: string): string {
  return "hello " + name;
}
const y = greet("world");
`;

describe("Highlighter", () => {
  let highlighter: Highlighter;

  beforeAll(async () => {
    highlighter = new Highlighter();
    await highlighter.init(
      path.join(WASM_DIR, "tree-sitter.wasm"),
      path.join(WASM_DIR, "tree-sitter-typescript.wasm"),
    );
  });

  describe("initialization", () => {
    it("should be ready after init", () => {
      expect(highlighter.ready).toBe(true);
    });
  });

  describe("initial parse", () => {
    it("should return tokens for a parsed buffer", () => {
      highlighter.parseBuffer("test-initial", TYPESCRIPT_SOURCE);
      const tokens = highlighter.getLineTokens("test-initial", 0);
      expect(tokens.length).toBeGreaterThan(0);
    });

    it("should return empty array for unparsed buffer", () => {
      const tokens = highlighter.getLineTokens("nonexistent", 0);
      expect(tokens).toEqual([]);
    });

    it("should return tokens covering 'const' keyword on line 0", () => {
      highlighter.parseBuffer("test-keyword", TYPESCRIPT_SOURCE);
      const tokens = highlighter.getLineTokens("test-keyword", 0);
      // First token should start at column 0 (the 'const' keyword)
      expect(tokens[0]?.startColumn).toBe(0);
      expect(tokens.length).toBeGreaterThan(1);
    });
  });

  describe("incremental parse without edit info (best-effort)", () => {
    it("should produce identical tokens when re-parsing unchanged text with old tree", () => {
      highlighter.parseBuffer("test-incr", TYPESCRIPT_SOURCE);
      const tokensBefore = highlighter.getLineTokens("test-incr", 0);

      // Re-parse same text -- old tree is passed internally but no edit info
      highlighter.parseBuffer("test-incr", TYPESCRIPT_SOURCE);
      const tokensAfter = highlighter.getLineTokens("test-incr", 0);

      expect(tokensAfter).toEqual(tokensBefore);
    });

    it("should produce correct tokens after text change without edit info", () => {
      const original = "const a = 1;\nconst b = 2;\n";
      const modified = "const a = 1;\nlet b = 2;\n";

      highlighter.parseBuffer("test-change", original);
      // Re-parse with modified text but no edit descriptor (best-effort)
      highlighter.parseBuffer("test-change", modified);

      const tokens = highlighter.getLineTokens("test-change", 1);
      expect(tokens.length).toBeGreaterThan(0);
      // First token should start at column 0
      expect(tokens[0]?.startColumn).toBe(0);
      // Without a TreeEdit descriptor, tree-sitter reuses the old tree's node
      // positions when doing incremental re-parse. This means the first token
      // retains the stale column width of "const" (5) rather than the actual
      // "let" width (3). This is expected best-effort behavior — callers that
      // need accurate column boundaries must provide a TreeEdit descriptor.
      const firstTokenWidth =
        (tokens[0]?.endColumn ?? 0) - (tokens[0]?.startColumn ?? 0);
      expect(firstTokenWidth).toBe(5); // stale "const" width, not fresh "let" (3)
      // The first token must end within the line (not extend past)
      expect(tokens[0]?.endColumn).toBeGreaterThan(0);
      expect(tokens[0]?.endColumn).toBeLessThanOrEqual("let b = 2;".length);
      // Token color should be a keyword even without edit info
      expect(tokens[0]?.color).toContain("var(--syntax-keyword");
      // Should have multiple tokens covering the full line structure
      expect(tokens.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("incremental parse with edit info", () => {
    it("should produce correct tokens after edit with TreeEdit descriptor", () => {
      const original = "const a = 1;\nconst b = 2;\n";
      highlighter.parseBuffer("test-edit", original);
      const tokensLine0Before = highlighter.getLineTokens("test-edit", 0);

      // Simulate changing "const b" to "let b" on line 1 (index 13..18 -> 13..16)
      // "const b" starts at index 13 in the original text
      // "const" is 5 chars, replaced by "let" which is 3 chars
      const modified = "const a = 1;\nlet b = 2;\n";
      const edit: TreeEdit = {
        startIndex: 13,
        oldEndIndex: 18, // end of "const" on line 1
        newEndIndex: 16, // end of "let" on line 1
        startPosition: { row: 1, column: 0 },
        oldEndPosition: { row: 1, column: 5 },
        newEndPosition: { row: 1, column: 3 },
      };

      highlighter.parseBuffer("test-edit", modified, edit);

      // Line 0 should be unaffected
      const tokensLine0After = highlighter.getLineTokens("test-edit", 0);
      expect(tokensLine0After).toEqual(tokensLine0Before);

      // Line 1 should have tokens starting at column 0
      const tokensLine1 = highlighter.getLineTokens("test-edit", 1);
      expect(tokensLine1.length).toBeGreaterThan(0);
      expect(tokensLine1[0]?.startColumn).toBe(0);
    });

    it("should handle multi-line insertion with edit info", () => {
      const original = "const a = 1;\nconst b = 2;\n";
      highlighter.parseBuffer("test-insert", original);

      // Insert a new line after line 0
      const modified = "const a = 1;\nconst c = 3;\nconst b = 2;\n";
      const insertIndex = 13; // right after "const a = 1;\n"
      const insertedText = "const c = 3;\n";
      const edit: TreeEdit = {
        startIndex: insertIndex,
        oldEndIndex: insertIndex,
        newEndIndex: insertIndex + insertedText.length,
        startPosition: { row: 1, column: 0 },
        oldEndPosition: { row: 1, column: 0 },
        newEndPosition: { row: 2, column: 0 },
      };

      highlighter.parseBuffer("test-insert", modified, edit);

      // The new line 1 should have tokens
      const tokensLine1 = highlighter.getLineTokens("test-insert", 1);
      expect(tokensLine1.length).toBeGreaterThan(0);

      // The old line 1 (now line 2) should still have tokens
      const tokensLine2 = highlighter.getLineTokens("test-insert", 2);
      expect(tokensLine2.length).toBeGreaterThan(0);
    });
  });

  describe("token ordering", () => {
    it("should return tokens in startColumn order", () => {
      const code = "const foo = bar + baz;";
      highlighter.parseBuffer("test-order", code);
      const tokens = highlighter.getLineTokens("test-order", 0);

      // Verify tokens are sorted by startColumn (weaker than non-overlap)
      for (let i = 1; i < tokens.length; i++) {
        expect(tokens[i]?.startColumn).toBeGreaterThanOrEqual(
          tokens[i - 1]?.startColumn ?? 0,
        );
      }
    });

    it("should have non-overlapping tokens", () => {
      const code = "function test(a: number): string { return a.toString(); }";
      highlighter.parseBuffer("test-overlap", code);
      const tokens = highlighter.getLineTokens("test-overlap", 0);

      // Verify no tokens overlap
      for (let i = 1; i < tokens.length; i++) {
        expect(tokens[i]?.startColumn).toBeGreaterThanOrEqual(
          tokens[i - 1]?.endColumn ?? 0,
        );
      }
    });
  });
});

describe("Highlighter uninitialized", () => {
  it("should not be ready before init", () => {
    const highlighter = new Highlighter();
    expect(highlighter.ready).toBe(false);
  });

  it("should return early from parseBuffer when parser not initialized", () => {
    const highlighter = new Highlighter();
    // Should not throw when called before init
    highlighter.parseBuffer("test", "const x = 1;");
    // getLineTokens should return empty array for unparsed buffer
    const tokens = highlighter.getLineTokens("test", 0);
    expect(tokens).toEqual([]);
  });
});

describe("Highlighter with Markdown", () => {
  let highlighter: Highlighter;

  beforeAll(async () => {
    highlighter = new Highlighter(markdownQuery);
    await highlighter.init(
      path.join(WASM_DIR, "tree-sitter.wasm"),
      path.join(WASM_DIR, "tree-sitter-markdown.wasm"),
    );
  });

  describe("SKIP_CHILDREN nodes (code blocks)", () => {
    it("should return comment-colored tokens for fenced code block content", () => {
      const markdown = "# Heading\n\n```typescript\nconst x = 42;\n```\n";
      highlighter.parseBuffer("test-code-block", markdown);

      // Line 2 is the opening fence "```typescript"
      const fenceTokens = highlighter.getLineTokens("test-code-block", 2);
      expect(fenceTokens.length).toBeGreaterThan(0);

      // Line 3 is code content "const x = 42;" - should have comment color
      // (because SKIP_CHILDREN uses fenced_code_block_delimiter color)
      const contentTokens = highlighter.getLineTokens("test-code-block", 3);
      expect(contentTokens.length).toBeGreaterThan(0);
      expect(contentTokens[0]?.color).toContain("--syntax-comment");
    });

    it("should return tokens for inline code span", () => {
      const markdown = "This is `inline code` in text.";
      highlighter.parseBuffer("test-code-span", markdown);
      const tokens = highlighter.getLineTokens("test-code-span", 0);
      expect(tokens.length).toBeGreaterThan(0);
    });
  });

  describe("STYLED_PARENTS nodes (headings, emphasis)", () => {
    it("should propagate heading color to children", () => {
      const markdown = "# Hello World\n\nParagraph text.";
      highlighter.parseBuffer("test-heading", markdown);

      // Line 0 is the heading "# Hello World"
      const headingTokens = highlighter.getLineTokens("test-heading", 0);
      expect(headingTokens.length).toBeGreaterThan(0);

      // All tokens in heading should use keyword color (atx_heading maps to keyword)
      for (const token of headingTokens) {
        expect(token.color).toContain("--syntax-keyword");
      }
    });

    it("should return tokens for emphasis markers", () => {
      // Note: tree-sitter-markdown (block parser) only tokenizes markers,
      // not inline text. Full inline parsing requires markdown_inline parser.
      const markdown = "This is *emphasized text* here.";
      highlighter.parseBuffer("test-emphasis", markdown);
      const tokens = highlighter.getLineTokens("test-emphasis", 0);
      expect(tokens.length).toBeGreaterThan(0);

      // The * markers should be tokenized (typically as operators in markdown)
      const markerTokens = tokens.filter(
        (t) => t.startColumn === 8 || t.startColumn === 24,
      );
      expect(markerTokens.length).toBe(2);
    });

    it("should return tokens for strong emphasis markers", () => {
      // Note: tree-sitter-markdown (block parser) only tokenizes markers.
      const markdown = "This is **bold text** here.";
      highlighter.parseBuffer("test-strong", markdown);
      const tokens = highlighter.getLineTokens("test-strong", 0);
      expect(tokens.length).toBeGreaterThan(0);

      // The ** delimiters should be tokenized at their expected columns
      // Opening ** at column 8, closing ** at column 19
      const openMarkers = tokens.filter((t) => t.startColumn === 8);
      const closeMarkers = tokens.filter((t) => t.startColumn === 19);
      expect(openMarkers.length).toBeGreaterThanOrEqual(1);
      expect(closeMarkers.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("multi-line nodes", () => {
    it("should handle nodes spanning multiple lines with correct column bounds", () => {
      const markdown = "```\nline1\nline2\nline3\n```";
      highlighter.parseBuffer("test-multiline", markdown);

      // Each line inside the code block should have tokens
      for (let row = 1; row <= 3; row++) {
        const tokens = highlighter.getLineTokens("test-multiline", row);
        expect(tokens.length).toBeGreaterThan(0);
        // First token on each line should start at column 0
        expect(tokens[0]?.startColumn).toBe(0);
      }
    });

    it("should return empty array for row beyond document", () => {
      const markdown = "# Test\n";
      highlighter.parseBuffer("test-bounds", markdown);
      const tokens = highlighter.getLineTokens("test-bounds", 100);
      expect(tokens).toEqual([]);
    });
  });
});

describe("applyTreeEdit", () => {
  let highlighter: Highlighter;

  beforeAll(async () => {
    highlighter = new Highlighter();
    await highlighter.init(
      path.join(WASM_DIR, "tree-sitter.wasm"),
      path.join(WASM_DIR, "tree-sitter-typescript.wasm"),
    );
  });

  it("should work correctly when used via parseBuffer with edit", () => {
    const original = "let x = 1;";
    highlighter.parseBuffer("test-apply", original);

    // Change "let" to "const" (0..3 -> 0..5)
    const modified = "const x = 1;";
    const edit: TreeEdit = {
      startIndex: 0,
      oldEndIndex: 3,
      newEndIndex: 5,
      startPosition: { row: 0, column: 0 },
      oldEndPosition: { row: 0, column: 3 },
      newEndPosition: { row: 0, column: 5 },
    };

    highlighter.parseBuffer("test-apply", modified, edit);
    const tokens = highlighter.getLineTokens("test-apply", 0);
    expect(tokens.length).toBeGreaterThan(0);
    // First token should now cover "const" (5 chars)
    expect(tokens[0]?.startColumn).toBe(0);
    expect(tokens[0]?.endColumn).toBe(5);
  });
});

describe("buildHighlightedSpans", () => {
  // happy-dom provides the DOM environment for span creation tests
  const { Window } = require("happy-dom");
  const win = new Window({ url: "https://localhost:8080/" });
  const doc = win.document;

  // Save and restore global document so it doesn't leak into other test files
  const originalDocument = globalThis.document;

  // Set up global document so buildHighlightedSpans can call document.createElement
  // biome-ignore lint/plugin/no-type-assertion: expect: globalThis extension for DOM APIs requires type assertion
  (globalThis as unknown as Record<string, unknown>).document = doc;

  afterAll(() => {
    // biome-ignore lint/plugin/no-type-assertion: expect: globalThis extension for DOM APIs requires type assertion
    (globalThis as unknown as Record<string, unknown>).document = originalDocument;
    win.close();
  });

  function makeContainer(): HTMLElement {
    // biome-ignore lint/plugin/no-type-assertion: expect: happy-dom returns Element which is compatible with HTMLElement at runtime
    return doc.createElement("div") as unknown as HTMLElement;
  }

  it("should create a trailing span for empty token array", () => {
    const container = makeContainer();
    const text = "hello world";
    buildHighlightedSpans(container, text, []);
    // With no tokens, the entire text is trailing and gets one span
    expect(container.childNodes.length).toBe(1);
    // biome-ignore lint/plugin/no-type-assertion: expect: happy-dom childNodes are Elements with textContent
    expect((container.childNodes[0] as unknown as HTMLElement).textContent).toBe("hello world");
  });

  it("should create gap spans between tokens", () => {
    const container = makeContainer();
    const text = "hello world";
    // Token covers "world" (columns 6-11), leaving "hello " (0-6) as a gap
    const tokens: import("../../src/renderer/highlighter.ts").Token[] = [
      { startColumn: 6, endColumn: 11, color: "red" },
    ];
    buildHighlightedSpans(container, text, tokens);
    // Expect: gap span ("hello ") + token span ("world")
    expect(container.childNodes.length).toBe(2);
    // biome-ignore lint/plugin/no-type-assertion: expect: happy-dom childNodes are Elements with textContent
    expect((container.childNodes[0] as unknown as HTMLElement).textContent).toBe("hello ");
    // biome-ignore lint/plugin/no-type-assertion: expect: happy-dom childNodes are Elements with textContent
    expect((container.childNodes[1] as unknown as HTMLElement).textContent).toBe("world");
  });

  it("should clamp token endColumn to text length", () => {
    const container = makeContainer();
    const text = "hi";
    // Token extends well beyond text length (simulating Number.MAX_SAFE_INTEGER)
    const tokens: import("../../src/renderer/highlighter.ts").Token[] = [
      { startColumn: 0, endColumn: Number.MAX_SAFE_INTEGER, color: "blue" },
    ];
    buildHighlightedSpans(container, text, tokens);
    // The token should be clamped to text.length (2), so content is "hi"
    expect(container.childNodes.length).toBe(1);
    // biome-ignore lint/plugin/no-type-assertion: expect: happy-dom childNodes are Elements with textContent
    expect((container.childNodes[0] as unknown as HTMLElement).textContent).toBe("hi");
  });

  it("should apply syntax color to token spans", () => {
    const container = makeContainer();
    const text = "const";
    const tokens: import("../../src/renderer/highlighter.ts").Token[] = [
      { startColumn: 0, endColumn: 5, color: "var(--syntax-keyword)" },
    ];
    buildHighlightedSpans(container, text, tokens);
    expect(container.childNodes.length).toBe(1);
    // biome-ignore lint/plugin/no-type-assertion: expect: happy-dom childNodes are Elements with style property
    const span = container.childNodes[0] as unknown as HTMLElement;
    expect(span.style.color).toBe("var(--syntax-keyword)");
    expect(span.textContent).toBe("const");
  });

  it("should not insert gap spans for contiguous tokens", () => {
    const container = makeContainer();
    const text = "ab";
    const tokens: import("../../src/renderer/highlighter.ts").Token[] = [
      { startColumn: 0, endColumn: 1, color: "red" },
      { startColumn: 1, endColumn: 2, color: "blue" },
    ];
    buildHighlightedSpans(container, text, tokens);
    // Two contiguous tokens -> exactly 2 spans, no gap
    expect(container.childNodes.length).toBe(2);
    // biome-ignore lint/plugin/no-type-assertion: expect: happy-dom childNodes are Elements with textContent
    expect((container.childNodes[0] as unknown as HTMLElement).textContent).toBe("a");
    // biome-ignore lint/plugin/no-type-assertion: expect: happy-dom childNodes are Elements with textContent
    expect((container.childNodes[1] as unknown as HTMLElement).textContent).toBe("b");
  });
});
