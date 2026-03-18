/**
 * Canvas-based renderer for the multibuffer.
 *
 * Uses a glyph atlas for efficient text rendering and provides cursor/selection
 * rendering with theme-aware colors and blink animation.
 */

import type { MultiBufferPoint, MultiBufferRow, MultiBufferSnapshot } from "../multibuffer/types.ts";
import { computeSelectionRects } from "./dom.ts";
import {
  calculateContentHeight,
  calculateScrollTop,
  yToVisualRow,
} from "./measurement.ts";
import { GRUVBOX_DARK_THEME } from "./theme.ts";
import type { Measurements, Renderer, RenderState, ScrollTarget, Theme, Viewport } from "./types.ts";
import { charColToVisualCol, WrapMap } from "./wrap-map.ts";

/**
 * Glyph atlas for efficient text rendering.
 * Pre-renders ASCII printable characters (32-126) at the specified font/size.
 * Extended characters are cached on-demand.
 */
class GlyphAtlas {
  readonly canvas: OffscreenCanvas;
  readonly charWidth: number;
  readonly lineHeight: number;
  private readonly _ctx: OffscreenCanvasRenderingContext2D;
  private readonly _glyphMap: Map<string, { x: number; y: number }> = new Map();
  private readonly _font: string;
  private readonly _textColor: string;

  /** Number of glyphs per row in the atlas. */
  private static readonly GLYPHS_PER_ROW = 16;
  /** ASCII printable range. */
  private static readonly ASCII_START = 32;
  private static readonly ASCII_END = 126;

  constructor(charWidth: number, lineHeight: number, font: string, textColor: string) {
    this.charWidth = charWidth;
    this.lineHeight = lineHeight;
    this._font = font;
    this._textColor = textColor;

    // Calculate atlas size for ASCII characters + some space for extended chars
    const asciiCount = GlyphAtlas.ASCII_END - GlyphAtlas.ASCII_START + 1;
    const rows = Math.ceil(asciiCount / GlyphAtlas.GLYPHS_PER_ROW);
    // Reserve extra rows for on-demand extended character caching
    const totalRows = rows + 8;

    this.canvas = new OffscreenCanvas(
      GlyphAtlas.GLYPHS_PER_ROW * charWidth,
      totalRows * lineHeight,
    );

    const ctx = this.canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Failed to create OffscreenCanvas 2D context");
    }
    this._ctx = ctx;

    this._initAtlas();
  }

  /** Pre-render ASCII printable characters. */
  private _initAtlas(): void {
    const ctx = this._ctx;
    ctx.font = this._font;
    ctx.fillStyle = this._textColor;
    ctx.textBaseline = "top";

    for (let code = GlyphAtlas.ASCII_START; code <= GlyphAtlas.ASCII_END; code++) {
      const char = String.fromCharCode(code);
      const idx = code - GlyphAtlas.ASCII_START;
      const col = idx % GlyphAtlas.GLYPHS_PER_ROW;
      const row = Math.floor(idx / GlyphAtlas.GLYPHS_PER_ROW);
      const x = col * this.charWidth;
      const y = row * this.lineHeight;

      // Center the character horizontally within its cell
      const charMetrics = ctx.measureText(char);
      const charX = x + (this.charWidth - charMetrics.width) / 2;
      ctx.fillText(char, charX, y);

      this._glyphMap.set(char, { x, y });
    }
  }

  /** Get the atlas position for a character. Returns null for unmapped characters. */
  get(char: string): { x: number; y: number } | null {
    const cached = this._glyphMap.get(char);
    if (cached) return cached;

    // On-demand caching for extended characters
    const code = char.charCodeAt(0);
    if (code >= GlyphAtlas.ASCII_START && code <= GlyphAtlas.ASCII_END) {
      // Should have been pre-rendered
      return null;
    }

    // Add extended character to the atlas
    const idx = this._glyphMap.size;
    const col = idx % GlyphAtlas.GLYPHS_PER_ROW;
    const row = Math.floor(idx / GlyphAtlas.GLYPHS_PER_ROW);
    const x = col * this.charWidth;
    const y = row * this.lineHeight;

    // Check if we have space
    if (y + this.lineHeight > this.canvas.height) {
      return null; // Atlas full
    }

    this._ctx.fillText(char, x, y);
    this._glyphMap.set(char, { x, y });
    return { x, y };
  }

  /** Rebuild atlas with new colors. */
  rebuild(textColor: string): void {
    this._ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this._ctx.fillStyle = textColor;
    this._glyphMap.clear();
    this._initAtlas();
  }
}

/**
 * Canvas renderer implementing the Renderer interface.
 * Provides efficient text, cursor, and selection rendering.
 */
