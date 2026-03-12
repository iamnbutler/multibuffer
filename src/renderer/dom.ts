/**
 * DOM-based renderer for the multibuffer.
 * Renders visible visual rows into a scrollable container.
 * Supports soft wrapping via WrapMap.
 */

import type { MultiBufferPoint, MultiBufferRow, MultiBufferSnapshot } from "../multibuffer/types.ts";
import type { SyntaxHighlighter, Token } from "./highlighter.ts";
import { buildHighlightedSpans } from "./highlighter.ts";
import {
  calculateContentHeight,
  calculateScrollTop,
  createViewport,
  yToVisualRow,
} from "./measurement.ts";
import type { Decoration, DecorationStyle, Measurements, Renderer, RenderState, ScrollTarget, Viewport } from "./types.ts";
import { charColToVisualCol, visualColToCharCol, visualWidth, WrapMap, wrapLine } from "./wrap-map.ts";

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
  // Diff mode elements (created but hidden in standard mode)
  oldGutter?: HTMLSpanElement;
  newGutter?: HTMLSpanElement;
  sign?: HTMLSpanElement;
}

export class DomRenderer implements Renderer {
  private _container: HTMLElement | null = null;
  private _scrollContainer: HTMLDivElement | null = null;
  private _spacer: HTMLDivElement | null = null;
  private _linesContainer: HTMLDivElement | null = null;
  private _cursorEl: HTMLDivElement | null = null;
  private _selectionLayer: HTMLDivElement | null = null;
  private _blinkStyle: HTMLStyleElement | null = null;
  private _measurements: Measurements;
  private _rowPool: RowElement[] = [];
  private _viewport: Viewport;
  private _snapshot: MultiBufferSnapshot | null = null;
  private _wrapMap: WrapMap | null = null;
  private _highlighter: SyntaxHighlighter | null = null;
  private _decorations: readonly Decoration[] = [];
  private _onScroll: (() => void) | null = null;
  private _onClick: ((e: MouseEvent) => void) | null = null;
  private _onMouseMove: ((e: MouseEvent) => void) | null = null;
  private _onMouseUp: ((e: MouseEvent) => void) | null = null;
  private _isDragging = false;
  private _focused = false;
  private _onClickCallback: ((point: MultiBufferPoint) => void) | null = null;
  private _onDragCallback: ((point: MultiBufferPoint) => void) | null = null;
  private _onDoubleClickCallback: ((point: MultiBufferPoint) => void) | null = null;
  private _onTripleClickCallback: ((point: MultiBufferPoint) => void) | null = null;
  /** Measured character width from actual font rendering */
  private _charWidth: number = 8; // Default, will be measured on mount

  /** Diff mode gutter widths */
  private static readonly DIFF_OLD_GUTTER_WIDTH = 40;
  private static readonly DIFF_NEW_GUTTER_WIDTH = 40;
  private static readonly DIFF_SIGN_WIDTH = 16;

  /** Get effective gutter width based on mode */
  private _getEffectiveGutterWidth(): number {
    if (this._measurements.gutterMode === "diff") {
      return DomRenderer.DIFF_OLD_GUTTER_WIDTH + DomRenderer.DIFF_NEW_GUTTER_WIDTH + DomRenderer.DIFF_SIGN_WIDTH;
    }
    return this._measurements.gutterWidth;
  }

  constructor(measurements: Measurements) {
    this._measurements = measurements;
    // Use provided charWidth as initial value if given
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

    // Measure actual character width from the font
    this._charWidth = this._measureCharWidth(container);

    // Inject blink animation keyframes (once per document)
    const blinkStyle = document.createElement("style");
    blinkStyle.textContent =
      "@keyframes cursor-blink { from { opacity: 1; } to { opacity: 0; } }";
    document.head.appendChild(blinkStyle);
    this._blinkStyle = blinkStyle;

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
    cursorEl.style.cssText = `position:absolute;width:2px;background:var(--editor-cursor, #ebdbb2);display:none;height:${this._measurements.lineHeight}px;z-index:10;`;
    this._cursorEl = cursorEl;

    scrollContainer.appendChild(spacer);
    scrollContainer.appendChild(selectionLayer);
    scrollContainer.appendChild(linesContainer);
    scrollContainer.appendChild(cursorEl);
    container.appendChild(scrollContainer);

    this._onScroll = () => this._handleScroll();
    scrollContainer.addEventListener("scroll", this._onScroll, { passive: true });

    this._onClick = (e: MouseEvent) => this._handleMouseDown(e);
    this._onMouseMove = (e: MouseEvent) => this._handleMouseMove(e);
    this._onMouseUp = () => this._handleMouseUp();
    scrollContainer.addEventListener("mousedown", this._onClick);
    document.addEventListener("mousemove", this._onMouseMove);
    document.addEventListener("mouseup", this._onMouseUp);
  }

