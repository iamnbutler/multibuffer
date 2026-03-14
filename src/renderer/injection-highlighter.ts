/**
 * Tree-sitter based syntax highlighter with language injection support.
 * Supports highlighting embedded languages (e.g., YAML in markdown frontmatter).
 */

import type {
  Language,
  Node,
  Parser as ParserType,
  Tree,
} from "web-tree-sitter";
import {
  applyTreeEdit,
  type SyntaxHighlighter,
  type Token,
  type TreeEdit,
} from "./highlighter.ts";
import { colorForNodeType } from "./theme.ts";

export type { Token };

/** Represents a range that should be highlighted with a different language. */
interface InjectionRange {
  language: string;
  startRow: number;
  startColumn: number;
  endRow: number;
  endColumn: number;
  /** The text content to parse with the injected language. */
  text: string;
  /** Row offset to apply when converting injection tokens to buffer coordinates. */
  rowOffset: number;
}

/** Cached parse result for a buffer. */
interface BufferParse {
  tree: Tree;
  injections: Map<string, Tree>; // language -> tree for injected content
  injectionRanges: InjectionRange[];
}

/**
 * Highlighter with support for language injections.
 *
 * Injections allow embedded languages to be highlighted correctly,
 * such as YAML frontmatter in Markdown files.
 */
export class InjectionHighlighter implements SyntaxHighlighter {
  private _parsers = new Map<string, ParserType>();
  private _languages = new Map<string, Language>();
  private _bufferParses = new Map<string, BufferParse>();
  private _primaryLanguage: string | null = null;
  private _ready = false;

  // Module reference for creating new parsers
  private _parserModule: {
    Parser: new () => ParserType;
    Language: { load: (path: string) => Promise<Language> };
  } | null = null;

  get ready(): boolean {
    return this._ready;
  }

  /**
   * Initialize the highlighter with tree-sitter and a primary language.
   */
  async init(
    treeSitterWasmUrl: string,
    primaryLanguageWasmUrl: string,
    primaryLanguageName: string,
  ): Promise<void> {
    const mod = await import("web-tree-sitter");
    const Parser = mod.Parser ?? mod.default;
    await Parser.init({
      locateFile: () => treeSitterWasmUrl,
    });

    const LangClass =
      mod.Language ??
      // biome-ignore lint/plugin/no-type-assertion: expect: Language is exported at module level but also accessible via Parser
      (Parser as unknown as { Language: typeof Language }).Language;

    this._parserModule = { Parser, Language: LangClass };

    // Load primary language
    const language = await LangClass.load(primaryLanguageWasmUrl);
    this._languages.set(primaryLanguageName, language);

    const parser: ParserType = new Parser();
    parser.setLanguage(language);
    this._parsers.set(primaryLanguageName, parser);

    this._primaryLanguage = primaryLanguageName;
    this._ready = true;
  }

  /**
   * Load an additional language for injection support.
   */
  async loadLanguage(name: string, wasmUrl: string): Promise<void> {
    if (!this._parserModule) {
      throw new Error("Highlighter not initialized");
    }

    const language = await this._parserModule.Language.load(wasmUrl);
    this._languages.set(name, language);

    const parser = new this._parserModule.Parser();
    parser.setLanguage(language);
    this._parsers.set(name, parser);
  }

  /**
   * Check if a language is available for injection.
   */
  hasLanguage(name: string): boolean {
    return this._languages.has(name);
  }

  /**
   * Parse a buffer and detect injection ranges.
   *
   * When `edit` is provided, the old primary tree is updated via `tree.edit()`
   * before incremental re-parse. Injection sub-parses always do a full parse
   * because their text subsets change unpredictably with edits.
   */
  parseBuffer(bufferId: string, text: string, edit?: TreeEdit): void {
    const primaryParser = this._parsers.get(this._primaryLanguage ?? "");
    if (!primaryParser) return;

    // Pass old tree for incremental parsing of the primary language
    const oldParse = this._bufferParses.get(bufferId);
    const oldTree = oldParse?.tree;
    if (oldTree && edit) {
      applyTreeEdit(oldTree, edit);
    }
    const tree = primaryParser.parse(text, oldTree);
    if (!tree) {
      if (oldParse && edit) {
        // The old tree was mutated by tree.edit() but parse failed —
        // remove the corrupted parse so subsequent calls don't reuse it.
        this._bufferParses.delete(bufferId);
      }
      return;
    }

    // Find injection ranges
    const injectionRanges = this._findInjectionRanges(tree.rootNode, text);

    // Parse injected content
    const injections = new Map<string, Tree>();
    for (const range of injectionRanges) {
      const injParser = this._parsers.get(range.language);
      if (injParser) {
        const injTree = injParser.parse(range.text);
        if (injTree) {
          // Use a unique key combining language and position
          const key = `${range.language}:${range.startRow}`;
          injections.set(key, injTree);
        }
      }
    }

    this._bufferParses.set(bufferId, { tree, injections, injectionRanges });
  }

