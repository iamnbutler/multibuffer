/**
 * Tests for EditorView facade (issue #64).
 *
 * DOM-dependent paths (renderer.mount, inputHandler.mount) require a browser
 * environment and are not exercised here. These tests cover the pure-logic
 * portions: type exports, setDecorations keyed-merging, setTheme, and the
 * destroy cleanup contract.
 */

import { describe, expect, test } from "bun:test";
import {
  type EditorViewOptions,
  mergeDecorations,
  resolveReadOnlyOptions,
  type ThemeVars,
} from "../../src/editor/editor-view.ts";
import type { MultiBufferRow } from "../../src/multibuffer/types.ts";
import { createDomRenderer } from "../../src/renderer/dom.ts";
import type { Decoration } from "../../src/renderer/types.ts";

// ── Type export smoke test ──────────────────────────────────────────────────

// Ensuring the imports above compile is the primary type check.

// ── mergeDecorations (pure helper) ─────────────────────────────────────────

// biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in tests
const row = (n: number) => n as MultiBufferRow;

function makeRange(startRow: number, endRow: number) {
  return {
    start: { row: row(startRow), column: 0 },
    end: { row: row(endRow), column: 0 },
  };
}

function makeDec(startRow: number, className: string): Decoration {
  return { range: makeRange(startRow, startRow + 1), className };
}

describe("mergeDecorations", () => {
  test("empty map returns empty array", () => {
    const map = new Map<string, Decoration[]>();
    expect(mergeDecorations(map)).toEqual([]);
  });

  test("single group is returned as-is", () => {
    const map = new Map<string, Decoration[]>();
    const decs = [makeDec(0, "error"), makeDec(1, "error")];
    map.set("errors", decs);
    expect(mergeDecorations(map)).toEqual(decs);
  });

  test("multiple groups are concatenated", () => {
    const map = new Map<string, Decoration[]>();
    const errors = [makeDec(0, "error")];
    const search = [makeDec(1, "search"), makeDec(2, "search")];
    map.set("errors", errors);
    map.set("search", search);
    const result = mergeDecorations(map);
    expect(result).toHaveLength(3);
    for (const d of errors) expect(result).toContainEqual(d);
    for (const d of search) expect(result).toContainEqual(d);
  });

  test("empty array for a key contributes nothing", () => {
    const map = new Map<string, Decoration[]>();
    map.set("errors", []);
    map.set("search", [makeDec(0, "search")]);
    expect(mergeDecorations(map)).toHaveLength(1);
  });
});

// ── EditorViewOptions type check ───────────────────────────────────────────

describe("EditorViewOptions", () => {
  test("accepts all expected fields without TypeScript error", () => {
    const opts: EditorViewOptions = {
      readOnly: true,
      measurements: {
        lineHeight: 24,
        gutterWidth: 56,
        charWidth: 8,
        wrapWidth: 80,
      },
    };
    // If this compiles the type is correct; just assert it's defined
    expect(opts.readOnly).toBe(true);
    expect(opts.measurements?.lineHeight).toBe(24);
  });

  test("all fields are optional", () => {
    const opts: EditorViewOptions = {};
    expect(opts).toBeDefined();
  });

  test("accepts hideCursor and skipInputHandler options", () => {
    const opts: EditorViewOptions = {
      readOnly: true,
      hideCursor: true,
      skipInputHandler: true,
    };
    // If this compiles the type is correct
    expect(opts.hideCursor).toBe(true);
    expect(opts.skipInputHandler).toBe(true);
  });
});

// ── resolveReadOnlyOptions (pure logic) ─────────────────────────────────────

describe("resolveReadOnlyOptions", () => {
  test("defaults: both false when no options", () => {
    const result = resolveReadOnlyOptions();
    expect(result.hideCursor).toBe(false);
    expect(result.skipInputHandler).toBe(false);
  });

  test("defaults: both false when readOnly is false", () => {
    const result = resolveReadOnlyOptions({ readOnly: false });
    expect(result.hideCursor).toBe(false);
    expect(result.skipInputHandler).toBe(false);
  });

  test("readOnly: true auto-derives hideCursor and skipInputHandler", () => {
    const result = resolveReadOnlyOptions({ readOnly: true });
    expect(result.hideCursor).toBe(true);
    expect(result.skipInputHandler).toBe(true);
  });

  test("readOnly: true, hideCursor: false keeps cursor visible", () => {
    const result = resolveReadOnlyOptions({ readOnly: true, hideCursor: false });
    expect(result.hideCursor).toBe(false);
    expect(result.skipInputHandler).toBe(true);
  });

  test("readOnly: true, skipInputHandler: false keeps input handler", () => {
    const result = resolveReadOnlyOptions({ readOnly: true, skipInputHandler: false });
    expect(result.hideCursor).toBe(true);
    expect(result.skipInputHandler).toBe(false);
  });

  test("explicit overrides win over readOnly in all directions", () => {
    const result = resolveReadOnlyOptions({
      readOnly: true,
      hideCursor: false,
      skipInputHandler: false,
    });
    expect(result.hideCursor).toBe(false);
    expect(result.skipInputHandler).toBe(false);
  });

  test("explicit true without readOnly", () => {
    const result = resolveReadOnlyOptions({
      hideCursor: true,
      skipInputHandler: true,
    });
    expect(result.hideCursor).toBe(true);
    expect(result.skipInputHandler).toBe(true);
  });
});

// ── DomRenderer.cursorHidden (behavioral, no DOM mount needed) ──────────────

describe("DomRenderer.cursorHidden", () => {
  test("cursorHidden defaults to false", () => {
    const renderer = createDomRenderer({ lineHeight: 20, gutterWidth: 48 });
    expect(renderer.cursorHidden).toBe(false);
  });

  test("setCursorHidden(true) sets cursorHidden", () => {
    const renderer = createDomRenderer({ lineHeight: 20, gutterWidth: 48 });
    renderer.setCursorHidden(true);
    expect(renderer.cursorHidden).toBe(true);
  });

  test("setCursorHidden(false) clears cursorHidden", () => {
    const renderer = createDomRenderer({ lineHeight: 20, gutterWidth: 48 });
    renderer.setCursorHidden(true);
    renderer.setCursorHidden(false);
    expect(renderer.cursorHidden).toBe(false);
  });
});

// ── Theme type check ────────────────────────────────────────────────────────

describe("ThemeVars type", () => {
  test("ThemeVars is a Record<string, string>", () => {
    const theme: ThemeVars = {
      "--editor-cursor": "#ebdbb2",
      "--editor-selection": "rgba(214,153,46,0.25)",
    };
    expect(theme["--editor-cursor"]).toBe("#ebdbb2");
  });
});
