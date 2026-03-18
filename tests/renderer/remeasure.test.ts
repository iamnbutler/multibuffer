/**
 * Tests for dynamic font remeasurement API in DomRenderer.
 *
 * Covers:
 * - remeasure() method exists and is callable
 * - getCharWidth() method returns measured/default charWidth
 * - API contract for font remeasurement
 *
 * Note: Actual DOM font measurement behavior is tested via Playwright (e2e).
 * These tests verify the API contract without requiring a full DOM environment.
 */

import { describe, expect, test } from "bun:test";
import { createDomRenderer } from "../../src/renderer/dom.ts";
import type { Measurements } from "../../src/renderer/types.ts";

describe("DomRenderer.remeasure() API", () => {
  const baseMeasurements: Measurements = {
    lineHeight: 20,
    gutterWidth: 48,
  };

  test("remeasure() method exists on DomRenderer", () => {
    const renderer = createDomRenderer(baseMeasurements);
    expect(typeof renderer.remeasure).toBe("function");
  });

  test("remeasure() is safe to call before mount (no-op)", () => {
    const renderer = createDomRenderer(baseMeasurements);
    // Should not throw, just be a no-op since there's no container
    expect(() => renderer.remeasure()).not.toThrow();
  });
});

describe("DomRenderer.getCharWidth() API", () => {
  const baseMeasurements: Measurements = {
    lineHeight: 20,
    gutterWidth: 48,
  };

  test("getCharWidth() method exists on DomRenderer", () => {
    const renderer = createDomRenderer(baseMeasurements);
    expect(typeof renderer.getCharWidth).toBe("function");
  });

  test("getCharWidth() returns default value before mount", () => {
    const renderer = createDomRenderer(baseMeasurements);
    const charWidth = renderer.getCharWidth();
    expect(typeof charWidth).toBe("number");
    expect(charWidth).toBeGreaterThan(0);
    // Default is 8 when no charWidth is provided
    expect(charWidth).toBe(8);
  });

  test("getCharWidth() uses provided charWidth from measurements as initial value", () => {
    const customMeasurements: Measurements = {
      lineHeight: 20,
      gutterWidth: 48,
      charWidth: 9.5,
    };
    const renderer = createDomRenderer(customMeasurements);

    // Should use the provided charWidth as initial value
    expect(renderer.getCharWidth()).toBe(9.5);
  });

  test("getCharWidth() returns a positive number", () => {
    const renderer = createDomRenderer(baseMeasurements);
    const charWidth = renderer.getCharWidth();
    expect(charWidth).toBeGreaterThan(0);
  });
});

describe("Renderer interface", () => {
  test("remeasure is optional on Renderer interface", () => {
    // This is a compile-time check - if it compiles, the contract is correct
    // The Renderer interface doesn't require remeasure() since not all
    // renderers (Canvas, WebGPU) may need it
    const renderer = createDomRenderer({ lineHeight: 20, gutterWidth: 48 });
    // DomRenderer implements remeasure()
    expect(typeof renderer.remeasure).toBe("function");
  });
});
