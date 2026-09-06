/**
 * Tests for excerpt header placement in the diff view.
 *
 * An excerpt header does not sit *above* the excerpt it labels — it takes
 * over the row before it, which is meant to be the previous excerpt's
 * trailing-newline row. A diff MultiBuffer's excerpts are adjacent slices of
 * the same file (delete / insert / context groups) and have no trailing
 * newline, so that row holds real text and a header drawn there replaces the
 * line instead of accompanying it.
 *
 * These tests mount the real DiffEditorView under happy-dom rather than
 * asserting on the header list, because the loss is only observable in the
 * rendered output.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { createDiffEditorView, resetDiffEditorViewCounter } from "../../src/diff/diff-editor-view.ts";
import type { Decoration } from "../../src/renderer/types.ts";
import { mbRow, resetCounters } from "../helpers.ts";

const OLD_TEXT = "alpha\nbravo\ncharlie\ndelta\necho\nfoxtrot\ngolf\nhotel\nindia\njuliet\nkilo\nlima\nmike\n";
const NEW_TEXT = "alpha\nBRAVO\ncharlie\ndelta\necho\nfoxtrot\ngolf\nhotel\nindia\njuliet\nkilo\nLIMA\nmike\n";

/** Every line either side of the diff should survive to the rendered output. */
const CONTENT_LINES = [
  "alpha",
  "bravo",
  "BRAVO",
  "charlie",
  "delta",
  "echo",
  "india",
  "juliet",
  "kilo",
  "lima",
  "LIMA",
  "mike",
];

let originalDocument: typeof globalThis.document;
let originalWindow: typeof globalThis.window;
let originalRaf: typeof globalThis.requestAnimationFrame;
let originalCancelRaf: typeof globalThis.cancelAnimationFrame;
let happyWindow: Window;

function setupDOM(): void {
  happyWindow = new Window({ width: 800, height: 600 });
  originalDocument = globalThis.document;
  originalWindow = globalThis.window;
  originalRaf = globalThis.requestAnimationFrame;
  originalCancelRaf = globalThis.cancelAnimationFrame;
  // biome-ignore lint/plugin/no-type-assertion: expect: happy-dom window/document assignment
  globalThis.document = happyWindow.document as unknown as Document;
  Object.defineProperty(globalThis, "window", {
    value: happyWindow,
    writable: true,
    configurable: true,
  });
  // Run scheduled renders synchronously so assertions see the final DOM.
  Object.defineProperty(globalThis, "requestAnimationFrame", {
    value: (cb: () => void) => {
      cb();
      return 1;
    },
    writable: true,
    configurable: true,
  });
  Object.defineProperty(globalThis, "cancelAnimationFrame", {
    value: () => {},
    writable: true,
    configurable: true,
  });
  // happy-dom reports 0 for layout boxes; the renderer sizes its viewport from
  // the scroll container, and a 0px viewport renders no rows at all.
  Object.defineProperty(happyWindow.HTMLElement.prototype, "clientHeight", {
    get() {
      return 600;
    },
    configurable: true,
  });
  Object.defineProperty(happyWindow.HTMLElement.prototype, "clientWidth", {
    get() {
      return 800;
    },
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
  Object.defineProperty(globalThis, "requestAnimationFrame", {
    value: originalRaf,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(globalThis, "cancelAnimationFrame", {
    value: originalCancelRaf,
    writable: true,
    configurable: true,
  });
  happyWindow.close();
}

describe("diff view excerpt headers", () => {
  let container: HTMLElement;

  beforeEach(() => {
    resetCounters();
    resetDiffEditorViewCounter();
    setupDOM();
    container = document.createElement("div");
    container.style.width = "800px";
    container.style.height = "600px";
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
    teardownDOM();
  });

  /**
   * Mount a diff view and return its rendered text.
   *
   * `remeasure()` runs the renderer's own scroll/render path, which is what
   * gives the viewport a non-zero height; the decoration update then drives
   * DiffEditorView's render path, which builds the header list under test.
   */
  function renderDiffView(): string {
    const view = createDiffEditorView(container, OLD_TEXT, NEW_TEXT, { readOnly: true });
    view.renderer.remeasure();
    const decoration: Decoration = {
      range: {
        start: { row: mbRow(0), column: 0 },
        end: { row: mbRow(0), column: 0 },
      },
      className: "probe",
    };
    view.setDecorations("probe", [decoration]);
    const rendered = container.textContent ?? "";
    view.destroy();
    return rendered;
  }

  test("renders every line of both sides of the diff", () => {
    const rendered = renderDiffView();

    for (const line of CONTENT_LINES) {
      expect(rendered).toContain(line);
    }
  });

  test("does not replace diff rows with internal buffer-id headers", () => {
    const rendered = renderDiffView();

    // Excerpt headers label a path. The diff view's excerpts are internal
    // scratch buffers, so any header it emits leaks an internal id.
    expect(rendered).not.toContain("diff-old-");
    expect(rendered).not.toContain("diff-new-");
    expect(rendered).not.toContain("__hunk_separator_");
  });

  test("keeps the hunk separator's own text visible", () => {
    const rendered = renderDiffView();

    expect(rendered).toContain("@@ -9,6 +9,6 @@");
  });
});
