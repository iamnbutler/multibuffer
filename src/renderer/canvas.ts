/**
 * Canvas-based renderer for the multibuffer.
 *
 * Uses a glyph atlas for high-performance text rendering with syntax highlighting.
 * The compositing approach applies color to grayscale glyphs via canvas operations.
 */

import type { MultiBufferRow, MultiBufferSnapshot } from "../multibuffer/types.ts";
import { sliceTokensToRange } from "./dom.ts";
import type { SyntaxHighlighter, Token } from "./highlighter.ts";
import {
  calculateContentHeight,
  calculateScrollTop,
  yToVisualRow,
} from "./measurement.ts";
import { GRUVBOX_DARK_THEME } from "./theme.ts";
import type {
  DecorationStyle,
  Measurements,
  Renderer,
  RenderState,
  ScrollTarget,
  Theme,
  Viewport,
} from "./types.ts";
import { visualColToCharCol, WrapMap, wrapLine } from "./wrap-map.ts";

/**
 * Glyph atlas for caching pre-rendered character glyphs.
 * Uses a single grayscale atlas; color is applied via compositing.
 */
interface GlyphEntry {
  x: number;
  y: number;
  width: number;
  height: number;
}

class GlyphAtlas {
  private _canvas: OffscreenCanvas;
  private _ctx: OffscreenCanvasRenderingContext2D;
  private _glyphs = new Map<string, GlyphEntry>();
  private _nextX = 0;
  private _nextY = 0;
  private _rowHeight = 0;
  readonly charWidth: number;
  readonly lineHeight: number;

  constructor(font: string, charWidth: number, lineHeight: number) {
    this.charWidth = charWidth;
    this.lineHeight = lineHeight;

    // Start with a reasonably sized atlas (1024x1024)
    this._canvas = new OffscreenCanvas(1024, 1024);
    const ctx = this._canvas.getContext("2d", { willReadFrequently: false });
    if (!ctx) throw new Error("Failed to create OffscreenCanvas 2D context");
    this._ctx = ctx;
    this._ctx.font = font;
    this._ctx.textBaseline = "top";
    // Render white text - we'll apply color via compositing
    this._ctx.fillStyle = "#ffffff";

    // Pre-render ASCII printable characters (32-126)
    for (let code = 32; code <= 126; code++) {
      this._addGlyph(String.fromCharCode(code));
    }
  }

  private _addGlyph(char: string): GlyphEntry {
    const existing = this._glyphs.get(char);
    if (existing) return existing;

    const width = this.charWidth;
    const height = this.lineHeight;

    // Check if we need to wrap to next row
    if (this._nextX + width > this._canvas.width) {
      this._nextX = 0;
      this._nextY += this._rowHeight;
      this._rowHeight = 0;
    }

    // Check if we need to expand the atlas
    if (this._nextY + height > this._canvas.height) {
      this._expandAtlas();
    }

    // Render the glyph
    this._ctx.fillText(char, this._nextX, this._nextY);

    const entry: GlyphEntry = {
      x: this._nextX,
      y: this._nextY,
      width,
      height,
    };
    this._glyphs.set(char, entry);

    this._nextX += width;
    this._rowHeight = Math.max(this._rowHeight, height);

    return entry;
  }

  private _expandAtlas(): void {
    const newHeight = this._canvas.height * 2;
    const newCanvas = new OffscreenCanvas(this._canvas.width, newHeight);
    const newCtx = newCanvas.getContext("2d", { willReadFrequently: false });
    if (!newCtx) throw new Error("Failed to create expanded OffscreenCanvas");

    // Copy existing content
    newCtx.drawImage(this._canvas, 0, 0);
    newCtx.font = this._ctx.font;
    newCtx.textBaseline = "top";
    newCtx.fillStyle = "#ffffff";

    this._canvas = newCanvas;
    this._ctx = newCtx;
  }

  get(char: string): GlyphEntry {
    return this._glyphs.get(char) ?? this._addGlyph(char);
  }

  get canvas(): OffscreenCanvas {
    return this._canvas;
  }
}

/**
 * Resolve a CSS color value that may contain CSS variables.
 * For canvas rendering, we need actual color values, not var() references.
 */
