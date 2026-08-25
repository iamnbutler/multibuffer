/**
 * Tests for GlyphAtlas.
 *
 * Note: Tests that need real rasterization require browser APIs (OffscreenCanvas
 * or document) and are skipped in non-browser environments.
 *
 * The atlas packing geometry does not need them: it is arithmetic over
 * charWidth/lineHeight/width/height, so the "packing (headless)" block below
 * drives the real GlyphAtlas against a stub 2D context and runs everywhere.
 */

import { afterAll, beforeAll, describe, expect, it } from "bun:test";

// Check if we're in a browser-like environment with working canvas
const hasCanvasSupport = (() => {
  try {
    if (typeof OffscreenCanvas !== "undefined") {
      const c = new OffscreenCanvas(1, 1);
      return c.getContext("2d") !== null;
    }
    if (typeof document !== "undefined") {
      const c = document.createElement("canvas");
      return c.getContext("2d") !== null;
    }
    return false;
  } catch {
    return false;
  }
})();

describe.skipIf(!hasCanvasSupport)("GlyphAtlas (browser environment)", () => {
  it("creates atlas with specified dimensions", async () => {
    const { createGlyphAtlas } = await import("../../src/renderer/glyph-atlas.ts");
    const atlas = createGlyphAtlas(8, 16);
    expect(atlas.charWidth).toBe(8);
    expect(atlas.lineHeight).toBe(16);
    expect(atlas.width).toBeGreaterThanOrEqual(512);
    expect(atlas.height).toBeGreaterThanOrEqual(512);
  });

  it("returns valid glyph info for ASCII characters", async () => {
    const { createGlyphAtlas } = await import("../../src/renderer/glyph-atlas.ts");
    const atlas = createGlyphAtlas(8, 16);
    const info = atlas.getGlyph("A");
    expect(info.valid).toBe(true);
    expect(info.x).toBeGreaterThanOrEqual(0);
    expect(info.y).toBeGreaterThanOrEqual(0);
  });

  it("returns same position for same character", async () => {
    const { createGlyphAtlas } = await import("../../src/renderer/glyph-atlas.ts");
    const atlas = createGlyphAtlas(8, 16);
    const first = atlas.getGlyph("X");
    const second = atlas.getGlyph("X");
    expect(first.x).toBe(second.x);
    expect(first.y).toBe(second.y);
  });
});

/**
 * Minimal 2D context stub. The packing path only calls clearRect/fillText/
 * drawImage and reads back nothing, so these can be no-ops.
 */
class StubContext {
  textBaseline = "";
  font = "";
  fillStyle = "";
  imageSmoothingEnabled = false;
  clearRect(): void {}
  fillText(): void {}
  drawImage(): void {}
}

class StubOffscreenCanvas {
  width: number;
  height: number;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }
  getContext(): StubContext {
    return new StubContext();
  }
}

describe("GlyphAtlas packing (headless)", () => {
  const CHAR_WIDTH = 8;
  const LINE_HEIGHT = 20;
  /** Enough distinct glyphs to exhaust the default 512x512 atlas. */
  const GLYPH_COUNT = 6000;
  /** CJK block - genuinely distinct characters a real document can contain. */
  const codePointAt = (i: number) => String.fromCodePoint(0x4e00 + i);

  beforeAll(() => {
    Object.defineProperty(globalThis, "OffscreenCanvas", {
      value: StubOffscreenCanvas,
      configurable: true,
      writable: true,
    });
  });

  afterAll(() => {
    Reflect.deleteProperty(globalThis, "OffscreenCanvas");
  });

  it("never reports a glyph as valid outside the atlas bounds", async () => {
    const { createGlyphAtlas } = await import("../../src/renderer/glyph-atlas.ts");
    const atlas = createGlyphAtlas(CHAR_WIDTH, LINE_HEIGHT);

    // A glyph marked valid must lie entirely inside the atlas: webgpu.ts uses
    // `if (!glyph.valid) continue` to decide whether to emit vertices for it.
    const violations: string[] = [];
    for (let i = 0; i < GLYPH_COUNT; i++) {
      const glyph = atlas.getGlyph(codePointAt(i));
      if (!glyph.valid) continue;
      if (
        glyph.x + CHAR_WIDTH > atlas.width ||
        glyph.y + LINE_HEIGHT > atlas.height
      ) {
        violations.push(
          `U+${(0x4e00 + i).toString(16)} at (${glyph.x},${glyph.y}) in ${atlas.width}x${atlas.height}`,
        );
      }
    }

    expect(violations).toEqual([]);
  });

  it("makes room by expanding rather than by rejecting glyphs", async () => {
    // Control for the test above: rejecting everything would also satisfy it.
    const { createGlyphAtlas } = await import("../../src/renderer/glyph-atlas.ts");
    const atlas = createGlyphAtlas(CHAR_WIDTH, LINE_HEIGHT);
    const initialHeight = atlas.height;

    let valid = 0;
    for (let i = 0; i < GLYPH_COUNT; i++) {
      if (atlas.getGlyph(codePointAt(i)).valid) valid++;
    }

    expect(valid).toBe(GLYPH_COUNT);
    expect(atlas.height).toBeGreaterThan(initialHeight);
  });

  it("stops expanding at maxSize and reports the overflow as invalid", async () => {
    // Also guards termination: the packing loop must not spin when _expand()
    // can no longer grow the atlas.
    const { GlyphAtlas } = await import("../../src/renderer/glyph-atlas.ts");
    const atlas = new GlyphAtlas({
      charWidth: CHAR_WIDTH,
      lineHeight: LINE_HEIGHT,
      fontFamily: "monospace",
      fontSize: 16,
      initialWidth: 64,
      initialHeight: 64,
      maxSize: 64,
    });

    let sawInvalid = false;
    for (let i = 0; i < 500; i++) {
      if (!atlas.getGlyph(codePointAt(i)).valid) {
        sawInvalid = true;
        break;
      }
    }

    expect(sawInvalid).toBe(true);
    expect(atlas.width).toBe(64);
    expect(atlas.height).toBe(64);
  });
});

describe("WebGpuRenderer availability check", () => {
  it("isWebGpuAvailable returns boolean", async () => {
    const { isWebGpuAvailable } = await import("../../src/renderer/webgpu.ts");
    const available = isWebGpuAvailable();
    expect(typeof available).toBe("boolean");
  });

  it("isWebGpuAvailable returns false in non-browser environment", async () => {
    // In Node/Bun without WebGPU, this should return false
    const { isWebGpuAvailable } = await import("../../src/renderer/webgpu.ts");
    if (typeof navigator === "undefined" || !navigator.gpu) {
      expect(isWebGpuAvailable()).toBe(false);
    }
  });
});

describe("Renderer factory", () => {
  it("exports createRenderer function", async () => {
    const { createRenderer } = await import("../../src/renderer/index.ts");
    expect(typeof createRenderer).toBe("function");
  });

  it("exports RendererBackend type values", async () => {
    // Just verify the module exports successfully
    const mod = await import("../../src/renderer/index.ts");
    expect(mod.createDomRenderer).toBeDefined();
    expect(mod.WebGpuRenderer).toBeDefined();
    expect(mod.isWebGpuAvailable).toBeDefined();
    expect(mod.GlyphAtlas).toBeDefined();
    expect(mod.createGlyphAtlas).toBeDefined();
  });
});
