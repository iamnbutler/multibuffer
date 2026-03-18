/**
 * Tests for GlyphAtlas.
 *
 * Note: The GlyphAtlas requires browser APIs (OffscreenCanvas or document).
 * These tests will be skipped in non-browser environments.
 */

import { describe, expect, it } from "bun:test";

// Check if we're in a browser-like environment
const hasBrowserApis =
  typeof OffscreenCanvas !== "undefined" || typeof document !== "undefined";

describe.skipIf(!hasBrowserApis)("GlyphAtlas (browser environment)", () => {
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
