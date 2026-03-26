/**
 * Multi-language syntax highlighter.
 *
 * Extends the tree-sitter highlighter to support multiple language grammars,
 * switching per-buffer based on filename/language detection.
 *
 * @example
 * ```ts
 * const highlighter = new MultiLanguageHighlighter();
 * await highlighter.init("./wasm/tree-sitter.wasm", {
 *   typescript: "./grammars/tree-sitter-typescript.wasm",
 *   rust: "./grammars/tree-sitter-rust.wasm",
 *   python: "./grammars/tree-sitter-python.wasm",
 * });
 *
 * // Parse with explicit language
 * highlighter.parseBuffer("main.rs", rustCode, undefined, "rust");
 *
 * // Parse with auto-detection from buffer ID (treated as file path)
 * highlighter.parseBuffer("src/main.rs", rustCode);
 *
 * // Get tokens for a line
 * const tokens = highlighter.getLineTokens("src/main.rs", 0);
 * ```
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
import { detectLanguage } from "./language-detection.ts";
import type { LanguageQuery } from "./queries/types.ts";
import { colorForNodeType } from "./theme.ts";

/** Per-buffer state: the parse tree and which language was used. */
interface BufferState {
  tree: Tree;
  language: string;
}

/**
 * Syntax highlighter that supports multiple tree-sitter language grammars.
 *
 * Load grammars at init time or lazily via `loadLanguage()`. Each buffer
 * is parsed with its detected (or explicitly specified) language grammar.
 */
export class MultiLanguageHighlighter implements SyntaxHighlighter {
  private _parsers = new Map<string, ParserType>();
  private _languages = new Map<string, Language>();
  private _buffers = new Map<string, BufferState>();
  private _ready = false;
  private _languageQueries = new Map<string, LanguageQuery>();

  // Module reference for creating new parsers after init
  private _parserModule: {
    Parser: new () => ParserType;
    Language: { load: (path: string) => Promise<Language> };
  } | null = null;

  get ready(): boolean {
    return this._ready;
  }

  /**
   * Initialize with tree-sitter core WASM and one or more language grammars.
   *
   * @param treeSitterWasmUrl - URL to the tree-sitter WASM binary
   * @param grammars - Map of language ID → WASM grammar URL
   *
   * @example
   * ```ts
   * await highlighter.init("./wasm/tree-sitter.wasm", {
   *   typescript: "./grammars/tree-sitter-typescript.wasm",
   *   rust: "./grammars/tree-sitter-rust.wasm",
   * });
   * ```
   */
  async init(
    treeSitterWasmUrl: string,
    grammars: Record<string, string>,
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

    // Load all grammars in parallel
    const entries = Object.entries(grammars);
    await Promise.all(
      entries.map(async ([langId, wasmUrl]) => {
        const language = await LangClass.load(wasmUrl);
        this._languages.set(langId, language);

        const parser: ParserType = new Parser();
        parser.setLanguage(language);
        this._parsers.set(langId, parser);
      }),
    );

    this._ready = true;
  }

  /**
   * Load an additional language grammar after initialization.
   *
   * @param langId - Language identifier (e.g., "python")
   * @param wasmUrl - URL to the language's WASM grammar
   */
  async loadLanguage(langId: string, wasmUrl: string): Promise<void> {
    if (!this._parserModule) {
      throw new Error("MultiLanguageHighlighter not initialized — call init() first");
    }

    const language = await this._parserModule.Language.load(wasmUrl);
    this._languages.set(langId, language);

    const parser = new this._parserModule.Parser();
    parser.setLanguage(language);
    this._parsers.set(langId, parser);
  }

  /**
   * Register a language query for language-specific node type mappings.
   * Optional — without a query, the combined/global node type map is used.
   */
  setLanguageQuery(langId: string, query: LanguageQuery): void {
    this._languageQueries.set(langId, query);
  }

  /**
   * Check if a grammar is loaded for the given language.
   */
  hasLanguage(langId: string): boolean {
    return this._parsers.has(langId);
  }

  /**
   * Get the list of loaded language IDs.
   */
  getLoadedLanguages(): string[] {
    return Array.from(this._parsers.keys());
  }

  /**
   * Parse a buffer's text with the appropriate language grammar.
   *
   * Language is resolved in order:
   * 1. Explicit `language` parameter
   * 2. Auto-detection from `bufferId` (treated as a file path)
   * 3. First loaded grammar (fallback)
   *
   * @param bufferId - Buffer identifier (typically a file path)
   * @param text - Full text content of the buffer
   * @param edit - Optional incremental edit descriptor
   * @param language - Optional explicit language override
   */
  parseBuffer(bufferId: string, text: string, edit?: TreeEdit, language?: string): void {
    const langId = language ?? detectLanguage(bufferId) ?? this._firstLanguage();
    if (!langId) return;

    const parser = this._parsers.get(langId);
    if (!parser) return;

    const existing = this._buffers.get(bufferId);
    const oldTree = existing?.tree;

    // If language changed, discard old tree (can't do incremental across languages)
    if (oldTree && edit && existing?.language === langId) {
      applyTreeEdit(oldTree, edit);
    }

    const tree = parser.parse(text, existing?.language === langId ? oldTree : undefined);
    if (tree) {
      this._buffers.set(bufferId, { tree, language: langId });
    } else if (oldTree && edit) {
      this._buffers.delete(bufferId);
    }
  }

  /**
   * Delete a buffer's parse tree, freeing the associated memory.
   */
  deleteBuffer(bufferId: string): void {
    const state = this._buffers.get(bufferId);
    if (state) {
      state.tree.delete();
      this._buffers.delete(bufferId);
    }
  }

  /**
   * Get the detected/assigned language for a buffer.
   * Returns null if the buffer hasn't been parsed.
   */
  getBufferLanguage(bufferId: string): string | null {
    return this._buffers.get(bufferId)?.language ?? null;
  }

  /**
   * Get syntax tokens for a specific line of a buffer.
   * Returns tokens in startColumn order.
   */
  getLineTokens(bufferId: string, row: number): Token[] {
    const state = this._buffers.get(bufferId);
    if (!state) return [];

    const query = this._languageQueries.get(state.language);
    const tokens: Token[] = [];
    this._collectTokens(state.tree.rootNode, row, tokens, null, query);
    return tokens;
  }

  private _firstLanguage(): string | null {
    const first = this._parsers.keys().next();
    // biome-ignore lint/plugin/no-type-assertion: expect: iterator result value is string when not done
    return (first as IteratorResult<string>).done ? null : (first as IteratorResult<string>).value;
  }

  private _collectTokens(
    node: Node,
    targetRow: number,
    tokens: Token[],
    inheritedColor: string | null,
    query?: LanguageQuery,
  ): void {
    if (
      node.endPosition.row < targetRow ||
      node.startPosition.row > targetRow
    ) {
      return;
    }

    const nodeType = node.type;

    // Skip highlighting inside code blocks
    if (query?.skipChildren?.has(nodeType)) {
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
    if (query?.styledParents?.has(nodeType)) {
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
        this._collectTokens(child, targetRow, tokens, colorToPropagate, query);
      }
    }
  }
}
