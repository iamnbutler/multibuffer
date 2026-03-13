/**
 * Tests for the keymap system (issue #65).
 *
 * Tests cover:
 * - normalizeKey: canonical string from KeyboardEvent
 * - resolveKeyBinding: pure binding lookup with chord state
 * - Editor dispatch of CustomCommand
 * - InputHandlerOptions type export
 */

import { describe, expect, test } from "bun:test";
import { createBuffer } from "../../src/buffer/buffer.ts";
import { Editor } from "../../src/editor/editor.ts";
import {
  type InputHandlerOptions,
  normalizeKey,
  resolveKeyBinding,
} from "../../src/editor/input-handler.ts";
import type { KeyBinding, Keymap } from "../../src/editor/types.ts";
import { createMultiBuffer } from "../../src/multibuffer/multibuffer.ts";
import {
  createBufferId,
  excerptRange,
  resetCounters,
} from "../helpers.ts";

// ── Helpers ────────────────────────────────────────────────────────────────

/** Create a fake KeyboardEvent with only the fields normalizeKey reads. */
function key(
  k: string,
  opts: {
    metaKey?: boolean;
    ctrlKey?: boolean;
    altKey?: boolean;
    shiftKey?: boolean;
  } = {},
): KeyboardEvent {
  // biome-ignore lint/plugin/no-type-assertion: expect: test-only partial KeyboardEvent mock
  return {
    key: k,
    metaKey: opts.metaKey ?? false,
    ctrlKey: opts.ctrlKey ?? false,
    altKey: opts.altKey ?? false,
    shiftKey: opts.shiftKey ?? false,
  } as KeyboardEvent;
}

function setup() {
  resetCounters();
  const buf = createBuffer(createBufferId(), "hello\nworld");
  const mb = createMultiBuffer();
  mb.addExcerpt(buf, excerptRange(0, 2));
  return new Editor(mb);
}

// ── normalizeKey ───────────────────────────────────────────────────────────

describe("normalizeKey", () => {
  test("single letter key → uppercase", () => {
    expect(normalizeKey(key("s"))).toBe("S");
  });

  test("already uppercase letter → uppercase unchanged", () => {
    expect(normalizeKey(key("S"))).toBe("S");
  });

  test("special key unchanged", () => {
    expect(normalizeKey(key("ArrowUp"))).toBe("ArrowUp");
    expect(normalizeKey(key("Tab"))).toBe("Tab");
    expect(normalizeKey(key("Enter"))).toBe("Enter");
    expect(normalizeKey(key("Backspace"))).toBe("Backspace");
  });

  test("Mod modifier (ctrlKey on non-Mac)", () => {
    // In test environment, isMac is false (navigator.platform undefined)
    expect(normalizeKey(key("s", { ctrlKey: true }))).toBe("Mod+S");
    expect(normalizeKey(key("z", { ctrlKey: true }))).toBe("Mod+Z");
  });

  test("Alt modifier", () => {
    expect(normalizeKey(key("ArrowUp", { altKey: true }))).toBe("Alt+ArrowUp");
  });

  test("Shift modifier", () => {
    expect(normalizeKey(key("ArrowUp", { shiftKey: true }))).toBe("Shift+ArrowUp");
  });

  test("Mod+Shift combination", () => {
    expect(normalizeKey(key("k", { ctrlKey: true, shiftKey: true }))).toBe("Mod+Shift+K");
  });

  test("Mod+Alt+Shift combination", () => {
    expect(normalizeKey(key("ArrowUp", { ctrlKey: true, altKey: true, shiftKey: true }))).toBe(
      "Mod+Alt+Shift+ArrowUp",
    );
  });

  test("digit key", () => {
    expect(normalizeKey(key("1"))).toBe("1");
  });

  test("Escape key", () => {
    expect(normalizeKey(key("Escape"))).toBe("Escape");
  });
});

// ── resolveKeyBinding ──────────────────────────────────────────────────────

