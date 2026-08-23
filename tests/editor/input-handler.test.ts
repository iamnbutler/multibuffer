/**
 * Tests for keyEventToCommand — the pure keyboard-to-command mapping in input-handler.ts.
 *
 * The InputHandler class mounts a hidden textarea and requires a DOM; those
 * paths are not tested here.  Only the exported `keyEventToCommand` function
 * is exercised because it is pure logic with no side-effects.
 *
 * isMac is evaluated at module load time from navigator.platform.  Bun exposes
 * navigator.platform (e.g. "MacIntel" on macOS), so _isMac is true on Mac.
 * The `mod()` helper below maps the platform modifier correctly.
 */

import { describe, expect, test } from "bun:test";
import { keyEventToCommand } from "../../src/editor/input-handler.ts";

const _isMac =
  typeof navigator !== "undefined" && navigator.platform.includes("Mac");

/**
 * Minimal keyboard-event-shaped object.
 * keyEventToCommand only reads key / ctrlKey / metaKey / altKey / shiftKey.
 */
function keyEvent(
  key: string,
  opts: {
    ctrlKey?: boolean;
    metaKey?: boolean;
    altKey?: boolean;
    shiftKey?: boolean;
  } = {},
): KeyboardEvent {
  // biome-ignore lint/plugin/no-type-assertion: expect: minimal mock for testing — keyEventToCommand only reads the five properties set here
  return {
    key,
    ctrlKey: opts.ctrlKey ?? false,
    metaKey: opts.metaKey ?? false,
    altKey: opts.altKey ?? false,
    shiftKey: opts.shiftKey ?? false,
  } as unknown as KeyboardEvent;
}

/**
 * Platform-aware modifier helper. Returns the correct modifier flags for the
 * "Mod" key (Cmd on Mac, Ctrl elsewhere), matching what keyEventToCommand checks.
 */
function mod(extra: { shiftKey?: boolean; altKey?: boolean } = {}): {
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
} {
  return {
    ...extra,
    metaKey: _isMac,
    ctrlKey: !_isMac,
  };
}


describe("keyEventToCommand — ArrowLeft", () => {
  test("no modifier → moveCursor character left", () => {
    expect(keyEventToCommand(keyEvent("ArrowLeft"))).toEqual({
      type: "moveCursor", direction: "left", granularity: "character",
    });
  });

  test("Mod → moveCursor line left", () => {
    expect(keyEventToCommand(keyEvent("ArrowLeft", mod()))).toEqual({
      type: "moveCursor", direction: "left", granularity: "line",
    });
  });

  test("Alt → moveCursor word left", () => {
    expect(keyEventToCommand(keyEvent("ArrowLeft", { altKey: true }))).toEqual({
      type: "moveCursor", direction: "left", granularity: "word",
    });
  });

  test("Shift → extendSelection character left", () => {
    expect(keyEventToCommand(keyEvent("ArrowLeft", { shiftKey: true }))).toEqual({
      type: "extendSelection", direction: "left", granularity: "character",
    });
  });

  test("Mod+Shift → extendSelection line left", () => {
    expect(keyEventToCommand(keyEvent("ArrowLeft", mod({ shiftKey: true })))).toEqual({
      type: "extendSelection", direction: "left", granularity: "line",
    });
  });

  test("Alt+Shift → extendSelection word left", () => {
    expect(keyEventToCommand(keyEvent("ArrowLeft", { altKey: true, shiftKey: true }))).toEqual({
      type: "extendSelection", direction: "left", granularity: "word",
    });
  });
});


describe("keyEventToCommand — ArrowRight", () => {
  test("no modifier → moveCursor character right", () => {
    expect(keyEventToCommand(keyEvent("ArrowRight"))).toEqual({
      type: "moveCursor", direction: "right", granularity: "character",
    });
  });

  test("Mod → moveCursor line right", () => {
    expect(keyEventToCommand(keyEvent("ArrowRight", mod()))).toEqual({
      type: "moveCursor", direction: "right", granularity: "line",
    });
  });

  test("Alt → moveCursor word right", () => {
    expect(keyEventToCommand(keyEvent("ArrowRight", { altKey: true }))).toEqual({
      type: "moveCursor", direction: "right", granularity: "word",
    });
  });

  test("Shift → extendSelection character right", () => {
    expect(keyEventToCommand(keyEvent("ArrowRight", { shiftKey: true }))).toEqual({
      type: "extendSelection", direction: "right", granularity: "character",
    });
  });

  test("Mod+Shift → extendSelection line right", () => {
    expect(keyEventToCommand(keyEvent("ArrowRight", mod({ shiftKey: true })))).toEqual({
      type: "extendSelection", direction: "right", granularity: "line",
    });
  });

  test("Alt+Shift → extendSelection word right", () => {
    expect(keyEventToCommand(keyEvent("ArrowRight", { altKey: true, shiftKey: true }))).toEqual({
      type: "extendSelection", direction: "right", granularity: "word",
    });
  });
});