function resolveCssColor(color: string, computedStyle?: CSSStyleDeclaration): string {
  if (!color.startsWith("var(")) {
    return color;
  }

  // Parse var(--name, fallback)
  const match = color.match(/^var\((--[^,)]+)(?:,\s*([^)]+))?\)$/);
  if (!match) return color;

  const varName = match[1];
  const fallback = match[2]?.trim();

  if (computedStyle && varName) {
    const resolved = computedStyle.getPropertyValue(varName).trim();
    if (resolved) return resolved;
  }

  return fallback ?? "#ebdbb2"; // Default to Gruvbox fg
}

export interface CanvasRendererOptions {
  highlighter?: SyntaxHighlighter;
  theme?: Partial<Theme>;
}

export class CanvasRenderer implements Renderer {
  private _container: HTMLElement | null = null;
  private _canvas: HTMLCanvasElement | null = null;
  private _ctx: CanvasRenderingContext2D | null = null;
  private _measurements: Measurements;
  private _theme: Theme;
  private _viewport: Viewport;
  private _snapshot: MultiBufferSnapshot | null = null;
  private _highlighter: SyntaxHighlighter | null = null;
  private _wrapMap: WrapMap | null = null;
  private _glyphAtlas: GlyphAtlas | null = null;
  private _charWidth = 8; // Default, will be measured
  private _scrollTop = 0;
  private _scrollHandler: (() => void) | null = null;
  private _computedStyle: CSSStyleDeclaration | null = null;

  // Color cache to avoid repeated CSS variable resolution
  private _colorCache = new Map<string, string>();

  constructor(measurements: Measurements, options?: CanvasRendererOptions) {
    this._measurements = measurements;
    this._theme = { ...GRUVBOX_DARK_THEME, ...options?.theme };
    this._highlighter = options?.highlighter ?? null;
    this._viewport = {
      // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction for initial viewport
      startRow: 0 as MultiBufferRow,
      // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction for initial viewport
      endRow: 0 as MultiBufferRow,
      scrollTop: 0,
      height: 0,
      width: 0,
    };
  }

  mount(container: HTMLElement): void {
    this._container = container;
    this._computedStyle = getComputedStyle(container);

    // Create canvas element
    this._canvas = document.createElement("canvas");
    this._canvas.style.cssText = "display:block;width:100%;height:100%;";
    container.style.overflow = "auto";
    container.style.position = "relative";

    // Create a wrapper for scrolling
    const scrollContent = document.createElement("div");
    scrollContent.style.cssText = "position:relative;";
    scrollContent.appendChild(this._canvas);
    container.appendChild(scrollContent);

    const ctx = this._canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Failed to create canvas 2D context");
    this._ctx = ctx;

    // Measure character width
    this._measureCharWidth();

    // Initialize glyph atlas
    const font = getComputedStyle(container).font || "14px monospace";
    this._glyphAtlas = new GlyphAtlas(font, this._charWidth, this._measurements.lineHeight);

    // Set up scroll handling
    this._scrollHandler = () => this._handleScroll();
    container.addEventListener("scroll", this._scrollHandler);

    // Initial size
    this._resizeCanvas();
  }

  unmount(): void {
    if (this._container && this._scrollHandler) {
      this._container.removeEventListener("scroll", this._scrollHandler);
    }
    if (this._canvas) {
      this._canvas.remove();
    }
    this._container = null;
    this._canvas = null;
    this._ctx = null;
    this._glyphAtlas = null;
    this._computedStyle = null;
    this._colorCache.clear();
  }

  setMeasurements(measurements: Measurements): void {
    this._measurements = measurements;
    if (this._measurements.charWidth) {
      this._charWidth = this._measurements.charWidth;
    }
    // Recreate glyph atlas with new measurements
    if (this._container) {
      const font = getComputedStyle(this._container).font || "14px monospace";
      this._glyphAtlas = new GlyphAtlas(font, this._charWidth, this._measurements.lineHeight);
    }
  }

  remeasure(): void {
    this._measureCharWidth();
    this._colorCache.clear();
    if (this._container) {
      this._computedStyle = getComputedStyle(this._container);
      const font = this._computedStyle.font || "14px monospace";
      this._glyphAtlas = new GlyphAtlas(font, this._charWidth, this._measurements.lineHeight);
    }
  }

