/**
 * Tree-sitter based syntax highlighter.
 * Parses buffers once, then extracts tokens for visible lines on demand.
 */

import type { Language, Node, Parser as ParserType, Tree } from "web-tree-sitter";
import { colorForNodeType } from "./theme.ts";

export interface Token {
  startColumn: number;
  endColumn: number;
  color: string;
}

export class Highlighter {
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
    // biome-ignore lint/plugin/no-type-assertion: expect: Language is exported at module level but also accessible via Parser
    const LangClass = (mod.Language ?? (Parser as unknown as { Language: typeof Language }).Language);
    const language = await LangClass.load(languageWasmUrl);
    this._parser.setLanguage(language);
    this._ready = true;
  }

  parseBuffer(bufferId: string, text: string): void {
    if (!this._parser) return;
    const tree = this._parser.parse(text);
    if (tree) {
      this._trees.set(bufferId, tree);
    }
  }

  /**
   * Get syntax tokens for a specific line of a buffer.
   * Returns tokens sorted by startColumn with pre-resolved colors.
   */
  getLineTokens(bufferId: string, row: number): Token[] {
    const tree = this._trees.get(bufferId);
    if (!tree) return [];

    const tokens: Token[] = [];
    this._collectLeafTokens(tree.rootNode, row, tokens);
    tokens.sort((a, b) => a.startColumn - b.startColumn);
    return tokens;
  }

  private _collectLeafTokens(
    node: Node,
    targetRow: number,
    tokens: Token[],
  ): void {
    if (node.endPosition.row < targetRow || node.startPosition.row > targetRow) {
      return;
    }

    if (node.childCount === 0) {
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
          color: colorForNodeType(node.type),
        });
      }
      return;
    }

    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) {
        this._collectLeafTokens(child, targetRow, tokens);
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