describe("keyEventToCommand — ArrowUp", () => {
  test("no modifier → moveCursor character up", () => {
    expect(keyEventToCommand(keyEvent("ArrowUp"))).toEqual({
      type: "moveCursor", direction: "up", granularity: "character",
    });
  });

  test("Mod → moveCursor buffer up", () => {
    expect(keyEventToCommand(keyEvent("ArrowUp", mod()))).toEqual({
      type: "moveCursor", direction: "up", granularity: "buffer",
    });
  });

  test("Shift → extendSelection character up", () => {
    expect(keyEventToCommand(keyEvent("ArrowUp", { shiftKey: true }))).toEqual({
      type: "extendSelection", direction: "up", granularity: "character",
    });
  });

  test("Mod+Shift → extendSelection buffer up", () => {
    expect(keyEventToCommand(keyEvent("ArrowUp", mod({ shiftKey: true })))).toEqual({
      type: "extendSelection", direction: "up", granularity: "buffer",
    });
  });

  test("Alt → moveLine up", () => {
    expect(keyEventToCommand(keyEvent("ArrowUp", { altKey: true }))).toEqual({
      type: "moveLine", direction: "up",
    });
  });

  test("Alt+Shift → duplicateLine up", () => {
    expect(keyEventToCommand(keyEvent("ArrowUp", { altKey: true, shiftKey: true }))).toEqual({
      type: "duplicateLine", direction: "up",
    });
  });
});


describe("keyEventToCommand — ArrowDown", () => {
  test("no modifier → moveCursor character down", () => {
    expect(keyEventToCommand(keyEvent("ArrowDown"))).toEqual({
      type: "moveCursor", direction: "down", granularity: "character",
    });
  });

  test("Mod → moveCursor buffer down", () => {
    expect(keyEventToCommand(keyEvent("ArrowDown", mod()))).toEqual({
      type: "moveCursor", direction: "down", granularity: "buffer",
    });
  });

  test("Shift → extendSelection character down", () => {
    expect(keyEventToCommand(keyEvent("ArrowDown", { shiftKey: true }))).toEqual({
      type: "extendSelection", direction: "down", granularity: "character",
    });
  });

  test("Alt → moveLine down", () => {
    expect(keyEventToCommand(keyEvent("ArrowDown", { altKey: true }))).toEqual({
      type: "moveLine", direction: "down",
    });
  });

  test("Alt+Shift → duplicateLine down", () => {
    expect(keyEventToCommand(keyEvent("ArrowDown", { altKey: true, shiftKey: true }))).toEqual({
      type: "duplicateLine", direction: "down",
    });
  });

  test("Mod+Shift → extendSelection buffer down", () => {
    expect(keyEventToCommand(keyEvent("ArrowDown", mod({ shiftKey: true })))).toEqual({
      type: "extendSelection", direction: "down", granularity: "buffer",
    });
  });
});


describe("keyEventToCommand — Home / End", () => {
  test("Home → moveCursor line left", () => {
    expect(keyEventToCommand(keyEvent("Home"))).toEqual({
      type: "moveCursor", direction: "left", granularity: "line",
    });
  });

  test("Home + Mod → moveCursor buffer left", () => {
    expect(keyEventToCommand(keyEvent("Home", mod()))).toEqual({
      type: "moveCursor", direction: "left", granularity: "buffer",
    });
  });

  test("Home + Shift → extendSelection line left", () => {
    expect(keyEventToCommand(keyEvent("Home", { shiftKey: true }))).toEqual({
      type: "extendSelection", direction: "left", granularity: "line",
    });
  });

  test("Home + Mod + Shift → extendSelection buffer left", () => {
    expect(keyEventToCommand(keyEvent("Home", mod({ shiftKey: true })))).toEqual({
      type: "extendSelection", direction: "left", granularity: "buffer",
    });
  });

  test("End → moveCursor line right", () => {
    expect(keyEventToCommand(keyEvent("End"))).toEqual({
      type: "moveCursor", direction: "right", granularity: "line",
    });
  });

  test("End + Mod → moveCursor buffer right", () => {
    expect(keyEventToCommand(keyEvent("End", mod()))).toEqual({
      type: "moveCursor", direction: "right", granularity: "buffer",
    });
  });

  test("End + Shift → extendSelection line right", () => {
    expect(keyEventToCommand(keyEvent("End", { shiftKey: true }))).toEqual({
      type: "extendSelection", direction: "right", granularity: "line",
    });
  });

  test("End + Mod + Shift → extendSelection buffer right", () => {
    expect(keyEventToCommand(keyEvent("End", mod({ shiftKey: true })))).toEqual({
      type: "extendSelection", direction: "right", granularity: "buffer",
    });
  });
});


