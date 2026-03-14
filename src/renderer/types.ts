/**
 * Renderer interface types for multibuffer.
 *
 * Design principles:
 * - Rendering-agnostic: can be implemented by DOM, Canvas, WebGPU
 * - Fixed-height lines: all measurements are constant
 * - Viewport-based: only render visible content
 */

import type { MultiBufferRange, MultiBufferRow, Selection } from "../multibuffer/types.ts";

/**
 * Visual theme for the editor.
 * Keys correspond to entries in THEME_CSS_VARIABLES; values are CSS color strings.
 * Use Partial<Theme> with setTheme() for runtime partial updates.
 */
export interface Theme {
  // Editor chrome
  /** Cursor color */
  cursor: string;
  /** Selection background */
  selection: string;
  /** Gutter (line number) text color */
  gutter: string;
  /** Excerpt header background */
  headerBg: string;
  /** Excerpt header border color */
  headerBorder: string;
  /** Excerpt header text color */
  headerText: string;
  /** Line background (use "transparent" to inherit) */
  lineBg: string;
  // Syntax highlighting
  syntaxKeyword: string;
  syntaxString: string;
  syntaxNumber: string;
  syntaxComment: string;
  syntaxType: string;
  syntaxFunction: string;
  syntaxProperty: string;
  syntaxOperator: string;
  syntaxPunctuation: string;
  syntaxConstant: string;
  syntaxVariableBuiltin: string;
  syntaxDefault: string;
}

/**
 * Fixed measurements for rendering.
 * All lines have identical height for O(1) calculations.
 */
export interface Measurements {
  /** Height of each line in pixels */
  readonly lineHeight: number;
  /**
   * Width of a single character in pixels (monospace assumed).
   * For DOM renderers, this is auto-measured from the font if omitted.
   */
  readonly charWidth?: number;
  /** Padding at the start of each line (for line numbers, etc.) */
  readonly gutterWidth: number;
  /** Character column limit for soft wrapping. Undefined or 0 = no wrap. */
  readonly wrapWidth?: number;
  /**
   * Gutter rendering mode.
   * - "standard": single line number column (default)
   * - "diff": dual columns (old line #, new line #) plus sign character
   */
  readonly gutterMode?: "standard" | "diff";
}

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
  /** Background color for the gutter area on decorated lines */
  readonly gutterBackground: string;
  /** Text color for the gutter line number on decorated lines */
  readonly gutterColor: string;
  /** A sign character rendered between gutter and content (e.g., "+", "−") */
  readonly gutterSign: string;
  /** Color for the gutter sign character */
  readonly gutterSignColor: string;
}

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

  /** Update the visual theme at runtime. Partial updates merge onto the current theme. */
  setTheme(theme: Partial<Theme>): void;

  /** Render the current state */
  render(state: RenderState, lines: readonly string[]): void;

  /** Scroll to a target */
  scrollTo(target: ScrollTarget): void;

  /** Get current viewport */
  getViewport(): Viewport;

  /** Convert pixel coordinates to multibuffer position */
  hitTest(x: number, y: number): { row: MultiBufferRow; column: number } | undefined;
}

export type CreateRenderer = (measurements: Measurements) => Renderer;