export class CanvasRenderer implements Renderer {
  private _container: HTMLElement | null = null;
  private _canvas: HTMLCanvasElement | null = null;
  private _ctx: CanvasRenderingContext2D | null = null;
  private _atlas: GlyphAtlas | null = null;
  private _measurements: Measurements;
  private _charWidth: number = 8;
  private _viewport: Viewport;
  private _snapshot: MultiBufferSnapshot | null = null;
  private _wrapMap: WrapMap | null = null;
  private _theme: Theme = GRUVBOX_DARK_THEME;

  // Cursor state
  private _cursorPoint: MultiBufferPoint | undefined;
  private _cursorVisible = true;
  private _cursorHidden = false;
  private _blinkIntervalMs: number | false = 600;
  private _blinkIntervalId: ReturnType<typeof setInterval> | null = null;
  private _focused = false;

  // Selection state
  private _selectionStart: MultiBufferPoint | undefined;
  private _selectionEnd: MultiBufferPoint | undefined;

  // Font configuration
  private readonly _fontFamily = "monospace";
  private readonly _fontSize: number;

  constructor(measurements: Measurements) {
    this._measurements = measurements;
    this._fontSize = Math.round(measurements.lineHeight * 0.75);
    if (measurements.charWidth !== undefined) {
      this._charWidth = measurements.charWidth;
    }
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
    this._canvas = document.createElement("canvas");
    this._canvas.style.display = "block";
    this._canvas.style.width = "100%";
    this._canvas.style.height = "100%";
    container.appendChild(this._canvas);

    const ctx = this._canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Failed to create Canvas 2D context");
    }
    this._ctx = ctx;

    // Measure actual character width from font
    this._measureCharWidth();

    // Initialize glyph atlas
    this._initAtlas();

