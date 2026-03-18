/**
 * Canvas-based renderer for the multibuffer.
 * Uses a glyph atlas for efficient text rendering and provides
 * hit testing and mouse event handling.
 */

import type { MultiBufferPoint, MultiBufferRow, MultiBufferSnapshot } from "../multibuffer/types.ts";
import {
  calculateContentHeight,
  calculateScrollTop,
  createViewport,
  yToVisualRow,
} from "./measurement.ts";
import { GRUVBOX_DARK_THEME, themeToVars } from "./theme.ts";
import type { Measurements, Renderer, RenderState, ScrollTarget, Theme, Viewport } from "./types.ts";
import { charColToVisualCol, visualColToCharCol, WrapMap } from "./wrap-map.ts";

/**
 * Glyph information for atlas lookup.
 */
interface Glyph {
  /** X position in atlas */
  x: number;
  /** Y position in atlas */
  y: number;
  /** Width of glyph cell */
  width: number;
  /** Height of glyph cell */
  height: number;
}

/**
 * Glyph atlas for efficient text rendering.
 * Pre-renders ASCII characters and caches extended characters on demand.
 */
class GlyphAtlas {
  private _canvas: OffscreenCanvas;
  private _ctx: OffscreenCanvasRenderingContext2D;
  private _charWidth: number;
  private _lineHeight: number;
  private _glyphMap: Map<string, Glyph> = new Map();
  private _nextX = 0;
  private _nextY = 0;
  private _rowHeight: number;
  private _font: string;
  private _textColor: string;

  /** Number of columns in the atlas */
  private static readonly ATLAS_COLS = 32;
  /** Initial number of rows in the atlas */
  private static readonly INITIAL_ROWS = 8;

  constructor(charWidth: number, lineHeight: number, font: string, textColor: string) {
    this._charWidth = charWidth;
    this._lineHeight = lineHeight;
    this._rowHeight = lineHeight;
    this._font = font;
    this._textColor = textColor;

    // Create atlas canvas
    const atlasWidth = GlyphAtlas.ATLAS_COLS * charWidth;
    const atlasHeight = GlyphAtlas.INITIAL_ROWS * lineHeight;
    this._canvas = new OffscreenCanvas(atlasWidth, atlasHeight);
    // biome-ignore lint/plugin/no-type-assertion: expect: getContext always returns context for "2d"
    this._ctx = this._canvas.getContext("2d") as OffscreenCanvasRenderingContext2D;
    this._ctx.font = font;
    this._ctx.textBaseline = "top";
    this._ctx.fillStyle = textColor;

    // Pre-render ASCII printable characters (32-126)
    for (let code = 32; code <= 126; code++) {
      this._addGlyph(String.fromCharCode(code));
    }
  }

  get canvas(): OffscreenCanvas {
    return this._canvas;
  }

  get charWidth(): number {
    return this._charWidth;
  }

  get lineHeight(): number {
    return this._lineHeight;
  }

  /**
   * Get glyph info for a character, adding to atlas if needed.
   */
  get(char: string): Glyph {
    let glyph = this._glyphMap.get(char);
    if (!glyph) {
      glyph = this._addGlyph(char);
    }
    return glyph;
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

  private _addGlyph(char: string): Glyph {
    // Check if we need to expand the atlas
    if (this._nextX + this._charWidth > this._canvas.width) {
      this._nextX = 0;
      this._nextY += this._rowHeight;
    }

    if (this._nextY + this._lineHeight > this._canvas.height) {
      this._expandAtlas();
    }

    // Draw the character
    this._ctx.fillText(char, this._nextX, this._nextY);

    const glyph: Glyph = {
      x: this._nextX,
      y: this._nextY,
      width: this._charWidth,
      height: this._lineHeight,
    };

    this._glyphMap.set(char, glyph);
    this._nextX += this._charWidth;

    return glyph;
  }

  private _expandAtlas(): void {
    // Double the height
    const newHeight = this._canvas.height * 2;
    const newCanvas = new OffscreenCanvas(this._canvas.width, newHeight);
    // biome-ignore lint/plugin/no-type-assertion: expect: getContext always returns context for "2d"
    const newCtx = newCanvas.getContext("2d") as OffscreenCanvasRenderingContext2D;

    // Copy existing content
    newCtx.drawImage(this._canvas, 0, 0);

    // Configure new context
    newCtx.font = this._font;
    newCtx.textBaseline = "top";
    newCtx.fillStyle = this._textColor;

    this._canvas = newCanvas;
    this._ctx = newCtx;
  }
}

/**
 * Canvas-based renderer implementation.
 * Implements the Renderer interface with canvas-based text rendering,
 * scroll handling, hit testing, and mouse event handling.
 */
export class CanvasRenderer implements Renderer {
  private _measurements: Measurements;
  private _charWidth: number;
  private _viewport: Viewport;
  private _container: HTMLElement | null = null;
  private _scrollContainer: HTMLElement | null = null;
  private _spacer: HTMLElement | null = null;
  private _canvas: HTMLCanvasElement | null = null;
  private _ctx: CanvasRenderingContext2D | null = null;
  private _atlas: GlyphAtlas | null = null;
  private _snapshot: MultiBufferSnapshot | null = null;
  private _wrapMap: WrapMap | null = null;
  private _theme: Theme;
  private _pendingRender: number | null = null;

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

