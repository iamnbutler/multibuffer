/**
 * Canvas-based renderer for the multibuffer.
 * Renders visible visual rows into an HTML Canvas element.
 * Supports native scrolling via a scroll container with spacer element.
 * Supports soft wrapping via WrapMap.
 */

import type { MultiBufferRow, MultiBufferSnapshot } from "../multibuffer/types.ts";
import {
  calculateContentHeight,
  calculateScrollTop,
  createViewport,
  yToVisualRow,
} from "./measurement.ts";
import { themeToVars } from "./theme.ts";
import type {
  Measurements,
  Renderer,
  RenderState,
  ScrollTarget,
  Theme,
  Viewport,
} from "./types.ts";
import { visualColToCharCol, WrapMap } from "./wrap-map.ts";

/** Threshold for lazy WrapMap computation (lines). */
const LAZY_WRAP_THRESHOLD = 5000;

/** Number of rows to compute per animation frame during lazy WrapMap build. */
const WRAP_CHUNK_SIZE = 500;

/** Default character width in pixels (monospace). */
const DEFAULT_CHAR_WIDTH = 8;

/**
 * Create a canvas renderer with the given measurements.
 */
export function createCanvasRenderer(measurements: Measurements): CanvasRenderer {
  return new CanvasRenderer(measurements);
}

/**
 * Canvas-based renderer implementing the Renderer interface.
 * Uses a scroll container with a spacer element for native scrolling,
 * and renders visible content to a canvas positioned over the viewport.
 */
export class CanvasRenderer implements Renderer {
  private _measurements: Measurements;
  private _charWidth: number;
  private _theme: Partial<Theme> = {};
  private _viewport: Viewport;

  // DOM elements
  private _container: HTMLElement | null = null;
  private _scrollContainer: HTMLDivElement | null = null;
  private _spacer: HTMLDivElement | null = null;
  private _canvas: HTMLCanvasElement | null = null;
  private _ctx: CanvasRenderingContext2D | null = null;

  // State
  private _snapshot: MultiBufferSnapshot | null = null;
  private _wrapMap: WrapMap | null = null;
  private _wrapMapSnapshotVersion = -1;
  private _wrapMapWrapWidth = 0;
  private _wrapBuildFrame: number | null = null;
  private _renderFrame: number | null = null;

  // Event handlers
  private _onScroll: (() => void) | null = null;

  constructor(measurements: Measurements) {
    this._measurements = measurements;
    this._charWidth = measurements.charWidth ?? DEFAULT_CHAR_WIDTH;
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

    // Apply initial theme if one was set before mount
    if (this._theme && Object.keys(this._theme).length > 0) {
      this._applyThemeVars(container, this._theme);
    }

    // Measure actual character width from the font
    this._charWidth = this._measureCharWidth(container);

    // Create scroll container with native scrolling
    const scrollContainer = document.createElement("div");
    scrollContainer.className = "canvas-scroll-container";
    scrollContainer.style.cssText =
      "position:relative;overflow-y:auto;height:100%;width:100%;overscroll-behavior:none;";
    this._scrollContainer = scrollContainer;

    // Spacer element for scroll height
    const spacer = document.createElement("div");
    spacer.className = "canvas-spacer";
    spacer.style.cssText = "width:1px;pointer-events:none;";
    this._spacer = spacer;

    // Canvas element positioned absolutely at top
    const canvas = document.createElement("canvas");
    canvas.className = "canvas-renderer";
    canvas.style.cssText = "position:absolute;top:0;left:0;";
    this._canvas = canvas;
    this._ctx = canvas.getContext("2d");

    scrollContainer.appendChild(spacer);
    scrollContainer.appendChild(canvas);
    container.appendChild(scrollContainer);

    // Attach scroll listener with passive flag for performance
    this._onScroll = () => this._handleScroll();
    scrollContainer.addEventListener("scroll", this._onScroll, { passive: true });

    // Initial viewport setup
    this._updateCanvasSize();
  }