describe("resolveKeyBinding", () => {
  const cmd = (type: string): KeyBinding => ({ type: "custom", action: type });

  test("exact match returns binding", () => {
    const keymap: Keymap = { "Mod+S": cmd("save") };
    const chordPrefixes = new Set<string>();
    const result = resolveKeyBinding(keymap, "Mod+S", null, chordPrefixes);
    expect(result.binding).toEqual({ type: "custom", action: "save" });
    expect(result.matched).toBe(true);
    expect(result.pendingChord).toBeNull();
  });

  test("null binding is returned (disable)", () => {
    const keymap: Keymap = { "Mod+Z": null };
    const chordPrefixes = new Set<string>();
    const result = resolveKeyBinding(keymap, "Mod+Z", null, chordPrefixes);
    expect(result.binding).toBeNull();
    expect(result.matched).toBe(true);
  });

  test("no match returns unmatched", () => {
    const keymap: Keymap = { "Mod+S": cmd("save") };
    const chordPrefixes = new Set<string>();
    const result = resolveKeyBinding(keymap, "Mod+Z", null, chordPrefixes);
    expect(result.matched).toBe(false);
  });

  test("chord prefix sets pending chord", () => {
    const keymap: Keymap = { "Mod+K Mod+C": cmd("commentLine") };
    const chordPrefixes = new Set(["Mod+K"]);
    const result = resolveKeyBinding(keymap, "Mod+K", null, chordPrefixes);
    expect(result.matched).toBe(true);
    expect(result.binding).toBeUndefined();
    expect(result.pendingChord).toBe("Mod+K");
  });

  test("chord completion fires binding", () => {
    const keymap: Keymap = { "Mod+K Mod+C": cmd("commentLine") };
    const chordPrefixes = new Set(["Mod+K"]);
    const result = resolveKeyBinding(keymap, "Mod+C", "Mod+K", chordPrefixes);
    expect(result.matched).toBe(true);
    expect(result.binding).toEqual({ type: "custom", action: "commentLine" });
    expect(result.pendingChord).toBeNull();
  });

  test("wrong second key in chord clears pending", () => {
    const keymap: Keymap = { "Mod+K Mod+C": cmd("commentLine") };
    const chordPrefixes = new Set(["Mod+K"]);
    const result = resolveKeyBinding(keymap, "Mod+X", "Mod+K", chordPrefixes);
    // Chord not matched — second key should be handled by default
    expect(result.matched).toBe(false);
    expect(result.pendingChord).toBeNull();
  });

  test("multiple chords with same prefix", () => {
    const keymap: Keymap = {
      "Mod+K Mod+C": cmd("commentLine"),
      "Mod+K Mod+U": cmd("uncommentLine"),
    };
    const chordPrefixes = new Set(["Mod+K"]);
    const resultC = resolveKeyBinding(keymap, "Mod+C", "Mod+K", chordPrefixes);
    expect(resultC.binding).toEqual({ type: "custom", action: "commentLine" });

    const resultU = resolveKeyBinding(keymap, "Mod+U", "Mod+K", chordPrefixes);
    expect(resultU.binding).toEqual({ type: "custom", action: "uncommentLine" });
  });
});

// ── Editor.dispatch CustomCommand ──────────────────────────────────────────

describe("Editor custom command dispatch", () => {
  test("custom command fires onCustomCommand callback", () => {
    const editor = setup();
    const actions: string[] = [];
    editor.onCustomCommand((action) => actions.push(action));
    editor.dispatch({ type: "custom", action: "save" });
    expect(actions).toEqual(["save"]);
  });

  test("custom command does not change text or cursor state", () => {
    const editor = setup();
    const beforeCursor = { ...editor.cursor };
    editor.dispatch({ type: "custom", action: "save" });
    expect(editor.cursor).toEqual(beforeCursor);
  });

  test("onCustomCommand(null) removes callback", () => {
    const editor = setup();
    const actions: string[] = [];
    editor.onCustomCommand((action) => actions.push(action));
    editor.onCustomCommand(null);
    editor.dispatch({ type: "custom", action: "save" });
    expect(actions).toHaveLength(0);
  });

  test("custom command is ignored when no callback registered", () => {
    const editor = setup();
    // Should not throw
    expect(() => editor.dispatch({ type: "custom", action: "save" })).not.toThrow();
  });
});

// ── InputHandlerOptions type ───────────────────────────────────────────────

describe("InputHandlerOptions type", () => {
  test("accepts keymap option", () => {
    const opts: InputHandlerOptions = {
      keymap: {
        "Mod+S": { type: "custom", action: "save" },
      },
    };
    expect(opts.keymap).toBeDefined();
  });

  test("keymap is optional", () => {
    const opts: InputHandlerOptions = {};
    expect(opts.keymap).toBeUndefined();
  });
});
