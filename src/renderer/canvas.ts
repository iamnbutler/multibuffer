/**
 * Canvas-based renderer for the multibuffer.
 *
 * Uses a glyph atlas for high-performance text rendering with syntax highlighting.
 * The compositing approach applies color to grayscale glyphs via canvas operations.
 * Uses a glyph atlas for efficient text rendering and provides
 * hit testing and mouse event handling.
 */

import type { MultiBufferPoint, MultiBufferRow, MultiBufferSnapshot } from "../multibuffer/types.ts";
import { sliceTokensToRange } from "./dom.ts";
import type { SyntaxHighlighter, Token } from "./highlighter.ts";
import {
  calculateContentHeight,
  calculateScrollTop,
  createViewport,
  yToVisualRow,
} from "./measurement.ts";
import { GRUVBOX_DARK_THEME, themeToVars } from "./theme.ts";
import type {
  DecorationStyle,
  Measurements,
  Renderer,
  RenderState,
  ScrollTarget,
  Theme,
  Viewport,
} from "./types.ts";
import { charColToVisualCol, visualColToCharCol, WrapMap, wrapLine } from "./wrap-map.ts";

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
  private _font: string;
  private _textColor: string;
  readonly charWidth: number;
  readonly lineHeight: number;

  constructor(font: string, charWidth: number, lineHeight: number, textColor = "#ffffff") {
    this.charWidth = charWidth;
    this.lineHeight = lineHeight;
    this._font = font;
    this._textColor = textColor;

    // Start with a reasonably sized atlas (1024x1024)
    this._canvas = new OffscreenCanvas(1024, 1024);
    const ctx = this._canvas.getContext("2d", { willReadFrequently: false });
    if (!ctx) throw new Error("Failed to create OffscreenCanvas 2D context");
    this._ctx = ctx;
    this._ctx.font = font;
    this._ctx.textBaseline = "top";
    // Render white text - we'll apply color via compositing
    this._ctx.fillStyle = textColor;

    // Pre-render ASCII printable characters (32-126)
    for (let code = 32; code <= 126; code++) {
      this._addGlyph(String.fromCharCode(code));
    }
  }

  /**
   * Update the text color for new glyphs.
   */
  setTextColor(color: string): void {
    this._textColor = color;
    this._ctx.fillStyle = color;
    // Note: existing glyphs keep their original color
    // For a full theme change, recreate the atlas
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
    newCtx.font = this._font;
    newCtx.textBaseline = "top";
    newCtx.fillStyle = this._textColor;

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

/**
 * Canvas-based renderer implementation.
 * Implements the Renderer interface with canvas-based text rendering,
 * scroll handling, hit testing, and mouse event handling.
 */
export class CanvasRenderer implements Renderer {
  private _container: HTMLElement | null = null;
  private _scrollContainer: HTMLElement | null = null;
  private _spacer: HTMLElement | null = null;
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
  private _computedStyle: CSSStyleDeclaration | null = null;
  private _pendingRender: number | null = null;

  // Color cache to avoid repeated CSS variable resolution
  private _colorCache = new Map<string, string>();

  // Event handlers
  private _onScroll: (() => void) | null = null;
  private _onClick: ((e: MouseEvent) => void) | null = null;
  private _onMouseMove: ((e: MouseEvent) => void) | null = null;
  private _onMouseUp: ((e: MouseEvent) => void) | null = null;
  private _isDragging = false;

  // Callbacks
  private _onClickCallback: ((point: MultiBufferPoint) => void) | null = null;
  private _onDragCallback: ((point: MultiBufferPoint) => void) | null = null;
  private _onDoubleClickCallback: ((point: MultiBufferPoint) => void) | null = null;
  private _onTripleClickCallback: ((point: MultiBufferPoint) => void) | null = null;

  /** Diff mode gutter widths */
  private static readonly DIFF_OLD_GUTTER_WIDTH = 40;
  private static readonly DIFF_NEW_GUTTER_WIDTH = 40;
  private static readonly DIFF_SIGN_WIDTH = 16;

  constructor(measurements: Measurements, options?: CanvasRendererOptions) {
    this._measurements = measurements;
    this._charWidth = measurements.charWidth ?? 8;
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

  /** Get effective gutter width based on mode */
  private _getEffectiveGutterWidth(): number {
    if (this._measurements.gutterMode === "diff") {
      return (
        CanvasRenderer.DIFF_OLD_GUTTER_WIDTH +
        CanvasRenderer.DIFF_NEW_GUTTER_WIDTH +
        CanvasRenderer.DIFF_SIGN_WIDTH
      );
    }
    return this._measurements.gutterWidth;
  }

  mount(container: HTMLElement): void {
    this._container = container;
    this._computedStyle = getComputedStyle(container);

    // Measure character width from the font
    this._charWidth = this._measureCharWidth(container);

    // Create scroll container
    const scrollContainer = document.createElement("div");
    scrollContainer.style.cssText =
      "position:relative;overflow-y:auto;height:100%;width:100%;overscroll-behavior:none;";
    this._scrollContainer = scrollContainer;

    // Create spacer for scroll height
    const spacer = document.createElement("div");
    spacer.style.cssText = "width:1px;pointer-events:none;";
    this._spacer = spacer;

    // Create canvas
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "position:absolute;top:0;left:0;";
    this._canvas = canvas;

    // Get 2D context
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) {
      throw new Error("Failed to get 2D context from canvas");
    }
    this._ctx = ctx;

    // Initialize glyph atlas
    const font = getComputedStyle(container).font || "14px monospace";
    this._glyphAtlas = new GlyphAtlas(font, this._charWidth, this._measurements.lineHeight, this._theme.syntaxDefault);

    // Assemble DOM
    scrollContainer.appendChild(spacer);
    scrollContainer.appendChild(canvas);
    container.appendChild(scrollContainer);

    // Size the canvas to the container
    this._resizeCanvas();

    // Set up scroll listener
    this._onScroll = () => this._handleScroll();
    scrollContainer.addEventListener("scroll", this._onScroll, { passive: true });

    // Set up mouse event listeners
    this._onClick = (e: MouseEvent) => this._handleMouseDown(e);
    this._onMouseMove = (e: MouseEvent) => this._handleMouseMove(e);
    this._onMouseUp = () => this._handleMouseUp();
    scrollContainer.addEventListener("mousedown", this._onClick);
    document.addEventListener("mousemove", this._onMouseMove);
    document.addEventListener("mouseup", this._onMouseUp);
  }

  unmount(): void {
    if (this._pendingRender !== null && typeof cancelAnimationFrame !== "undefined") {
      cancelAnimationFrame(this._pendingRender);
      this._pendingRender = null;
    }

    if (this._scrollContainer) {
      if (this._onScroll) {
        this._scrollContainer.removeEventListener("scroll", this._onScroll);
      }
      if (this._onClick) {
        this._scrollContainer.removeEventListener("mousedown", this._onClick);
      }
    }

    if (this._onMouseMove) {
      document.removeEventListener("mousemove", this._onMouseMove);
    }
    if (this._onMouseUp) {
      document.removeEventListener("mouseup", this._onMouseUp);
    }

    if (this._container && this._scrollContainer) {
      this._container.removeChild(this._scrollContainer);
    }

    this._container = null;
    this._scrollContainer = null;
    this._spacer = null;
    this._canvas = null;
    this._ctx = null;
    this._glyphAtlas = null;
    this._computedStyle = null;
    this._colorCache.clear();
    this._onScroll = null;
    this._onClick = null;
    this._onMouseMove = null;
    this._onMouseUp = null;
  }

  setMeasurements(measurements: Measurements): void {
    this._measurements = measurements;
    if (measurements.charWidth !== undefined) {
      this._charWidth = measurements.charWidth;
    }

    // Rebuild wrap map if snapshot exists
    if (this._snapshot && measurements.wrapWidth && measurements.wrapWidth > 0) {
      this._wrapMap = new WrapMap(this._snapshot, measurements.wrapWidth);
    } else {
      this._wrapMap = null;
    }

    // Recreate glyph atlas with new measurements
    if (this._container) {
      const font = getComputedStyle(this._container).font || "14px monospace";
      this._glyphAtlas = new GlyphAtlas(font, this._charWidth, this._measurements.lineHeight, this._theme.syntaxDefault);
    }

    this._scheduleRender();
  }

  remeasure(): void {
    if (!this._container) return;

    this._charWidth = this._measureCharWidth(this._container);
    this._colorCache.clear();
    this._computedStyle = getComputedStyle(this._container);

    // Rebuild atlas with new measurements
    const font = this._computedStyle.font || "14px monospace";
    this._glyphAtlas = new GlyphAtlas(font, this._charWidth, this._measurements.lineHeight, this._theme.syntaxDefault);

    // Rebuild wrap map
    if (this._snapshot && this._measurements.wrapWidth && this._measurements.wrapWidth > 0) {
      this._wrapMap = new WrapMap(this._snapshot, this._measurements.wrapWidth);
    }

    this._scheduleRender();
  }

  setTheme(theme: Partial<Theme>): void {
    this._theme = { ...this._theme, ...theme };
    this._colorCache.clear();

    // Apply CSS variables to container
    if (this._container) {
      const vars = themeToVars(theme);
      for (const [key, value] of Object.entries(vars)) {
        this._container.style.setProperty(key, value);
      }
    }

    // Update atlas text color
    if (this._glyphAtlas && theme.syntaxDefault) {
      this._glyphAtlas.setTextColor(theme.syntaxDefault);
    }

    this._scheduleRender();
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
    const gutterWidth = this._getEffectiveGutterWidth();

    // Update viewport
    this._viewport = state.viewport;

    // Update scroll content height for proper scrolling
    if (this._spacer && this._snapshot) {
      const contentHeight = calculateContentHeight(
        this._snapshot.lineCount,
        lineHeight,
        this._wrapMap ?? undefined,
      );
      this._spacer.style.height = `${contentHeight}px`;
    }

    // Clear canvas with line background
    const bgColor = this._resolveColor(this._theme.lineBg === "transparent" ? "#282828" : this._theme.lineBg);
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, this._canvas.width, this._canvas.height);

    // Draw gutter background
    ctx.fillStyle = "#282828";
    ctx.fillRect(0, 0, gutterWidth, this._canvas.height);

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
    const gutterWidth = this._getEffectiveGutterWidth();

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
      this._drawTextWithColor(ctx, text, startX, y, defaultColor);
      return;
    }

    let x = startX;
    let pos = 0;

    for (const token of tokens) {
      // Fill gap before token with default color
      if (token.startColumn > pos) {
        const gapText = text.slice(pos, token.startColumn);
        this._drawTextWithColor(ctx, gapText, x, y, defaultColor);
        x += gapText.length * charWidth;
      }

      // Draw token with its color
      const tokenEnd = Math.min(token.endColumn, text.length);
      if (token.startColumn < tokenEnd) {
        const tokenText = text.slice(token.startColumn, tokenEnd);
        const tokenColor = this._resolveColor(token.color);
        this._drawTextWithColor(ctx, tokenText, x, y, tokenColor);
        x += tokenText.length * charWidth;
      }

      pos = Math.max(pos, tokenEnd);
    }

    // Fill trailing gap with default color
    if (pos < text.length) {
      const trailingText = text.slice(pos);
      this._drawTextWithColor(ctx, trailingText, x, y, defaultColor);
    }
  }

  /**
   * Draw text with the specified color using the glyph atlas.
   * Uses compositing to apply color to grayscale glyphs.
   */
  private _drawTextWithColor(
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
    const gutterWidth = this._getEffectiveGutterWidth();

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

        const lineText = this._getLineText(
          // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
          row as MultiBufferRow,
        );
        const visualRow = this._wrapMap
          // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
          ? this._wrapMap.bufferRowToFirstVisualRow(row as MultiBufferRow)
          : row;
        const screenY = (visualRow - Math.floor(state.viewport.scrollTop / lineHeight)) * lineHeight;

        const isFirstRow = row === startRow;
        const isLastRow = row === endRow;

        const selStartCol = isFirstRow ? startCol : 0;
        const selEndCol = isLastRow ? endCol : lineText.length;

        const startX = gutterWidth + charColToVisualCol(lineText.slice(0, selStartCol), selStartCol) * charWidth;
        const endX = gutterWidth + charColToVisualCol(lineText.slice(0, selEndCol), selEndCol) * charWidth;

        ctx.fillRect(startX, screenY, endX - startX, lineHeight);
      }
    }
  }

  private _renderCursor(ctx: CanvasRenderingContext2D, state: RenderState): void {
    const sel = state.selections[0];
    if (!sel || !this._snapshot) return;

    const lineHeight = this._measurements.lineHeight;
    const gutterWidth = this._getEffectiveGutterWidth();

    // Cursor is at the head position (start or end based on sel.head)
    const headAnchor = sel.head === "start" ? sel.range.start : sel.range.end;
    const cursorPoint = this._snapshot.resolveAnchor(headAnchor);
    if (!cursorPoint) return;

    const cursorRow = cursorPoint.row;
    const cursorCol = cursorPoint.column;

    if (cursorRow < state.viewport.startRow || cursorRow >= state.viewport.endRow) return;

    const lineText = this._getLineText(
      // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
      cursorRow as MultiBufferRow,
    );
    const visualRow = this._wrapMap
      // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
      ? this._wrapMap.bufferRowToFirstVisualRow(cursorRow as MultiBufferRow)
      : cursorRow;
    const screenY = (visualRow - Math.floor(state.viewport.scrollTop / lineHeight)) * lineHeight;

    const cursorX = gutterWidth + charColToVisualCol(lineText.slice(0, cursorCol), cursorCol) * this._charWidth;

    ctx.fillStyle = this._resolveColor(this._theme.cursor);
    ctx.fillRect(cursorX, screenY, 2, lineHeight); // 2px wide cursor
  }

  scrollTo(target: ScrollTarget): void {
    if (!this._scrollContainer || !this._snapshot) return;

    const totalLines = this._snapshot.lineCount;
    const contentHeight = calculateContentHeight(
      totalLines,
      this._measurements.lineHeight,
      this._wrapMap ?? undefined,
    );

    const newScrollTop = calculateScrollTop(
      target.row,
      target.strategy,
      this._scrollContainer.scrollTop,
      this._measurements.lineHeight,
      this._scrollContainer.clientHeight,
      contentHeight,
      this._wrapMap ?? undefined,
    );

    this._scrollContainer.scrollTop = newScrollTop;
  }

  getViewport(): Viewport {
    return this._viewport;
  }

  /**
   * Convert pixel coordinates to multibuffer position.
   * Accounts for gutter width, scroll offset, and soft wrapping.
   */
  hitTest(x: number, y: number): { row: MultiBufferRow; column: number } | undefined {
    if (!this._scrollContainer) return undefined;

    const scrollTop = this._scrollContainer.scrollTop;
    const visualRow = yToVisualRow(scrollTop + y, this._measurements.lineHeight);
    const gutterWidth = this._getEffectiveGutterWidth();

    // Convert pixel X to visual column
    const visualColInSegment = Math.max(0, Math.floor((x - gutterWidth) / this._charWidth));

    // If click is in gutter area, treat as column 0
    if (x < gutterWidth) {
      if (this._wrapMap) {
        const { mbRow } = this._wrapMap.visualRowToBufferRow(visualRow);
        return { row: mbRow, column: 0 };
      }
      // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
      return { row: visualRow as MultiBufferRow, column: 0 };
    }

    if (this._wrapMap) {
      const { mbRow, segment } = this._wrapMap.visualRowToBufferRow(visualRow);
      const lineText = this._getLineText(mbRow);

      // Use cached segment char-start offsets for O(1) lookup
      const charOffset = this._wrapMap.segmentCharStart(mbRow, segment);
      const nextSeg = segment + 1;
      const segEnd =
        nextSeg < this._wrapMap.visualRowsForLine(mbRow)
          ? this._wrapMap.segmentCharStart(mbRow, nextSeg)
          : lineText.length;
      const segText = lineText.slice(charOffset, segEnd);

      // Handle wide characters (tabs, emoji, CJK)
      const charColInSeg = visualColToCharCol(segText, visualColInSegment);
      return { row: mbRow, column: charOffset + charColInSeg };
    }

    // No wrapping: visual row = buffer row
    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
    const lineText = this._getLineText(visualRow as MultiBufferRow);
    const column = visualColToCharCol(lineText, visualColInSegment);
    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
    return { row: visualRow as MultiBufferRow, column };
  }

  getCharWidth(): number {
    return this._charWidth;
  }

  /**
   * Register callback for click events.
   * Callback receives the buffer position of the click.
   */
  onClickPosition(cb: (point: MultiBufferPoint) => void): void {
    this._onClickCallback = cb;
  }

  /**
   * Register callback for drag events.
   * Callback receives the current buffer position during drag.
   */
  onDrag(cb: (point: MultiBufferPoint) => void): void {
    this._onDragCallback = cb;
  }

  /**
   * Register callback for double-click events.
   * Typically used for word selection.
   */
  onDoubleClick(cb: (point: MultiBufferPoint) => void): void {
    this._onDoubleClickCallback = cb;
  }

  /**
   * Register callback for triple-click events.
   * Typically used for line selection.
   */
  onTripleClick(cb: (point: MultiBufferPoint) => void): void {
    this._onTripleClickCallback = cb;
  }

  /**
   * Render the cursor at a given position.
   */
  renderCursor(point: MultiBufferPoint | undefined): void {
    if (!this._ctx || !this._canvas || !point) return;
    this._drawCursor(this._ctx, point, this._viewport);
  }

  /**
   * Render selection highlight between two multibuffer points.
   */
  renderSelection(
    start: MultiBufferPoint | undefined,
    end: MultiBufferPoint | undefined,
  ): void {
    if (!this._ctx || !this._canvas || !start || !end) return;
    this._drawSelectionRange(this._ctx, start, end, this._viewport);
  }

  // --- Private Methods ---

  private _measureCharWidth(container: HTMLElement): number {
    if (this._measurements.charWidth) {
      return this._measurements.charWidth;
    }

    const span = document.createElement("span");
    span.style.cssText = "position:absolute;visibility:hidden;white-space:pre;font:inherit;";
    span.textContent = "MMMMMMMMMM"; // 10 wide chars for accuracy
    container.appendChild(span);
    const width = span.getBoundingClientRect().width / 10;
    container.removeChild(span);
    return width || 8; // Fallback to 8 if measurement fails
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
    if (!this._canvas || !this._scrollContainer) return;

    const width = this._scrollContainer.clientWidth;
    const height = this._scrollContainer.clientHeight;

    // Handle device pixel ratio for sharp rendering
    const dpr = window.devicePixelRatio || 1;
    this._canvas.width = width * dpr;
    this._canvas.height = height * dpr;
    this._canvas.style.width = `${width}px`;
    this._canvas.style.height = `${height}px`;

    if (this._ctx) {
      this._ctx.scale(dpr, dpr);
      // Reset font after scale
      this._ctx.font = this._getFont();
      this._ctx.textBaseline = "top";
    }

    // Update viewport dimensions
    this._viewport = {
      ...this._viewport,
      width,
      height,
    };
  }

  private _scheduleRender(): void {
    if (this._pendingRender !== null) return;

    this._pendingRender = requestAnimationFrame(() => {
      this._pendingRender = null;
      this._handleScrollUpdate();
    });
  }

  private _handleScroll(): void {
    this._handleScrollUpdate();
  }

  private _handleScrollUpdate(): void {
    if (!this._scrollContainer || !this._snapshot) return;

    const scrollTop = this._scrollContainer.scrollTop;
    const height = this._scrollContainer.clientHeight;
    const width = this._scrollContainer.clientWidth;

    const totalLines = this._snapshot.lineCount;

    // Update spacer height
    if (this._spacer) {
      const contentHeight = calculateContentHeight(
        totalLines,
        this._measurements.lineHeight,
        this._wrapMap ?? undefined,
      );
      this._spacer.style.height = `${contentHeight}px`;
    }

    this._viewport = createViewport(
      scrollTop,
      height,
      width,
      this._measurements,
      totalLines,
      this._wrapMap ?? undefined,
    );

    const { startRow, endRow } = this._viewport;
    const lines = this._snapshot.lines(startRow, endRow);

    this.render(
      {
        viewport: this._viewport,
        selections: [],
        decorations: [],
        excerptHeaders: [],
        focused: false,
      },
      lines,
    );
  }

  private _drawSelectionRange(
    ctx: CanvasRenderingContext2D,
    selStart: MultiBufferPoint,
    selEnd: MultiBufferPoint,
    viewport: Viewport,
  ): void {
    const { lineHeight } = this._measurements;
    const gutterWidth = this._getEffectiveGutterWidth();

    // Normalize selection (start <= end)
    const start =
      selStart.row < selEnd.row ||
      (selStart.row === selEnd.row && selStart.column <= selEnd.column)
        ? selStart
        : selEnd;
    const end =
      selStart.row < selEnd.row ||
      (selStart.row === selEnd.row && selStart.column <= selEnd.column)
        ? selEnd
        : selStart;

    ctx.fillStyle = this._theme.selection;

    for (let row = start.row; row <= end.row; row++) {
      if (row < viewport.startRow || row >= viewport.endRow) continue;

      const lineText = this._getLineText(row);
      const visualRow = this._wrapMap
        ? this._wrapMap.bufferRowToFirstVisualRow(row)
        : row;
      const screenY = (visualRow - Math.floor(viewport.scrollTop / lineHeight)) * lineHeight;

      const startCol = row === start.row ? start.column : 0;
      const endCol = row === end.row ? end.column : lineText.length;

      const startX = gutterWidth + charColToVisualCol(lineText.slice(0, startCol), startCol) * this._charWidth;
      const endX = gutterWidth + charColToVisualCol(lineText.slice(0, endCol), endCol) * this._charWidth;

      ctx.fillRect(startX, screenY, endX - startX, lineHeight);
    }
  }

  private _drawCursor(
    ctx: CanvasRenderingContext2D,
    cursor: MultiBufferPoint,
    viewport: Viewport,
  ): void {
    const { lineHeight } = this._measurements;
    const gutterWidth = this._getEffectiveGutterWidth();

    if (cursor.row < viewport.startRow || cursor.row >= viewport.endRow) return;

    const lineText = this._getLineText(cursor.row);
    const visualRow = this._wrapMap
      ? this._wrapMap.bufferRowToFirstVisualRow(cursor.row)
      : cursor.row;
    const screenY = (visualRow - Math.floor(viewport.scrollTop / lineHeight)) * lineHeight;

    const cursorX =
      gutterWidth + charColToVisualCol(lineText.slice(0, cursor.column), cursor.column) * this._charWidth;

    ctx.fillStyle = this._theme.cursor;
    ctx.fillRect(cursorX, screenY, 2, lineHeight);
  }

  private _hitTestFromEvent(e: MouseEvent): { row: MultiBufferRow; column: number } | undefined {
    if (!this._scrollContainer) return undefined;
    const rect = this._scrollContainer.getBoundingClientRect();
    return this.hitTest(e.clientX - rect.left, e.clientY - rect.top);
  }

  private _handleMouseDown(e: MouseEvent): void {
    if (!this._scrollContainer) return;

    // Prevent the browser from focusing the scroll container,
    // so the hidden textarea retains focus for keyboard input.
    e.preventDefault();

    const point = this._hitTestFromEvent(e);
    if (!point) return;

    // Handle click based on detail (click count)
    if (e.detail >= 3 && this._onTripleClickCallback) {
      this._onTripleClickCallback(point);
    } else if (e.detail === 2 && this._onDoubleClickCallback) {
      this._onDoubleClickCallback(point);
    } else if (this._onClickCallback) {
      this._onClickCallback(point);
    }

    this._isDragging = true;
  }

  private _handleMouseMove(e: MouseEvent): void {
    if (!this._isDragging || !this._onDragCallback) return;
    const point = this._hitTestFromEvent(e);
    if (point) {
      this._onDragCallback(point);
    }
  }

  private _handleMouseUp(): void {
    this._isDragging = false;
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