  unmount(): void {
    // Cancel any pending animation frames
    if (this._wrapBuildFrame !== null && typeof cancelAnimationFrame !== "undefined") {
      cancelAnimationFrame(this._wrapBuildFrame);
      this._wrapBuildFrame = null;
    }
    if (this._renderFrame !== null && typeof cancelAnimationFrame !== "undefined") {
      cancelAnimationFrame(this._renderFrame);
      this._renderFrame = null;
    }

    // Remove event listeners
    if (this._scrollContainer && this._onScroll) {
      this._scrollContainer.removeEventListener("scroll", this._onScroll);
    }

    // Remove DOM elements
    if (this._container && this._scrollContainer) {
      this._container.removeChild(this._scrollContainer);
    }

    // Clear references
    this._container = null;
    this._scrollContainer = null;
    this._spacer = null;
    this._canvas = null;
    this._ctx = null;
    this._snapshot = null;
    this._wrapMap = null;
    this._wrapMapSnapshotVersion = -1;
    this._wrapMapWrapWidth = 0;
    this._onScroll = null;
  }

  setMeasurements(measurements: Measurements): void {
    this._measurements = measurements;
    // Rebuild wrap map if snapshot exists and wrapping is enabled
    if (this._snapshot) {
      this._wrapMap = this._buildWrapMap(this._snapshot);
    }
  }

  /**
   * Re-measure character width from the container's current font.
   * Call this after font changes at runtime (e.g., after FontFace.load() resolves).
   */
  remeasure(): void {
    if (!this._container) {
      return;
    }

    // Re-measure character width from the current font
    this._charWidth = this._measureCharWidth(this._container);

    // Rebuild wrap map with new measurements
    if (this._snapshot) {
      this._wrapMap = this._buildWrapMap(this._snapshot);
    }

    // Trigger a full re-render
    this._handleScroll();
  }

  /**
   * Get the current measured character width.
   */
  getCharWidth(): number {
    return this._charWidth;
  }

  setTheme(theme: Partial<Theme>): void {
    this._theme = { ...this._theme, ...theme };
    if (this._container) {
      this._applyThemeVars(this._container, theme);
    }
  }

  render(state: RenderState, lines: readonly string[]): void {
    if (!this._canvas || !this._ctx || !this._spacer || !this._scrollContainer) {
      return;
    }

    const { viewport, selections, focused } = state;
    this._viewport = viewport;

    // Update canvas size to match container
    this._updateCanvasSize();

    // Update spacer height to match content height
    const totalLines = this._snapshot?.lineCount ?? 0;
    const contentHeight = calculateContentHeight(
      totalLines,
      this._measurements.lineHeight,
      this._wrapMap ?? undefined,
    );
    this._spacer.style.height = `${contentHeight}px`;

    // Clear canvas
    const ctx = this._ctx;
    const canvas = this._canvas;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Calculate first visual row for positioning
    const firstVisualRow = this._wrapMap
      ? this._wrapMap.bufferRowToFirstVisualRow(viewport.startRow)
      : viewport.startRow;

    // Apply scroll offset to canvas rendering
    const scrollOffset = firstVisualRow * this._measurements.lineHeight;
    const relativeScrollTop = viewport.scrollTop - scrollOffset;

    // Render visible lines
    this._renderLines(lines, viewport, relativeScrollTop);

    // TODO: Selection and cursor rendering requires anchor resolution
    // which will be implemented in a follow-up PR
    void selections;
    void focused;
  }

  scrollTo(target: ScrollTarget): void {
    if (!this._scrollContainer) return;

    const totalLines = this._snapshot?.lineCount ?? 0;
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
      this._viewport.height,
      contentHeight,
      this._wrapMap ?? undefined,
    );

