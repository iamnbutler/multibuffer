/**
 * Tree-sitter based syntax highlighter.
 * Parses buffers once, then extracts tokens for visible lines on demand.
 *
 * ## Single-language usage (Highlighter)
 *
 * For simple use cases where all buffers use the same language:
 *
 * ```ts
 * const highlighter = new Highlighter();
 * await highlighter.init(treeSitterWasmUrl, typescriptWasmUrl);
 * highlighter.parseBuffer("file.ts", sourceCode);
 * const tokens = highlighter.getLineTokens("file.ts", 0);
 * ```
 *
 * ## Multi-language usage (MultiLanguageHighlighter)
 *
 * For diff viewers and multi-file editors that need multiple languages:
 *
 * ```ts
 * const highlighter = new MultiLanguageHighlighter();
 * await highlighter.init(treeSitterWasmUrl, {
 *   typescript: "/grammars/tree-sitter-typescript.wasm",
 *   rust: "/grammars/tree-sitter-rust.wasm",
 *   python: "/grammars/tree-sitter-python.wasm",
 * });
 *
 * // Parse with explicit language
 * highlighter.parseBuffer("main.rs", rustCode, undefined, "rust");
 *
 * // Or auto-detect from filename
 * highlighter.parseBufferWithPath("src/main.rs", rustCode);
 * ```
 *
 * ## Custom highlighter implementations
 *
 * Consumers can implement the {@link SyntaxHighlighter} interface to bring
 * their own highlighting engine (e.g., Shiki, Prism, or TextMate grammars):
 *
 * ```ts
 * class ShikiHighlighter implements SyntaxHighlighter {
 *   ready = false;
 *
 *   async init(theme: string) {
 *     // Load Shiki...
 *     this.ready = true;
 *   }
 *
 *   parseBuffer(bufferId: string, text: string) {
 *     // Cache highlighted tokens...
 *   }
 *
 *   getLineTokens(bufferId: string, row: number): Token[] {
 *     // Return tokens for the line...
 *   }
 * }
 * ```
 */

import type {
  Language,
  Node,
  Parser as ParserType,
  Point,
  Tree,
} from "web-tree-sitter";
import { detectLanguage, type LanguageId } from "./languages.ts";
import { colorForNodeType } from "./theme.ts";

export interface Token {
  startColumn: number;
  endColumn: number;
  color: string;
}

/**
 * Descriptor for an incremental edit, matching the data fields of
 * web-tree-sitter's `Edit` class. When provided to `parseBuffer`, the old
 * tree is updated via `tree.edit()` before being passed to `parser.parse()`,
 * enabling true incremental parsing.
 */
export interface TreeEdit {
  startIndex: number;
  oldEndIndex: number;
  newEndIndex: number;
  startPosition: Point;
  oldEndPosition: Point;
  newEndPosition: Point;
}

/**
 * Apply a {@link TreeEdit} descriptor to a tree-sitter `Tree`.
 *
 * `tree.edit()` expects the concrete `Edit` class at the type level, but
 * accepts a plain object with the same fields at runtime. This helper
 * centralises the single required type assertion so call-sites stay clean.
 */
export function applyTreeEdit(tree: Tree, edit: TreeEdit): void {
  // biome-ignore lint/plugin/no-type-assertion: expect: tree.edit() accepts plain objects at runtime despite the Edit class type
  tree.edit(edit as import("web-tree-sitter").Edit);
}

/**
 * Common interface for syntax highlighters.
 *
 * Implement this interface to provide custom syntax highlighting using
 * alternative engines like Shiki, Prism, or TextMate grammars.
 *
 * The renderer calls {@link parseBuffer} when buffer content changes, then
 * {@link getLineTokens} for each visible line during rendering.
 *
 * @example
 * ```ts
 * // Custom Shiki-based highlighter
 * class ShikiHighlighter implements SyntaxHighlighter {
 *   private _ready = false;
 *   private _cache = new Map<string, Token[][]>();
 *
 *   get ready() { return this._ready; }
 *
 *   async init() {
 *     // Initialize Shiki...
 *     this._ready = true;
 *   }
 *
 *   parseBuffer(bufferId: string, text: string): void {
 *     // Highlight entire buffer and cache tokens by line
 *     const highlighted = shiki.codeToTokens(text, { lang: 'typescript' });
 *     this._cache.set(bufferId, highlighted.tokens);
 *   }
 *
 *   getLineTokens(bufferId: string, row: number): Token[] {
 *     const lines = this._cache.get(bufferId);
 *     if (!lines || row >= lines.length) return [];
 *     return lines[row].map(t => ({
 *       startColumn: t.offset,
 *       endColumn: t.offset + t.content.length,
 *       color: t.color ?? 'inherit',
 *     }));
 *   }
 * }
 * ```
 */
