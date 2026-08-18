/**
 * WebGPU-based renderer for maximum performance on very large files.
 *
 * Uses GPU instanced rendering with a glyph atlas texture for efficient
 * text rendering. Targets ~10x throughput over Canvas for 100K+ line files.
 *
 * Architecture:
 * - Glyph atlas: Pre-rendered character bitmaps in GPU texture
 * - Instance buffer: Per-glyph position, atlas coords, color
 * - Single draw call: All visible glyphs rendered in one batch
 *
 * @module
 */

import type { MultiBufferPoint, MultiBufferRow, MultiBufferSnapshot } from "../multibuffer/types.ts";
import { computeCursorRect } from "./dom.ts";
import { createGlyphAtlas, type GlyphAtlas } from "./glyph-atlas.ts";
import type { SyntaxHighlighter, Token } from "./highlighter.ts";
import {
  calculateContentHeight,
  calculateScrollTop,
  createViewport,
  yToVisualRow,
} from "./measurement.ts";
import { GRUVBOX_DARK_THEME } from "./theme.ts";
import type {
  Decoration,
  DecorationStyle,
  Measurements,
  Renderer,
  RenderState,
  ScrollTarget,
  Theme,
  Viewport,
} from "./types.ts";
import { charColToVisualCol, visualColToCharCol, WrapMap, wrapLine } from "./wrap-map.ts";

// WGSL shader source (inlined for portability)
const SHADER_SOURCE = /* wgsl */ `
// WebGPU shaders for text rendering via glyph atlas.
//
// Renders text as instanced quads sampling from a glyph atlas texture.
// Each glyph instance provides position, atlas coordinates, and color.

// Uniform buffer containing viewport and rendering parameters.
struct Uniforms {
  viewport_width: f32,
  viewport_height: f32,
  scroll_x: f32,
  scroll_y: f32,
  char_width: f32,
  line_height: f32,
  gutter_width: f32,
  atlas_width: f32,
  atlas_height: f32,
  _padding: vec3<f32>,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var glyph_atlas: texture_2d<f32>;
@group(0) @binding(2) var atlas_sampler: sampler;

// Per-glyph instance data.
struct GlyphInstance {
  // Screen position (pixels, top-left of glyph)
  @location(0) pos: vec2<f32>,
  // Atlas UV coordinates (top-left corner, in pixels)
  @location(1) atlas_pos: vec2<f32>,
  // Glyph color (RGBA)
  @location(2) color: vec4<f32>,
}

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) tex_coord: vec2<f32>,
  @location(1) color: vec4<f32>,
}

// Quad vertices for a unit quad (0,0) to (1,1).
// 6 vertices for 2 triangles (no index buffer needed).
const QUAD_VERTICES: array<vec2<f32>, 6> = array<vec2<f32>, 6>(
  vec2<f32>(0.0, 0.0), // Triangle 1
  vec2<f32>(1.0, 0.0),
  vec2<f32>(0.0, 1.0),
  vec2<f32>(1.0, 0.0), // Triangle 2
  vec2<f32>(1.0, 1.0),
  vec2<f32>(0.0, 1.0),
);

@vertex
fn vs_main(
  @builtin(vertex_index) vertex_idx: u32,
  instance: GlyphInstance,
) -> VertexOutput {
  let quad_pos = QUAD_VERTICES[vertex_idx];

  // Compute pixel position of this vertex
  let pixel_x = instance.pos.x + quad_pos.x * uniforms.char_width - uniforms.scroll_x;
  let pixel_y = instance.pos.y + quad_pos.y * uniforms.line_height - uniforms.scroll_y;

  // Convert to NDC: [-1, 1] range
  // Note: Y is flipped (top = 1, bottom = -1 in NDC, but we want top = 0 in screen coords)
  let ndc_x = (pixel_x / uniforms.viewport_width) * 2.0 - 1.0;
  let ndc_y = 1.0 - (pixel_y / uniforms.viewport_height) * 2.0;

  var out: VertexOutput;
  out.position = vec4<f32>(ndc_x, ndc_y, 0.0, 1.0);

  // Compute texture coordinates (normalized 0-1)
  out.tex_coord = vec2<f32>(
    (instance.atlas_pos.x + quad_pos.x * uniforms.char_width) / uniforms.atlas_width,
    (instance.atlas_pos.y + quad_pos.y * uniforms.line_height) / uniforms.atlas_height,
  );

  out.color = instance.color;
  return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  // Sample alpha from the glyph atlas (single-channel texture)
  let alpha = textureSample(glyph_atlas, atlas_sampler, in.tex_coord).r;

  // Output colored glyph with sampled alpha
  return vec4<f32>(in.color.rgb, in.color.a * alpha);
}

// Selection/cursor highlight shader (solid color rectangles)
struct RectInstance {
  @location(0) pos: vec2<f32>,      // Top-left position (pixels)
  @location(1) size: vec2<f32>,     // Width, height (pixels)
  @location(2) color: vec4<f32>,    // Fill color
}

struct RectVertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) color: vec4<f32>,
}

@vertex
fn vs_rect(
  @builtin(vertex_index) vertex_idx: u32,
  instance: RectInstance,
) -> RectVertexOutput {
  let quad_pos = QUAD_VERTICES[vertex_idx];

  // Compute pixel position
  let pixel_x = instance.pos.x + quad_pos.x * instance.size.x - uniforms.scroll_x;
  let pixel_y = instance.pos.y + quad_pos.y * instance.size.y - uniforms.scroll_y;

  // Convert to NDC
  let ndc_x = (pixel_x / uniforms.viewport_width) * 2.0 - 1.0;
  let ndc_y = 1.0 - (pixel_y / uniforms.viewport_height) * 2.0;

  var out: RectVertexOutput;
  out.position = vec4<f32>(ndc_x, ndc_y, 0.0, 1.0);
  out.color = instance.color;
  return out;
}

@fragment
fn fs_rect(in: RectVertexOutput) -> @location(0) vec4<f32> {
  return in.color;
}
`;

