/**
 * Tests for the binary-search child scan used by getLineTokens().
 *
 * getLineTokens() locates the children touching a row with a binary search
 * rather than materialising every child (each node.child(i) is a WASM FFI call
 * plus an allocation). That is only valid because tree-sitter siblings are in
 * source order and non-overlapping, so their start and end rows are both
 * non-decreasing and the touching children form a contiguous span.
 *
 * These tests pin that invariant directly, and check the search against a
 * brute-force linear scan over every node of real parse trees.
 */

import { beforeAll, describe, expect, it } from "bun:test";
import * as path from "node:path";
import type { Node } from "web-tree-sitter";
import {
  firstChildReachingRow,
  Highlighter,
} from "../../src/renderer/highlighter.ts";
import { markdownQuery } from "../../src/renderer/queries/index.ts";

const WASM_DIR = path.join(import.meta.dir, "../../playground/wasm");

/** Flat source: every statement is a top-level sibling, so root fanout is
 *  maximal. This is the shape the linear scan degenerates on. */
function flatSource(lines: number): string {
  return Array.from(
    { length: lines },
    (_, i) => `const variable${i}: number = ${i}; // line ${i}`,
  ).join("\n");
}

const NESTED_SOURCE = `class Container {
  private items: Map<string, number[]> = new Map();

  add(key: string, value: number): void {
    if (!this.items.has(key)) {
      this.items.set(key, []);
    }
    this.items.get(key)?.push(value);
  }

  total(): number {
    let sum = 0;
    for (const [, values] of this.items) {
      for (const v of values) {
        sum += v;
      }
    }
    return sum;
  }
}
`;

/** Markdown exercising the skipChildren head logic, including a bare fence
 *  (no info string), which reaches skipChildren rather than an injection. */
const MARKDOWN_SOURCE = `# Heading with \`code span\`

Text with *emphasis* and a [link](http://example.com).

\`\`\`ts
const x: number = 1;
\`\`\`

\`\`\`
bare fence, no info string
\`\`\`

    indented code block

> quote with \`span\`
`;

/** Visit every node of a tree. */
function walk(node: Node, visit: (n: Node) => void): void {
  visit(node);
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) walk(child, visit);
  }
}

/** Brute-force equivalent of firstChildReachingRow. */
function linearFirstChildReachingRow(node: Node, targetRow: number): number {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child || child.endPosition.row >= targetRow) return i;
  }
  return node.childCount;
}