  constructor(measurements: Measurements) {
    this._measurements = measurements;
    this._charWidth = measurements.charWidth ?? 8;
    this._theme = { ...GRUVBOX_DARK_THEME };
    this._viewport = {
      // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction for initial zero viewport
      startRow: 0 as MultiBufferRow,
      // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction for initial zero viewport
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
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Failed to get 2D context from canvas");
    }
    this._ctx = ctx;

    // Initialize glyph atlas
    const font = `${this._measurements.lineHeight}px monospace`;
    this._atlas = new GlyphAtlas(
      this._charWidth,
      this._measurements.lineHeight,
      font,
      this._theme.syntaxDefault,
    );

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
    this._atlas = null;
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

    this._scheduleRender();
  }

  remeasure(): void {
    if (!this._container) return;

    this._charWidth = this._measureCharWidth(this._container);

    // Rebuild atlas with new measurements
    if (this._atlas) {
      const font = `${this._measurements.lineHeight}px monospace`;
      this._atlas = new GlyphAtlas(
        this._charWidth,
        this._measurements.lineHeight,
        font,
        this._theme.syntaxDefault,
      );
    }

    // Rebuild wrap map
    if (this._snapshot && this._measurements.wrapWidth && this._measurements.wrapWidth > 0) {
      this._wrapMap = new WrapMap(this._snapshot, this._measurements.wrapWidth);
    }

    this._scheduleRender();
  }

  setTheme(theme: Partial<Theme>): void {
    this._theme = { ...this._theme, ...theme };

    // Apply CSS variables to container
    if (this._container) {
      const vars = themeToVars(theme);
      for (const [key, value] of Object.entries(vars)) {
        this._container.style.setProperty(key, value);
      }
    }

    // Update atlas text color
    if (this._atlas && theme.syntaxDefault) {
      this._atlas.setTextColor(theme.syntaxDefault);
    }

    this._scheduleRender();
  }

