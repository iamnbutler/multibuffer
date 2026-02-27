/**
 * DOM-based renderer for the multibuffer.
 * Renders visible rows into a scrollable container.
 * Each row is either a content line or an excerpt header, in document order.
 */

import type { MultiBufferRow, MultiBufferSnapshot } from "../multibuffer/types.ts";
import {
  calculateContentHeight,
  createViewport,
  xToColumn,
  yToRow,
} from "./measurement.ts";
import type { Measurements, Renderer, RenderState, ScrollTarget, Viewport } from "./types.ts";

/**
 * A pooled row element that can be either a content line or an excerpt header.
 */
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
  private _measurements: Measurements;
  private _rowPool: RowElement[] = [];
  private _viewport: Viewport;
  private _snapshot: MultiBufferSnapshot | null = null;
  private _onScroll: (() => void) | null = null;

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

    scrollContainer.appendChild(spacer);
    scrollContainer.appendChild(linesContainer);
    container.appendChild(scrollContainer);

    this._onScroll = () => this._handleScroll();
    scrollContainer.addEventListener("scroll", this._onScroll, { passive: true });
  }

  unmount(): void {
    if (this._scrollContainer && this._onScroll) {
      this._scrollContainer.removeEventListener("scroll", this._onScroll);
    }
    if (this._container && this._scrollContainer) {
      this._container.removeChild(this._scrollContainer);
    }
    this._container = null;
    this._scrollContainer = null;
    this._spacer = null;
    this._linesContainer = null;
    this._rowPool = [];
    this._snapshot = null;
    this._onScroll = null;
  }

  setMeasurements(measurements: Measurements): void {
    this._measurements = measurements;
  }

  setSnapshot(snapshot: MultiBufferSnapshot): void {
    this._snapshot = snapshot;
  }

  render(state: RenderState, lines: readonly string[]): void {
    if (!this._linesContainer || !this._spacer || !this._scrollContainer) return;

    const { viewport, excerptHeaders } = state;
    this._viewport = viewport;

    const totalLines = this._snapshot?.lineCount ?? viewport.endRow;
    const contentHeight = calculateContentHeight(totalLines, this._measurements.lineHeight);
    this._spacer.style.height = `${contentHeight}px`;

    this._linesContainer.style.transform =
      `translateY(${viewport.startRow * this._measurements.lineHeight}px)`;

    // Build header lookup: row number → header info
    const headerMap = new Map<number, { path: string; label?: string }>();
    for (const header of excerptHeaders) {
      headerMap.set(header.row, header);
    }

    const visibleCount = viewport.endRow - viewport.startRow;
    this._ensureRowPool(visibleCount);

    // Hide all pooled rows
    for (const row of this._rowPool) {
      row.root.style.display = "none";
    }

    for (let i = 0; i < visibleCount; i++) {
      const mbRow = viewport.startRow + i;
      const rowEl = this._rowPool[i];
      if (!rowEl) continue;

      const header = headerMap.get(mbRow);

      if (header) {
        // Render as excerpt header
        this._renderAsHeader(rowEl, header.path, header.label);
      } else {
        // Render as content line
        this._renderAsLine(rowEl, mbRow, lines[i] ?? "");
      }
    }
  }

  scrollTo(target: ScrollTarget): void {
    if (!this._scrollContainer) return;
    const y = target.row * this._measurements.lineHeight;
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
    const row = yToRow(scrollTop + y, this._measurements.lineHeight);
    const column = xToColumn(x, this._measurements);
    return { row, column };
  }

  private _handleScroll(): void {
    if (!this._scrollContainer || !this._snapshot) return;

    const scrollTop = this._scrollContainer.scrollTop;
    const height = this._scrollContainer.clientHeight;
    const width = this._scrollContainer.clientWidth;

    const viewport = createViewport(
      scrollTop,
      height,
      width,
      this._measurements,
      this._snapshot.lineCount,
    );

    const { startRow, endRow } = viewport;
    const lines = this._snapshot.lines(startRow, endRow);
    const excerptBoundaries = this._snapshot.excerptBoundaries(startRow, endRow);

    const excerptHeaders = excerptBoundaries.map((b) => ({
      // For the first excerpt, header is at its startRow.
      // For subsequent excerpts, use the previous excerpt's trailing newline row.
      // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic
      row: (b.prev ? b.row - 1 : b.row) as MultiBufferRow,
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
    mbRow: number,
    text: string,
  ): void {
    rowEl.root.style.display = "flex";
    rowEl.root.style.background = "";
    rowEl.root.style.borderTop = "";
    rowEl.gutter.textContent = String(mbRow + 1);
    rowEl.gutter.style.background = "";
    rowEl.content.textContent = text;
    rowEl.content.style.color = "";
    rowEl.content.style.fontWeight = "";
    rowEl.content.style.fontSize = "";
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
}

export function createDomRenderer(measurements: Measurements): DomRenderer {
  return new DomRenderer(measurements);
}
