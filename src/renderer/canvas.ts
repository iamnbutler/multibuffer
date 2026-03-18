/**
 * Canvas-based renderer for the multibuffer.
 * Uses a glyph atlas for efficient text rendering via drawImage().
 *
 * Performance targets:
 * - 10K lines render in <16ms (60fps)
 * - Glyph atlas <1MB memory
 */

import type { MultiBufferRow } from "../multibuffer/types.ts";
import {
  calculateContentHeight,
  calculateScrollTop,
  createViewport,
  xToColumn,
} from "./measurement.ts";
import { GRUVBOX_DARK_THEME } from "./theme.ts";
import type {
  Measurements,
  Renderer,
  RenderState,
  ScrollTarget,
  Theme,
  Viewport,
} from "./types.ts";

/**
 * Glyph atlas for efficient text rendering.
 * Pre-renders ASCII printable characters (32-126) and caches extended characters on-demand.
 */
export class GlyphAtlas {
  readonly canvas: OffscreenCanvas;
  readonly charWidth: number;
  readonly lineHeight: number;

  private readonly _ctx: OffscreenCanvasRenderingContext2D;
  private readonly _font: string;
  private readonly _textColor: string;
  /** Map from character code to atlas position { x, y } */
  private readonly _glyphMap: Map<number, { x: number; y: number }>;
  /** Number of glyphs per row in the atlas */
  private readonly _glyphsPerRow: number;
  /** Current row for adding new glyphs */
  private _currentRow: number;
  /** Current column in the current row */
  private _currentCol: number;

  /**
   * Create a new glyph atlas.
   * @param charWidth - Width of each character in pixels
   * @param lineHeight - Height of each line in pixels
   * @param font - CSS font string (e.g., "14px monospace")
   * @param textColor - CSS color for text rendering
   */
  constructor(
    charWidth: number,
    lineHeight: number,
    font: string,
    textColor: string,
  ) {
    this.charWidth = charWidth;
    this.lineHeight = lineHeight;
    this._font = font;
    this._textColor = textColor;
    this._glyphMap = new Map();

    // Calculate atlas dimensions
    // ASCII printable: 95 characters (32-126)
    // Reserve space for ~256 extended characters (on-demand)
    // Total: ~351 glyphs, arrange in a grid
    const totalGlyphs = 512; // Power of 2 for potential GPU optimization
    this._glyphsPerRow = Math.ceil(Math.sqrt(totalGlyphs));
    const rows = Math.ceil(totalGlyphs / this._glyphsPerRow);

    const atlasWidth = this._glyphsPerRow * charWidth;
    const atlasHeight = rows * lineHeight;

    this.canvas = new OffscreenCanvas(atlasWidth, atlasHeight);
    const ctx = this.canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Failed to get 2D context for glyph atlas");
    }
    this._ctx = ctx;

    // Configure context for text rendering
    this._ctx.font = font;
    this._ctx.textBaseline = "top";
    this._ctx.fillStyle = textColor;

    // Pre-render ASCII printable characters
    this._currentRow = 0;
    this._currentCol = 0;
    for (let code = 32; code <= 126; code++) {
      this._renderGlyph(code);
    }
  }

  /**
   * Get the atlas position for a character.
   * Returns undefined for characters not in the atlas.
   */
  get(char: string): { x: number; y: number } | undefined {
    const code = char.charCodeAt(0);
    let pos = this._glyphMap.get(code);
    if (pos === undefined) {
      // On-demand rendering for extended characters
      pos = this._renderGlyph(code);
    }
    return pos;
  }

  /**
   * Get the memory size of the atlas in bytes (approximate).
   */
  getMemorySize(): number {
    // 4 bytes per pixel (RGBA)
    return this.canvas.width * this.canvas.height * 4;
  }

  /**
   * Get the CSS font string used by this atlas.
   */
  get font(): string {
    return this._font;
  }

  private _renderGlyph(code: number): { x: number; y: number } | undefined {
    // Check if we have space
    const maxGlyphs = this._glyphsPerRow * Math.floor(this.canvas.height / this.lineHeight);
    if (this._currentRow * this._glyphsPerRow + this._currentCol >= maxGlyphs) {
      // Atlas is full, return undefined for this character
      return undefined;
    }

    const x = this._currentCol * this.charWidth;
    const y = this._currentRow * this.lineHeight;

    // Clear the glyph cell
    this._ctx.clearRect(x, y, this.charWidth, this.lineHeight);

    // Render the character
    const char = String.fromCharCode(code);
    this._ctx.fillStyle = this._textColor;
    this._ctx.fillText(char, x, y);

    // Store position
    const pos = { x, y };
    this._glyphMap.set(code, pos);

    // Advance to next position
    this._currentCol++;
    if (this._currentCol >= this._glyphsPerRow) {
      this._currentCol = 0;
      this._currentRow++;
    }

    return pos;
  }
}