  /**
   * Get syntax tokens for a specific line of a buffer.
   * Returns tokens sorted by startColumn with pre-resolved colors.
   */
  getLineTokens(bufferId: string, row: number): Token[] {
    const parse = this._bufferParses.get(bufferId);
    if (!parse) return [];

    const tokens: Token[] = [];

    // Check if this row is inside an injection range
    const activeInjection = parse.injectionRanges.find(
      (r) => row >= r.startRow && row <= r.endRow,
    );

    if (activeInjection) {
      // Get tokens from injected language
      const key = `${activeInjection.language}:${activeInjection.startRow}`;
      const injTree = parse.injections.get(key);

      if (injTree) {
        // Calculate the relative row within the injection
        const relativeRow = row - activeInjection.rowOffset;
        this._collectTokens(injTree.rootNode, relativeRow, tokens, null);
      }
    } else {
      // Get tokens from primary language, but skip injection ranges
      this._collectTokensWithInjectionSkip(
        parse.tree.rootNode,
        row,
        tokens,
        null,
        parse.injectionRanges,
      );
    }

    tokens.sort((a, b) => a.startColumn - b.startColumn);
    return tokens;
  }

  /** Node types that should not have their children highlighted. */
  private static readonly SKIP_CHILDREN = new Set([
    "fenced_code_block",
    "indented_code_block",
    "code_span",
  ]);

  /** Node types that propagate their styling to all children. */
  private static readonly STYLED_PARENTS = new Set([
    "atx_heading",
    "setext_heading",
    "emphasis",
    "strong_emphasis",
    "strikethrough",
    "link_text",
    "inline_link",
    "shortcut_link",
  ]);

