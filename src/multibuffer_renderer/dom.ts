/**
 * DOM-based renderer for the multibuffer.
 * Renders visible visual rows into a scrollable container.
 * Supports soft wrapping via WrapMap.
 */

import type { MultiBufferPoint, MultiBufferRow, MultiBufferSnapshot } from "../multibuffer/types.ts";
import type { Highlighter, Token } from "./highlighter.ts";
import { buildHighlightedSpans } from "./highlighter.ts";
import {
  calculateContentHeight,
  createViewport,
  rowToY,
  xToColumn,
  yToVisualRow,
} from "./measurement.ts";
import type { Measurements, Renderer, RenderState, ScrollTarget, Viewport } from "./types.ts";
import { WrapMap, wrapLine } from "./wrap-map.ts";

/** Slice tokens to a column range, adjusting offsets to be segment-relative. */
function sliceTokensToRange(tokens: Token[], segStart: number, segEnd: number): Token[] {
  const result: Token[] = [];
  for (const t of tokens) {
    if (t.endColumn <= segStart || t.startColumn >= segEnd) continue;
    result.push({
      startColumn: Math.max(0, t.startColumn - segStart),
      endColumn: Math.min(segEnd - segStart, t.endColumn - segStart),
      color: t.color,
    });
  }
  return result;
}

interface RowElement {
  root: HTMLDivElement;
  gutter: HTMLSpanElement;
  content: HTMLSpanElement;
  kind: "line" | "header";
}

export class DomRenderer implements Renderer {
  private _container: HTMLElement | null = null;
  private _scrollContainer: HTMLDivElement | null = null;
  private _spacer: HTMLDivElement | null = null;
  private _linesContainer: HTMLDivElement | null = null;
  private _cursorEl: HTMLDivElement | null = null;
  private _selectionLayer: HTMLDivElement | null = null;
  private _measurements: Measurements;
  private _rowPool: RowElement[] = [];
  private _viewport: Viewport;
  private _snapshot: MultiBufferSnapshot | null = null;
  private _wrapMap: WrapMap | null = null;
  private _highlighter: Highlighter | null = null;
  private _onScroll: (() => void) | null = null;
  private _onClick: ((e: MouseEvent) => void) | null = null;
  private _onClickCallback: ((point: MultiBufferPoint) => void) | null = null;

  constructor(measurements: Measurements) {
    this._measurements = measurements;
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

    const scrollContainer = document.createElement("div");
    scrollContainer.style.cssText =
      "position:relative;overflow-y:auto;height:100%;width:100%;overscroll-behavior:none;";
    this._scrollContainer = scrollContainer;

    const spacer = document.createElement("div");
    spacer.style.cssText = "width:1px;pointer-events:none;";
    this._spacer = spacer;

    const linesContainer = document.createElement("div");
    linesContainer.style.cssText = "position:absolute;top:0;left:0;right:0;";
    this._linesContainer = linesContainer;

    // Selection highlight layer (behind text)
    const selectionLayer = document.createElement("div");
    selectionLayer.style.cssText = "position:absolute;top:0;left:0;right:0;pointer-events:none;";
    this._selectionLayer = selectionLayer;

    // Cursor element
    const cursorEl = document.createElement("div");
    cursorEl.style.cssText = `position:absolute;width:2px;background:#ebdbb2;display:none;height:${this._measurements.lineHeight}px;z-index:10;`;
    this._cursorEl = cursorEl;

    scrollContainer.appendChild(spacer);
    scrollContainer.appendChild(selectionLayer);
    scrollContainer.appendChild(linesContainer);
    scrollContainer.appendChild(cursorEl);
    container.appendChild(scrollContainer);

    this._onScroll = () => this._handleScroll();
    scrollContainer.addEventListener("scroll", this._onScroll, { passive: true });

    this._onClick = (e: MouseEvent) => this._handleClick(e);
    scrollContainer.addEventListener("mousedown", this._onClick);
  }

  unmount(): void {
    if (this._scrollContainer) {
      if (this._onScroll) this._scrollContainer.removeEventListener("scroll", this._onScroll);
      if (this._onClick) this._scrollContainer.removeEventListener("mousedown", this._onClick);
    }
    if (this._container && this._scrollContainer) {
      this._container.removeChild(this._scrollContainer);
    }
    this._container = null;
    this._scrollContainer = null;
    this._spacer = null;
    this._linesContainer = null;
    this._cursorEl = null;
    this._selectionLayer = null;
    this._rowPool = [];
    this._snapshot = null;
    this._wrapMap = null;
    this._onScroll = null;
    this._onClick = null;
  }