    // Set up resize handling
    this._handleResize();
    window.addEventListener("resize", this._handleResize);
  }

  unmount(): void {
    this._stopBlinking();
    window.removeEventListener("resize", this._handleResize);

    if (this._canvas && this._container) {
      this._container.removeChild(this._canvas);
    }

    this._container = null;
    this._canvas = null;
    this._ctx = null;
    this._atlas = null;
  }

  setMeasurements(measurements: Measurements): void {
    this._measurements = measurements;
    if (measurements.charWidth !== undefined) {
      this._charWidth = measurements.charWidth;
    }
    // Rebuild atlas with new measurements
    this._initAtlas();
  }

  setTheme(theme: Partial<Theme>): void {
    this._theme = { ...this._theme, ...theme };
    // Rebuild atlas if text color changed
    if (theme.syntaxDefault && this._atlas) {
      this._atlas.rebuild(this._theme.syntaxDefault);
    }
  }

  render(state: RenderState, lines: readonly string[]): void {
    if (!this._ctx || !this._canvas || !this._atlas) return;

    const ctx = this._ctx;
    const { lineHeight, gutterWidth } = this._measurements;
    const charWidth = this._charWidth;

    // Clear canvas
    ctx.fillStyle = this._theme.lineBg === "transparent" ? "#1d2021" : this._theme.lineBg;
    ctx.fillRect(0, 0, this._canvas.width, this._canvas.height);

    // Draw selection (behind text)
    this._renderSelectionInternal(ctx);

    // Draw lines
    const { startRow, scrollTop } = state.viewport;
    const wrapMap = this._wrapMap;

    for (let i = 0; i < lines.length; i++) {
      // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic
      const bufferRow = (startRow + i) as MultiBufferRow;
      const visualRow = wrapMap
        ? wrapMap.bufferRowToFirstVisualRow(bufferRow)
        : bufferRow;
      const y = visualRow * lineHeight - scrollTop;

      // Skip if off-screen
      if (y + lineHeight < 0 || y > this._canvas.height) continue;

      const line = lines[i] ?? "";

      // Draw gutter (line number)
      ctx.fillStyle = this._theme.gutter;
      ctx.font = `${this._fontSize}px ${this._fontFamily}`;
      ctx.textBaseline = "top";
      const lineNum = String(bufferRow + 1);
      ctx.fillText(lineNum, gutterWidth - (lineNum.length + 1) * charWidth, y);

      // Draw text using glyph atlas
      let x = gutterWidth;
      for (const char of line) {
        const glyph = this._atlas.get(char);
        if (glyph) {
          ctx.drawImage(
            this._atlas.canvas,
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
          // Fallback for characters not in atlas
          ctx.fillStyle = this._theme.syntaxDefault;
          ctx.fillText(char, x, y);
        }
        x += charWidth;
      }
    }

    // Draw cursor (on top of text)
    this._renderCursorInternal(ctx);

    // Update viewport
    this._viewport = state.viewport;
  }

  scrollTo(target: ScrollTarget): void {
    if (!this._snapshot || !this._canvas) return;

    const contentHeight = calculateContentHeight(
      this._snapshot.lineCount,
      this._measurements.lineHeight,
      this._wrapMap ?? undefined,
    );

    const newScrollTop = calculateScrollTop(
      target.row,
      target.strategy,
      this._viewport.scrollTop,
      this._measurements.lineHeight,
      this._viewport.height,
      contentHeight,
      this._wrapMap ?? undefined,
    );

    this._viewport = {
      ...this._viewport,
      scrollTop: newScrollTop,
    };
  }

  getViewport(): Viewport {
    return this._viewport;
  }

  hitTest(x: number, y: number): { row: MultiBufferRow; column: number } | undefined {
    const { lineHeight, gutterWidth } = this._measurements;
    const charWidth = this._charWidth;
    const scrollTop = this._viewport.scrollTop;

    const visualRow = yToVisualRow(y + scrollTop, lineHeight);

    let bufferRow: MultiBufferRow;
    if (this._wrapMap) {
      const info = this._wrapMap.visualRowToBufferRow(visualRow);
      bufferRow = info.mbRow;
    } else {
      // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
      bufferRow = visualRow as MultiBufferRow;
    }

    // Clamp to valid rows
    if (this._snapshot) {
      // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
      bufferRow = Math.min(bufferRow, Math.max(0, this._snapshot.lineCount - 1)) as MultiBufferRow;
    }

    const column = Math.max(0, Math.floor((x - gutterWidth) / charWidth));

    return { row: bufferRow, column };
  }

  /**
   * Set the snapshot for rendering. Called by EditorView.
   */
  setSnapshot(snapshot: MultiBufferSnapshot): void {
    this._snapshot = snapshot;
    const wrapWidth = this._measurements.wrapWidth ?? 0;
    if (wrapWidth > 0) {
      this._wrapMap = new WrapMap(snapshot, wrapWidth);
    } else {
      this._wrapMap = null;
    }
  }

  // ─── Cursor Rendering ────────────────────────────────────────────────

  /**
   * Render cursor at a multibuffer point.
   */
  renderCursor(point: MultiBufferPoint | undefined): void {
    this._cursorPoint = point;
    this._requestRedraw();
  }

  private _renderCursorInternal(ctx: CanvasRenderingContext2D): void {
    if (this._cursorHidden || !this._cursorPoint || !this._cursorVisible) return;

    const point = this._cursorPoint;
    const { lineHeight } = this._measurements;
    const gutterWidth = this._getEffectiveGutterWidth();
    const charWidth = this._charWidth;
    const scrollTop = this._viewport.scrollTop;

    // Calculate visual position
    const visualRow = this._wrapMap
      ? this._wrapMap.bufferRowToFirstVisualRow(point.row)
      : point.row;

    const wrapWidth = this._measurements.wrapWidth ?? 0;
    const lineText = this._getLineText(point.row);
    let displayRow = visualRow;
    let displayVisualCol: number;

    if (wrapWidth > 0 && this._wrapMap) {
      // Handle wrapped lines
      const wm = this._wrapMap;
      const totalSegs = wm.visualRowsForLine(point.row);
      let segIdx = 0;
      for (let s = 1; s < totalSegs; s++) {
        if (wm.segmentCharStart(point.row, s) > point.column) break;
        segIdx = s;
      }
      displayRow = visualRow + segIdx;
      const charOffset = wm.segmentCharStart(point.row, segIdx);
      const segEnd =
        segIdx + 1 < totalSegs
          ? wm.segmentCharStart(point.row, segIdx + 1)
          : lineText.length;
      displayVisualCol = charColToVisualCol(lineText.slice(charOffset, segEnd), point.column - charOffset);
    } else {
      displayVisualCol = charColToVisualCol(lineText, point.column);
    }

    const x = gutterWidth + displayVisualCol * charWidth;
    const y = displayRow * lineHeight - scrollTop;

    // Draw 2px vertical bar cursor
    ctx.fillStyle = this._theme.cursor;
    ctx.fillRect(x, y, 2, lineHeight);
  }

  /**
   * Set whether the cursor should be hidden (for read-only mode).
   */
  setCursorHidden(hidden: boolean): void {
    this._cursorHidden = hidden;
    this._requestRedraw();
  }

  /**
   * Returns true if the cursor is hidden.
   */
  get cursorHidden(): boolean {
    return this._cursorHidden;
  }

  /**
   * Configure cursor blink behavior.
   * @param ms - Blink interval in milliseconds (must be > 0), or `false` to disable blinking.
   * @throws {RangeError} If `ms` is a number that is not positive.
   */
  setCursorBlink(ms: number | false): void {
    if (typeof ms === "number" && ms <= 0) {
      throw new RangeError(`setCursorBlink: interval must be > 0, got ${ms}`);
    }
    this._blinkIntervalMs = ms;
    this._updateBlinking();
  }

  /**
   * Return the current blink interval setting.
   */
  getCursorBlinkInterval(): number | false {
    return this._blinkIntervalMs;
  }

  /**
   * Update focus state — call when the editor gains or loses keyboard focus.
   */
  setFocused(focused: boolean): void {
    this._focused = focused;
    this._updateBlinking();
    this._requestRedraw();
  }

  private _updateBlinking(): void {
    this._stopBlinking();

    if (this._focused && this._blinkIntervalMs !== false) {
      this._cursorVisible = true;
      this._blinkIntervalId = setInterval(() => {
        this._cursorVisible = !this._cursorVisible;
        this._requestRedraw();
      }, this._blinkIntervalMs);
    } else {
      // When unfocused or blink disabled, cursor is solid
      this._cursorVisible = true;
    }
  }

  private _stopBlinking(): void {
    if (this._blinkIntervalId !== null) {
      clearInterval(this._blinkIntervalId);
      this._blinkIntervalId = null;
    }
  }

  // ─── Selection Rendering ─────────────────────────────────────────────

  /**
   * Render selection highlight between two multibuffer points.
   */
  renderSelection(
    start: MultiBufferPoint | undefined,
    end: MultiBufferPoint | undefined,
  ): void {
    this._selectionStart = start;
    this._selectionEnd = end;
    this._requestRedraw();
  }

  private _renderSelectionInternal(ctx: CanvasRenderingContext2D): void {
    if (!this._selectionStart || !this._selectionEnd) return;

    const rects = computeSelectionRects(
      this._selectionStart,
      this._selectionEnd,
      this._snapshot,
      this._measurements.lineHeight,
      this._charWidth,
      this._getEffectiveGutterWidth(),
      this._measurements.wrapWidth ?? 0,
      this._wrapMap,
    );

    if (rects.length === 0) return;

    const scrollTop = this._viewport.scrollTop;
    ctx.fillStyle = this._theme.selection;

    for (const rect of rects) {
      ctx.fillRect(rect.x, rect.y - scrollTop, rect.width, rect.height);
    }
  }

  // ─── Private Helpers ─────────────────────────────────────────────────

  private _measureCharWidth(): void {
    if (!this._ctx) return;

    this._ctx.font = `${this._fontSize}px ${this._fontFamily}`;
    // Measure using a character that represents average width
    const metrics = this._ctx.measureText("M");
    this._charWidth = metrics.width;
  }

  private _initAtlas(): void {
    const font = `${this._fontSize}px ${this._fontFamily}`;
    this._atlas = new GlyphAtlas(
      this._charWidth,
      this._measurements.lineHeight,
      font,
      this._theme.syntaxDefault,
    );
  }

  private _getEffectiveGutterWidth(): number {
    if (this._measurements.gutterMode === "diff") {
      // Diff mode: old line # + new line # + sign
      return 40 + 40 + 16;
    }
    return this._measurements.gutterWidth;
  }

  private _getLineText(row: MultiBufferRow): string {
    if (!this._snapshot) return "";
    // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic
    const nextRow = Math.min(row + 1, this._snapshot.lineCount) as MultiBufferRow;
    const lines = this._snapshot.lines(row, nextRow);
    return lines[0] ?? "";
  }

  private readonly _handleResize = (): void => {
    if (!this._canvas || !this._container) return;

    const rect = this._container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    // Set actual canvas size for high-DPI displays
    this._canvas.width = rect.width * dpr;
    this._canvas.height = rect.height * dpr;

    // Scale context to match device pixel ratio
    if (this._ctx) {
      this._ctx.scale(dpr, dpr);
    }

    // Update viewport dimensions
    this._viewport = {
      ...this._viewport,
      width: rect.width,
      height: rect.height,
    };
  };

  private _redrawPending = false;

  private _requestRedraw(): void {
    if (this._redrawPending) return;
    this._redrawPending = true;
    requestAnimationFrame(() => {
      this._redrawPending = false;
      this._redrawCursorAndSelection();
    });
  }

  /**
   * Redraw only cursor and selection layers without full re-render.
   * This is more efficient for cursor blink animation.
   */
  private _redrawCursorAndSelection(): void {
    if (!this._ctx || !this._canvas) return;
    // For now, we do a full re-render. A more optimized version could
    // use separate canvas layers or dirty rect tracking.
    // The render() method will be called by the editor on the next frame.
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
