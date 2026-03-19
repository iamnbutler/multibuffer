export type { CanvasRendererOptions } from "./canvas.ts";
export { CanvasRenderer, createCanvasRenderer } from "./canvas.ts";
export { createDomRenderer, DomRenderer } from "./dom.ts";
export type { GlyphAtlasConfig, GlyphInfo } from "./glyph-atlas.ts";
export { createGlyphAtlas, GlyphAtlas } from "./glyph-atlas.ts";
export type { SyntaxHighlighter, Token, TreeEdit } from "./highlighter.ts";
export { buildHighlightedSpans, Highlighter } from "./highlighter.ts";
export {
  buildHighlightedSpans as buildHighlightedSpansWithInjection,
  InjectionHighlighter,
} from "./injection-highlighter.ts";
export {
  calculateContentHeight,
  calculateVisibleRows,
  createViewport,
  rowToY,
  xToColumn,
  yToRow,
  yToVisualRow,
} from "./measurement.ts";
export type { HighlightCategory, LanguageQuery } from "./queries/index.ts";
export {
  getLanguageQuery,
  getRegisteredLanguages,
  hasLanguageQuery,
  markdownQuery,
  nodeTypeToCategory,
  nodeTypeToCategoryForLanguage,
  typescriptQuery,
  yamlQuery,
} from "./queries/index.ts";
export {
  colorForNodeType,
  GRUVBOX_DARK_THEME,
  GRUVBOX_THEME,
  LIGHT_THEME,
  THEME_CSS_VARIABLES,
  themeToVars,
} from "./theme.ts";
export type { InvalidationReason, Tile, TileManagerOptions } from "./tile-map.ts";
export { createTileManager, markEditDirty, markSelectionDirty, TileManager } from "./tile-map.ts";
export * from "./types.ts";
export { createWebGpuRenderer, isWebGpuAvailable, WebGpuRenderer } from "./webgpu.ts";
export type { WrapMapOptions } from "./wrap-map.ts";
export { charColToVisualCol, visualColToCharCol, visualWidth, WrapMap, wrapLine } from "./wrap-map.ts";

// ─── Renderer Factory ────────────────────────────────────────────────────────

import { createDomRenderer } from "./dom.ts";
import type { Measurements, Renderer, Theme } from "./types.ts";
import { createWebGpuRenderer, isWebGpuAvailable } from "./webgpu.ts";

/**
 * Renderer backend preference.
 * - "webgpu": Use WebGPU if available, error if not
 * - "dom": Use DOM renderer
 * - "auto": Try WebGPU first, fall back to DOM
 */
export type RendererBackend = "webgpu" | "dom" | "auto";

/**
 * Options for creating a renderer.
 */
export interface CreateRendererOptions {
  /** Rendering measurements (line height, gutter width, etc.) */
  measurements: Measurements;
  /** Container element to mount the renderer */
  container: HTMLElement;
  /** Optional theme configuration */
  theme?: Partial<Theme>;
  /** Backend preference (default: "auto") */
  backend?: RendererBackend;
}

/**
 * Create a renderer with automatic backend selection.
 *
 * By default ("auto"), tries WebGPU first for maximum performance,
 * falling back to DOM rendering when WebGPU is unavailable.
 *
 * @example
 * ```ts
 * // Automatic backend selection
 * const renderer = await createRenderer({
 *   measurements: { lineHeight: 20, gutterWidth: 50 },
 *   container: document.getElementById("editor"),
 * });
 *
 * // Force WebGPU (throws if unavailable)
 * const gpuRenderer = await createRenderer({
 *   measurements,
 *   container,
 *   backend: "webgpu",
 * });
 *
 * // Force DOM
 * const domRenderer = await createRenderer({
 *   measurements,
 *   container,
 *   backend: "dom",
 * });
 * ```
 */
export async function createRenderer(options: CreateRendererOptions): Promise<Renderer> {
  const { measurements, container, theme, backend = "auto" } = options;

  if (backend === "dom") {
    const renderer = createDomRenderer(measurements, theme);
    renderer.mount(container);
    return renderer;
  }

  if (backend === "webgpu") {
    if (!isWebGpuAvailable()) {
      throw new Error("WebGPU not available in this browser");
    }
    return createWebGpuRenderer(measurements, container, theme);
  }

  // Auto mode: try WebGPU first, fall back to DOM
  if (isWebGpuAvailable()) {
    try {
      return await createWebGpuRenderer(measurements, container, theme);
    } catch (e) {
      console.warn("WebGPU initialization failed, falling back to DOM renderer:", e);
    }
  }

  const renderer = createDomRenderer(measurements, theme);
  renderer.mount(container);
  return renderer;
}