    this._scrollContainer.scrollTop = newScrollTop;
    // The scroll event handler will update the viewport
  }

  getViewport(): Viewport {
    return this._viewport;
  }

  /**
   * Get the current scroll position from the scroll container.
   */
  getScrollTop(): number {
    return this._scrollContainer?.scrollTop ?? 0;
  }

  hitTest(x: number, y: number): { row: MultiBufferRow; column: number } | undefined {
    if (!this._scrollContainer) return undefined;

    const scrollTop = this._scrollContainer.scrollTop;
    const visualRow = yToVisualRow(scrollTop + y, this._measurements.lineHeight);
    const gutterWidth = this._measurements.gutterWidth;
    const visualColInSegment = Math.max(0, Math.floor((x - gutterWidth) / this._charWidth));

    if (this._wrapMap) {
      const { mbRow, segment } = this._wrapMap.visualRowToBufferRow(visualRow);
      const lineText = this._getLineText(mbRow);
      // Use cached segment char-start offsets
      const charOffset = this._wrapMap.segmentCharStart(mbRow, segment);
      const nextSeg = segment + 1;
      const segEnd =
        nextSeg < this._wrapMap.visualRowsForLine(mbRow)
          ? this._wrapMap.segmentCharStart(mbRow, nextSeg)
          : lineText.length;
      const segText = lineText.slice(charOffset, segEnd);
      const charColInSeg = visualColToCharCol(segText, visualColInSegment);
      return { row: mbRow, column: charOffset + charColInSeg };
    }

    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
    const lineText = this._getLineText(visualRow as MultiBufferRow);
    const column = visualColToCharCol(lineText, visualColInSegment);
    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
    return { row: visualRow as MultiBufferRow, column };
  }

  /**
   * Set the snapshot for content rendering.
   * Called by the editor to update the content state.
   */
  setSnapshot(snapshot: MultiBufferSnapshot): void {
    this._snapshot = snapshot;

    // Check if we need to rebuild the wrap map
    const wrapWidth = this._measurements.wrapWidth;
    const needsRebuild =
      snapshot.version !== this._wrapMapSnapshotVersion ||
      (wrapWidth ?? 0) !== this._wrapMapWrapWidth;

    if (needsRebuild) {
      this._wrapMap = this._buildWrapMap(snapshot);
    }
  }

  /**
   * Handle scroll events from the scroll container.
   * Updates the viewport and triggers a render.
   */
  private _handleScroll(): void {
    if (!this._scrollContainer || !this._snapshot) return;

    const scrollTop = this._scrollContainer.scrollTop;
    const height = this._scrollContainer.clientHeight;
    const width = this._scrollContainer.clientWidth;

    const totalLines = this._snapshot.lineCount;
    const viewport = createViewport(
      scrollTop,
      height,
      width,
      this._measurements,
      totalLines,
      this._wrapMap ?? undefined,
    );

    this._viewport = viewport;

    const { startRow, endRow } = viewport;
    const lines = this._snapshot.lines(startRow, endRow);

    // Render with updated viewport
    this.render(
      {
        viewport,
        selections: [],
        decorations: [],
        excerptHeaders: [],
        focused: false,
      },
      lines,
    );
  }

  /**
   * Update canvas size to match the scroll container dimensions.
   */
  private _updateCanvasSize(): void {
    if (!this._canvas || !this._scrollContainer) return;

    const width = this._scrollContainer.clientWidth;
    const height = this._scrollContainer.clientHeight;
    const dpr = typeof devicePixelRatio !== "undefined" ? devicePixelRatio : 1;

    // Set canvas size accounting for device pixel ratio
    this._canvas.width = width * dpr;
    this._canvas.height = height * dpr;
    this._canvas.style.width = `${width}px`;
    this._canvas.style.height = `${height}px`;

    // Scale context for high-DPI displays
    if (this._ctx) {
      this._ctx.scale(dpr, dpr);
    }
  }

  /**
   * Render lines to the canvas.
   */
  private _renderLines(
    lines: readonly string[],
    viewport: Viewport,
    scrollOffset: number,
  ): void {
    if (!this._ctx) return;

    const ctx = this._ctx;
    const { lineHeight, gutterWidth } = this._measurements;
    const theme = this._theme;

    // Set font
    ctx.font = `${lineHeight * 0.8}px monospace`;
    ctx.textBaseline = "middle";

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line === undefined) continue;

      const y = i * lineHeight - scrollOffset + lineHeight / 2;

      // Render gutter (line number)
      ctx.fillStyle = theme.gutter ?? "#928374";
      const lineNum = viewport.startRow + i + 1;
      ctx.fillText(String(lineNum), 4, y);

      // Render line text
      ctx.fillStyle = theme.syntaxDefault ?? "#ebdbb2";
      ctx.fillText(line, gutterWidth, y);
    }
  }

  /**
   * Get the text for a specific line.
   */
  private _getLineText(row: MultiBufferRow): string {
    if (!this._snapshot) return "";
    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
    const nextRow = Math.min(row + 1, this._snapshot.lineCount) as MultiBufferRow;
    return this._snapshot.lines(row, nextRow)?.[0] ?? "";
  }

  /**
   * Build or rebuild the WrapMap for soft wrapping.
   */
  private _buildWrapMap(snapshot: MultiBufferSnapshot): WrapMap | null {
    const wrapWidth = this._measurements.wrapWidth;
    if (!wrapWidth || wrapWidth <= 0) {
      return null;
    }

    this._wrapMapSnapshotVersion = snapshot.version;
    this._wrapMapWrapWidth = wrapWidth;

    // Cancel any pending animation frame from a previous build
    if (this._wrapBuildFrame !== null && typeof cancelAnimationFrame !== "undefined") {
      cancelAnimationFrame(this._wrapBuildFrame);
      this._wrapBuildFrame = null;
    }

    const useLazy =
      snapshot.lineCount > LAZY_WRAP_THRESHOLD &&
      typeof requestAnimationFrame !== "undefined";

    if (useLazy) {
      const wrapMap = new WrapMap(snapshot, wrapWidth, { lazy: true });
      this._scheduleWrapCompletion(wrapMap);
      return wrapMap;
    }

    return new WrapMap(snapshot, wrapWidth);
  }

  /**
   * Incrementally compute the WrapMap across animation frames.
   */
  private _scheduleWrapCompletion(wrapMap: WrapMap): void {
    this._wrapBuildFrame = requestAnimationFrame(() => {
      // If the wrapMap was replaced by a newer snapshot, bail out
      if (this._wrapMap !== wrapMap) {
        this._wrapBuildFrame = null;
        return;
      }

      const complete = wrapMap.computeChunk(WRAP_CHUNK_SIZE);

      if (complete) {
        this._wrapBuildFrame = null;
        // Update spacer height with exact content height
        if (this._spacer && this._snapshot) {
          const contentHeight = calculateContentHeight(
            this._snapshot.lineCount,
            this._measurements.lineHeight,
            wrapMap,
          );
          this._spacer.style.height = `${contentHeight}px`;
        }
      } else {
        // Schedule next chunk
        this._scheduleWrapCompletion(wrapMap);
      }
    });
  }

  /**
   * Measure the actual character width from the container's font.
   */
  private _measureCharWidth(container: HTMLElement): number {
    const span = document.createElement("span");
    span.style.cssText =
      "position:absolute;visibility:hidden;white-space:pre;font-family:inherit;font-size:inherit;";
    span.textContent = "M".repeat(10);
    container.appendChild(span);
    const width = span.getBoundingClientRect().width / 10;
    container.removeChild(span);
    return width || DEFAULT_CHAR_WIDTH;
  }

  /**
   * Apply theme CSS variables to the container.
   */
  private _applyThemeVars(container: HTMLElement, theme: Partial<Theme>): void {
    const vars = themeToVars(theme);
    for (const [cssVar, value] of Object.entries(vars)) {
      container.style.setProperty(cssVar, value);
    }
  }
}