describe("getLineTokens child scan", () => {
  let tsHighlighter: Highlighter;
  let mdHighlighter: Highlighter;
  let roots: { name: string; root: Node }[] = [];

  beforeAll(async () => {
    tsHighlighter = new Highlighter();
    await tsHighlighter.init(
      path.join(WASM_DIR, "tree-sitter.wasm"),
      path.join(WASM_DIR, "tree-sitter-typescript.wasm"),
    );
    mdHighlighter = new Highlighter(markdownQuery);
    await mdHighlighter.init(
      path.join(WASM_DIR, "tree-sitter.wasm"),
      path.join(WASM_DIR, "tree-sitter-markdown.wasm"),
    );

    // Parse trees are reachable through a throwaway parser so the tests can
    // inspect nodes; the Highlighter itself keeps its trees private.
    const mod = await import("web-tree-sitter");
    const Parser = mod.Parser ?? mod.default;
    await Parser.init({ locateFile: () => path.join(WASM_DIR, "tree-sitter.wasm") });
    const LangClass = mod.Language;

    const tsParser = new Parser();
    tsParser.setLanguage(
      await LangClass.load(path.join(WASM_DIR, "tree-sitter-typescript.wasm")),
    );
    const mdParser = new Parser();
    mdParser.setLanguage(
      await LangClass.load(path.join(WASM_DIR, "tree-sitter-markdown.wasm")),
    );

    const built: { name: string; root: Node }[] = [];
    for (const [name, parser, text] of [
      ["nested-ts", tsParser, NESTED_SOURCE],
      ["flat-ts", tsParser, flatSource(300)],
      ["markdown", mdParser, MARKDOWN_SOURCE],
    ] as const) {
      const tree = parser.parse(text);
      if (tree) built.push({ name, root: tree.rootNode });
    }
    roots = built;
  });

  describe("sibling ordering invariant", () => {
    it("start and end rows are non-decreasing across siblings", () => {
      expect(roots.length).toBe(3);
      let nodesChecked = 0;
      for (const { name, root } of roots) {
        walk(root, (node) => {
          if (node.childCount < 2) return;
          nodesChecked++;
          for (let i = 1; i < node.childCount; i++) {
            const prev = node.child(i - 1);
            const cur = node.child(i);
            if (!prev || !cur) continue;
            expect(
              cur.startPosition.row >= prev.startPosition.row,
              `${name}: child ${i} starts before its predecessor`,
            ).toBe(true);
            expect(
              cur.endPosition.row >= prev.endPosition.row,
              `${name}: child ${i} ends before its predecessor`,
            ).toBe(true);
          }
        });
      }
      // Guard against the assertion loop silently never executing.
      expect(nodesChecked).toBeGreaterThan(50);
    });

    it("siblings do not overlap", () => {
      for (const { name, root } of roots) {
        walk(root, (node) => {
          for (let i = 1; i < node.childCount; i++) {
            const prev = node.child(i - 1);
            const cur = node.child(i);
            if (!prev || !cur) continue;
            const startsAfter =
              cur.startPosition.row > prev.endPosition.row ||
              (cur.startPosition.row === prev.endPosition.row &&
                cur.startPosition.column >= prev.endPosition.column);
            expect(startsAfter, `${name}: child ${i} overlaps its predecessor`).toBe(
              true,
            );
          }
        });
      }
    });
  });

  describe("firstChildReachingRow", () => {
    it("matches a linear scan for every node and every row", () => {
      let comparisons = 0;
      for (const { name, root } of roots) {
        const maxRow = root.endPosition.row;
        walk(root, (node) => {
          if (node.childCount === 0) return;
          for (let row = -1; row <= maxRow + 1; row++) {
            comparisons++;
            expect(
              firstChildReachingRow(node, row),
              `${name}: node ${node.type} row ${row}`,
            ).toBe(linearFirstChildReachingRow(node, row));
          }
        });
      }
      expect(comparisons).toBeGreaterThan(1000);
    });

    it("returns childCount when no child reaches the row", () => {
      for (const { root } of roots) {
        expect(firstChildReachingRow(root, root.endPosition.row + 100)).toBe(
          root.childCount,
        );
      }
    });

    it("returns 0 when every child reaches the row", () => {
      for (const { root } of roots) {
        expect(firstChildReachingRow(root, -10)).toBe(0);
      }
    });

    it("never skips past a child that touches the row", () => {
      // The search may legitimately start early, but must never start after a
      // child that still intersects the target row.
      for (const { name, root } of roots) {
        const maxRow = root.endPosition.row;
        walk(root, (node) => {
          if (node.childCount === 0) return;
          for (let row = 0; row <= maxRow; row++) {
            const idx = firstChildReachingRow(node, row);
            for (let i = 0; i < idx; i++) {
              const skipped = node.child(i);
              if (!skipped) continue;
              expect(
                skipped.endPosition.row < row,
                `${name}: skipped child ${i} still touches row ${row}`,
              ).toBe(true);
            }
          }
        });
      }
    });
  });

  describe("getLineTokens over high-fanout documents", () => {
    const LINES = 300;
    const source = flatSource(LINES);

    beforeAll(() => {
      tsHighlighter.parseBuffer("flat", source);
    });

    it("highlights every row of a flat document", () => {
      const lines = source.split("\n");
      for (let row = 0; row < LINES; row++) {
        const tokens = tsHighlighter.getLineTokens("flat", row);
        expect(tokens.length, `row ${row} produced no tokens`).toBeGreaterThan(0);
        // First token is the `const` keyword at column 0.
        expect(tokens[0]?.startColumn, `row ${row}`).toBe(0);
        for (const t of tokens) {
          expect(t.startColumn).toBeLessThan(t.endColumn);
          expect(t.startColumn).toBeLessThanOrEqual(lines[row]?.length ?? 0);
        }
      }
    });

    it("returns tokens in startColumn order", () => {
      for (let row = 0; row < LINES; row += 7) {
        const tokens = tsHighlighter.getLineTokens("flat", row);
        for (let i = 1; i < tokens.length; i++) {
          expect(
            (tokens[i]?.startColumn ?? 0) >= (tokens[i - 1]?.startColumn ?? 0),
            `row ${row} token ${i} out of order`,
          ).toBe(true);
        }
      }
    });

    it("is independent of the order rows are requested in", () => {
      const ascending = new Map<number, string>();
      for (let row = 0; row < LINES; row++) {
        ascending.set(row, JSON.stringify(tsHighlighter.getLineTokens("flat", row)));
      }
      for (let row = LINES - 1; row >= 0; row--) {
        expect(
          JSON.stringify(tsHighlighter.getLineTokens("flat", row)),
          `row ${row} differs when requested in descending order`,
        ).toBe(ascending.get(row) ?? "");
      }
    });

    it("returns no tokens for rows outside the document", () => {
      expect(tsHighlighter.getLineTokens("flat", LINES + 50)).toEqual([]);
      expect(tsHighlighter.getLineTokens("flat", -1)).toEqual([]);
      expect(tsHighlighter.getLineTokens("flat", -100)).toEqual([]);
    });
  });

  describe("getLineTokens with skipChildren head logic", () => {
    beforeAll(() => {
      mdHighlighter.parseBuffer("md", MARKDOWN_SOURCE);
    });

    it("still collapses fenced code blocks to a single token per row", () => {
      const lines = MARKDOWN_SOURCE.split("\n");
      const fenceContentRow = lines.indexOf("const x: number = 1;");
      expect(fenceContentRow).toBeGreaterThan(0);
      // Inside a fence the whole row is one token, not per-node highlighting.
      const tokens = mdHighlighter.getLineTokens("md", fenceContentRow);
      expect(tokens.length).toBe(1);
    });

    it("collapses a bare fence with no info string", () => {
      const lines = MARKDOWN_SOURCE.split("\n");
      const bareRow = lines.indexOf("bare fence, no info string");
      expect(bareRow).toBeGreaterThan(0);
      expect(mdHighlighter.getLineTokens("md", bareRow).length).toBe(1);
    });

    it("highlights every markdown row without throwing", () => {
      const rows = MARKDOWN_SOURCE.split("\n").length;
      for (let row = 0; row < rows; row++) {
        expect(() => mdHighlighter.getLineTokens("md", row)).not.toThrow();
      }
    });
  });
});