  render(state: RenderState, lines: readonly string[]): void {
    if (!this._ctx || !this._canvas || !this._atlas) return;

    const ctx = this._ctx;
    const { lineHeight } = this._measurements;
    const gutterWidth = this._getEffectiveGutterWidth();
    const { scrollTop } = state.viewport;

    // Clear canvas
    ctx.fillStyle = this._theme.lineBg === "transparent" ? "#1d2021" : this._theme.lineBg;
    ctx.fillRect(0, 0, this._canvas.width, this._canvas.height);

    // Draw gutter background
    ctx.fillStyle = "#282828";
    ctx.fillRect(0, 0, gutterWidth, this._canvas.height);

    // Calculate which visual rows are visible
    const startVisualRow = Math.floor(scrollTop / lineHeight);

    // Render each line
    let y = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? "";
      const bufferRow = state.viewport.startRow + i;

      if (this._wrapMap) {
        // Handle wrapped lines
        const numVisualRows = this._wrapMap.visualRowsForLine(
          // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
          bufferRow as MultiBufferRow,
        );
        const firstVisualRow = this._wrapMap.bufferRowToFirstVisualRow(
          // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
          bufferRow as MultiBufferRow,
        );

        for (let seg = 0; seg < numVisualRows; seg++) {
          const visualRow = firstVisualRow + seg;
          const screenY = (visualRow - startVisualRow) * lineHeight;

          if (screenY < -lineHeight || screenY > this._canvas.height) continue;

          // Get segment text
          const charStart = this._wrapMap.segmentCharStart(
            // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
            bufferRow as MultiBufferRow,
            seg,
          );
          const charEnd =
            seg + 1 < numVisualRows
              ? this._wrapMap.segmentCharStart(
                  // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
                  bufferRow as MultiBufferRow,
                  seg + 1,
                )
              : line.length;
          const segText = line.slice(charStart, charEnd);

          // Draw line number (only for first segment)
          if (seg === 0) {
            this._drawLineNumber(ctx, bufferRow + 1, screenY, gutterWidth);
          }

          // Draw text
          this._drawText(ctx, segText, gutterWidth, screenY);
        }
      } else {
        // No wrapping
        const screenY = y;

        // Draw line number
        this._drawLineNumber(ctx, bufferRow + 1, screenY, gutterWidth);

        // Draw text
        this._drawText(ctx, line, gutterWidth, screenY);

        y += lineHeight;
      }
    }

    // Note: Selections and cursor are rendered via separate methods
    // (renderSelection, renderCursor) which receive resolved MultiBufferPoints.
    // The RenderState.selections use anchor-based positions that require
    // resolution before rendering.
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
   * Set the snapshot for content access.
   * Used by hitTest to get line text.
   */
  setSnapshot(snapshot: MultiBufferSnapshot): void {
    this._snapshot = snapshot;

    // Build wrap map if wrapping is enabled
    if (this._measurements.wrapWidth && this._measurements.wrapWidth > 0) {
      this._wrapMap = new WrapMap(snapshot, this._measurements.wrapWidth);
    }
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

  // ─── Private Methods ───────────────────────────────────────────────────

  private _measureCharWidth(container: HTMLElement): number {
    const span = document.createElement("span");
    span.style.cssText = "position:absolute;visibility:hidden;white-space:pre;font:inherit;";
    span.textContent = "MMMMMMMMMM"; // 10 wide chars for accuracy
    container.appendChild(span);
    const width = span.getBoundingClientRect().width / 10;
    container.removeChild(span);
    return width || 8; // Fallback to 8 if measurement fails
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
      this._ctx.font = `${this._measurements.lineHeight}px monospace`;
      this._ctx.textBaseline = "top";
    }
  }

  private _scheduleRender(): void {
    if (this._pendingRender !== null) return;

    this._pendingRender = requestAnimationFrame(() => {
      this._pendingRender = null;
      this._handleScroll();
    });
  }

  private _handleScroll(): void {
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

  private _getLineText(row: MultiBufferRow): string {
    if (!this._snapshot) return "";
    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
    const lines = this._snapshot.lines(row, (row + 1) as MultiBufferRow);
    return lines[0] ?? "";
  }

  private _drawLineNumber(
    ctx: CanvasRenderingContext2D,
    lineNum: number,
    y: number,
    gutterWidth: number,
  ): void {
    ctx.fillStyle = this._theme.gutter;
    ctx.textAlign = "right";
    ctx.fillText(String(lineNum), gutterWidth - 8, y);
    ctx.textAlign = "left";
  }

  private _drawText(
    ctx: CanvasRenderingContext2D,
    text: string,
    startX: number,
    y: number,
  ): void {
    if (!this._atlas) return;

    let x = startX;
    for (const char of text) {
      const glyph = this._atlas.get(char);
      ctx.drawImage(
        this._atlas.canvas,
        glyph.x,
        glyph.y,
        glyph.width,
        glyph.height,
        x,
        y,
        this._charWidth,
        this._measurements.lineHeight,
      );
      x += this._charWidth;
    }
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
}

/**
 * Factory function to create a canvas renderer.
 */
export function createCanvasRenderer(
  measurements: Measurements,
  theme?: Partial<Theme>,
): CanvasRenderer {
  const renderer = new CanvasRenderer(measurements);
  if (theme) {
    renderer.setTheme(theme);
  }
  return renderer;
}
