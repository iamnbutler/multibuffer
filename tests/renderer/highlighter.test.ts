/**
 * Tests for Highlighter - tree-sitter based syntax highlighting with
 * incremental parsing via tree.edit().
 */

import { beforeAll, describe, expect, it } from "bun:test";
import * as path from "node:path";
import type { TreeEdit } from "../../src/renderer/highlighter.ts";
import { Highlighter } from "../../src/renderer/highlighter.ts";

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
      // 'let' should start at column 0
      expect(tokens[0]?.startColumn).toBe(0);
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
});