/** Bytes per glyph instance in the instance buffer. */
const GLYPH_INSTANCE_SIZE = 32; // 2 floats pos + 2 floats atlas + 4 floats color = 8 * 4 = 32

/** Bytes per rectangle instance. */
const RECT_INSTANCE_SIZE = 32; // 2 floats pos + 2 floats size + 4 floats color = 8 * 4 = 32

/** Maximum glyphs per frame (determines instance buffer size). */
const MAX_GLYPHS = 100_000;

/** Maximum rectangles (selections, cursor) per frame. */
const MAX_RECTS = 1000;

/** Uniform buffer size (must be multiple of 16 for alignment). */
const UNIFORM_SIZE = 48; // 9 floats + 3 padding = 12 * 4 = 48

/** Result of WebGPU initialization. */
interface WebGpuContext {
  device: GPUDevice;
  context: GPUCanvasContext;
  format: GPUTextureFormat;
  glyphPipeline: GPURenderPipeline;
  rectPipeline: GPURenderPipeline;
  uniformBuffer: GPUBuffer;
  uniformBindGroup: GPUBindGroup;
  glyphInstanceBuffer: GPUBuffer;
  rectInstanceBuffer: GPUBuffer;
  atlasTexture: GPUTexture;
  atlasSampler: GPUSampler;
}

/** Parse CSS color string to RGBA floats (0-1 range). */
function parseColor(color: string): [number, number, number, number] {
  // Handle rgba() format
  const rgbaMatch = color.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/);
  if (rgbaMatch) {
    return [
      parseInt(rgbaMatch[1] ?? "0", 10) / 255,
      parseInt(rgbaMatch[2] ?? "0", 10) / 255,
      parseInt(rgbaMatch[3] ?? "0", 10) / 255,
      parseFloat(rgbaMatch[4] ?? "1"),
    ];
  }

  // Handle hex format
  const hexMatch = color.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (hexMatch) {
    return [
      parseInt(hexMatch[1] ?? "0", 16) / 255,
      parseInt(hexMatch[2] ?? "0", 16) / 255,
      parseInt(hexMatch[3] ?? "0", 16) / 255,
      1.0,
    ];
  }

  // Handle short hex
  const shortHexMatch = color.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);
  if (shortHexMatch) {
    return [
      parseInt((shortHexMatch[1] ?? "0") + (shortHexMatch[1] ?? "0"), 16) / 255,
      parseInt((shortHexMatch[2] ?? "0") + (shortHexMatch[2] ?? "0"), 16) / 255,
      parseInt((shortHexMatch[3] ?? "0") + (shortHexMatch[3] ?? "0"), 16) / 255,
      1.0,
    ];
  }

  // Default to white
  return [1.0, 1.0, 1.0, 1.0];
}

/** Extract base color from CSS var() expression. */
function resolveColor(color: string, _theme: Theme): string {
  // Check if it's a var() expression with fallback
  const varMatch = color.match(/var\s*\(\s*--[^,)]+\s*,\s*([^)]+)\s*\)/);
  if (varMatch) {
    return varMatch[1] ?? color;
  }
  return color;
}

export class WebGpuRenderer implements Renderer {
  /** Documents above this line count use lazy WrapMap construction. */
  static readonly LAZY_WRAP_THRESHOLD = 5000;
  /** Number of buffer rows to compute per animation frame when completing a lazy WrapMap. */
  static readonly WRAP_CHUNK_SIZE = 2000;

  private _container: HTMLElement | null = null;
  private _canvas: HTMLCanvasElement | null = null;
  private _gpu: WebGpuContext | null = null;
  private _measurements: Measurements;
  private _viewport: Viewport;
  private _snapshot: MultiBufferSnapshot | null = null;
  private _wrapMap: WrapMap | null = null;
  private _wrapBuildFrame: number | null = null;
  private _wrapMapSnapshotVersion = -1;
  private _wrapMapWrapWidth = 0;
  private _highlighter: SyntaxHighlighter | null = null;
  private _decorations: readonly Decoration[] = [];
  private _theme: Theme = GRUVBOX_DARK_THEME;
  private _glyphAtlas: GlyphAtlas | null = null;
  private _atlasVersion = -1;
  private _focused = false;
  private _cursorPoint: MultiBufferPoint | undefined;
  private _selectionStart: MultiBufferPoint | undefined;
  private _selectionEnd: MultiBufferPoint | undefined;
  private _charWidth: number;

