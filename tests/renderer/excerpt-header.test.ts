/**
 * Tests for excerpt header row placement in DomRenderer.
 *
 * A header is drawn on the row *before* the excerpt it labels, which is
 * intended to be the previous excerpt's trailing-newline (separator) row.
 * When the previous excerpt has no trailing newline that row holds real
 * text, and rendering a header there replaces the line instead of
 * accompanying it — the line disappears from the output.
 *
 * Uses happy-dom for DOM environment simulation.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { createBuffer } from "../../src/buffer/buffer.ts";
import { createMultiBuffer } from "../../src/multibuffer/multibuffer.ts";
import type { MultiBuffer } from "../../src/multibuffer/types.ts";
import { DomRenderer } from "../../src/renderer/dom.ts";
import type { Measurements } from "../../src/renderer/types.ts";
import { createBufferId, excerptRange, resetCounters } from "../helpers.ts";

const MEASUREMENTS: Measurements = {
  lineHeight: 20,
  charWidth: 8,
  gutterWidth: 40,
};

let originalDocument: typeof globalThis.document;
let originalWindow: typeof globalThis.window;
let happyWindow: Window;

function setupDOM(): void {
  happyWindow = new Window({ width: 800, height: 600 });
  originalDocument = globalThis.document;
  originalWindow = globalThis.window;
  // biome-ignore lint/plugin/no-type-assertion: expect: happy-dom window/document assignment
  globalThis.document = happyWindow.document as unknown as Document;
  Object.defineProperty(globalThis, "window", {
    value: happyWindow,
    writable: true,
    configurable: true,
  });
}

function teardownDOM(): void {
  globalThis.document = originalDocument;
  Object.defineProperty(globalThis, "window", {
    value: originalWindow,
    writable: true,
    configurable: true,
  });
  happyWindow.close();
}

/** Two adjacent excerpts, optionally separated by a trailing-newline row. */
function twoExcerpts(trailingNewline: boolean): MultiBuffer {
  const bufA = createBuffer(createBufferId(), "AAA1\nAAA2");
  const bufB = createBuffer(createBufferId(), "BBB1\nBBB2");
  const mb = createMultiBuffer();
  mb.addExcerpt(
    bufA,
    excerptRange(0, 2),
    trailingNewline ? { hasTrailingNewline: true } : undefined,
  );
  mb.addExcerpt(bufB, excerptRange(0, 2));
  return mb;
}

describe("excerpt header row placement", () => {
  let container: HTMLElement;
  let renderer: DomRenderer;

  beforeEach(() => {
    resetCounters();
    setupDOM();
    container = document.createElement("div");
    container.style.width = "800px";
    container.style.height = "600px";
    document.body.appendChild(container);
    renderer = new DomRenderer(MEASUREMENTS);
  });

  afterEach(() => {
    renderer.unmount();
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
    teardownDOM();
  });

  /**
   * Mount, attach the snapshot and drive the renderer's own header
   * computation. `remeasure()` is the public entry point into the internal
   * scroll/render path, so the headers under test are the ones the renderer
   * builds for itself rather than any supplied by the test.
   */
  function render(mb: MultiBuffer): string {
    renderer.mount(container);
    renderer.setSnapshot(mb.snapshot());
    renderer.remeasure();
    return container.textContent ?? "";
  }

  test("renders every content line when excerpts have no trailing newline", () => {
    const rendered = render(twoExcerpts(false));

    // "AAA2" is the last line of the first excerpt and the row the second
    // excerpt's header is placed on.
    expect(rendered).toContain("AAA1");
    expect(rendered).toContain("AAA2");
    expect(rendered).toContain("BBB1");
    expect(rendered).toContain("BBB2");
  });

  test("renders every content line when excerpts have a trailing newline", () => {
    const rendered = render(twoExcerpts(true));

    expect(rendered).toContain("AAA1");
    expect(rendered).toContain("AAA2");
    expect(rendered).toContain("BBB1");
    expect(rendered).toContain("BBB2");
  });

  test("draws the header on the separator row when one exists", () => {
    const mb = twoExcerpts(true);
    // The second excerpt's buffer id is the header label.
    const secondBufferId = mb.snapshot().excerpts[1]?.bufferId;
    expect(secondBufferId).toBeDefined();

    const rendered = render(mb);

    expect(rendered).toContain(String(secondBufferId));
  });

  test("does not consume a content row when there is no separator row", () => {
    const mb = twoExcerpts(false);
    const secondBufferId = mb.snapshot().excerpts[1]?.bufferId;
    expect(secondBufferId).toBeDefined();

    const rendered = render(mb);

    // Without a trailing-newline row there is nowhere to put the header that
    // does not displace text, so it is skipped rather than hiding a line.
    expect(rendered).not.toContain(String(secondBufferId));
    expect(rendered).toContain("AAA2");
  });

  test("a single excerpt renders no header and keeps every line", () => {
    const buf = createBuffer(createBufferId(), "only1\nonly2");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 2));

    const rendered = render(mb);

    expect(rendered).toContain("only1");
    expect(rendered).toContain("only2");
  });
});
