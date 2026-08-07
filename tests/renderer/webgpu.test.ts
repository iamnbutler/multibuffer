/**
 * Tests for WebGpuRenderer character-width measurement and hit testing.
 *
 * Uses happy-dom for DOM environment simulation.
 *
 * `WebGpuRenderer.mount()` cannot complete under happy-dom: there is no WebGPU
 * adapter, so `_initWebGpu()` rejects. It does, however, assign `_charWidth`
 * *before* that point, which is the state these tests exercise. In a real
 * browser the same state is reached without any error, by mounting into a
 * container that has no layout yet (detached, `display:none`, or zero-sized) --
 * `getBoundingClientRect().width` is 0 there too.
 *
 * Covers:
 * - Character width falls back to a usable value when measurement yields 0
 * - Hit testing resolves distinct columns rather than collapsing to end-of-line
 * - An explicitly supplied `measurements.charWidth` is still honoured
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { createBuffer } from "../../src/buffer/buffer.ts";
import { createMultiBuffer } from "../../src/multibuffer/multibuffer.ts";
import type { MultiBufferRow } from "../../src/multibuffer/types.ts";
import type { Measurements } from "../../src/renderer/types.ts";
import { WebGpuRenderer } from "../../src/renderer/webgpu.ts";
import { createBufferId, excerptRange } from "../helpers.ts";

const LINE = "hello world"; // 11 characters
const GUTTER = 40;

let happyWindow: Window;
let originalDocument: typeof globalThis.document;
let originalWindow: typeof globalThis.window;
let originalRaf: typeof globalThis.requestAnimationFrame;

beforeEach(() => {
  happyWindow = new Window({ width: 800, height: 600 });
  originalDocument = globalThis.document;
  originalWindow = globalThis.window;
  originalRaf = globalThis.requestAnimationFrame;
  // biome-ignore lint/plugin/no-type-assertion: expect: happy-dom window/document assignment
  globalThis.document = happyWindow.document as unknown as Document;
  Object.defineProperty(globalThis, "window", {
    value: happyWindow,
    writable: true,
    configurable: true,
  });
  // The renderer schedules frames on setSnapshot(); swallow them. Rendering is
  // never reached here because there is no GPU device.
  Object.defineProperty(globalThis, "requestAnimationFrame", {
    value: () => 0,
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  globalThis.document = originalDocument;
  Object.defineProperty(globalThis, "window", {
    value: originalWindow,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(globalThis, "requestAnimationFrame", {
    value: originalRaf,
    writable: true,
    configurable: true,
  });
});

/**
 * Mount a renderer over a single-line document. `mount()` rejects under
 * happy-dom (no WebGPU adapter) after `_charWidth` has been assigned, so the
 * rejection is expected and swallowed.
 */
async function mountRenderer(measurements: Measurements): Promise<WebGpuRenderer> {
  const renderer = new WebGpuRenderer(measurements);
  const container = document.createElement("div");
  document.body.appendChild(container);

  await renderer.mount(container).catch(() => {
    // Expected: WebGPU is unavailable under happy-dom.
  });

  const buffer = createBuffer(createBufferId(), LINE);
  const mb = createMultiBuffer();
  mb.addExcerpt(buffer, excerptRange(0, 1));
  renderer.setSnapshot(mb.snapshot());

  return renderer;
}