  setMeasurements(measurements: Measurements): void {
    this._measurements = measurements;
    // Rebuild wrap map if snapshot exists and wrapping is enabled
    if (this._snapshot) {
      this._wrapMap = this._buildWrapMap(this._snapshot);
    }
  }

  setSnapshot(snapshot: MultiBufferSnapshot): void {
    this._snapshot = snapshot;
    this._wrapMap = this._buildWrapMap(snapshot);
  }

  setHighlighter(highlighter: Highlighter): void {
    this._highlighter = highlighter;
  }

  render(state: RenderState, lines: readonly string[]): void {
    if (!this._linesContainer || !this._spacer || !this._scrollContainer) return;

    const { viewport, excerptHeaders } = state;
    this._viewport = viewport;

    // Update spacer height
    const totalLines = this._snapshot?.lineCount ?? viewport.endRow;
    const contentHeight = calculateContentHeight(
      totalLines,
      this._measurements.lineHeight,
      this._wrapMap ?? undefined,
    );
    this._spacer.style.height = `${contentHeight}px`;

    // Build header lookup: buffer row → header info
    const headerMap = new Map<number, { path: string; label?: string }>();
    for (const header of excerptHeaders) {
      headerMap.set(header.row, header);
    }

    // Determine the wrap width
    const wrapWidth = this._measurements.wrapWidth ?? 0;

    // Build the list of visual rows to render
    const visualRows: Array<{
      mbRow: number;
      segment: number;
      text: string;
      isHeader: boolean;
      headerPath?: string;
      headerLabel?: string;
      tokens?: Token[];
      gutterText: string;
    }> = [];

    for (let i = 0; i < lines.length; i++) {
      const mbRow = viewport.startRow + i;
      const lineText = lines[i] ?? "";
      const header = headerMap.get(mbRow);

      // Look up the excerpt to get the real buffer row number
      // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
      const excerptInfo = this._snapshot?.excerptAt(mbRow as MultiBufferRow);
      let bufferRow = -1;
      let lineTokens: Token[] | undefined;

      if (excerptInfo) {
        bufferRow = excerptInfo.range.context.start.row + (mbRow - excerptInfo.startRow);

        // Get syntax tokens if highlighter is available
        if (this._highlighter?.ready) {
          // biome-ignore lint/plugin/no-type-assertion: expect: BufferId is branded string
          lineTokens = this._highlighter.getLineTokens(excerptInfo.bufferId as string, bufferRow);
        }
      }

      // Show buffer line number (1-based), or empty for headers/trailing newlines
      const showLineNumber = !header && bufferRow >= 0;
      const gutterBase = showLineNumber ? String(bufferRow + 1) : "";

      if (wrapWidth > 0) {
        const segments = wrapLine(lineText, wrapWidth);
        for (let s = 0; s < segments.length; s++) {
          const segStart = s * wrapWidth;
          const segEnd = segStart + (segments[s]?.length ?? 0);
          const segTokens = lineTokens
            ? sliceTokensToRange(lineTokens, segStart, segEnd)
            : undefined;

          visualRows.push({
            mbRow,
            segment: s,
            text: segments[s] ?? "",
            isHeader: s === 0 && header !== undefined,
            headerPath: header?.path,
            headerLabel: header?.label,
            tokens: segTokens,
            gutterText: s === 0 ? gutterBase : "",
          });
        }
      } else {
        visualRows.push({
          mbRow,
          segment: 0,
          text: lineText,
          isHeader: header !== undefined,
          headerPath: header?.path,
          headerLabel: header?.label,
          tokens: lineTokens,
          gutterText: gutterBase,
        });
      }
    }

    this._ensureRowPool(visualRows.length);

    // Hide all pooled rows
    for (const row of this._rowPool) {
      row.root.style.display = "none";
    }

    // Position the lines container at the first visual row
    const firstVisualRow = this._wrapMap
      ? this._wrapMap.bufferRowToFirstVisualRow(viewport.startRow)
      : viewport.startRow;
    this._linesContainer.style.transform =
      `translateY(${firstVisualRow * this._measurements.lineHeight}px)`;

    // Render each visual row
    for (let i = 0; i < visualRows.length; i++) {
      const vr = visualRows[i];
      const rowEl = this._rowPool[i];
      if (!vr || !rowEl) continue;

      if (vr.isHeader && vr.headerPath) {
        this._renderAsHeader(rowEl, vr.headerPath, vr.headerLabel);
      } else {
        this._renderAsLine(rowEl, vr.gutterText, vr.text, vr.tokens);
      }
    }
  }

