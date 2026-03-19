/**
 * Tests for React bindings (issue #264).
 *
 * React hooks require a DOM environment and React testing utilities.
 * These tests cover compile-time type checks and verifying exports
 * are accessible. Full integration tests would require happy-dom/jsdom
 * and @testing-library/react.
 */

import { describe, expect, test } from "bun:test";
import type {
  Decoration,
  DiffViewProps,
  EditorViewComponentProps,
  Keymap,
  Measurements,
  Theme,
  UseDiffViewOptions,
  UseEditorViewOptions,
} from "../../src/react/index.ts";
import {
  DiffView,
  EditorViewComponent,
  useDiffView,
  useEditorView,
} from "../../src/react/index.ts";

// Type export smoke tests

describe("React bindings exports", () => {
  test("useEditorView is exported as a function", () => {
    expect(typeof useEditorView).toBe("function");
  });

  test("useDiffView is exported as a function", () => {
    expect(typeof useDiffView).toBe("function");
  });

  test("DiffView is exported", () => {
    expect(DiffView).toBeDefined();
  });

  test("EditorViewComponent is exported", () => {
    expect(EditorViewComponent).toBeDefined();
  });
});

// ── UseEditorViewOptions type check ─────────────────────────────────────────

describe("UseEditorViewOptions", () => {
  test("accepts all expected fields without TypeScript error", () => {
    const opts: UseEditorViewOptions = {
      text: "hello world",
      readOnly: true,
      bracketMatching: true,
      measurements: {
        lineHeight: 20,
        gutterWidth: 48,
        charWidth: 8,
        wrapWidth: 80,
      },
      theme: {
        cursor: "#ffffff",
      },
      decorations: [],
    };
    expect(opts.text).toBe("hello world");
    expect(opts.readOnly).toBe(true);
  });

  test("only text is required", () => {
    const opts: UseEditorViewOptions = { text: "" };
    expect(opts).toBeDefined();
  });
});

// ── UseDiffViewOptions type check ───────────────────────────────────────────

describe("UseDiffViewOptions", () => {
  test("accepts all expected fields without TypeScript error", () => {
    const opts: UseDiffViewOptions = {
      oldText: "hello",
      newText: "world",
      readOnly: true,
      measurements: {
        lineHeight: 20,
        gutterWidth: 96,
      },
      theme: {
        cursor: "#ffffff",
      },
      decorations: [],
      diffOptions: {
        context: 3,
        debounceMs: 150,
      },
    };
    expect(opts.oldText).toBe("hello");
    expect(opts.newText).toBe("world");
    expect(opts.readOnly).toBe(true);
  });

  test("only oldText and newText are required", () => {
    const opts: UseDiffViewOptions = { oldText: "", newText: "" };
    expect(opts).toBeDefined();
  });
});

// ── DiffViewProps type check ────────────────────────────────────────────────

describe("DiffViewProps", () => {
  test("accepts all expected fields without TypeScript error", () => {
    const props: DiffViewProps = {
      oldText: "hello",
      newText: "world",
      readOnly: true,
      style: { height: 400 },
      className: "my-diff-view",
    };
    expect(props.oldText).toBe("hello");
    expect(props.newText).toBe("world");
  });

  test("only oldText and newText are required", () => {
    const props: DiffViewProps = { oldText: "", newText: "" };
    expect(props).toBeDefined();
  });
});

// ── EditorViewComponentProps type check ─────────────────────────────────────

describe("EditorViewComponentProps", () => {
  test("accepts all expected fields without TypeScript error", () => {
    const props: EditorViewComponentProps = {
      text: "hello world",
      readOnly: true,
      style: { height: 400 },
      className: "my-editor",
    };
    expect(props.text).toBe("hello world");
  });

  test("only text is required", () => {
    const props: EditorViewComponentProps = { text: "" };
    expect(props).toBeDefined();
  });
});

// ── Re-exported types type check ────────────────────────────────────────────

describe("Re-exported types", () => {
  test("Decoration type is accessible", () => {
    const dec: Decoration = {
      range: {
        // biome-ignore lint/plugin/no-type-assertion: expect: branded type in test
        start: { row: 0 as import("../../src/multibuffer/types.ts").MultiBufferRow, column: 0 },
        // biome-ignore lint/plugin/no-type-assertion: expect: branded type in test
        end: { row: 1 as import("../../src/multibuffer/types.ts").MultiBufferRow, column: 0 },
      },
      className: "test",
    };
    expect(dec.className).toBe("test");
  });

  test("Measurements type is accessible", () => {
    const m: Measurements = {
      lineHeight: 20,
      gutterWidth: 48,
    };
    expect(m.lineHeight).toBe(20);
  });

  test("Theme type is accessible", () => {
    const t: Partial<Theme> = {
      cursor: "#1d2021",
    };
    expect(t.cursor).toBe("#1d2021");
  });

  test("Keymap type is accessible", () => {
    const k: Keymap = {
      "ctrl+s": { type: "custom", action: "save" },
    };
    expect(k["ctrl+s"]).toBeDefined();
  });
});
