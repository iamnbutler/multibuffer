/**
 * Glyph atlas for GPU text rendering.
 *
 * Rasterizes glyphs to an offscreen canvas and provides texture data
 * for upload to WebGPU. Uses a simple row-based packing strategy.
 *
 * Design:
 * - Fixed cell size (charWidth x lineHeight) for monospace fonts
 * - Single-channel alpha texture (glyph shapes only, color applied in shader)
 * - Lazy rasterization: glyphs added on first use
 * - Row-based packing: fills rows left-to-right, top-to-bottom
 */

/** Glyph location in the atlas. */
export interface GlyphInfo {
  /** X position in atlas (pixels) */
  readonly x: number;
  /** Y position in atlas (pixels) */
  readonly y: number;
  /** Whether this glyph exists in the atlas */
  readonly valid: boolean;
}

/** Atlas configuration. */
export interface GlyphAtlasConfig {
  /** Character width in pixels */
  readonly charWidth: number;
  /** Line height in pixels */
  readonly lineHeight: number;
  /** Font family (e.g., "monospace") */
  readonly fontFamily: string;
  /** Font size in pixels */
  readonly fontSize: number;
  /** Initial atlas width (will grow if needed) */
  readonly initialWidth?: number;
  /** Initial atlas height (will grow if needed) */
  readonly initialHeight?: number;
  /** Maximum atlas dimension (prevents unbounded growth) */
  readonly maxSize?: number;
}

/** Default printable ASCII characters to pre-populate. */
const DEFAULT_CHARSET = " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~";

export class GlyphAtlas {
  private readonly _charWidth: number;
  private readonly _lineHeight: number;
  private readonly _fontFamily: string;
  private readonly _fontSize: number;
  private readonly _maxSize: number;

  private _canvas: OffscreenCanvas | HTMLCanvasElement;
  private _ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
  private _width: number;
  private _height: number;

  /** Map from character to atlas position. */
  private readonly _glyphs: Map<string, GlyphInfo> = new Map();

  /** Current packing position. */
  private _packX = 0;
  private _packY = 0;

  /** Tracks whether the atlas texture needs re-upload to GPU. */
  private _dirty = true;

  /** Version number, incremented when atlas changes. */
  private _version = 0;

  constructor(config: GlyphAtlasConfig) {
    this._charWidth = config.charWidth;
    this._lineHeight = config.lineHeight;
    this._fontFamily = config.fontFamily;
    this._fontSize = config.fontSize;
    this._maxSize = config.maxSize ?? 4096;

    const initialWidth = config.initialWidth ?? 512;
    const initialHeight = config.initialHeight ?? 512;

    // Create offscreen canvas if available, fallback to regular canvas
    if (typeof OffscreenCanvas !== "undefined") {
      this._canvas = new OffscreenCanvas(initialWidth, initialHeight);
      const ctx = this._canvas.getContext("2d");
      if (!ctx) throw new Error("Failed to create OffscreenCanvas 2D context");
      // biome-ignore lint/plugin/no-type-assertion: expect: getContext returns correct type for "2d"
      this._ctx = ctx as OffscreenCanvasRenderingContext2D;
    } else {
      this._canvas = document.createElement("canvas");
      this._canvas.width = initialWidth;
      this._canvas.height = initialHeight;
      const ctx = this._canvas.getContext("2d");
      if (!ctx) throw new Error("Failed to create Canvas 2D context");
      this._ctx = ctx;
    }

    this._width = initialWidth;
    this._height = initialHeight;

    this._setupContext();
    this._prepopulateAscii();
  }

  /** Atlas width in pixels. */
  get width(): number {
    return this._width;
  }

  /** Atlas height in pixels. */
  get height(): number {
    return this._height;
  }

  /** Character width in pixels. */
  get charWidth(): number {
    return this._charWidth;
  }

  /** Line height in pixels. */
  get lineHeight(): number {
    return this._lineHeight;
  }

  /** Whether the atlas has changed since last getImageData(). */
  get dirty(): boolean {
    return this._dirty;
  }

  /** Version number, incremented on each change. */
  get version(): number {
    return this._version;
  }

  /**
   * Get glyph info for a character, adding it to the atlas if needed.
   * Returns the atlas position for the glyph.
   */
  getGlyph(char: string): GlyphInfo {
    // Check cache first
    const cached = this._glyphs.get(char);
    if (cached) return cached;

    // Add new glyph
    return this._addGlyph(char);
  }

  /**
   * Ensure all characters in a string are in the atlas.
   * Call this before rendering a line to batch atlas updates.
   */
  ensureGlyphs(text: string): void {
    for (const char of text) {
      this.getGlyph(char);
    }
  }

  /**
   * Get the atlas image data for GPU upload.
   * Returns single-channel (alpha) data.
   */
  getImageData(): ImageData {
    this._dirty = false;
    return this._ctx.getImageData(0, 0, this._width, this._height);
  }

