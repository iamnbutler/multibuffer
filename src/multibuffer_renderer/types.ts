/**
 * Renderer interface types for multibuffer.
 *
 * Design principles:
 * - Rendering-agnostic: can be implemented by DOM, Canvas, WebGPU
 * - Fixed-height lines: all measurements are constant
 * - Viewport-based: only render visible content
 */

import type { MultiBufferRange, MultiBufferRow, Selection } from "../multibuffer/types.ts";

// =============================================================================
// Measurement Types
// =============================================================================

/**
 * Fixed measurements for rendering.
 * All lines have identical height for O(1) calculations.
 */
export interface Measurements {
  /** Height of each line in pixels */
  readonly lineHeight: number;
  /** Width of a single character in pixels (monospace assumed) */
  readonly charWidth: number;
  /** Padding at the start of each line (for line numbers, etc.) */
  readonly gutterWidth: number;
}

// =============================================================================
// Viewport Types
// =============================================================================

/**
 * The visible portion of the multibuffer.
 */
export interface Viewport {
  /** First visible row (may be partially visible) */
  readonly startRow: MultiBufferRow;
  /** Last visible row (exclusive, may be partially visible) */
  readonly endRow: MultiBufferRow;
  /** Scroll offset in pixels from top */
  readonly scrollTop: number;
  /** Viewport height in pixels */
  readonly height: number;
  /** Viewport width in pixels */
  readonly width: number;
}

/**
 * Scroll position request.
 */
export interface ScrollTarget {
  /** Target row to scroll to */
  readonly row: MultiBufferRow;
  /** Where to position the target row */
  readonly strategy: "top" | "center" | "bottom" | "nearest";
}

// =============================================================================
// Decoration Types
// =============================================================================

/**
 * A visual decoration applied to a range of text.
 */
export interface Decoration {
  readonly range: MultiBufferRange;
  readonly className?: string;
  readonly style?: Partial<DecorationStyle>;
}

export interface DecorationStyle {
  readonly backgroundColor: string;
  readonly color: string;
  readonly borderColor: string;
  readonly fontWeight: "normal" | "bold";
  readonly fontStyle: "normal" | "italic";
  readonly textDecoration: "none" | "underline" | "line-through";
}

// =============================================================================
// Excerpt Header Types
// =============================================================================

/**
 * Information needed to render an excerpt header/boundary.
 */
export interface ExcerptHeader {
  /** Row where the header should appear */
  readonly row: MultiBufferRow;
  /** File path or name to display */
  readonly path: string;
  /** Optional additional info (line range, etc.) */
  readonly label?: string;
}

// =============================================================================
// Render State
// =============================================================================

/**
 * Complete state needed for a render pass.
 */
export interface RenderState {
  /** Current viewport */
  readonly viewport: Viewport;
  /** Active selections */
  readonly selections: readonly Selection[];
  /** Decorations to render */
  readonly decorations: readonly Decoration[];
  /** Excerpt headers visible in viewport */
  readonly excerptHeaders: readonly ExcerptHeader[];
  /** Whether the editor has focus */
  readonly focused: boolean;
}

// =============================================================================
// Renderer Interface
// =============================================================================

/**
 * Interface that rendering implementations must satisfy.
 * Implementations could use DOM, Canvas, WebGPU, etc.
 */
export interface Renderer {
  /** Initialize the renderer with a container element */
  mount(container: HTMLElement): void;

  /** Clean up resources */
  unmount(): void;

  /** Update measurements (e.g., after font change) */
  setMeasurements(measurements: Measurements): void;

  /** Render the current state */
  render(state: RenderState, lines: readonly string[]): void;

  /** Scroll to a target */
  scrollTo(target: ScrollTarget): void;

  /** Get current viewport */
  getViewport(): Viewport;

  /** Convert pixel coordinates to multibuffer position */
  hitTest(x: number, y: number): { row: MultiBufferRow; column: number } | undefined;
}

// =============================================================================
// Renderer Factory
// =============================================================================

export type CreateRenderer = (measurements: Measurements) => Renderer;
