/**
 * Tree-sitter based syntax highlighter.
 * Parses buffers once, then extracts tokens for visible lines on demand.
 */

import type {
  Language,
  Node,
  Parser as ParserType,
  Point,
  Tree,
} from "web-tree-sitter";
import type { LanguageQuery } from "./queries/types.ts";
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
 * Consumers can implement this interface to bring their own highlighting
 * engine (e.g., Shiki, Prism, TextMate grammars) and inject it into the
 * renderer via `renderer.setHighlighter(myHighlighter)`.
 *
 * @example Custom highlighter using Shiki
 * ```ts
 * import { getHighlighter } from "shiki";
 * import type { SyntaxHighlighter, Token } from "multibuffer/renderer";
 *
 * class ShikiHighlighter implements SyntaxHighlighter {
 *   private _shiki: Awaited<ReturnType<typeof getHighlighter>> | null = null;
 *   private _cache = new Map<string, Token[][]>();
 *   ready = false;
 *
 *   async init() {
 *     this._shiki = await getHighlighter({ themes: ["nord"], langs: ["typescript"] });
 *     this.ready = true;
 *   }
 *
 *   parseBuffer(bufferId: string, text: string): void {
 *     if (!this._shiki) return;
 *     const lines = text.split("\n");
 *     const allTokens: Token[][] = [];
 *     for (const line of lines) {
 *       const result = this._shiki.codeToTokens(line, { lang: "typescript", theme: "nord" });
 *       allTokens.push(result.tokens[0].map(t => ({
 *         startColumn: t.offset,
 *         endColumn: t.offset + t.content.length,
 *         color: t.color ?? "",
 *       })));
 *     }
 *     this._cache.set(bufferId, allTokens);
 *   }
 *
 *   getLineTokens(bufferId: string, row: number): Token[] {
 *     return this._cache.get(bufferId)?.[row] ?? [];
 *   }
 * }
 *
 * // Usage:
 * const highlighter = new ShikiHighlighter();
 * await highlighter.init();
 * renderer.setHighlighter(highlighter);
 * ```
 */
export interface SyntaxHighlighter {
  readonly ready: boolean;
  parseBuffer(bufferId: string, text: string, edit?: TreeEdit): void;
  getLineTokens(bufferId: string, row: number): Token[];
}

export class Highlighter implements SyntaxHighlighter {
  private _parser: ParserType | null = null;
  private _trees = new Map<string, Tree>();
  private _ready = false;
  private _languageQuery: LanguageQuery | undefined;

  constructor(languageQuery?: LanguageQuery) {
    this._languageQuery = languageQuery;
  }

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
   * Delete a buffer's parse tree, freeing the associated memory.
   */
  deleteBuffer(bufferId: string): void {
    const tree = this._trees.get(bufferId);
    if (tree) {
      tree.delete();
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
    if (this._languageQuery?.skipChildren?.has(nodeType)) {
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
    if (this._languageQuery?.styledParents?.has(nodeType)) {
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

/** Column decoration for intraline highlighting. */
interface ColumnDecoration {
  startColumn: number;
  endColumn: number;
  style: { backgroundColor?: string };
}

/**
 * Build highlighted span elements inside a container.
 * Fills gaps between tokens with default-colored text.
 * Optionally applies column decorations (intraline highlights) as backgrounds.
 */
export function buildHighlightedSpans(
  container: HTMLElement,
  text: string,
  tokens: Token[],
  columnDecorations?: ColumnDecoration[],
): void {
  container.textContent = "";

  // Build a list of background ranges from column decorations
  const bgRanges = columnDecorations ?? [];

  let pos = 0;
  for (const token of tokens) {
    if (token.startColumn > pos) {
      // Gap between tokens - render with any applicable column decorations
      renderTextWithBackground(container, text, pos, token.startColumn, undefined, bgRanges);
    }

    const end = Math.min(token.endColumn, text.length);
    if (token.startColumn < end) {
      // Token range - render with syntax color and any applicable column decorations
      renderTextWithBackground(container, text, token.startColumn, end, token.color, bgRanges);
    }

    pos = Math.max(pos, end);
  }

  if (pos < text.length) {
    // Trailing text
    renderTextWithBackground(container, text, pos, text.length, undefined, bgRanges);
  }
}

/**
 * Render a text range, splitting it by column decoration boundaries.
 */
function renderTextWithBackground(
  container: HTMLElement,
  text: string,
  start: number,
  end: number,
  color: string | undefined,
  bgRanges: ColumnDecoration[],
): void {
  // Find all column decoration boundaries within [start, end)
  const boundaries = new Set<number>();
  boundaries.add(start);
  boundaries.add(end);
  for (const bg of bgRanges) {
    if (bg.startColumn > start && bg.startColumn < end) {
      boundaries.add(bg.startColumn);
    }
    if (bg.endColumn > start && bg.endColumn < end) {
      boundaries.add(bg.endColumn);
    }
  }

  const sortedBoundaries = Array.from(boundaries).sort((a, b) => a - b);

  for (let i = 0; i < sortedBoundaries.length - 1; i++) {
    const segStart = sortedBoundaries[i] ?? start;
    const segEnd = sortedBoundaries[i + 1] ?? end;

    // Find background color for this segment (last decoration wins)
    let bgColor: string | undefined;
    for (const bg of bgRanges) {
      if (bg.startColumn <= segStart && bg.endColumn >= segEnd && bg.style.backgroundColor) {
        bgColor = bg.style.backgroundColor;
      }
    }

    const span = document.createElement("span");
    if (color) span.style.color = color;
    if (bgColor) span.style.backgroundColor = bgColor;
    span.textContent = text.slice(segStart, segEnd);
    container.appendChild(span);
  }
}

/**
 * Build content with column decorations but no syntax highlighting.
 */
export function buildColumnDecoratedContent(
  container: HTMLElement,
  text: string,
  columnDecorations: ColumnDecoration[],
): void {
  container.textContent = "";
  renderTextWithBackground(container, text, 0, text.length, undefined, columnDecorations);
}