  setTheme(theme: Partial<Theme>): void {
    this._theme = { ...this._theme, ...theme };
    this._colorCache.clear();
  }

  setSnapshot(snapshot: MultiBufferSnapshot | null): void {
    this._snapshot = snapshot;
    this._wrapMap = null;
    if (snapshot && this._measurements.wrapWidth && this._measurements.wrapWidth > 0) {
      this._wrapMap = new WrapMap(snapshot, this._measurements.wrapWidth);
    }
  }

  setHighlighter(highlighter: SyntaxHighlighter | null): void {
    this._highlighter = highlighter;
  }

  render(state: RenderState, lines: readonly string[]): void {
    if (!this._ctx || !this._canvas) return;

    this._resizeCanvas();
    const ctx = this._ctx;
    const lineHeight = this._measurements.lineHeight;

    // Update viewport
    this._viewport = state.viewport;

    // Update scroll content height for proper scrolling
    if (this._container && this._snapshot) {
      const contentHeight = calculateContentHeight(
        this._snapshot.lineCount,
        lineHeight,
        this._wrapMap ?? undefined,
      );
      const scrollContent = this._canvas.parentElement;
      if (scrollContent) {
        scrollContent.style.height = `${contentHeight}px`;
      }
    }

    // Clear canvas with line background
    const bgColor = this._resolveColor(this._theme.lineBg === "transparent" ? "#282828" : this._theme.lineBg);
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, this._canvas.width, this._canvas.height);

    // Build decoration map
    const decorationMap = new Map<number, Partial<DecorationStyle>>();
    for (const dec of state.decorations) {
      for (let r = dec.range.start.row; r <= dec.range.end.row; r++) {
        if (dec.style) {
          decorationMap.set(r, dec.style);
        }
      }
    }

    // Build header map
    const headerMap = new Map<number, { path: string; label?: string }>();
    for (const header of state.excerptHeaders) {
      headerMap.set(header.row, { path: header.path, label: header.label });
    }

    const wrapWidth = this._measurements.wrapWidth ?? 0;

    // Render each visible line
    let visualY = 0;
    for (let i = 0; i < lines.length; i++) {
      const mbRow = state.viewport.startRow + i;
      const lineText = lines[i] ?? "";
      const header = headerMap.get(mbRow);
      const decoration = decorationMap.get(mbRow);

      // Get excerpt info for syntax highlighting
      // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
      const excerptInfo = this._snapshot?.excerptAt(mbRow as MultiBufferRow);
      let lineTokens: Token[] | undefined;

      if (excerptInfo && this._highlighter?.ready) {
        const bufferRow = excerptInfo.range.context.start.row + (mbRow - excerptInfo.startRow);
        // biome-ignore lint/plugin/no-type-assertion: expect: BufferId is branded string
        lineTokens = this._highlighter.getLineTokens(excerptInfo.bufferId as string, bufferRow);
      }

      // Get line number for gutter
      let gutterText = "";
      if (!header && excerptInfo) {
        const bufferRow = excerptInfo.range.context.start.row + (mbRow - excerptInfo.startRow);
        gutterText = String(bufferRow + 1);
      }

      if (wrapWidth > 0) {
        const segments = wrapLine(lineText, wrapWidth);
        let charOffset = 0;
        for (let s = 0; s < segments.length; s++) {
          const seg = segments[s] ?? "";
          const segStart = charOffset;
          charOffset += seg.length;
          const segEnd = charOffset;
          const segTokens = lineTokens ? sliceTokensToRange(lineTokens, segStart, segEnd) : undefined;

          if (s === 0 && header) {
            this._renderHeader(ctx, visualY, header.path, header.label);
          } else {
            this._renderLine(ctx, visualY, s === 0 ? gutterText : "", seg, segTokens, decoration);
          }
          visualY += lineHeight;
        }
      } else {
        if (header) {
          this._renderHeader(ctx, visualY, header.path, header.label);
        } else {
          this._renderLine(ctx, visualY, gutterText, lineText, lineTokens, decoration);
        }
        visualY += lineHeight;
      }
    }

    // Render selections
    this._renderSelections(ctx, state);