  /**
   * Find ranges that should be highlighted with a different language.
   */
  private _findInjectionRanges(root: Node, _fullText: string): InjectionRange[] {
    const ranges: InjectionRange[] = [];

    const walk = (node: Node) => {
      // YAML frontmatter (minus_metadata)
      if (node.type === "minus_metadata") {
        const text = node.text;
        const lines = text.split("\n");
        // Skip first line (---) and last line (---)
        const yamlLines = lines.slice(1, -1);
        const yamlText = yamlLines.join("\n");

        if (yamlText.trim()) {
          ranges.push({
            language: "yaml",
            startRow: node.startPosition.row + 1,
            startColumn: 0,
            endRow: node.endPosition.row - 1,
            endColumn: yamlLines[yamlLines.length - 1]?.length ?? 0,
            text: yamlText,
            rowOffset: node.startPosition.row + 1,
          });
        }
      }

      // TOML frontmatter (plus_metadata)
      if (node.type === "plus_metadata") {
        const text = node.text;
        const lines = text.split("\n");
        const tomlLines = lines.slice(1, -1);
        const tomlText = tomlLines.join("\n");

        if (tomlText.trim()) {
          ranges.push({
            language: "toml",
            startRow: node.startPosition.row + 1,
            startColumn: 0,
            endRow: node.endPosition.row - 1,
            endColumn: tomlLines[tomlLines.length - 1]?.length ?? 0,
            text: tomlText,
            rowOffset: node.startPosition.row + 1,
          });
        }
      }

      // Fenced code blocks with language info
      if (node.type === "fenced_code_block") {
        let language: string | null = null;
        let contentNode: Node | null = null;

        for (let i = 0; i < node.childCount; i++) {
          const child = node.child(i);
          if (!child) continue;

          if (child.type === "info_string") {
            for (let j = 0; j < child.childCount; j++) {
              const langChild = child.child(j);
              if (langChild?.type === "language") {
                language = langChild.text.toLowerCase();
              }
            }
          }
          if (child.type === "code_fence_content") {
            contentNode = child;
          }
        }

        if (language && contentNode && contentNode.text.trim()) {
          ranges.push({
            language,
            startRow: contentNode.startPosition.row,
            startColumn: contentNode.startPosition.column,
            endRow: contentNode.endPosition.row,
            endColumn: contentNode.endPosition.column,
            text: contentNode.text,
            rowOffset: contentNode.startPosition.row,
          });
        }
      }

      // Recurse
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child) walk(child);
      }
    };

    walk(root);
    return ranges;
  }

  /**
   * Collect tokens from a tree, handling styled parents and leaf nodes.
   */
  private _collectTokens(
    node: Node,
    targetRow: number,
    tokens: Token[],
    inheritedColor: string | null,
  ): void {
    if (
      node.endPosition.row < targetRow ||
      node.startPosition.row > targetRow
    ) {
      return;
    }

    const nodeType = node.type;

    // Determine if this node should propagate its color to children
    let colorToPropagate = inheritedColor;
    if (InjectionHighlighter.STYLED_PARENTS.has(nodeType)) {
      colorToPropagate = colorForNodeType(nodeType);
    }

    // Leaf node - apply color
    if (node.childCount === 0) {
      const startCol =
        node.startPosition.row === targetRow ? node.startPosition.column : 0;
      const endCol =
        node.endPosition.row === targetRow
          ? node.endPosition.column
          : Number.MAX_SAFE_INTEGER;

      if (startCol < endCol) {
        const color = colorToPropagate ?? colorForNodeType(nodeType);
        tokens.push({
          startColumn: startCol,
          endColumn: endCol,
          color,
        });
      }
      return;
    }

    // Recurse into children
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) {
        this._collectTokens(child, targetRow, tokens, colorToPropagate);
      }
    }
  }

  /**
   * Collect tokens but skip nodes that are inside injection ranges.
   */
  private _collectTokensWithInjectionSkip(
    node: Node,
    targetRow: number,
    tokens: Token[],
    inheritedColor: string | null,
    injectionRanges: InjectionRange[],
  ): void {
    if (
      node.endPosition.row < targetRow ||
      node.startPosition.row > targetRow
    ) {
      return;
    }

    const nodeType = node.type;

    // Skip if this node is a container for an injection (like minus_metadata)
    if (nodeType === "minus_metadata" || nodeType === "plus_metadata") {
      // Only highlight the delimiter lines, not the content
      if (
        targetRow === node.startPosition.row ||
        targetRow === node.endPosition.row
      ) {
        // Highlight the --- delimiter
        const startCol =
          node.startPosition.row === targetRow ? node.startPosition.column : 0;
        const endCol =
          node.endPosition.row === targetRow
            ? node.endPosition.column
            : Number.MAX_SAFE_INTEGER;

        if (startCol < endCol) {
          tokens.push({
            startColumn: startCol,
            endColumn: endCol,
            color: colorForNodeType("fenced_code_block_delimiter"),
          });
        }
      }
      return;
    }

    // Skip code blocks - their content is handled by injection
    if (InjectionHighlighter.SKIP_CHILDREN.has(nodeType)) {
      const startCol =
        node.startPosition.row === targetRow ? node.startPosition.column : 0;
      const endCol =
        node.endPosition.row === targetRow
          ? node.endPosition.column
          : Number.MAX_SAFE_INTEGER;
      if (startCol < endCol) {
        tokens.push({
          startColumn: startCol,
          endColumn: endCol,
          color: colorForNodeType("fenced_code_block_delimiter"),
        });
      }
      return;
    }

    // Determine if this node should propagate its color to children
    let colorToPropagate = inheritedColor;
    if (InjectionHighlighter.STYLED_PARENTS.has(nodeType)) {
      colorToPropagate = colorForNodeType(nodeType);
    }

    // Leaf node - apply color
    if (node.childCount === 0) {
      const startCol =
        node.startPosition.row === targetRow ? node.startPosition.column : 0;
      const endCol =
        node.endPosition.row === targetRow
          ? node.endPosition.column
          : Number.MAX_SAFE_INTEGER;

      if (startCol < endCol) {
        const color = colorToPropagate ?? colorForNodeType(nodeType);
        tokens.push({
          startColumn: startCol,
          endColumn: endCol,
          color,
        });
      }
      return;
    }

    // Recurse into children
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) {
        this._collectTokensWithInjectionSkip(
          child,
          targetRow,
          tokens,
          colorToPropagate,
          injectionRanges,
        );
      }
    }
  }
}

/**
 * Build highlighted span elements inside a container.
 * Fills gaps between tokens with default-colored text.
 */
export function buildHighlightedSpans(
  container: HTMLElement,
  text: string,
  tokens: Token[],
): void {
  container.textContent = "";

  let pos = 0;
  for (const token of tokens) {
    if (token.startColumn > pos) {
      const gap = document.createElement("span");
      gap.textContent = text.slice(pos, token.startColumn);
      container.appendChild(gap);
    }

    const end = Math.min(token.endColumn, text.length);
    if (token.startColumn < end) {
      const span = document.createElement("span");
      span.style.color = token.color;
      span.textContent = text.slice(token.startColumn, end);
      container.appendChild(span);
    }

    pos = Math.max(pos, end);
  }

  if (pos < text.length) {
    const trailing = document.createElement("span");
    trailing.textContent = text.slice(pos);
    container.appendChild(trailing);
  }
}