export interface SyntaxHighlighter {
  /** Whether the highlighter is initialized and ready to use. */
  readonly ready: boolean;

  /**
   * Parse or re-parse buffer content for syntax highlighting.
   *
   * Called by the renderer when buffer content changes. Implementations
   * should cache the parse result for efficient {@link getLineTokens} calls.
   *
   * @param bufferId - Unique identifier for the buffer
   * @param text - Full text content of the buffer
   * @param edit - Optional incremental edit descriptor for tree-sitter
   */
  parseBuffer(bufferId: string, text: string, edit?: TreeEdit): void;

  /**
   * Get syntax tokens for a specific line.
   *
   * Called by the renderer for each visible line during rendering.
   * Tokens must be sorted by startColumn (ascending).
   *
   * @param bufferId - Buffer identifier passed to parseBuffer
   * @param row - Zero-based line number
   * @returns Array of tokens sorted by startColumn, or empty array if unavailable
   */
  getLineTokens(bufferId: string, row: number): Token[];
}

export class Highlighter implements SyntaxHighlighter {
  private _parser: ParserType | null = null;
  private _trees = new Map<string, Tree>();
  private _ready = false;

  get ready(): boolean {
    return this._ready;
  }

  async init(
    treeSitterWasmUrl: string,
    languageWasmUrl: string,
  ): Promise<void> {
    const mod = await import("web-tree-sitter");
    const Parser = mod.Parser ?? mod.default;
    await Parser.init({
      locateFile: () => treeSitterWasmUrl,
    });
    this._parser = new Parser();
    const LangClass =
      mod.Language ??
      // biome-ignore lint/plugin/no-type-assertion: expect: Language is exported at module level but also accessible via Parser
      (Parser as unknown as { Language: typeof Language }).Language;
    const language = await LangClass.load(languageWasmUrl);
    this._parser.setLanguage(language);
    this._ready = true;
  }

  parseBuffer(bufferId: string, text: string, edit?: TreeEdit): void {
    if (!this._parser) return;
    const oldTree = this._trees.get(bufferId);
    if (oldTree && edit) {
      applyTreeEdit(oldTree, edit);
    }
    const tree = this._parser.parse(text, oldTree);
    if (tree) {
      this._trees.set(bufferId, tree);
    } else if (oldTree && edit) {
      // The old tree was mutated by tree.edit() but parse failed —
      // remove the corrupted tree so subsequent calls don't reuse it.
      this._trees.delete(bufferId);
    }
  }

  /**
   * Get syntax tokens for a specific line of a buffer.
   * Returns tokens in startColumn order (guaranteed by depth-first tree traversal).
   */
  getLineTokens(bufferId: string, row: number): Token[] {
    const tree = this._trees.get(bufferId);
    if (!tree) return [];

    const tokens: Token[] = [];
    this._collectTokens(tree.rootNode, row, tokens, null);
    return tokens;
  }

  /** Node types that should not have their children highlighted (code injections). */
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