describe("WebGpuRenderer character width without container layout", () => {
  test("hit testing does not collapse every x to end-of-line", async () => {
    const renderer = await mountRenderer({ lineHeight: 20, gutterWidth: GUTTER });

    // With charWidth 0 these all resolve to column 11 (the end of the line):
    // the division yields Infinity or NaN, and visualColToCharCol() then walks
    // the whole string. Distinct x positions must map to distinct columns.
    const columns = [44, 60, 100].map((x) => renderer.hitTest(x, 5)?.column);

    expect(columns).not.toEqual([LINE.length, LINE.length, LINE.length]);
    expect(new Set(columns).size).toBe(3);
  });

  test("clicking just past the gutter resolves to an early column", async () => {
    const renderer = await mountRenderer({ lineHeight: 20, gutterWidth: GUTTER });

    // One fallback character-width (8px) past the gutter is column 1.
    expect(renderer.hitTest(GUTTER + 8, 5)?.column).toBe(1);
  });

  test("clicking exactly at the gutter boundary resolves to column 0", async () => {
    const renderer = await mountRenderer({ lineHeight: 20, gutterWidth: GUTTER });

    // x - gutterWidth is 0 here, so a zero charWidth makes this 0/0 = NaN.
    expect(renderer.hitTest(GUTTER, 5)?.column).toBe(0);
  });

  test("columns increase monotonically across the line", async () => {
    const renderer = await mountRenderer({ lineHeight: 20, gutterWidth: GUTTER });

    const columns = [0, 1, 2, 3, 4].map((i) => renderer.hitTest(GUTTER + i * 8, 5)?.column);

    expect(columns).toEqual([0, 1, 2, 3, 4]);
  });

  test("a click far past the end of the line still clamps to line length", async () => {
    const renderer = await mountRenderer({ lineHeight: 20, gutterWidth: GUTTER });

    // Guards against over-correction: the fallback must not let hit testing
    // run past the end of the text.
    expect(renderer.hitTest(GUTTER + 500, 5)?.column).toBe(LINE.length);
  });
});

describe("WebGpuRenderer with a container that reports real layout", () => {
  /**
   * happy-dom reports width 0 for every `getBoundingClientRect()`, which makes
   * "fall back to 8" and "always return 8" indistinguishable. Intercepting the
   * probe span lets one test observe a genuine measurement being preferred.
   */
  async function mountWithMeasuredWidth(measuredCharWidth: number): Promise<WebGpuRenderer> {
    const renderer = new WebGpuRenderer({ lineHeight: 20, gutterWidth: GUTTER });
    const container = document.createElement("div");
    document.body.appendChild(container);

    const realAppendChild = container.appendChild.bind(container);
    Object.defineProperty(container, "appendChild", {
      value: (node: Node) => {
        if (node.textContent === "MMMMMMMMMM") {
          Object.defineProperty(node, "getBoundingClientRect", {
            value: () => ({ width: measuredCharWidth * 10, height: 20 }),
            configurable: true,
          });
        }
        return realAppendChild(node);
      },
      configurable: true,
    });

    await renderer.mount(container).catch(() => {
      // Expected: WebGPU is unavailable under happy-dom.
    });

    const buffer = createBuffer(createBufferId(), LINE);
    const mb = createMultiBuffer();
    mb.addExcerpt(buffer, excerptRange(0, 1));
    renderer.setSnapshot(mb.snapshot());

    return renderer;
  }

  test("a real measurement is preferred over the fallback", async () => {
    const renderer = await mountWithMeasuredWidth(13);

    // 13px per character, deliberately chosen so the columns differ from what
    // the 8px fallback would produce (which would give 3 and 4 here).
    expect(renderer.hitTest(GUTTER + 26, 5)?.column).toBe(2);
    expect(renderer.hitTest(GUTTER + 39, 5)?.column).toBe(3);
  });
});

describe("WebGpuRenderer explicit character width", () => {
  test("an explicitly supplied charWidth is used instead of the fallback", async () => {
    const renderer = await mountRenderer({ lineHeight: 20, gutterWidth: GUTTER, charWidth: 20 });

    // Green before and after the fix -- the explicit value must keep winning
    // over both the measurement and the fallback.
    expect(renderer.hitTest(GUTTER + 20, 5)?.column).toBe(1);
    expect(renderer.hitTest(GUTTER + 60, 5)?.column).toBe(3);
  });

  test("hit testing reports the row it was given", async () => {
    const renderer = await mountRenderer({ lineHeight: 20, gutterWidth: GUTTER });

    // biome-ignore lint/plugin/no-type-assertion: expect: branded type comparison in tests
    expect(renderer.hitTest(GUTTER + 8, 5)?.row).toBe(0 as MultiBufferRow);
  });
});