  unmount(): void {
    if (this._scrollContainer) {
      if (this._onScroll) this._scrollContainer.removeEventListener("scroll", this._onScroll);
      if (this._onClick) this._scrollContainer.removeEventListener("mousedown", this._onClick);
    }
    if (this._onMouseMove) document.removeEventListener("mousemove", this._onMouseMove);
    if (this._onMouseUp) document.removeEventListener("mouseup", this._onMouseUp);
    if (this._container && this._scrollContainer) {
      this._container.removeChild(this._scrollContainer);
    }
    if (this._blinkStyle?.parentNode) {
      this._blinkStyle.parentNode.removeChild(this._blinkStyle);
    }
    this._container = null;
    this._scrollContainer = null;
    this._spacer = null;
    this._linesContainer = null;
    this._cursorEl = null;
    this._selectionLayer = null;
    this._blinkStyle = null;
    this._rowPool = [];
    this._snapshot = null;
    this._wrapMap = null;
    this._decorations = [];
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

  setHighlighter(highlighter: SyntaxHighlighter): void {
    this._highlighter = highlighter;
  }

  render(state: RenderState, lines: readonly string[]): void {
    if (!this._linesContainer || !this._spacer || !this._scrollContainer) return;

    const { viewport, excerptHeaders, decorations } = state;
    this._viewport = viewport;
    this._decorations = decorations;

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

    // Build decoration lookup: mbRow → decoration style (last decoration wins)
    const decorationMap = new Map<number, Partial<DecorationStyle>>();
    for (const dec of decorations) {
      if (!dec.style) continue;
      for (let r = dec.range.start.row; r <= dec.range.end.row; r++) {
        if (r >= viewport.startRow && r < viewport.endRow) {
          decorationMap.set(r, dec.style);
        }
      }
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
      decoration?: Partial<DecorationStyle>;
      diffGutter?: { oldLineNum?: string; newLineNum?: string };
    }> = [];

    const isDiffMode = this._measurements.gutterMode === "diff";

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

      const decoration = decorationMap.get(mbRow);

      // Compute diff gutter info if in diff mode
      let diffGutter: { oldLineNum?: string; newLineNum?: string } | undefined;
      if (isDiffMode && showLineNumber) {
        const lineNumStr = String(bufferRow + 1);
        const sign = decoration?.gutterSign;
        if (sign === "−") {
          // Delete line: show in old column only
          diffGutter = { oldLineNum: lineNumStr };
        } else if (sign === "+") {
          // Insert line: show in new column only
          diffGutter = { newLineNum: lineNumStr };
        } else {
          // Equal line: show in both columns
          diffGutter = { oldLineNum: lineNumStr, newLineNum: lineNumStr };
        }
      }

      if (wrapWidth > 0) {
        const segments = wrapLine(lineText, wrapWidth);
        let charOffset = 0;
        for (let s = 0; s < segments.length; s++) {
          const seg = segments[s] ?? "";
          const segStart = charOffset;
          charOffset += seg.length;
          const segEnd = charOffset;
          const segTokens = lineTokens
            ? sliceTokensToRange(lineTokens, segStart, segEnd)
            : undefined;

          visualRows.push({
            mbRow,
            segment: s,
            text: seg,
            isHeader: s === 0 && header !== undefined,
            headerPath: header?.path,
            headerLabel: header?.label,
            tokens: segTokens,
            gutterText: s === 0 ? gutterBase : "",
            decoration,
            diffGutter: s === 0 ? diffGutter : undefined,
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
          decoration,
          diffGutter,
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
        this._renderAsLine(rowEl, vr.gutterText, vr.text, vr.tokens, vr.decoration, vr.diffGutter);
      }
    }
  }

  scrollTo(target: ScrollTarget): void {
    if (!this._scrollContainer) return;
    const contentHeight = calculateContentHeight(
      this._snapshot?.lineCount ?? 0,
      this._measurements.lineHeight,
      this._wrapMap ?? undefined,
    );
    this._scrollContainer.scrollTop = calculateScrollTop(
      target.row,
      target.strategy,
      this._scrollContainer.scrollTop,
      this._measurements.lineHeight,
      this._viewport.height,
      contentHeight,
      this._wrapMap ?? undefined,
    );
  }

  /** Get the current scroll position from the DOM element. */
  getScrollTop(): number {
    return this._scrollContainer?.scrollTop ?? 0;
  }

  getViewport(): Viewport {
    return this._viewport;
  }

  hitTest(x: number, y: number): { row: MultiBufferRow; column: number } | undefined {
    if (!this._scrollContainer) return undefined;
    const scrollTop = this._scrollContainer.scrollTop;
    const visualRow = yToVisualRow(scrollTop + y, this._measurements.lineHeight);
    // Convert pixel X to visual column using measured charWidth
    const gutterWidth = this._getEffectiveGutterWidth();
    const visualColInSegment = Math.max(0, Math.floor((x - gutterWidth) / this._charWidth));

    if (this._wrapMap) {
      const { mbRow, segment } = this._wrapMap.visualRowToBufferRow(visualRow);
      const wrapWidth = this._measurements.wrapWidth ?? 0;
      const lineText = this._getLineText(mbRow);
      const segments = wrapLine(lineText, wrapWidth);
      // Compute char offset of this segment by summing prior segment lengths
      let charOffset = 0;
      for (let s = 0; s < segment; s++) {
        charOffset += segments[s]?.length ?? 0;
      }
      const segText = segments[segment] ?? "";
      const charColInSeg = visualColToCharCol(segText, visualColInSegment);
      return { row: mbRow, column: charOffset + charColInSeg };
    }

    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
    const lineText = this._getLineText(visualRow as MultiBufferRow);
    const column = visualColToCharCol(lineText, visualColInSegment);
    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
    return { row: visualRow as MultiBufferRow, column };
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
        decorations: this._decorations,
        excerptHeaders,
        focused: false,
      },
      lines,
    );
  }

  private _getLineText(row: MultiBufferRow): string {
    if (!this._snapshot) return "";
    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
    const nextRow = Math.min(row + 1, this._snapshot.lineCount) as MultiBufferRow;
    return this._snapshot.lines(row, nextRow)?.[0] ?? "";
  }

  private _buildWrapMap(snapshot: MultiBufferSnapshot): WrapMap | null {
    const wrapWidth = this._measurements.wrapWidth;
    if (!wrapWidth || wrapWidth <= 0) return null;
    return new WrapMap(snapshot, wrapWidth);
  }

  /**
   * Measure the actual character width from the container's font.
   * Uses a test string to get accurate width for monospace fonts.
   */
  private _measureCharWidth(container: HTMLElement): number {
    const span = document.createElement("span");
    span.style.cssText = "position:absolute;visibility:hidden;white-space:pre;font:inherit;";
    span.textContent = "MMMMMMMMMM"; // 10 wide chars for accuracy
    container.appendChild(span);
    const width = span.getBoundingClientRect().width / 10;
    container.removeChild(span);
    return width;
  }

  private _renderAsHeader(
    rowEl: RowElement,
    path: string,
    label?: string,
  ): void {
    rowEl.root.style.display = "flex";
    rowEl.root.style.background = "var(--editor-header-bg, #3c3836)";
    rowEl.root.style.borderTop = "1px solid var(--editor-header-border, #504945)";

    const isDiffMode = this._measurements.gutterMode === "diff";

    if (isDiffMode && rowEl.oldGutter && rowEl.newGutter && rowEl.sign) {
      // Hide all gutters in header, content spans full width
      rowEl.gutter.style.display = "none";
      rowEl.oldGutter.style.display = "none";
      rowEl.newGutter.style.display = "none";
      rowEl.sign.style.display = "none";
    } else {
      rowEl.gutter.style.display = "inline-block";
      rowEl.gutter.textContent = "";
      rowEl.gutter.style.background = "var(--editor-header-bg, #3c3836)";
      if (rowEl.oldGutter) rowEl.oldGutter.style.display = "none";
      if (rowEl.newGutter) rowEl.newGutter.style.display = "none";
      if (rowEl.sign) rowEl.sign.style.display = "none";
    }

    rowEl.content.textContent = path + (label ? `  ${label}` : "");
    rowEl.content.style.color = "var(--editor-header-text, #a89984)";
    rowEl.content.style.fontWeight = "bold";
    rowEl.content.style.fontSize = "0.85em";
    rowEl.kind = "header";
  }

  private _renderAsLine(
    rowEl: RowElement,
    gutterText: string,
    text: string,
    tokens?: Token[],
    decoration?: Partial<DecorationStyle>,
    diffGutter?: { oldLineNum?: string; newLineNum?: string },
  ): void {
    rowEl.root.style.display = "flex";
    rowEl.root.style.borderTop = "";

    // Apply decoration styles or defaults
    const bg = decoration?.backgroundColor ?? "var(--editor-line-bg, transparent)";
    rowEl.root.style.background = bg;
    rowEl.content.style.color = decoration?.color ?? "";
    rowEl.content.style.fontWeight = decoration?.fontWeight ?? "";
    rowEl.content.style.fontStyle = decoration?.fontStyle ?? "";
    rowEl.content.style.textDecoration = decoration?.textDecoration ?? "";
    rowEl.content.style.fontSize = "";

    const isDiffMode = this._measurements.gutterMode === "diff";

    if (isDiffMode && rowEl.oldGutter && rowEl.newGutter && rowEl.sign) {
      // Diff mode: show old/new gutters and sign, hide standard gutter
      rowEl.gutter.style.display = "none";
      rowEl.oldGutter.style.display = "inline-block";
      rowEl.newGutter.style.display = "inline-block";
      rowEl.sign.style.display = "inline-block";

      rowEl.oldGutter.textContent = diffGutter?.oldLineNum ?? "";
      rowEl.newGutter.textContent = diffGutter?.newLineNum ?? "";
      rowEl.oldGutter.style.background = decoration?.gutterBackground ?? bg;
      rowEl.newGutter.style.background = decoration?.gutterBackground ?? bg;
      rowEl.oldGutter.style.color = decoration?.gutterColor ?? "";
      rowEl.newGutter.style.color = decoration?.gutterColor ?? "";

      rowEl.sign.textContent = decoration?.gutterSign ?? " ";
      rowEl.sign.style.color = decoration?.gutterSignColor ?? "";
      rowEl.sign.style.background = decoration?.gutterBackground ?? bg;
    } else {
      // Standard mode: show standard gutter, hide diff gutters
      rowEl.gutter.style.display = "inline-block";
      if (rowEl.oldGutter) rowEl.oldGutter.style.display = "none";
      if (rowEl.newGutter) rowEl.newGutter.style.display = "none";
      if (rowEl.sign) rowEl.sign.style.display = "none";

      rowEl.gutter.style.background = decoration?.gutterBackground ?? bg;
      rowEl.gutter.style.color = decoration?.gutterColor ?? "";

      // Gutter text: sign character prepended if present
      if (decoration?.gutterSign) {
        rowEl.gutter.textContent = "";
        const numSpan = document.createElement("span");
        numSpan.textContent = gutterText;
        const signSpan = document.createElement("span");
        signSpan.textContent = ` ${decoration.gutterSign} `;
        signSpan.style.color = decoration.gutterSignColor ?? "";
        rowEl.gutter.appendChild(numSpan);
        rowEl.gutter.appendChild(signSpan);
      } else {
        rowEl.gutter.textContent = gutterText;
      }
    }

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
    const isDiffMode = this._measurements.gutterMode === "diff";

    while (this._rowPool.length < count) {
      const root = document.createElement("div");
      root.style.cssText =
        `display:none;height:${lh}px;line-height:${lh}px;white-space:pre;`;

      // Standard gutter (used in standard mode, hidden in diff mode)
      const gutter = document.createElement("span");
      gutter.style.cssText =
        `display:inline-block;width:${gw}px;text-align:right;padding-right:8px;color:var(--editor-gutter, #665c54);user-select:none;flex-shrink:0;`;

      // Diff mode gutters
      const oldGutter = document.createElement("span");
      oldGutter.style.cssText =
        "display:none;width:40px;text-align:right;padding-right:4px;color:var(--editor-gutter, #665c54);user-select:none;flex-shrink:0;";

      const newGutter = document.createElement("span");
      newGutter.style.cssText =
        "display:none;width:40px;text-align:right;padding-right:4px;color:var(--editor-gutter, #665c54);user-select:none;flex-shrink:0;";

      const sign = document.createElement("span");
      sign.style.cssText =
        "display:none;width:16px;text-align:center;user-select:none;flex-shrink:0;";

      const content = document.createElement("span");
      content.style.cssText = "flex:1;overflow:hidden;";

      root.appendChild(oldGutter);
      root.appendChild(newGutter);
      root.appendChild(sign);
      root.appendChild(gutter);
      root.appendChild(content);

      // Set initial visibility based on mode
      if (isDiffMode) {
        gutter.style.display = "none";
        oldGutter.style.display = "inline-block";
        newGutter.style.display = "inline-block";
        sign.style.display = "inline-block";
      }

      if (this._linesContainer) {
        this._linesContainer.appendChild(root);
      }
      this._rowPool.push({ root, gutter, content, kind: "line", oldGutter, newGutter, sign });
    }
  }

  /** Register a callback for single click (cursor placement). */
  onClickPosition(cb: (point: MultiBufferPoint) => void): void {
    this._onClickCallback = cb;
  }

  /** Register a callback for drag (selection extension). */
  onDrag(cb: (point: MultiBufferPoint) => void): void {
    this._onDragCallback = cb;
  }

  /** Register a callback for double-click (word selection). */
  onDoubleClick(cb: (point: MultiBufferPoint) => void): void {
    this._onDoubleClickCallback = cb;
  }

  /** Register a callback for triple-click (line selection). */
  onTripleClick(cb: (point: MultiBufferPoint) => void): void {
    this._onTripleClickCallback = cb;
  }

  /** Render cursor at a multibuffer point. */
  renderCursor(point: MultiBufferPoint | undefined): void {
    if (!this._cursorEl) return;
    if (!point) {
      this._cursorEl.style.display = "none";
      return;
    }

    const { lineHeight } = this._measurements;
    const gutterWidth = this._getEffectiveGutterWidth();
    const charWidth = this._charWidth;
    const visualRow = this._wrapMap
      ? this._wrapMap.bufferRowToFirstVisualRow(point.row)
      : point.row;

    // Convert char column to visual position, accounting for wide chars and wrapping
    const wrapWidth = this._measurements.wrapWidth ?? 0;
    const lineText = this._getLineText(point.row);
    let displayRow = visualRow;
    let displayVisualCol: number;
    if (wrapWidth > 0) {
      const segments = wrapLine(lineText, wrapWidth);
      // Find which segment contains this char index
      let charOffset = 0;
      let segIdx = 0;
      for (let s = 0; s < segments.length - 1; s++) {
        const segLen = segments[s]?.length ?? 0;
        if (charOffset + segLen > point.column) break;
        charOffset += segLen;
        segIdx = s + 1;
      }
      displayRow = visualRow + segIdx;
      const segText = segments[segIdx] ?? "";
      displayVisualCol = charColToVisualCol(segText, point.column - charOffset);
    } else {
      displayVisualCol = charColToVisualCol(lineText, point.column);
    }

    const x = gutterWidth + displayVisualCol * charWidth;
    const y = displayRow * lineHeight;

    this._cursorEl.style.display = "block";
    this._cursorEl.style.left = `${x}px`;
    this._cursorEl.style.top = `${y}px`;
    this._cursorEl.style.height = `${lineHeight}px`;
    this._cursorEl.style.animation = this._focused
      ? "cursor-blink 600ms steps(1, end) infinite alternate"
      : "none";
  }

  /** Update focus state — call when the editor gains or loses keyboard focus. */
  setFocused(focused: boolean): void {
    this._focused = focused;
    if (!this._cursorEl || this._cursorEl.style.display === "none") return;
    this._cursorEl.style.animation = focused
      ? "cursor-blink 600ms steps(1, end) infinite alternate"
      : "none";
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

    const { lineHeight } = this._measurements;
    const gutterWidth = this._getEffectiveGutterWidth();
    const charWidth = this._charWidth;

    // Ensure start is before end
    let selStart = start;
    let selEnd = end;
    if (start.row > end.row || (start.row === end.row && start.column > end.column)) {
      selStart = end;
      selEnd = start;
    }

    for (let row = selStart.row; row <= selEnd.row; row++) {
      const visualRowBase = this._wrapMap
        // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
        ? this._wrapMap.bufferRowToFirstVisualRow(row as MultiBufferRow)
        : row;

      // Get line length for this row
      // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
      const nextRow = Math.min(row + 1, this._snapshot?.lineCount ?? 0) as MultiBufferRow;
      // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
      const lineText = this._snapshot?.lines(row as MultiBufferRow, nextRow);
      const lineLen = lineText?.[0]?.length ?? 0;

      const startCharCol = row === selStart.row ? selStart.column : 0;
      const endCharCol = row === selEnd.row ? selEnd.column : lineLen + 1;
      const lineTextStr = lineText?.[0] ?? "";
      const wrapWidth = this._measurements.wrapWidth ?? 0;

      if (wrapWidth > 0) {
        // Emit one highlight rect per wrap segment that the selection overlaps.
        const segments = wrapLine(lineTextStr, wrapWidth);
        let charOffset = 0;
        for (let s = 0; s < segments.length; s++) {
          const segText = segments[s] ?? "";
          const segCharStart = charOffset;
          const segCharEnd = charOffset + segText.length;
          charOffset = segCharEnd;

          // Skip segments fully outside [startCharCol, endCharCol)
          if (startCharCol >= segCharEnd) continue;
          if (endCharCol <= segCharStart) continue;

          const segSelCharStart = Math.max(startCharCol, segCharStart) - segCharStart;
          const segSelCharEnd = Math.min(endCharCol, segCharEnd) - segCharStart;

          const segStartVisualCol = charColToVisualCol(segText, segSelCharStart);
          let segEndVisualCol: number;
          if (endCharCol > lineLen && s === segments.length - 1) {
            // Row-spanning selection: extend slightly past end to indicate newline
            segEndVisualCol = visualWidth(segText) + 0.3;
          } else {
            segEndVisualCol = charColToVisualCol(segText, Math.min(segSelCharEnd, segText.length));
          }

          const x = gutterWidth + segStartVisualCol * charWidth;
          const width = Math.max(0, segEndVisualCol - segStartVisualCol) * charWidth;
          const y = (visualRowBase + s) * lineHeight;

          const highlight = document.createElement("div");
          highlight.style.cssText =
            `position:absolute;background:var(--editor-selection, rgba(214,153,46,0.25));top:${y}px;left:${x}px;width:${width}px;height:${lineHeight}px;`;
          this._selectionLayer.appendChild(highlight);
        }
      } else {
        // Non-wrapped path
        const startVisualCol = charColToVisualCol(lineTextStr, startCharCol);
        const endVisualCol =
          endCharCol > lineTextStr.length
            ? visualWidth(lineTextStr) + 0.3 // Small extension for newline indicator
            : charColToVisualCol(lineTextStr, endCharCol);

        const x = gutterWidth + startVisualCol * charWidth;
        const width = Math.max(0, endVisualCol - startVisualCol) * charWidth;
        const y = visualRowBase * lineHeight;

        const highlight = document.createElement("div");
        highlight.style.cssText =
          `position:absolute;background:var(--editor-selection, rgba(214,153,46,0.25));top:${y}px;left:${x}px;width:${width}px;height:${lineHeight}px;`;
        this._selectionLayer.appendChild(highlight);
      }
    }
  }

  private _hitTestFromEvent(e: MouseEvent): { row: MultiBufferRow; column: number } | undefined {
    if (!this._scrollContainer) return undefined;
    const rect = this._scrollContainer.getBoundingClientRect();
    return this.hitTest(e.clientX - rect.left, e.clientY - rect.top);
  }

  private _handleMouseDown(e: MouseEvent): void {
    if (!this._scrollContainer) return;

    // Prevent the browser from focusing the scrollContainer,
    // so the hidden textarea retains focus for keyboard input.
    e.preventDefault();

    const point = this._hitTestFromEvent(e);
    if (!point) return;

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

export function createDomRenderer(measurements: Measurements): DomRenderer {
  return new DomRenderer(measurements);
}
