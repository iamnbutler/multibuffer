/**
 * InjectionHighlighter benchmarks.
 *
 * Measures tree-sitter parse + injection performance for markdown documents
 * containing YAML frontmatter and fenced code blocks with embedded languages.
 *
 * Uses async `setup` to load tree-sitter WASM (same paths as the test suite).
 */

import * as path from "node:path";
import { InjectionHighlighter } from "../src/renderer/injection-highlighter.ts";
import { markdownQuery } from "../src/renderer/queries/index.ts";
import type { BenchmarkSuite } from "./harness.ts";

const WASM_DIR = path.join(import.meta.dir, "../playground/wasm");

/** Markdown with YAML frontmatter (~20 lines). */
function generateMarkdownWithFrontmatter(bodyLines: number): string {
  const frontmatter = [
    "---",
    "title: Benchmark Document",
    "author: Performance Suite",
    "date: 2026-03-26",
    "tags:",
    "  - benchmark",
    "  - performance",
    "  - injection-highlighter",
    "enabled: true",
    "count: 42",
    "---",
  ].join("\n");

  const body = Array.from(
    { length: bodyLines },
    (_, i) => `This is paragraph ${i} with **bold** and *italic* text and a [link](http://example.com).`,
  ).join("\n\n");

  return `${frontmatter}\n\n${body}`;
}

/** Markdown with multiple fenced TypeScript code blocks. */
function generateMarkdownWithCodeBlocks(blockCount: number): string {
  const sections = Array.from({ length: blockCount }, (_, i) => {
    const codeLines = Array.from(
      { length: 10 },
      (_, j) => `const var${i}_${j}: number = ${i * 10 + j};`,
    ).join("\n");
    return `## Section ${i}\n\nSome text before code block ${i}.\n\n\`\`\`typescript\n${codeLines}\n\`\`\`\n`;
  });
  return sections.join("\n");
}

const markdownFrontmatter500 = generateMarkdownWithFrontmatter(500);
const markdownFrontmatter2k = generateMarkdownWithFrontmatter(2000);
const markdownCodeBlocks20 = generateMarkdownWithCodeBlocks(20);

// Shared highlighter initialized by the first benchmark's setup
let highlighter: InjectionHighlighter;

export const injectionHighlighterBenchmarks: BenchmarkSuite = {
  name: "InjectionHighlighter Operations",
  benchmarks: [
    // ── Full parse with YAML frontmatter (500 body lines) ─────────
    {
      name: "Full parse - markdown+YAML frontmatter (500 body lines)",
      iterations: 50,
      targetMs: 30,
      setup: async () => {
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
        await highlighter.loadLanguage(
          "typescript",
          path.join(WASM_DIR, "tree-sitter-typescript.wasm"),
        );
      },
      fn: () => {
        highlighter.parseBuffer(
          `full-fm-500-${Math.random()}`,
          markdownFrontmatter500,
        );
      },
    },

    // ── Full parse with YAML frontmatter (2K body lines) ──────────
    {
      name: "Full parse - markdown+YAML frontmatter (2K body lines)",
      iterations: 20,
      targetMs: 100,
      fn: () => {
        highlighter.parseBuffer(
          `full-fm-2k-${Math.random()}`,
          markdownFrontmatter2k,
        );
      },
    },

    // ── Full parse with 20 fenced code blocks ─────────────────────
    {
      name: "Full parse - markdown with 20 fenced code blocks",
      iterations: 50,
      targetMs: 30,
      fn: () => {
        highlighter.parseBuffer(
          `full-cb-20-${Math.random()}`,
          markdownCodeBlocks20,
        );
      },
    },

    // ── getLineTokens on YAML frontmatter row ─────────────────────
    {
      name: "getLineTokens - YAML frontmatter row (injection path)",
      iterations: 10_000,
      targetMs: 1,
      setup: () => {
        highlighter.parseBuffer("tokens-fm", markdownFrontmatter500);
      },
      fn: () => {
        // Row 3 is inside YAML frontmatter (e.g., "date: 2026-03-26")
        highlighter.getLineTokens("tokens-fm", 3);
      },
    },

    // ── getLineTokens on primary markdown row (skip injection) ────
    {
      name: "getLineTokens - markdown body row (injection-skip path)",
      iterations: 10_000,
      targetMs: 1,
      setup: () => {
        highlighter.parseBuffer("tokens-body", markdownFrontmatter500);
      },
      fn: () => {
        // Row 20 is well past the frontmatter, in the markdown body
        highlighter.getLineTokens("tokens-body", 20);
      },
    },

    // ── getLineTokens on fenced code block row ────────────────────
    {
      name: "getLineTokens - fenced code block row (code injection path)",
      iterations: 10_000,
      targetMs: 1,
      setup: () => {
        highlighter.parseBuffer("tokens-cb", markdownCodeBlocks20);
      },
      fn: () => {
        // Row 5 is inside the first fenced code block's content
        highlighter.getLineTokens("tokens-cb", 5);
      },
    },
  ],
};