/**
 * Canvas-based renderer implementing the Renderer interface.
 * Uses a glyph atlas for efficient text rendering.
 */
export class CanvasRenderer implements Renderer {
  private _container: HTMLElement | null = null;
  private _canvas: HTMLCanvasElement | null = null;
  private _ctx: CanvasRenderingContext2D | null = null;
  private _measurements: Measurements;
  private _theme: Theme;
  private _viewport: Viewport;
  private _atlas: GlyphAtlas | null = null;
  private _scrollTop = 0;
  private _totalLines = 0;
  private _onScroll: ((e: Event) => void) | null = null;

  constructor(measurements: Measurements, theme?: Partial<Theme>) {
    this._measurements = measurements;
    this._theme = { ...GRUVBOX_DARK_THEME, ...theme };
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

  mount(container: HTMLElement): void {
    this._container = container;

    // Create canvas element
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "display:block;width:100%;height:100%;";
    this._canvas = canvas;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Failed to get 2D context for canvas renderer");
    }
    this._ctx = ctx;

    // Set initial size
    const rect = container.getBoundingClientRect();
    this._resizeCanvas(rect.width, rect.height);

    // Create glyph atlas
    const charWidth = this._measurements.charWidth ?? 8;
    const font = this._getFontFromContainer(container) ?? `${this._measurements.lineHeight}px monospace`;
    this._atlas = new GlyphAtlas(
      charWidth,
      this._measurements.lineHeight,
      font,
      this._theme.syntaxDefault,
    );

    container.appendChild(canvas);

    // Set up scroll handling via wheel events
    this._onScroll = (e: Event) => {
      if (e instanceof WheelEvent) {
        e.preventDefault();
        const contentHeight = calculateContentHeight(this._totalLines, this._measurements.lineHeight);
        const maxScroll = Math.max(0, contentHeight - this._viewport.height);
        this._scrollTop = Math.min(Math.max(0, this._scrollTop + e.deltaY), maxScroll);
        this._updateViewport();
      }
    };
    canvas.addEventListener("wheel", this._onScroll, { passive: false });
  }

  unmount(): void {
    if (this._canvas && this._onScroll) {
      this._canvas.removeEventListener("wheel", this._onScroll);
    }
    if (this._canvas && this._container) {
      this._container.removeChild(this._canvas);
    }
    this._canvas = null;
    this._ctx = null;
    this._container = null;
    this._atlas = null;
    this._onScroll = null;
  }

  setMeasurements(measurements: Measurements): void {
    this._measurements = measurements;
    // Rebuild atlas if charWidth changed
    if (this._container && this._atlas) {
      const charWidth = measurements.charWidth ?? 8;
      if (charWidth !== this._atlas.charWidth) {
        const font = this._getFontFromContainer(this._container) ?? `${measurements.lineHeight}px monospace`;
        this._atlas = new GlyphAtlas(
          charWidth,
          measurements.lineHeight,
          font,
          this._theme.syntaxDefault,
        );
      }
    }
  }

  setTheme(theme: Partial<Theme>): void {
    this._theme = { ...this._theme, ...theme };
    // Rebuild atlas with new text color if it changed
    if (this._container && this._atlas && theme.syntaxDefault) {
      const charWidth = this._measurements.charWidth ?? 8;
      const font = this._getFontFromContainer(this._container) ?? `${this._measurements.lineHeight}px monospace`;
      this._atlas = new GlyphAtlas(
        charWidth,
        this._measurements.lineHeight,
        font,
        this._theme.syntaxDefault,
      );
    }
  }