  // Event handlers
  private _onScroll: ((e: WheelEvent) => void) | null = null;
  private _onMouseDown: ((e: MouseEvent) => void) | null = null;
  private _onMouseMove: ((e: MouseEvent) => void) | null = null;
  private _onMouseUp: ((e: MouseEvent) => void) | null = null;
  private _isDragging = false;
  private _onClickCallback: ((point: MultiBufferPoint) => void) | null = null;
  private _onDragCallback: ((point: MultiBufferPoint) => void) | null = null;
  private _onDoubleClickCallback: ((point: MultiBufferPoint) => void) | null = null;
  private _onTripleClickCallback: ((point: MultiBufferPoint) => void) | null = null;

  // Scroll state (manual, since we don't have native scrollbars)
  private _scrollTop = 0;

  // RAF handle for render loop
  private _rafHandle: number | null = null;
  private _needsRender = false;

  constructor(measurements: Measurements) {
    this._measurements = measurements;
    this._charWidth = measurements.charWidth ?? 8;
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

  async mount(container: HTMLElement): Promise<void> {
    this._container = container;

    // Create canvas
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "width:100%;height:100%;display:block;";
    container.appendChild(canvas);
    this._canvas = canvas;

    // Set up canvas size
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    // Measure character width if not provided
    this._charWidth = this._measurements.charWidth ?? this._measureCharWidth(container);

    // Create glyph atlas
    this._glyphAtlas = createGlyphAtlas(
      this._charWidth,
      this._measurements.lineHeight,
      "monospace",
      Math.floor(this._measurements.lineHeight * 0.8),
    );

    // Initialize WebGPU
    try {
      this._gpu = await this._initWebGpu(canvas);
    } catch (e) {
      console.error("WebGPU initialization failed:", e);
      throw e;
    }

    // Set up event handlers
    this._setupEventHandlers(canvas);

    // Update viewport
    this._updateViewport();
  }

  unmount(): void {
    if (this._rafHandle !== null) {
      cancelAnimationFrame(this._rafHandle);
      this._rafHandle = null;
    }

    if (this._wrapBuildFrame !== null) {
      cancelAnimationFrame(this._wrapBuildFrame);
      this._wrapBuildFrame = null;
    }

    if (this._canvas) {
      if (this._onScroll) {
        this._canvas.removeEventListener("wheel", this._onScroll);
      }
      if (this._onMouseDown) {
        this._canvas.removeEventListener("mousedown", this._onMouseDown);
      }
      if (this._container) {
        this._container.removeChild(this._canvas);
      }
    }

    if (this._onMouseMove) {
      document.removeEventListener("mousemove", this._onMouseMove);
    }
    if (this._onMouseUp) {
      document.removeEventListener("mouseup", this._onMouseUp);
    }

    // Destroy GPU resources
    if (this._gpu) {
      this._gpu.glyphInstanceBuffer.destroy();
      this._gpu.rectInstanceBuffer.destroy();
      this._gpu.uniformBuffer.destroy();
      this._gpu.atlasTexture.destroy();
      this._gpu.device.destroy();
    }

    this._container = null;
    this._canvas = null;
    this._gpu = null;
    this._glyphAtlas = null;
    this._snapshot = null;
    this._wrapMap = null;
  }

  setMeasurements(measurements: Measurements): void {
    this._measurements = measurements;
    this._charWidth = measurements.charWidth ?? this._charWidth;

    // Recreate glyph atlas if dimensions changed
    if (this._glyphAtlas) {
      if (
        this._glyphAtlas.charWidth !== this._charWidth ||
        this._glyphAtlas.lineHeight !== measurements.lineHeight
      ) {
        this._glyphAtlas = createGlyphAtlas(
          this._charWidth,
          measurements.lineHeight,
          "monospace",
          Math.floor(measurements.lineHeight * 0.8),
        );
        this._atlasVersion = -1;
      }
    }

    // Rebuild wrap map if needed
    if (this._snapshot) {
      this._wrapMap = this._buildWrapMap(this._snapshot);
    }

    this._scheduleRender();
  }

  setTheme(theme: Partial<Theme>): void {
    this._theme = { ...this._theme, ...theme };
    this._scheduleRender();
  }

  render(state: RenderState, lines: readonly string[]): void {
    if (!this._gpu || !this._canvas || !this._glyphAtlas) return;

    const { viewport, excerptHeaders, decorations } = state;
    this._viewport = viewport;
    this._decorations = decorations;

    // Build header and decoration lookups
    const headerMap = new Map<number, { path: string; label?: string }>();
    for (const header of excerptHeaders) {
      headerMap.set(header.row, header);
    }

    const decorationMap = new Map<number, Partial<DecorationStyle>>();
    for (const dec of decorations) {
      if (!dec.style) continue;
      for (let r = dec.range.start.row; r <= dec.range.end.row; r++) {
        if (r >= viewport.startRow && r < viewport.endRow) {
          decorationMap.set(r, dec.style);
        }
      }
    }

    // Ensure all glyphs are in the atlas
    for (const line of lines) {
      this._glyphAtlas.ensureGlyphs(line);
    }

    // Update atlas texture if needed
    if (this._glyphAtlas.version !== this._atlasVersion) {
      this._updateAtlasTexture();
      this._atlasVersion = this._glyphAtlas.version;
    }

    // Build glyph instances
    const glyphData = new Float32Array(MAX_GLYPHS * 8);
    let glyphCount = 0;

    const gutterWidth = this._measurements.gutterWidth;
    const lineHeight = this._measurements.lineHeight;
    const charWidth = this._charWidth;
    const wrapWidth = this._measurements.wrapWidth ?? 0;

    for (let i = 0; i < lines.length && glyphCount < MAX_GLYPHS; i++) {
      const mbRow = viewport.startRow + i;
      const lineText = lines[i] ?? "";
      const header = headerMap.get(mbRow);
      const decoration = decorationMap.get(mbRow);

      // Get syntax tokens
      // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
      const excerptInfo = this._snapshot?.excerptAt(mbRow as MultiBufferRow);
      let tokens: Token[] | undefined;
      if (excerptInfo && this._highlighter?.ready) {
        const bufferRow = excerptInfo.range.context.start.row + (mbRow - excerptInfo.startRow);
        // biome-ignore lint/plugin/no-type-assertion: expect: BufferId is branded string
        tokens = this._highlighter.getLineTokens(excerptInfo.bufferId as string, bufferRow);
      }

      // Determine line color
      let lineColor: [number, number, number, number];
      if (header) {
        lineColor = parseColor(resolveColor(this._theme.headerText, this._theme));
      } else if (decoration?.color) {
        lineColor = parseColor(decoration.color);
      } else {
        lineColor = parseColor(resolveColor(this._theme.syntaxDefault, this._theme));
      }

      // Compute visual row position
      const visualRow = this._wrapMap
        ? this._wrapMap.bufferRowToFirstVisualRow(viewport.startRow) + i
        : viewport.startRow + i;

      // Handle soft wrapping
      const segments = wrapWidth > 0 ? wrapLine(lineText, wrapWidth) : [lineText];
      let segmentRow = visualRow;
      let charOffset = 0;

      for (let seg = 0; seg < segments.length && glyphCount < MAX_GLYPHS; seg++) {
        const segText = segments[seg] ?? "";
        const y = segmentRow * lineHeight;

        for (let col = 0; col < segText.length && glyphCount < MAX_GLYPHS; col++) {
          const char = segText[col] ?? " ";
          const glyph = this._glyphAtlas.getGlyph(char);
          if (!glyph.valid) continue;

          // Get character color from tokens
          let color = lineColor;
          if (tokens) {
            const charCol = charOffset + col;
            for (const token of tokens) {
              if (charCol >= token.startColumn && charCol < token.endColumn) {
                color = parseColor(resolveColor(token.color, this._theme));
                break;
              }
            }
          }

          // Write glyph instance
          const x = gutterWidth + col * charWidth;
          const baseIdx = glyphCount * 8;
          glyphData[baseIdx + 0] = x;
          glyphData[baseIdx + 1] = y;
          glyphData[baseIdx + 2] = glyph.x;
          glyphData[baseIdx + 3] = glyph.y;
          glyphData[baseIdx + 4] = color[0];
          glyphData[baseIdx + 5] = color[1];
          glyphData[baseIdx + 6] = color[2];
          glyphData[baseIdx + 7] = color[3];
          glyphCount++;
        }

        charOffset += segText.length;
        segmentRow++;
      }
    }

    // Build rectangle instances (selection, cursor)
    const rectData = new Float32Array(MAX_RECTS * 8);
    let rectCount = 0;

    // Add selection rectangles
    if (this._selectionStart && this._selectionEnd) {
      const selColor = parseColor(resolveColor(this._theme.selection, this._theme));
      const rects = this._computeSelectionRects(this._selectionStart, this._selectionEnd);
      for (const rect of rects) {
        if (rectCount >= MAX_RECTS) break;
        const baseIdx = rectCount * 8;
        rectData[baseIdx + 0] = rect.x;
        rectData[baseIdx + 1] = rect.y;
        rectData[baseIdx + 2] = rect.width;
        rectData[baseIdx + 3] = rect.height;
        rectData[baseIdx + 4] = selColor[0];
        rectData[baseIdx + 5] = selColor[1];
        rectData[baseIdx + 6] = selColor[2];
        rectData[baseIdx + 7] = selColor[3];
        rectCount++;
      }
    }

    // Add cursor rectangle
    if (this._cursorPoint && this._focused) {
      const cursorColor = parseColor(resolveColor(this._theme.cursor, this._theme));
      const cursorRect = computeCursorRect(
        this._cursorPoint,
        this._getLineText(this._cursorPoint.row),
        lineHeight,
        charWidth,
        gutterWidth,
        this._measurements.wrapWidth ?? 0,
        this._wrapMap,
      );

      if (rectCount < MAX_RECTS) {
        const baseIdx = rectCount * 8;
        rectData[baseIdx + 0] = cursorRect.x;
        rectData[baseIdx + 1] = cursorRect.y;
        rectData[baseIdx + 2] = 2; // cursor width
        rectData[baseIdx + 3] = cursorRect.height;
        rectData[baseIdx + 4] = cursorColor[0];
        rectData[baseIdx + 5] = cursorColor[1];
        rectData[baseIdx + 6] = cursorColor[2];
        rectData[baseIdx + 7] = cursorColor[3];
        rectCount++;
      }
    }

    // Execute render pass
    this._executeRender(glyphData, glyphCount, rectData, rectCount);
  }

  scrollTo(target: ScrollTarget): void {
    const contentHeight = calculateContentHeight(
      this._snapshot?.lineCount ?? 0,
      this._measurements.lineHeight,
      this._wrapMap ?? undefined,
    );
    this._scrollTop = calculateScrollTop(
      target.row,
      target.strategy,
      this._scrollTop,
      this._measurements.lineHeight,
      this._viewport.height,
      contentHeight,
      this._wrapMap ?? undefined,
    );
    this._scheduleRender();
  }

  getViewport(): Viewport {
    return this._viewport;
  }

  hitTest(x: number, y: number): { row: MultiBufferRow; column: number } | undefined {
    const scrollTop = this._scrollTop;
    const visualRow = yToVisualRow(scrollTop + y, this._measurements.lineHeight);
    const gutterWidth = this._measurements.gutterWidth;
    const visualCol = Math.max(0, Math.floor((x - gutterWidth) / this._charWidth));

    if (this._wrapMap) {
      const { mbRow, segment } = this._wrapMap.visualRowToBufferRow(visualRow);
      const lineText = this._getLineText(mbRow);
      const charOffset = this._wrapMap.segmentCharStart(mbRow, segment);
      const nextSeg = segment + 1;
      const segEnd =
        nextSeg < this._wrapMap.visualRowsForLine(mbRow)
          ? this._wrapMap.segmentCharStart(mbRow, nextSeg)
          : lineText.length;
      const segText = lineText.slice(charOffset, segEnd);
      const charCol = visualColToCharCol(segText, visualCol);
      return { row: mbRow, column: charOffset + charCol };
    }

    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
    const lineText = this._getLineText(visualRow as MultiBufferRow);
    const column = visualColToCharCol(lineText, visualCol);
    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
    return { row: visualRow as MultiBufferRow, column };
  }

  /** Set the snapshot for rendering. */
  setSnapshot(snapshot: MultiBufferSnapshot): void {
    this._snapshot = snapshot;
    const wrapWidth = this._measurements.wrapWidth ?? 0;
    if (
      this._wrapMap !== null &&
      snapshot.version === this._wrapMapSnapshotVersion &&
      wrapWidth === this._wrapMapWrapWidth
    ) {
      return;
    }
    this._wrapMap = this._buildWrapMap(snapshot);
    this._scheduleRender();
  }

  /** Set the syntax highlighter. */
  setHighlighter(highlighter: SyntaxHighlighter): void {
    this._highlighter = highlighter;
  }

  /** Render cursor at a multibuffer point. */
  renderCursor(point: MultiBufferPoint | undefined): void {
    this._cursorPoint = point;
    this._scheduleRender();
  }

  /** Update focus state. */
  setFocused(focused: boolean): void {
    this._focused = focused;
    this._scheduleRender();
  }

  /** Render selection highlight. */
  renderSelection(start: MultiBufferPoint | undefined, end: MultiBufferPoint | undefined): void {
    this._selectionStart = start;
    this._selectionEnd = end;
    this._scheduleRender();
  }

  /** Register a callback for single click. */
  onClickPosition(cb: (point: MultiBufferPoint) => void): void {
    this._onClickCallback = cb;
  }

  /** Register a callback for drag. */
  onDrag(cb: (point: MultiBufferPoint) => void): void {
    this._onDragCallback = cb;
  }

  /** Register a callback for double-click. */
  onDoubleClick(cb: (point: MultiBufferPoint) => void): void {
    this._onDoubleClickCallback = cb;
  }

  /** Register a callback for triple-click. */
  onTripleClick(cb: (point: MultiBufferPoint) => void): void {
    this._onTripleClickCallback = cb;
  }

  /** Get the current scroll position. */
  getScrollTop(): number {
    return this._scrollTop;
  }

  // ─── Private methods ───────────────────────────────────────────────────────

  private async _initWebGpu(canvas: HTMLCanvasElement): Promise<WebGpuContext> {
    // Check for WebGPU support
    if (!navigator.gpu) {
      throw new Error("WebGPU not supported");
    }

    // Request adapter
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      throw new Error("Failed to get WebGPU adapter");
    }

    // Request device
    const device = await adapter.requestDevice();

    // Configure canvas context
    const context = canvas.getContext("webgpu");
    if (!context) {
      throw new Error("Failed to get WebGPU context");
    }

    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
      device,
      format,
      alphaMode: "premultiplied",
    });

    // Create shader module
    const shaderModule = device.createShaderModule({
      code: SHADER_SOURCE,
    });

    // Create uniform buffer
    const uniformBuffer = device.createBuffer({
      size: UNIFORM_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Create glyph atlas texture
    const atlasTexture = device.createTexture({
      size: [this._glyphAtlas?.width ?? 512, this._glyphAtlas?.height ?? 512],
      format: "r8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });

    // Create sampler
    const atlasSampler = device.createSampler({
      magFilter: "linear",
      minFilter: "linear",
    });

    // Create bind group layout
    const bindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: "float" },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: "filtering" },
        },
      ],
    });

    // Create bind group
    const uniformBindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: atlasTexture.createView() },
        { binding: 2, resource: atlasSampler },
      ],
    });

    // Create pipeline layout
    const pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout],
    });

    // Create glyph render pipeline
    const glyphPipeline = device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: "vs_main",
        buffers: [
          {
            arrayStride: GLYPH_INSTANCE_SIZE,
            stepMode: "instance",
            attributes: [
              { shaderLocation: 0, offset: 0, format: "float32x2" },  // pos
              { shaderLocation: 1, offset: 8, format: "float32x2" },  // atlas_pos
              { shaderLocation: 2, offset: 16, format: "float32x4" }, // color
            ],
          },
        ],
      },
      fragment: {
        module: shaderModule,
        entryPoint: "fs_main",
        targets: [
          {
            format,
            blend: {
              color: {
                srcFactor: "src-alpha",
                dstFactor: "one-minus-src-alpha",
                operation: "add",
              },
              alpha: {
                srcFactor: "one",
                dstFactor: "one-minus-src-alpha",
                operation: "add",
              },
            },
          },
        ],
      },
      primitive: {
        topology: "triangle-list",
      },
    });

    // Create rectangle render pipeline
    const rectPipeline = device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: "vs_rect",
        buffers: [
          {
            arrayStride: RECT_INSTANCE_SIZE,
            stepMode: "instance",
            attributes: [
              { shaderLocation: 0, offset: 0, format: "float32x2" },  // pos
              { shaderLocation: 1, offset: 8, format: "float32x2" },  // size
              { shaderLocation: 2, offset: 16, format: "float32x4" }, // color
            ],
          },
        ],
      },
      fragment: {
        module: shaderModule,
        entryPoint: "fs_rect",
        targets: [
          {
            format,
            blend: {
              color: {
                srcFactor: "src-alpha",
                dstFactor: "one-minus-src-alpha",
                operation: "add",
              },
              alpha: {
                srcFactor: "one",
                dstFactor: "one-minus-src-alpha",
                operation: "add",
              },
            },
          },
        ],
      },
      primitive: {
        topology: "triangle-list",
      },
    });

    // Create instance buffers
    const glyphInstanceBuffer = device.createBuffer({
      size: MAX_GLYPHS * GLYPH_INSTANCE_SIZE,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    const rectInstanceBuffer = device.createBuffer({
      size: MAX_RECTS * RECT_INSTANCE_SIZE,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    return {
      device,
      context,
      format,
      glyphPipeline,
      rectPipeline,
      uniformBuffer,
      uniformBindGroup,
      glyphInstanceBuffer,
      rectInstanceBuffer,
      atlasTexture,
      atlasSampler,
    };
  }

  private _updateAtlasTexture(): void {
    if (!this._gpu || !this._glyphAtlas) return;

    const { device, atlasTexture } = this._gpu;
    const atlas = this._glyphAtlas;

    // Check if we need to recreate the texture (atlas grew)
    if (
      atlasTexture.width !== atlas.width ||
      atlasTexture.height !== atlas.height
    ) {
      // Destroy old texture
      atlasTexture.destroy();

      // Create new texture
      this._gpu.atlasTexture = device.createTexture({
        size: [atlas.width, atlas.height],
        format: "r8unorm",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      });

      // Update bind group with new texture
      const bindGroupLayout = this._gpu.glyphPipeline.getBindGroupLayout(0);
      this._gpu.uniformBindGroup = device.createBindGroup({
        layout: bindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: this._gpu.uniformBuffer } },
          { binding: 1, resource: this._gpu.atlasTexture.createView() },
          { binding: 2, resource: this._gpu.atlasSampler },
        ],
      });
    }

    // Upload alpha data
    const alphaData = atlas.getAlphaData();
    device.queue.writeTexture(
      { texture: this._gpu.atlasTexture },
      alphaData.buffer,
      { bytesPerRow: atlas.width },
      { width: atlas.width, height: atlas.height },
    );
  }

  private _executeRender(
    glyphData: Float32Array,
    glyphCount: number,
    rectData: Float32Array,
    rectCount: number,
  ): void {
    if (!this._gpu || !this._canvas || !this._glyphAtlas) return;

    const { device, context, glyphPipeline, rectPipeline, uniformBuffer, uniformBindGroup, glyphInstanceBuffer, rectInstanceBuffer } = this._gpu;

    // Update canvas size
    const dpr = window.devicePixelRatio || 1;
    const rect = this._canvas.getBoundingClientRect();
    const width = rect.width * dpr;
    const height = rect.height * dpr;
    this._canvas.width = width;
    this._canvas.height = height;

    // Update uniform buffer
    const uniforms = new Float32Array([
      width,
      height,
      0, // scroll_x (horizontal scroll not implemented)
      this._scrollTop * dpr,
      this._charWidth * dpr,
      this._measurements.lineHeight * dpr,
      this._measurements.gutterWidth * dpr,
      this._glyphAtlas.width,
      this._glyphAtlas.height,
      0, 0, 0, // padding
    ]);
    device.queue.writeBuffer(uniformBuffer, 0, uniforms);

    // Update instance buffers
    if (glyphCount > 0) {
      // Scale glyph positions by DPR
      const scaledGlyphData = new Float32Array(glyphCount * 8);
      for (let i = 0; i < glyphCount; i++) {
        const srcIdx = i * 8;
        const dstIdx = i * 8;
        scaledGlyphData[dstIdx + 0] = (glyphData[srcIdx + 0] ?? 0) * dpr;
        scaledGlyphData[dstIdx + 1] = (glyphData[srcIdx + 1] ?? 0) * dpr;
        scaledGlyphData[dstIdx + 2] = glyphData[srcIdx + 2] ?? 0;
        scaledGlyphData[dstIdx + 3] = glyphData[srcIdx + 3] ?? 0;
        scaledGlyphData[dstIdx + 4] = glyphData[srcIdx + 4] ?? 0;
        scaledGlyphData[dstIdx + 5] = glyphData[srcIdx + 5] ?? 0;
        scaledGlyphData[dstIdx + 6] = glyphData[srcIdx + 6] ?? 0;
        scaledGlyphData[dstIdx + 7] = glyphData[srcIdx + 7] ?? 0;
      }
      device.queue.writeBuffer(glyphInstanceBuffer, 0, scaledGlyphData);
    }

    if (rectCount > 0) {
      // Scale rect positions and sizes by DPR
      const scaledRectData = new Float32Array(rectCount * 8);
      for (let i = 0; i < rectCount; i++) {
        const srcIdx = i * 8;
        const dstIdx = i * 8;
        scaledRectData[dstIdx + 0] = (rectData[srcIdx + 0] ?? 0) * dpr;
        scaledRectData[dstIdx + 1] = (rectData[srcIdx + 1] ?? 0) * dpr;
        scaledRectData[dstIdx + 2] = (rectData[srcIdx + 2] ?? 0) * dpr;
        scaledRectData[dstIdx + 3] = (rectData[srcIdx + 3] ?? 0) * dpr;
        scaledRectData[dstIdx + 4] = rectData[srcIdx + 4] ?? 0;
        scaledRectData[dstIdx + 5] = rectData[srcIdx + 5] ?? 0;
        scaledRectData[dstIdx + 6] = rectData[srcIdx + 6] ?? 0;
        scaledRectData[dstIdx + 7] = rectData[srcIdx + 7] ?? 0;
      }
      device.queue.writeBuffer(rectInstanceBuffer, 0, scaledRectData);
    }

    // Get current texture
    const textureView = context.getCurrentTexture().createView();

    // Create command encoder
    const commandEncoder = device.createCommandEncoder();

    // Begin render pass
    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: textureView,
          clearValue: { r: 0.15, g: 0.15, b: 0.15, a: 1.0 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });

    // Draw selection/cursor rectangles first (behind text)
    if (rectCount > 0) {
      renderPass.setPipeline(rectPipeline);
      renderPass.setBindGroup(0, uniformBindGroup);
      renderPass.setVertexBuffer(0, rectInstanceBuffer);
      renderPass.draw(6, rectCount);
    }

    // Draw glyphs
    if (glyphCount > 0) {
      renderPass.setPipeline(glyphPipeline);
      renderPass.setBindGroup(0, uniformBindGroup);
      renderPass.setVertexBuffer(0, glyphInstanceBuffer);
      renderPass.draw(6, glyphCount);
    }

    renderPass.end();

    // Submit commands
    device.queue.submit([commandEncoder.finish()]);
  }

  private _scheduleRender(): void {
    this._needsRender = true;
    if (this._rafHandle === null) {
      this._rafHandle = requestAnimationFrame(() => {
        this._rafHandle = null;
        if (this._needsRender) {
          this._needsRender = false;
          this._doRender();
        }
      });
    }
  }

  private _doRender(): void {
    if (!this._snapshot) return;

    this._updateViewport();

    const { startRow, endRow } = this._viewport;
    const lines = this._snapshot.lines(startRow, endRow);
    const excerptBoundaries = this._snapshot.excerptBoundaries(startRow, endRow);

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
        viewport: this._viewport,
        selections: [],
        decorations: this._decorations,
        excerptHeaders,
        focused: this._focused,
      },
      lines,
    );
  }

  private _updateViewport(): void {
    if (!this._canvas || !this._snapshot) return;

    const rect = this._canvas.getBoundingClientRect();
    const totalLines = this._snapshot.lineCount;
    this._viewport = createViewport(
      this._scrollTop,
      rect.height,
      rect.width,
      this._measurements,
      totalLines,
      this._wrapMap ?? undefined,
    );
  }

  private _measureCharWidth(container: HTMLElement): number {
    const span = document.createElement("span");
    span.style.cssText = "position:absolute;visibility:hidden;white-space:pre;font:inherit;";
    span.textContent = "MMMMMMMMMM";
    container.appendChild(span);
    const width = span.getBoundingClientRect().width / 10;
    container.removeChild(span);
    return width;
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

    this._wrapMapSnapshotVersion = snapshot.version;
    this._wrapMapWrapWidth = wrapWidth;

    if (this._wrapBuildFrame !== null) {
      cancelAnimationFrame(this._wrapBuildFrame);
      this._wrapBuildFrame = null;
    }

    const useLazy =
      snapshot.lineCount > WebGpuRenderer.LAZY_WRAP_THRESHOLD &&
      typeof requestAnimationFrame !== "undefined";

    if (useLazy) {
      const wrapMap = new WrapMap(snapshot, wrapWidth, { lazy: true });
      this._scheduleWrapCompletion(wrapMap);
      return wrapMap;
    }

    return new WrapMap(snapshot, wrapWidth);
  }

  private _scheduleWrapCompletion(wrapMap: WrapMap): void {
    this._wrapBuildFrame = requestAnimationFrame(() => {
      if (this._wrapMap !== wrapMap) {
        this._wrapBuildFrame = null;
        return;
      }

      const complete = wrapMap.computeChunk(WebGpuRenderer.WRAP_CHUNK_SIZE);

      if (complete) {
        this._wrapBuildFrame = null;
        this._scheduleRender();
      } else {
        this._scheduleWrapCompletion(wrapMap);
      }
    });
  }

  private _computeSelectionRects(
    start: MultiBufferPoint,
    end: MultiBufferPoint,
  ): Array<{ x: number; y: number; width: number; height: number }> {
    if (!this._snapshot) return [];
    if (start.row === end.row && start.column === end.column) return [];

    // Normalize
    let selStart = start;
    let selEnd = end;
    if (selStart.row > selEnd.row || (selStart.row === selEnd.row && selStart.column > selEnd.column)) {
      selStart = end;
      selEnd = start;
    }

    const rects: Array<{ x: number; y: number; width: number; height: number }> = [];
    const gutterWidth = this._measurements.gutterWidth;
    const lineHeight = this._measurements.lineHeight;
    const charWidth = this._charWidth;

    for (let r = selStart.row; r <= selEnd.row; r++) {
      const visualRow = this._wrapMap
        // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
        ? this._wrapMap.bufferRowToFirstVisualRow(r as MultiBufferRow)
        : r;

      // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction
      const lineText = this._getLineText(r as MultiBufferRow);
      const startCol = r === selStart.row ? selStart.column : 0;
      const endCol = r === selEnd.row ? selEnd.column : lineText.length + 1;

      const startX = gutterWidth + charColToVisualCol(lineText, startCol) * charWidth;
      const endX = gutterWidth + (endCol > lineText.length ? lineText.length + 0.3 : charColToVisualCol(lineText, endCol)) * charWidth;

      rects.push({
        x: startX,
        y: visualRow * lineHeight,
        width: Math.max(0, endX - startX),
        height: lineHeight,
      });
    }

    return rects;
  }

  private _setupEventHandlers(canvas: HTMLCanvasElement): void {
    // Wheel scroll
    const wheelHandler = (e: WheelEvent) => {
      e.preventDefault();
      this._scrollTop = Math.max(0, this._scrollTop + e.deltaY);
      this._scheduleRender();
    };
    this._onScroll = wheelHandler;
    canvas.addEventListener("wheel", wheelHandler, { passive: false });

    // Mouse down
    this._onMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const point = this.hitTest(e.clientX - rect.left, e.clientY - rect.top);
      if (!point) return;

      if (e.detail >= 3 && this._onTripleClickCallback) {
        this._onTripleClickCallback(point);
      } else if (e.detail === 2 && this._onDoubleClickCallback) {
        this._onDoubleClickCallback(point);
      } else if (this._onClickCallback) {
        this._onClickCallback(point);
      }

      this._isDragging = true;
    };
    canvas.addEventListener("mousedown", this._onMouseDown);

    // Mouse move
    this._onMouseMove = (e: MouseEvent) => {
      if (!this._isDragging || !this._onDragCallback) return;
      const rect = canvas.getBoundingClientRect();
      const point = this.hitTest(e.clientX - rect.left, e.clientY - rect.top);
      if (point) {
        this._onDragCallback(point);
      }
    };
    document.addEventListener("mousemove", this._onMouseMove);

    // Mouse up
    this._onMouseUp = () => {
      this._isDragging = false;
    };
    document.addEventListener("mouseup", this._onMouseUp);
  }
}

/**
 * Check if WebGPU is available in the current environment.
 */
export function isWebGpuAvailable(): boolean {
  return typeof navigator !== "undefined" && !!navigator.gpu;
}

/**
 * Create a WebGPU renderer.
 * Returns a promise that resolves when the renderer is ready.
 */
export async function createWebGpuRenderer(
  measurements: Measurements,
  container: HTMLElement,
  theme?: Partial<Theme>,
): Promise<WebGpuRenderer> {
  const renderer = new WebGpuRenderer(measurements);
  if (theme) {
    renderer.setTheme(theme);
  }
  await renderer.mount(container);
  return renderer;
}
