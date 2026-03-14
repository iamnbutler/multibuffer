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

/** Common interface for syntax highlighters. */
export interface SyntaxHighlighter {
  readonly ready: boolean;
  parseBuffer(bufferId: string, text: string, edit?: TreeEdit): void;
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