    // Skip highlighting inside code blocks - just use default color for the whole range
    // TODO: Use proper treesitter grammar/package to highlight injections
    if (Highlighter.SKIP_CHILDREN.has(nodeType)) {
      const startCol =
        node.startPosition.row === targetRow ? node.startPosition.column : 0;
      const endCol =
        node.endPosition.row === targetRow
          ? node.endPosition.column
          : Number.MAX_SAFE_INTEGER;
      if (startCol < endCol) {
        // Use comment color for code blocks to differentiate them
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
    if (Highlighter.STYLED_PARENTS.has(nodeType)) {
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
        // Use inherited color if available, otherwise determine from node type
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

/**
 * Configuration options for MultiLanguageHighlighter initialization.
 */
export interface MultiLanguageHighlighterOptions {
  /**
   * URL or path to the tree-sitter WASM runtime.
   * This is the core tree-sitter.wasm file, not language-specific.
   */
  treeSitterWasmUrl: string;

  /**
   * Map of language IDs to their grammar WASM URLs.
   *
   * @example
   * ```ts
   * {
   *   typescript: "/grammars/tree-sitter-typescript.wasm",
   *   rust: "/grammars/tree-sitter-rust.wasm",
   *   python: "/grammars/tree-sitter-python.wasm",
   * }
   * ```
   */
  languages: Partial<Record<LanguageId, string>>;
}

/**
 * Multi-language syntax highlighter using tree-sitter.
 *
 * Supports loading multiple language grammars and selecting the appropriate
 * one per buffer based on language ID or filename extension.
 *
 * @example
 * ```ts
 * const highlighter = new MultiLanguageHighlighter();
 * await highlighter.init({
 *   treeSitterWasmUrl: "/wasm/tree-sitter.wasm",
 *   languages: {
 *     typescript: "/grammars/tree-sitter-typescript.wasm",
 *     rust: "/grammars/tree-sitter-rust.wasm",
 *   },
 * });
 *
 * // Explicit language
 * highlighter.parseBuffer("file.ts", code, undefined, "typescript");
 *
 * // Auto-detect from path
 * highlighter.parseBufferWithPath("src/main.rs", rustCode);
 * ```
 */
export class MultiLanguageHighlighter implements SyntaxHighlighter {
  private _parser: ParserType | null = null;
  private _languages = new Map<LanguageId, Language>();
  private _trees = new Map<string, Tree>();
  private _bufferLanguages = new Map<string, LanguageId>();
  private _ready = false;
  private _pendingLoads = new Map<LanguageId, Promise<Language | null>>();
  private _languageUrls: Partial<Record<LanguageId, string>> = {};
  private _LangClass: typeof Language | null = null;

  get ready(): boolean {
    return this._ready;
  }

  /**
   * Get the set of currently loaded language IDs.
   */
  get loadedLanguages(): ReadonlySet<LanguageId> {
    return new Set(this._languages.keys());
  }

  /**
   * Initialize the highlighter with the tree-sitter runtime and language grammars.
   *
   * @param options - Configuration with tree-sitter URL and language grammar URLs
   */
  async init(options: MultiLanguageHighlighterOptions): Promise<void> {
    const { treeSitterWasmUrl, languages } = options;

    const mod = await import("web-tree-sitter");
    const Parser = mod.Parser ?? mod.default;
    await Parser.init({
      locateFile: () => treeSitterWasmUrl,
    });

    this._parser = new Parser();
    this._LangClass =
      mod.Language ??
      // biome-ignore lint/plugin/no-type-assertion: expect: Language is exported at module level but also accessible via Parser
      (Parser as unknown as { Language: typeof Language }).Language;

    this._languageUrls = languages;

    // Load all configured languages
    const loadPromises = Object.entries(languages).map(async ([langId, url]) => {
      if (url) {
        // biome-ignore lint/plugin/no-type-assertion: expect: Object.entries loses key typing, langId is a valid LanguageId key
        await this._loadLanguage(langId as LanguageId, url);
      }
    });

    await Promise.all(loadPromises);
    this._ready = true;
  }

  /**
   * Load a language grammar dynamically.
   *
   * Use this to add language support after initialization, or to lazy-load
   * grammars on demand.
   *
   * @param languageId - Language identifier
   * @param wasmUrl - URL or path to the grammar WASM file
   * @returns Promise resolving when the language is loaded
   */
  async loadLanguage(languageId: LanguageId, wasmUrl: string): Promise<void> {
    this._languageUrls[languageId] = wasmUrl;
    await this._loadLanguage(languageId, wasmUrl);
  }

  private async _loadLanguage(languageId: LanguageId, wasmUrl: string): Promise<Language | null> {
    // Return existing language if already loaded
    const existing = this._languages.get(languageId);
    if (existing) return existing;

    // Return pending promise if already loading
    const pending = this._pendingLoads.get(languageId);
    if (pending) return pending;

    // Start loading
    const loadPromise = (async () => {
      try {
        if (!this._LangClass) return null;
        const language = await this._LangClass.load(wasmUrl);
        this._languages.set(languageId, language);
        return language;
      } catch (e) {
        console.warn(`Failed to load language "${languageId}" from ${wasmUrl}:`, e);
        return null;
      } finally {
        this._pendingLoads.delete(languageId);
      }
    })();

    this._pendingLoads.set(languageId, loadPromise);
    return loadPromise;
  }

  /**
   * Check if a language grammar is loaded and available.
   */
  hasLanguage(languageId: LanguageId): boolean {
    return this._languages.has(languageId);
  }

  /**
   * Parse a buffer with an explicit language ID.
   *
   * @param bufferId - Unique identifier for the buffer
   * @param text - Full text content
   * @param edit - Optional incremental edit descriptor
   * @param languageId - Language to use for parsing (optional, uses last known or plaintext)
   */
  parseBuffer(bufferId: string, text: string, edit?: TreeEdit, languageId?: LanguageId): void {
    if (!this._parser) return;

    // Determine language: explicit > previously set > plaintext
    const lang = languageId ?? this._bufferLanguages.get(bufferId) ?? "plaintext";

    // Store the language for this buffer
    if (languageId) {
      this._bufferLanguages.set(bufferId, languageId);
    }

    // Get the language grammar
    const language = this._languages.get(lang);
    if (!language) {
      // No grammar available - clear any existing tree
      this._trees.delete(bufferId);
      return;
    }

    // Set the parser language
    this._parser.setLanguage(language);

    // Parse with optional incremental edit
    const oldTree = this._trees.get(bufferId);
    if (oldTree && edit) {
      applyTreeEdit(oldTree, edit);
    }

    const tree = this._parser.parse(text, oldTree);
    if (tree) {
      this._trees.set(bufferId, tree);
    } else if (oldTree && edit) {
      this._trees.delete(bufferId);
    }
  }

  /**
   * Parse a buffer, auto-detecting language from the file path.
   *
   * @param path - File path used for language detection (e.g., "src/main.rs")
   * @param text - Full text content
   * @param edit - Optional incremental edit descriptor
   */
  parseBufferWithPath(path: string, text: string, edit?: TreeEdit): void {
    const languageId = detectLanguage(path);
    this.parseBuffer(path, text, edit, languageId);
  }

  /**
   * Set the language for a buffer without re-parsing.
   * Call parseBuffer after this to apply the language.
   */
  setBufferLanguage(bufferId: string, languageId: LanguageId): void {
    this._bufferLanguages.set(bufferId, languageId);
  }

  /**
   * Get the language ID currently associated with a buffer.
   */
  getBufferLanguage(bufferId: string): LanguageId | undefined {
    return this._bufferLanguages.get(bufferId);
  }

  /**
   * Get syntax tokens for a specific line of a buffer.
   * Returns tokens in startColumn order (guaranteed by depth-first tree traversal).
   */
  getLineTokens(bufferId: string, row: number): Token[] {
    const tree = this._trees.get(bufferId);
    if (!tree) return [];

    const tokens: Token[] = [];
    this._collectTokens(tree.rootNode, row, tokens, null);
    return tokens;
  }

  /** Node types that should not have their children highlighted (code injections). */
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

    // Skip highlighting inside code blocks - just use default color for the whole range
    if (MultiLanguageHighlighter.SKIP_CHILDREN.has(nodeType)) {
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
    if (MultiLanguageHighlighter.STYLED_PARENTS.has(nodeType)) {
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
   * Remove a buffer's parse tree and language association.
   */
  removeBuffer(bufferId: string): void {
    this._trees.delete(bufferId);
    this._bufferLanguages.delete(bufferId);
  }
}