    // Render cursor if focused
    if (state.focused && state.selections.length > 0) {
      this._renderCursor(ctx, state);
    }
  }

  private _renderLine(
    ctx: CanvasRenderingContext2D,
    y: number,
    gutterText: string,
    text: string,
    tokens: Token[] | undefined,
    decoration: Partial<DecorationStyle> | undefined,
  ): void {
    const lineHeight = this._measurements.lineHeight;
    const gutterWidth = this._measurements.gutterWidth;

    // Draw line background if decorated
    if (decoration?.backgroundColor) {
      ctx.fillStyle = this._resolveColor(decoration.backgroundColor);
      ctx.fillRect(gutterWidth, y, this._canvas?.width ?? 0, lineHeight);
    }

    // Draw gutter background
    const gutterBg = decoration?.gutterBackground ?? this._theme.lineBg;
    if (gutterBg && gutterBg !== "transparent") {
      ctx.fillStyle = this._resolveColor(gutterBg);
      ctx.fillRect(0, y, gutterWidth, lineHeight);
    }

    // Draw gutter text (right-aligned)
    ctx.fillStyle = this._resolveColor(decoration?.gutterColor ?? this._theme.gutter);
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.font = this._getFont();
    ctx.fillText(gutterText, gutterWidth - 8, y);

    // Draw gutter sign if present
    if (decoration?.gutterSign) {
      ctx.fillStyle = this._resolveColor(decoration.gutterSignColor ?? this._theme.gutter);
      ctx.textAlign = "left";
      ctx.fillText(decoration.gutterSign, gutterWidth - 20, y);
    }

    // Draw text content with syntax highlighting
    this._renderTokenizedLine(ctx, text, tokens, gutterWidth, y, decoration?.color);
  }

  /**
   * Render a line with syntax highlighting tokens.
   * Fills gaps between tokens with default color.
   */
  private _renderTokenizedLine(
    ctx: CanvasRenderingContext2D,
    text: string,
    tokens: Token[] | undefined,
    startX: number,
    y: number,
    overrideColor?: string,
  ): void {
    const charWidth = this._charWidth;
    const defaultColor = this._resolveColor(overrideColor ?? this._theme.syntaxDefault);

    if (!tokens || tokens.length === 0) {
      // No tokens - render entire line with default color
      this._drawText(ctx, text, startX, y, defaultColor);
      return;
    }

    let x = startX;
    let pos = 0;

    for (const token of tokens) {
      // Fill gap before token with default color
      if (token.startColumn > pos) {
        const gapText = text.slice(pos, token.startColumn);
        this._drawText(ctx, gapText, x, y, defaultColor);
        x += gapText.length * charWidth;
      }

      // Draw token with its color
      const tokenEnd = Math.min(token.endColumn, text.length);
      if (token.startColumn < tokenEnd) {
        const tokenText = text.slice(token.startColumn, tokenEnd);
        const tokenColor = this._resolveColor(token.color);
        this._drawText(ctx, tokenText, x, y, tokenColor);
        x += tokenText.length * charWidth;
      }

      pos = Math.max(pos, tokenEnd);
    }

    // Fill trailing gap with default color
    if (pos < text.length) {
      const trailingText = text.slice(pos);
      this._drawText(ctx, trailingText, x, y, defaultColor);
    }
  }

  /**
   * Draw text with the specified color using the glyph atlas.
   * Uses compositing to apply color to grayscale glyphs.
   */
  private _drawText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    color: string,
  ): void {
    if (!this._glyphAtlas) {
      // Fallback to direct text rendering
      ctx.fillStyle = color;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.font = this._getFont();
      ctx.fillText(text, x, y);
      return;
    }

    const atlas = this._glyphAtlas;
    const charWidth = atlas.charWidth;
    const lineHeight = atlas.lineHeight;

    // For each character, draw from atlas with color applied
    // We use a per-character approach for simplicity; could batch for performance
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (!char) continue;

      // Skip space characters - nothing to draw
      if (char === " " || char === "\t") {
        x += charWidth;
        continue;
      }

      const glyph = atlas.get(char);

      // Method: Draw glyph, then tint with color using composite operation
      // Save current state
      ctx.save();

      // First draw the glyph from atlas (white on transparent)
      ctx.globalCompositeOperation = "source-over";
      ctx.drawImage(
        atlas.canvas,
        glyph.x,
        glyph.y,
        glyph.width,
        glyph.height,
        x,
        y,
        charWidth,
        lineHeight,
      );

      // Apply color tint using multiply composite operation
      ctx.globalCompositeOperation = "source-atop";
      ctx.fillStyle = color;
      ctx.fillRect(x, y, charWidth, lineHeight);

      ctx.restore();

      x += charWidth;
    }
  }

  private _renderHeader(
    ctx: CanvasRenderingContext2D,
    y: number,
    path: string,
    label?: string,
  ): void {
    const lineHeight = this._measurements.lineHeight;
    const width = this._canvas?.width ?? 0;

    // Draw header background
    ctx.fillStyle = this._resolveColor(this._theme.headerBg);
    ctx.fillRect(0, y, width, lineHeight);

    // Draw header border
    ctx.fillStyle = this._resolveColor(this._theme.headerBorder);
    ctx.fillRect(0, y + lineHeight - 1, width, 1);

    // Draw header text
    ctx.fillStyle = this._resolveColor(this._theme.headerText);
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.font = this._getFont();
    const displayText = label ? `${path} ${label}` : path;
    ctx.fillText(displayText, this._measurements.gutterWidth, y);
  }

  private _renderSelections(ctx: CanvasRenderingContext2D, state: RenderState): void {
    if (state.selections.length === 0 || !this._snapshot) return;

    const lineHeight = this._measurements.lineHeight;
    const charWidth = this._charWidth;
    const gutterWidth = this._measurements.gutterWidth;

    ctx.fillStyle = this._resolveColor(this._theme.selection);

    for (const sel of state.selections) {
      // Resolve anchors to get actual positions
      const startPoint = this._snapshot.resolveAnchor(sel.range.start);
      const endPoint = this._snapshot.resolveAnchor(sel.range.end);

      if (!startPoint || !endPoint) continue;

      if (startPoint.row === endPoint.row && startPoint.column === endPoint.column) {
        continue; // Empty selection
      }

      // Normalize selection direction
      let startRow = startPoint.row;
      let startCol = startPoint.column;
      let endRow = endPoint.row;
      let endCol = endPoint.column;
      if (startRow > endRow || (startRow === endRow && startCol > endCol)) {
        [startRow, startCol, endRow, endCol] = [endRow, endCol, startRow, startCol];
      }

      // Calculate visual positions relative to viewport
      for (let row = startRow; row <= endRow; row++) {
        if (row < state.viewport.startRow || row >= state.viewport.endRow) continue;

        const visualRow = row - state.viewport.startRow;
        const y = visualRow * lineHeight;

        const isFirstRow = row === startRow;
        const isLastRow = row === endRow;

        const selStartCol = isFirstRow ? startCol : 0;
        const selEndCol = isLastRow ? endCol : 1000; // Large number for end of line

        const x = gutterWidth + selStartCol * charWidth;
        const width = (selEndCol - selStartCol) * charWidth;

        ctx.fillRect(x, y, width, lineHeight);
      }
    }
  }

  private _renderCursor(ctx: CanvasRenderingContext2D, state: RenderState): void {
    const sel = state.selections[0];
    if (!sel || !this._snapshot) return;

    const lineHeight = this._measurements.lineHeight;
    const charWidth = this._charWidth;
    const gutterWidth = this._measurements.gutterWidth;

    // Cursor is at the head position (start or end based on sel.head)
    const headAnchor = sel.head === "start" ? sel.range.start : sel.range.end;
    const cursorPoint = this._snapshot.resolveAnchor(headAnchor);
    if (!cursorPoint) return;

    const cursorRow = cursorPoint.row;
    const cursorCol = cursorPoint.column;

    if (cursorRow < state.viewport.startRow || cursorRow >= state.viewport.endRow) return;

    const visualRow = cursorRow - state.viewport.startRow;
    const x = gutterWidth + cursorCol * charWidth;
    const y = visualRow * lineHeight;

    ctx.fillStyle = this._resolveColor(this._theme.cursor);
    ctx.fillRect(x, y, 2, lineHeight); // 2px wide cursor
  }

  scrollTo(target: ScrollTarget): void {
    if (!this._container || !this._snapshot) return;

    const contentHeight = calculateContentHeight(
      this._snapshot.lineCount,
      this._measurements.lineHeight,
      this._wrapMap ?? undefined,
    );

    const newScrollTop = calculateScrollTop(
      target.row,
      target.strategy,
      this._scrollTop,
      this._measurements.lineHeight,
      this._viewport.height,
      contentHeight,
      this._wrapMap ?? undefined,
    );

    this._container.scrollTop = newScrollTop;
  }

  getViewport(): Viewport {
    return this._viewport;
  }

  hitTest(x: number, y: number): { row: MultiBufferRow; column: number } | undefined {
    if (!this._container) return undefined;

    const scrollTop = this._container.scrollTop;
    const lineHeight = this._measurements.lineHeight;
    const gutterWidth = this._measurements.gutterWidth;
    const charWidth = this._charWidth;

    const visualRow = yToVisualRow(scrollTop + y, lineHeight);
    const visualCol = Math.max(0, Math.floor((x - gutterWidth) / charWidth));

    if (this._wrapMap && this._snapshot) {
      const { mbRow, segment } = this._wrapMap.visualRowToBufferRow(visualRow);
      const lineText = this._getLineText(mbRow);
      const charOffset = this._wrapMap.segmentCharStart(mbRow, segment);
      const nextSeg = segment + 1;
      const segEnd =
        nextSeg < this._wrapMap.visualRowsForLine(mbRow)
          ? this._wrapMap.segmentCharStart(mbRow, nextSeg)
          : lineText.length;
      const segText = lineText.slice(charOffset, segEnd);
      const charColInSeg = visualColToCharCol(segText, visualCol);
      return { row: mbRow, column: charOffset + charColInSeg };
    }

    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
    const mbRow = visualRow as MultiBufferRow;
    const lineText = this._getLineText(mbRow);
    const column = visualColToCharCol(lineText, visualCol);
    return { row: mbRow, column };
  }

  getCharWidth(): number {
    return this._charWidth;
  }

  private _measureCharWidth(): void {
    if (this._measurements.charWidth) {
      this._charWidth = this._measurements.charWidth;
      return;
    }

    if (!this._ctx) return;

    const testChar = "M";
    this._ctx.font = this._getFont();
    const metrics = this._ctx.measureText(testChar);
    this._charWidth = metrics.width;
  }

  private _getFont(): string {
    if (this._container) {
      return getComputedStyle(this._container).font || "14px monospace";
    }
    return "14px monospace";
  }

  /** Get the text content of a single line from the snapshot. */
  private _getLineText(row: MultiBufferRow): string {
    if (!this._snapshot) return "";
    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
    const nextRow = Math.min(row + 1, this._snapshot.lineCount) as MultiBufferRow;
    return this._snapshot.lines(row, nextRow)?.[0] ?? "";
  }

  private _resizeCanvas(): void {
    if (!this._canvas || !this._container) return;

    const rect = this._container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    // Set canvas size accounting for device pixel ratio
    this._canvas.width = rect.width * dpr;
    this._canvas.height = rect.height * dpr;
    this._canvas.style.width = `${rect.width}px`;
    this._canvas.style.height = `${rect.height}px`;

    // Scale context for high DPI
    if (this._ctx) {
      this._ctx.scale(dpr, dpr);
    }

    // Update viewport dimensions
    this._viewport = {
      ...this._viewport,
      width: rect.width,
      height: rect.height,
    };
  }

  private _handleScroll(): void {
    if (!this._container) return;
    this._scrollTop = this._container.scrollTop;
  }

  /**
   * Resolve a color that may contain CSS variables.
   * Caches results for performance.
   */
  private _resolveColor(color: string): string {
    const cached = this._colorCache.get(color);
    if (cached) return cached;

    const resolved = resolveCssColor(color, this._computedStyle ?? undefined);
    this._colorCache.set(color, resolved);
    return resolved;
  }
}

/**
 * Factory function to create a canvas renderer.
 */
export function createCanvasRenderer(
  measurements: Measurements,
  options?: CanvasRendererOptions,
): CanvasRenderer {
  return new CanvasRenderer(measurements, options);
}