  /**
   * Get the canvas directly (for createImageBitmap).
   */
  getCanvas(): OffscreenCanvas | HTMLCanvasElement {
    this._dirty = false;
    return this._canvas;
  }

  /**
   * Get single-channel alpha data for GPU upload.
   * Extracts just the alpha channel from RGBA data.
   */
  getAlphaData(): Uint8Array {
    const imageData = this._ctx.getImageData(0, 0, this._width, this._height);
    const rgba = imageData.data;
    const alpha = new Uint8Array(this._width * this._height);

    // Extract alpha channel (every 4th byte starting at index 3)
    for (let i = 0; i < alpha.length; i++) {
      // Use the red channel since we render white text on transparent
      // biome-ignore lint/style/noNonNullAssertion: expect: index is always valid
      alpha[i] = rgba[i * 4]!;
    }

    return alpha;
  }

  private _setupContext(): void {
    const ctx = this._ctx;
    ctx.textBaseline = "top";
    ctx.font = `${this._fontSize}px ${this._fontFamily}`;
    ctx.fillStyle = "white";
    // Enable subpixel rendering
    // biome-ignore lint/plugin/no-type-assertion: expect: imageSmoothingEnabled exists on 2d context
    (ctx as CanvasRenderingContext2D).imageSmoothingEnabled = true;
  }

  private _prepopulateAscii(): void {
    for (const char of DEFAULT_CHARSET) {
      this._addGlyph(char);
    }
  }

  private _addGlyph(char: string): GlyphInfo {
    // Check if we need to expand the atlas
    if (this._packX + this._charWidth > this._width) {
      // Move to next row
      this._packX = 0;
      this._packY += this._lineHeight;
    }

    // Keep expanding until the cell actually fits. _expand() prefers growing
    // width, which adds no new rows, so one call may report success without
    // making room for this glyph.
    while (this._packY + this._lineHeight > this._height) {
      // Need to expand the atlas
      if (!this._expand()) {
        // Can't expand, return invalid glyph
        const invalid: GlyphInfo = { x: 0, y: 0, valid: false };
        this._glyphs.set(char, invalid);
        return invalid;
      }
    }

    // Render the glyph
    const x = this._packX;
    const y = this._packY;

    // Clear the cell first
    this._ctx.clearRect(x, y, this._charWidth, this._lineHeight);

    // Draw the character centered vertically
    const yOffset = (this._lineHeight - this._fontSize) / 2;
    this._ctx.fillText(char, x, y + yOffset);

    // Update packing position
    this._packX += this._charWidth;

    // Store glyph info
    const info: GlyphInfo = { x, y, valid: true };
    this._glyphs.set(char, info);

    this._dirty = true;
    this._version++;

    return info;
  }

  private _expand(): boolean {
    // Try to double the size
    let newWidth = this._width;
    let newHeight = this._height;

    // Prefer expanding width first, then height
    if (newWidth < this._maxSize) {
      newWidth = Math.min(newWidth * 2, this._maxSize);
    } else if (newHeight < this._maxSize) {
      newHeight = Math.min(newHeight * 2, this._maxSize);
    } else {
      // Already at max size
      return false;
    }

    // Create new canvas
    let newCanvas: OffscreenCanvas | HTMLCanvasElement;
    let newCtx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

    if (typeof OffscreenCanvas !== "undefined") {
      newCanvas = new OffscreenCanvas(newWidth, newHeight);
      const ctx = newCanvas.getContext("2d");
      if (!ctx) return false;
      // biome-ignore lint/plugin/no-type-assertion: expect: getContext returns correct type for "2d"
      newCtx = ctx as OffscreenCanvasRenderingContext2D;
    } else {
      newCanvas = document.createElement("canvas");
      newCanvas.width = newWidth;
      newCanvas.height = newHeight;
      const ctx = newCanvas.getContext("2d");
      if (!ctx) return false;
      newCtx = ctx;
    }

    // Copy old content
    newCtx.drawImage(this._canvas, 0, 0);

    // Replace canvas
    this._canvas = newCanvas;
    this._ctx = newCtx;
    this._width = newWidth;
    this._height = newHeight;

    // Re-setup context after resize
    this._setupContext();

    this._dirty = true;
    this._version++;

    return true;
  }

  /**
   * Clear the atlas and reset to initial state.
   * Useful for font changes.
   */
  reset(): void {
    this._glyphs.clear();
    this._packX = 0;
    this._packY = 0;
    this._ctx.clearRect(0, 0, this._width, this._height);
    this._prepopulateAscii();
    this._dirty = true;
    this._version++;
  }
}

/**
 * Create a glyph atlas with default settings.
 */
export function createGlyphAtlas(
  charWidth: number,
  lineHeight: number,
  fontFamily = "monospace",
  fontSize?: number,
): GlyphAtlas {
  return new GlyphAtlas({
    charWidth,
    lineHeight,
    fontFamily,
    fontSize: fontSize ?? Math.floor(lineHeight * 0.8),
  });
}