describe("keyEventToCommand — PageUp / PageDown", () => {
  test("PageUp → moveCursor page up", () => {
    expect(keyEventToCommand(keyEvent("PageUp"))).toEqual({
      type: "moveCursor", direction: "up", granularity: "page",
    });
  });

  test("PageUp + Shift → extendSelection page up", () => {
    expect(keyEventToCommand(keyEvent("PageUp", { shiftKey: true }))).toEqual({
      type: "extendSelection", direction: "up", granularity: "page",
    });
  });

  test("PageDown → moveCursor page down", () => {
    expect(keyEventToCommand(keyEvent("PageDown"))).toEqual({
      type: "moveCursor", direction: "down", granularity: "page",
    });
  });

  test("PageDown + Shift → extendSelection page down", () => {
    expect(keyEventToCommand(keyEvent("PageDown", { shiftKey: true }))).toEqual({
      type: "extendSelection", direction: "down", granularity: "page",
    });
  });
});


describe("keyEventToCommand — Backspace / Delete", () => {
  test("Backspace → deleteBackward character", () => {
    expect(keyEventToCommand(keyEvent("Backspace"))).toEqual({
      type: "deleteBackward", granularity: "character",
    });
  });

  test("Backspace + Mod → deleteBackward line", () => {
    expect(keyEventToCommand(keyEvent("Backspace", mod()))).toEqual({
      type: "deleteBackward", granularity: "line",
    });
  });

  test("Backspace + Alt → deleteBackward word", () => {
    expect(keyEventToCommand(keyEvent("Backspace", { altKey: true }))).toEqual({
      type: "deleteBackward", granularity: "word",
    });
  });

  test("Delete → deleteForward character", () => {
    expect(keyEventToCommand(keyEvent("Delete"))).toEqual({
      type: "deleteForward", granularity: "character",
    });
  });

  test("Delete + Alt → deleteForward word", () => {
    expect(keyEventToCommand(keyEvent("Delete", { altKey: true }))).toEqual({
      type: "deleteForward", granularity: "word",
    });
  });
});


describe("keyEventToCommand — Enter / Tab", () => {
  test("Enter → insertNewline", () => {
    expect(keyEventToCommand(keyEvent("Enter"))).toEqual({ type: "insertNewline" });
  });

  test("Mod+Enter → insertLineBelow", () => {
    expect(keyEventToCommand(keyEvent("Enter", mod()))).toEqual({
      type: "insertLineBelow",
    });
  });

  test("Mod+Shift+Enter → insertLineAbove", () => {
    expect(keyEventToCommand(keyEvent("Enter", mod({ shiftKey: true })))).toEqual({
      type: "insertLineAbove",
    });
  });

  test("Tab → insertTab", () => {
    expect(keyEventToCommand(keyEvent("Tab"))).toEqual({ type: "insertTab" });
  });

  test("Shift+Tab → dedentLines", () => {
    expect(keyEventToCommand(keyEvent("Tab", { shiftKey: true }))).toEqual({
      type: "dedentLines",
    });
  });
});


describe("keyEventToCommand — Shortcuts", () => {
  test("Mod+A → selectAll", () => {
    expect(keyEventToCommand(keyEvent("a", mod()))).toEqual({ type: "selectAll" });
  });

  test("Mod+Z → undo", () => {
    expect(keyEventToCommand(keyEvent("z", mod()))).toEqual({ type: "undo" });
  });

  test("Mod+Shift+Z → redo", () => {
    expect(keyEventToCommand(keyEvent("z", mod({ shiftKey: true })))).toEqual({
      type: "redo",
    });
  });

  test("Mod+Y → redo", () => {
    expect(keyEventToCommand(keyEvent("y", mod()))).toEqual({ type: "redo" });
  });

  test("Mod+C → copy", () => {
    expect(keyEventToCommand(keyEvent("c", mod()))).toEqual({ type: "copy" });
  });

  test("Mod+X → cut", () => {
    expect(keyEventToCommand(keyEvent("x", mod()))).toEqual({ type: "cut" });
  });

  test("Mod+V → undefined (paste is handled via the paste event)", () => {
    expect(keyEventToCommand(keyEvent("v", mod()))).toBeUndefined();
  });

  test("Mod+] → indentLines", () => {
    expect(keyEventToCommand(keyEvent("]", mod()))).toEqual({ type: "indentLines" });
  });

  test("Mod+[ → dedentLines", () => {
    expect(keyEventToCommand(keyEvent("[", mod()))).toEqual({ type: "dedentLines" });
  });

  test("Mod+Shift+K → deleteLine", () => {
    expect(keyEventToCommand(keyEvent("k", mod({ shiftKey: true })))).toEqual({
      type: "deleteLine",
    });
  });
});