  scrollTo(target: ScrollTarget): void {
    if (!this._scrollContainer) return;
    const y = rowToY(target.row, this._measurements.lineHeight, this._wrapMap ?? undefined);
    const { height } = this._viewport;

    let scrollTop: number;
    switch (target.strategy) {
      case "top":
        scrollTop = y;
        break;
      case "center":
        scrollTop = y - height / 2;
        break;
      case "bottom":
        scrollTop = y - height + this._measurements.lineHeight;
        break;
      case "nearest": {
        const currentTop = this._scrollContainer.scrollTop;
        const currentBottom = currentTop + height;
        if (y < currentTop) {
          scrollTop = y;
        } else if (y + this._measurements.lineHeight > currentBottom) {
          scrollTop = y - height + this._measurements.lineHeight;
        } else {
          return;
        }
        break;
      }
    }
    this._scrollContainer.scrollTop = Math.max(0, scrollTop);
  }

  getViewport(): Viewport {
    return this._viewport;
  }

  hitTest(x: number, y: number): { row: MultiBufferRow; column: number } | undefined {
    if (!this._scrollContainer) return undefined;
    const scrollTop = this._scrollContainer.scrollTop;
    const visualRow = yToVisualRow(scrollTop + y, this._measurements.lineHeight);
    const colInSegment = xToColumn(x, this._measurements);

    if (this._wrapMap) {
      const { mbRow, segment } = this._wrapMap.visualRowToBufferRow(visualRow);
      const wrapWidth = this._measurements.wrapWidth ?? 0;
      const column = segment * wrapWidth + colInSegment;
      return { row: mbRow, column };
    }

    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
    return { row: visualRow as MultiBufferRow, column: colInSegment };
  }

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

    const { startRow, endRow } = viewport;
    const lines = this._snapshot.lines(startRow, endRow);
    const excerptBoundaries = this._snapshot.excerptBoundaries(startRow, endRow);

    // Skip header for the first excerpt (no trailing newline row before it).
    // Subsequent excerpts use the previous excerpt's trailing newline row.
    const excerptHeaders = excerptBoundaries
      .filter((b) => b.prev !== undefined)
      .map((b) => ({
        // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic
        row: (b.row - 1) as MultiBufferRow,
        path: b.next.bufferId,
        label: `L${b.next.range.context.start.row + 1}\u2013${b.next.range.context.end.row}`,
      }));