  render(state: RenderState, lines: readonly string[]): void {
    if (!this._ctx || !this._canvas || !this._atlas) return;

    this._totalLines = lines.length;
    this._viewport = state.viewport;
    this._scrollTop = state.viewport.scrollTop;

    const ctx = this._ctx;
    const { lineHeight, gutterWidth } = this._measurements;
    const charWidth = this._measurements.charWidth ?? 8;

    // Ensure canvas is sized correctly
    const containerWidth = this._container?.clientWidth ?? this._canvas.width;
    const containerHeight = this._container?.clientHeight ?? this._canvas.height;
    this._resizeCanvas(containerWidth, containerHeight);

    // Clear canvas with background color
    ctx.fillStyle = this._theme.lineBg === "transparent" ? "#1d2021" : this._theme.lineBg;
    ctx.fillRect(0, 0, this._canvas.width, this._canvas.height);

    // Draw gutter background
    ctx.fillStyle = "#282828";
    ctx.fillRect(0, 0, gutterWidth, this._canvas.height);

    // Render visible lines
    const { startRow, endRow } = state.viewport;
    const startY = -(this._scrollTop % lineHeight);

    for (let row = startRow; row < endRow && row < lines.length; row++) {
      const line = lines[row] ?? "";
      const y = startY + (row - startRow) * lineHeight;

      // Skip if completely off-screen
      if (y + lineHeight < 0 || y > this._canvas.height) continue;

      // Draw line number in gutter
      ctx.fillStyle = this._theme.gutter;
      ctx.font = `${lineHeight * 0.8}px monospace`;
      ctx.textBaseline = "top";
      const lineNum = String(row + 1);
      const lineNumWidth = ctx.measureText(lineNum).width;
      ctx.fillText(lineNum, gutterWidth - lineNumWidth - 8, y + lineHeight * 0.1);

      // Draw line content using glyph atlas
      this._renderLine(line, gutterWidth, y, charWidth, lineHeight);
    }
  }

  scrollTo(target: ScrollTarget): void {
    const contentHeight = calculateContentHeight(this._totalLines, this._measurements.lineHeight);
    this._scrollTop = calculateScrollTop(
      target.row,
      target.strategy,
      this._scrollTop,
      this._measurements.lineHeight,
      this._viewport.height,
      contentHeight,
    );
    this._updateViewport();
  }

  getViewport(): Viewport {
    return this._viewport;
  }

  hitTest(x: number, y: number): { row: MultiBufferRow; column: number } | undefined {
    const { lineHeight } = this._measurements;
    const charWidth = this._measurements.charWidth ?? 8;

    // Account for scroll position
    const absoluteY = y + this._scrollTop;
    const row = Math.floor(absoluteY / lineHeight);

    if (row < 0 || row >= this._totalLines) {
      return undefined;
    }

    const column = xToColumn(x, {
      ...this._measurements,
      charWidth,
    });

    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
    return { row: row as MultiBufferRow, column };
  }

  /**
   * Get the glyph atlas (for testing/debugging).
   */
  getAtlas(): GlyphAtlas | null {
    return this._atlas;
  }

  private _renderLine(
    line: string,
    startX: number,
    y: number,
    charWidth: number,
    lineHeight: number,
  ): void {
    if (!this._ctx || !this._atlas) return;

    const ctx = this._ctx;
    const atlas = this._atlas;

    let x = startX;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === undefined) continue;

      // Handle tabs
      if (char === "\t") {
        x += charWidth * 4; // 4-space tabs
        continue;
      }

      // Skip control characters
      if (char.charCodeAt(0) < 32) continue;

      const glyph = atlas.get(char);
      if (glyph) {
        // Draw from atlas
        ctx.drawImage(
          atlas.canvas,
          glyph.x,
          glyph.y,
          charWidth,
          lineHeight,
          x,
          y,
          charWidth,
          lineHeight,
        );
      } else {
        // Fallback: draw directly (for characters not in atlas)
        ctx.fillStyle = this._theme.syntaxDefault;
        ctx.font = atlas.font;
        ctx.textBaseline = "top";
        ctx.fillText(char, x, y);
      }

      x += charWidth;
    }
  }

  private _resizeCanvas(width: number, height: number): void {
    if (!this._canvas) return;

    // Use device pixel ratio for sharp rendering
    const dpr = window.devicePixelRatio || 1;
    this._canvas.width = width * dpr;
    this._canvas.height = height * dpr;
    this._canvas.style.width = `${width}px`;
    this._canvas.style.height = `${height}px`;

    if (this._ctx) {
      this._ctx.scale(dpr, dpr);
    }
  }

  private _updateViewport(): void {
    if (!this._container) return;

    const rect = this._container.getBoundingClientRect();
    this._viewport = createViewport(
      this._scrollTop,
      rect.height,
      rect.width,
      this._measurements,
      this._totalLines,
    );
  }

  private _getFontFromContainer(container: HTMLElement): string | null {
    const style = getComputedStyle(container);
    if (style.fontFamily && style.fontSize) {
      return `${style.fontSize} ${style.fontFamily}`;
    }
    return null;
  }
}

/**
 * Create a canvas-based renderer.
 * @param measurements - Fixed measurements for rendering
 * @param theme - Optional theme override (defaults to Gruvbox dark)
 */
export function createCanvasRenderer(
  measurements: Measurements,
  theme?: Partial<Theme>,
): Renderer {
  return new CanvasRenderer(measurements, theme);
}