describe("keyEventToCommand — Returns undefined for unbound keys", () => {
  test("plain letter 'a' (no modifier) → undefined", () => {
    expect(keyEventToCommand(keyEvent("a"))).toBeUndefined();
  });

  test("plain letter 'f' → undefined", () => {
    expect(keyEventToCommand(keyEvent("f"))).toBeUndefined();
  });

  test("Mod+K (no shift) → undefined", () => {
    expect(keyEventToCommand(keyEvent("k", mod()))).toBeUndefined();
  });

  test("Ctrl+Meta+A → undefined (system shortcut guard)", () => {
    expect(keyEventToCommand(keyEvent("a", { ctrlKey: true, metaKey: true }))).toBeUndefined();
  });

  test("F12 → undefined", () => {
    expect(keyEventToCommand(keyEvent("F12"))).toBeUndefined();
  });

  test("Escape → undefined", () => {
    expect(keyEventToCommand(keyEvent("Escape"))).toBeUndefined();
  });
});


// ─── Shifted / Caps Lock letter keys ────────────────────────────
//
// `KeyboardEvent.key` carries the *shifted* character for printable keys: a
// browser reports "K" for Shift+K, never "k".  The `keyEvent()` helper above
// lets a test pass `key: "k"` together with `shiftKey: true`, which is a
// combination no browser produces — so the letter bindings that require Shift
// have to be asserted with the character the browser really sends.

describe("keyEventToCommand — printable keys arrive shifted", () => {
  test("Mod+Shift+K → deleteLine when the browser reports key 'K'", () => {
    expect(keyEventToCommand(keyEvent("K", mod({ shiftKey: true })))).toEqual({
      type: "deleteLine",
    });
  });

  test("Mod+Shift+Z → redo when the browser reports key 'Z'", () => {
    expect(keyEventToCommand(keyEvent("Z", mod({ shiftKey: true })))).toEqual({
      type: "redo",
    });
  });

  // Caps Lock upper-cases the key without setting shiftKey.
  test("Mod+Z → undo with Caps Lock on", () => {
    expect(keyEventToCommand(keyEvent("Z", mod()))).toEqual({ type: "undo" });
  });

  test("Mod+A → selectAll with Caps Lock on", () => {
    expect(keyEventToCommand(keyEvent("A", mod()))).toEqual({ type: "selectAll" });
  });

  test("Mod+C → copy with Caps Lock on", () => {
    expect(keyEventToCommand(keyEvent("C", mod()))).toEqual({ type: "copy" });
  });

  test("Mod+X → cut with Caps Lock on", () => {
    expect(keyEventToCommand(keyEvent("X", mod()))).toEqual({ type: "cut" });
  });

  test("Mod+Y → redo with Caps Lock on", () => {
    expect(keyEventToCommand(keyEvent("Y", mod()))).toEqual({ type: "redo" });
  });

  // Guards: matching upper-case keys must not *widen* the bindings that never
  // took Shift.  These stay undefined, exactly as they are without the fix.
  test("Mod+Shift+A stays unbound", () => {
    expect(keyEventToCommand(keyEvent("A", mod({ shiftKey: true })))).toBeUndefined();
  });

  test("Mod+Shift+C stays unbound", () => {
    expect(keyEventToCommand(keyEvent("C", mod({ shiftKey: true })))).toBeUndefined();
  });

  test("Mod+Shift+X stays unbound", () => {
    expect(keyEventToCommand(keyEvent("X", mod({ shiftKey: true })))).toBeUndefined();
  });

  test("Mod+Shift+Y stays unbound", () => {
    expect(keyEventToCommand(keyEvent("Y", mod({ shiftKey: true })))).toBeUndefined();
  });

  // An unmodified upper-case letter is text input, not a command.
  test("Shift+K alone → undefined (falls through to text input)", () => {
    expect(keyEventToCommand(keyEvent("K", { shiftKey: true }))).toBeUndefined();
  });
});