    this.render(
      {
        viewport,
        selections: [],
        decorations: [],
        excerptHeaders,
        focused: false,
      },
      lines,
    );
  }

  private _buildWrapMap(snapshot: MultiBufferSnapshot): WrapMap | null {
    const wrapWidth = this._measurements.wrapWidth;
    if (!wrapWidth || wrapWidth <= 0) return null;
    return new WrapMap(snapshot, wrapWidth);
  }

  private _renderAsHeader(
    rowEl: RowElement,
    path: string,
    label?: string,
  ): void {
    rowEl.root.style.display = "flex";
    rowEl.root.style.background = "#3c3836";
    rowEl.root.style.borderTop = "1px solid #504945";
    rowEl.gutter.textContent = "";
    rowEl.gutter.style.background = "#3c3836";
    rowEl.content.textContent = path + (label ? `  ${label}` : "");
    rowEl.content.style.color = "#a89984";
    rowEl.content.style.fontWeight = "bold";
    rowEl.content.style.fontSize = "0.85em";
    rowEl.kind = "header";
  }

  private _renderAsLine(
    rowEl: RowElement,
    gutterText: string,
    text: string,
    tokens?: Token[],
  ): void {
    rowEl.root.style.display = "flex";
    rowEl.root.style.background = "";
    rowEl.root.style.borderTop = "";
    rowEl.gutter.textContent = gutterText;
    rowEl.gutter.style.background = "";
    rowEl.content.style.color = "";
    rowEl.content.style.fontWeight = "";
    rowEl.content.style.fontSize = "";

    if (tokens && tokens.length > 0) {
      buildHighlightedSpans(rowEl.content, text, tokens);
    } else {
      rowEl.content.textContent = text;
    }

    rowEl.kind = "line";
  }

  private _ensureRowPool(count: number): void {
    const lh = this._measurements.lineHeight;
    const gw = this._measurements.gutterWidth;

    while (this._rowPool.length < count) {
      const root = document.createElement("div");
      root.style.cssText =
        `display:none;height:${lh}px;line-height:${lh}px;white-space:pre;`;

      const gutter = document.createElement("span");
      gutter.style.cssText =
        `display:inline-block;width:${gw}px;text-align:right;padding-right:8px;color:#665c54;user-select:none;flex-shrink:0;`;

      const content = document.createElement("span");
      content.style.cssText = "flex:1;overflow:hidden;";

      root.appendChild(gutter);
      root.appendChild(content);

      if (this._linesContainer) {
        this._linesContainer.appendChild(root);
      }
      this._rowPool.push({ root, gutter, content, kind: "line" });
    }
  }

  /** Register a callback for mouse clicks (cursor placement). */
  onClickPosition(cb: (point: MultiBufferPoint) => void): void {
    this._onClickCallback = cb;
  }

  /** Render cursor at a multibuffer point. */
  renderCursor(point: MultiBufferPoint | undefined): void {
    if (!this._cursorEl) return;
    if (!point) {
      this._cursorEl.style.display = "none";
      return;
    }

    const { lineHeight, charWidth, gutterWidth } = this._measurements;
    const visualRow = this._wrapMap
      ? this._wrapMap.bufferRowToFirstVisualRow(point.row)
      : point.row;

    // Account for wrapped segments
    const wrapWidth = this._measurements.wrapWidth ?? 0;
    let displayRow = visualRow;
    let displayCol = point.column;
    if (wrapWidth > 0 && point.column > wrapWidth) {
      const extraRows = Math.floor(point.column / wrapWidth);
      displayRow = visualRow + extraRows;
      displayCol = point.column - extraRows * wrapWidth;
    }

    const x = gutterWidth + displayCol * charWidth;
    const y = displayRow * lineHeight;

    this._cursorEl.style.display = "block";
    this._cursorEl.style.left = `${x}px`;
    this._cursorEl.style.top = `${y}px`;
    this._cursorEl.style.height = `${lineHeight}px`;
  }

  /** Render selection highlight between two multibuffer points. */
  renderSelection(
    start: MultiBufferPoint | undefined,
    end: MultiBufferPoint | undefined,
  ): void {
    if (!this._selectionLayer) return;

    // Clear old selection highlights
    this._selectionLayer.textContent = "";

    if (!start || !end) return;
    if (start.row === end.row && start.column === end.column) return;

    const { lineHeight, charWidth, gutterWidth } = this._measurements;

    // Ensure start is before end
    let selStart = start;
    let selEnd = end;
    if (start.row > end.row || (start.row === end.row && start.column > end.column)) {
      selStart = end;
      selEnd = start;
    }

    for (let row = selStart.row; row <= selEnd.row; row++) {
      const visualRow = this._wrapMap
        // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
        ? this._wrapMap.bufferRowToFirstVisualRow(row as MultiBufferRow)
        : row;

      // Get line length for this row
      // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
      const nextRow = Math.min(row + 1, this._snapshot?.lineCount ?? 0) as MultiBufferRow;
      // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
      const lineText = this._snapshot?.lines(row as MultiBufferRow, nextRow);
      const lineLen = lineText?.[0]?.length ?? 0;

      const startCol = row === selStart.row ? selStart.column : 0;
      const endCol = row === selEnd.row ? selEnd.column : lineLen + 1;

      const x = gutterWidth + startCol * charWidth;
      const width = (endCol - startCol) * charWidth;
      const y = visualRow * lineHeight;

      const highlight = document.createElement("div");
      highlight.style.cssText =
        `position:absolute;background:rgba(214,153,46,0.25);top:${y}px;left:${x}px;width:${width}px;height:${lineHeight}px;`;
      this._selectionLayer.appendChild(highlight);
    }
  }

  private _handleClick(e: MouseEvent): void {
    if (!this._scrollContainer || !this._onClickCallback) return;

    const rect = this._scrollContainer.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const result = this.hitTest(x, y);
    if (result) {
      this._onClickCallback(result);
    }
  }
}

export function createDomRenderer(measurements: Measurements): DomRenderer {
  return new DomRenderer(measurements);
}
