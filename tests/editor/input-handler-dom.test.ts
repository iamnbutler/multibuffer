/**
 * DOM-based tests for InputHandler class (issue #171).
 *
 * These tests use happy-dom to provide a DOM environment for testing:
 * - mount() / unmount()
 * - focus() / blur() / hasFocus
 * - _handleInput (via textarea input events)
 * - _handlePaste (via paste events)
 *
 * The pure logic (keyEventToCommand, normalizeKey, resolveKeyBinding) is tested
 * separately in input-handler.test.ts and keymap.test.ts.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import type { CommandCallback, InputHandlerOptions } from "../../src/editor/input-handler.ts";
import type { EditorCommand } from "../../src/editor/types.ts";

// ── happy-dom setup ─────────────────────────────────────────────────────────

// Create a new happy-dom window for each test file
const win = new Window({ url: "https://localhost:8080/" });
const doc = win.document;

// Set up globals required by InputHandler.
// We use `as unknown as Record<string, unknown>` to avoid `noExplicitAny`,
// then only suppress `no-type-assertion` per rule.
// biome-ignore lint/plugin/no-type-assertion: expect: globalThis extension for DOM APIs requires type assertion
(globalThis as unknown as Record<string, unknown>).document = doc;
// biome-ignore lint/plugin/no-type-assertion: expect: globalThis extension for DOM APIs requires type assertion
(globalThis as unknown as Record<string, unknown>).HTMLElement = win.HTMLElement;
// biome-ignore lint/plugin/no-type-assertion: expect: globalThis extension for DOM APIs requires type assertion
(globalThis as unknown as Record<string, unknown>).HTMLTextAreaElement = win.HTMLTextAreaElement;
// biome-ignore lint/plugin/no-type-assertion: expect: globalThis extension for DOM APIs requires type assertion
(globalThis as unknown as Record<string, unknown>).KeyboardEvent = win.KeyboardEvent;
// biome-ignore lint/plugin/no-type-assertion: expect: globalThis extension for DOM APIs requires type assertion
(globalThis as unknown as Record<string, unknown>).ClipboardEvent = win.ClipboardEvent;
// biome-ignore lint/plugin/no-type-assertion: expect: globalThis extension for DOM APIs requires type assertion
(globalThis as unknown as Record<string, unknown>).DataTransfer = win.DataTransfer;
// biome-ignore lint/plugin/no-type-assertion: expect: globalThis extension for DOM APIs requires type assertion
(globalThis as unknown as Record<string, unknown>).Event = win.Event;
// biome-ignore lint/plugin/no-type-assertion: expect: globalThis extension for DOM APIs requires type assertion
(globalThis as unknown as Record<string, unknown>).navigator = win.navigator;

// Dynamic import: InputHandler must be imported AFTER the globals above are
// set, because `_isMac` is a module-level constant captured on first evaluation
// of input-handler.ts. A static import would evaluate the module before the
// globals exist, causing `_isMac` to read an undefined `navigator`.
//
// NOTE: If another test file statically imports input-handler.ts first (e.g.
// input-handler.test.ts), the module will already be cached with the real
// navigator. We use normalizeKey to detect the effective _isMac state.
const { InputHandler, normalizeKey } = await import("../../src/editor/input-handler.ts");

// Detect the effective _isMac state by checking how normalizeKey treats metaKey.
// If _isMac is true, Mod maps to metaKey; otherwise to ctrlKey.
const _testModKey: "metaKey" | "ctrlKey" = (() => {
  // biome-ignore lint/plugin/no-type-assertion: expect: minimal mock to detect _isMac state via normalizeKey
  const probe = normalizeKey({ metaKey: true, ctrlKey: false, altKey: false, shiftKey: false, key: "a" } as unknown as KeyboardEvent);
  return probe.startsWith("Mod") ? "metaKey" : "ctrlKey";
})();

// ── Test helpers ────────────────────────────────────────────────────────────

/** Create a container element for mounting the InputHandler. */
function createContainer(): HTMLElement {
  const container = doc.createElement("div");
  doc.body.appendChild(container);
  // biome-ignore lint/plugin/no-type-assertion: expect: happy-dom element cast to native type for InputHandler compatibility
  return container as unknown as HTMLElement;
}

/** Cleanup container from DOM. */
function removeContainer(container: HTMLElement): void {
  container.remove();
}

/** Create a collector for commands dispatched by InputHandler. */
function createCommandCollector(): {
  commands: EditorCommand[];
  callback: CommandCallback;
} {
  const commands: EditorCommand[] = [];
  const callback: CommandCallback = (cmd) => commands.push(cmd);
  return { commands, callback };
}

/** Get the textarea element from a container. */
function getTextarea(container: HTMLElement): HTMLTextAreaElement | null {
  // Use getElementsByTagName instead of querySelector due to happy-dom limitations
  const textareas = container.getElementsByTagName("textarea");
  // biome-ignore lint/plugin/no-type-assertion: expect: DOM element type narrowing
  return textareas.length > 0 ? (textareas[0] as unknown as HTMLTextAreaElement) : null;
}

/** Get all textarea elements from a container. */
function getAllTextareas(container: HTMLElement): HTMLCollectionOf<Element> {
  return container.getElementsByTagName("textarea");
}

/**
 * Create a keyboard event suitable for testing.
 */
function createKeyboardEvent(
  type: "keydown" | "keyup",
  key: string,
  opts: {
    ctrlKey?: boolean;
    metaKey?: boolean;
    altKey?: boolean;
    shiftKey?: boolean;
  } = {},
): KeyboardEvent {
  // biome-ignore lint/plugin/no-type-assertion: expect: happy-dom KeyboardEvent cast
  return new win.KeyboardEvent(type, {
    key,
    ctrlKey: opts.ctrlKey ?? false,
    metaKey: opts.metaKey ?? false,
    altKey: opts.altKey ?? false,
    shiftKey: opts.shiftKey ?? false,
    bubbles: true,
    cancelable: true,
  }) as unknown as KeyboardEvent;
}

/**
 * Create a keyboard event with the platform-correct Mod key (Cmd on Mac, Ctrl elsewhere).
 * Use this instead of manually setting ctrlKey/metaKey for Mod bindings.
 */
function createModKeyboardEvent(
  type: "keydown" | "keyup",
  key: string,
  opts: { altKey?: boolean; shiftKey?: boolean } = {},
): KeyboardEvent {
  return createKeyboardEvent(type, key, {
    [_testModKey]: true,
    altKey: opts.altKey,
    shiftKey: opts.shiftKey,
  });
}

/**
 * Create a clipboard event with text data.
 */
function createPasteEvent(text: string): ClipboardEvent {
  const clipboardData = new win.DataTransfer();
  clipboardData.setData("text/plain", text);
  // biome-ignore lint/plugin/no-type-assertion: expect: happy-dom ClipboardEvent cast
  return new win.ClipboardEvent("paste", {
    clipboardData,
    bubbles: true,
    cancelable: true,
  }) as unknown as ClipboardEvent;
}

// ── mount() / unmount() ─────────────────────────────────────────────────────

describe("InputHandler mount/unmount", () => {
  let container: HTMLElement;
  let collector: ReturnType<typeof createCommandCollector>;
  let handler: InstanceType<typeof InputHandler>;

  beforeEach(() => {
    container = createContainer();
    collector = createCommandCollector();
    handler = new InputHandler(collector.callback);
  });

  afterEach(() => {
    handler.unmount();
    removeContainer(container);
  });

  test("mount() creates a hidden textarea in the container", () => {
    handler.mount(container);
    const textarea = getTextarea(container);
    expect(textarea).not.toBeNull();
  });

  test("mounted textarea has correct attributes", () => {
    handler.mount(container);
    const textarea = getTextarea(container);
    expect(textarea?.getAttribute("autocomplete")).toBe("off");
    expect(textarea?.getAttribute("autocorrect")).toBe("off");
    expect(textarea?.getAttribute("autocapitalize")).toBe("off");
    expect(textarea?.getAttribute("spellcheck")).toBe("false");
    expect(textarea?.getAttribute("tabindex")).toBe("0");
  });

  test("mounted textarea is hidden (positioned off-screen)", () => {
    handler.mount(container);
    const textarea = getTextarea(container);
    // Note: the implementation sets "position:absolute" (no space), but happy-dom
    // normalizes cssText to include a space. This assertion depends on that behavior.
    expect(textarea?.style.cssText).toContain("position: absolute");
    expect(textarea?.style.cssText).toContain("left: -9999px");
  });

  test("unmount() removes the textarea from DOM", () => {
    handler.mount(container);
    expect(getTextarea(container)).not.toBeNull();
    handler.unmount();
    expect(getTextarea(container)).toBeNull();
  });

  test("unmount() before mount() is safe (no-op)", () => {
    expect(() => handler.unmount()).not.toThrow();
  });

  test("multiple mount() calls append additional textareas", () => {
    handler.mount(container);
    handler.mount(container);
    const textareas = getAllTextareas(container);
    // Pin current (defective) behavior: mount() does not guard against double-mounting,
    // so calling it twice appends two textareas. If mount() is made idempotent in the
    // future, update this assertion to toBe(1).
    expect(textareas.length).toBe(2);
  });
});

// ── focus() / blur() / hasFocus ─────────────────────────────────────────────

describe("InputHandler focus/blur/hasFocus", () => {
  let container: HTMLElement;
  let collector: ReturnType<typeof createCommandCollector>;
  let handler: InstanceType<typeof InputHandler>;

  beforeEach(() => {
    container = createContainer();
    collector = createCommandCollector();
    handler = new InputHandler(collector.callback);
    handler.mount(container);
  });

  afterEach(() => {
    handler.unmount();
    removeContainer(container);
  });

  test("focus() focuses the hidden textarea", () => {
    handler.focus();
    const textarea = getTextarea(container);
    expect(textarea).not.toBeNull();
    // biome-ignore lint/plugin/no-type-assertion: expect: happy-dom/native type compatibility check
    expect(doc.activeElement === (textarea as unknown)).toBe(true);
  });

  test("blur() blurs the textarea", () => {
    handler.focus();
    handler.blur();
    const textarea = getTextarea(container);
    expect(textarea).not.toBeNull();
    // biome-ignore lint/plugin/no-type-assertion: expect: happy-dom/native type compatibility check
    expect(doc.activeElement === (textarea as unknown)).toBe(false);
  });

  test("hasFocus returns true when textarea is focused", () => {
    handler.focus();
    expect(handler.hasFocus).toBe(true);
  });

  test("hasFocus returns false when textarea is not focused", () => {
    expect(handler.hasFocus).toBe(false);
  });

  test("hasFocus returns false after blur()", () => {
    handler.focus();
    expect(handler.hasFocus).toBe(true);
    handler.blur();
    expect(handler.hasFocus).toBe(false);
  });

  test("focus() before mount() is safe (no-op)", () => {
    const unmountedHandler = new InputHandler(collector.callback);
    expect(() => unmountedHandler.focus()).not.toThrow();
  });

  test("blur() before mount() is safe (no-op)", () => {
    const unmountedHandler = new InputHandler(collector.callback);
    expect(() => unmountedHandler.blur()).not.toThrow();
  });
});

// ── keydown event handling ──────────────────────────────────────────────────

describe("InputHandler keydown events", () => {
  let container: HTMLElement;
  let collector: ReturnType<typeof createCommandCollector>;
  let handler: InstanceType<typeof InputHandler>;

  beforeEach(() => {
    container = createContainer();
    collector = createCommandCollector();
    handler = new InputHandler(collector.callback);
    handler.mount(container);
  });

  afterEach(() => {
    handler.unmount();
    removeContainer(container);
  });

  test("keydown on textarea dispatches command", () => {
    const textarea = getTextarea(container);
    const event = createKeyboardEvent("keydown", "ArrowLeft");
    textarea?.dispatchEvent(event);

    expect(collector.commands).toHaveLength(1);
    expect(collector.commands[0]).toEqual({
      type: "moveCursor",
      direction: "left",
      granularity: "character",
    });
  });

  test("keydown with Mod dispatches correct command", () => {
    const textarea = getTextarea(container);
    const event = createModKeyboardEvent("keydown", "ArrowLeft");
    textarea?.dispatchEvent(event);

    expect(collector.commands).toHaveLength(1);
    expect(collector.commands[0]).toEqual({
      type: "moveCursor",
      direction: "left",
      granularity: "line",
    });
  });

  test("Backspace dispatches deleteBackward", () => {
    const textarea = getTextarea(container);
    const event = createKeyboardEvent("keydown", "Backspace");
    textarea?.dispatchEvent(event);

    expect(collector.commands).toHaveLength(1);
    expect(collector.commands[0]).toEqual({
      type: "deleteBackward",
      granularity: "character",
    });
  });

  test("Enter dispatches insertNewline", () => {
    const textarea = getTextarea(container);
    const event = createKeyboardEvent("keydown", "Enter");
    textarea?.dispatchEvent(event);

    expect(collector.commands).toHaveLength(1);
    expect(collector.commands[0]).toEqual({ type: "insertNewline" });
  });

  test("Tab dispatches insertTab", () => {
    const textarea = getTextarea(container);
    const event = createKeyboardEvent("keydown", "Tab");
    textarea?.dispatchEvent(event);

    expect(collector.commands).toHaveLength(1);
    expect(collector.commands[0]).toEqual({ type: "insertTab" });
  });

  test("Mod+A dispatches selectAll", () => {
    const textarea = getTextarea(container);
    const event = createModKeyboardEvent("keydown", "a");
    textarea?.dispatchEvent(event);

    expect(collector.commands).toHaveLength(1);
    expect(collector.commands[0]).toEqual({ type: "selectAll" });
  });

  test("unbound key (e.g., plain letter) does not dispatch a command", () => {
    const textarea = getTextarea(container);
    const event = createKeyboardEvent("keydown", "f");
    textarea?.dispatchEvent(event);

    // Plain 'f' should not trigger a command — text input goes through the input event
    expect(collector.commands).toHaveLength(0);
  });
});

// ── input event handling (text input / IME) ─────────────────────────────────

describe("InputHandler input events", () => {
  let container: HTMLElement;
  let collector: ReturnType<typeof createCommandCollector>;
  let handler: InstanceType<typeof InputHandler>;

  beforeEach(() => {
    container = createContainer();
    collector = createCommandCollector();
    handler = new InputHandler(collector.callback);
    handler.mount(container);
  });

  afterEach(() => {
    handler.unmount();
    removeContainer(container);
  });

  test("typing text dispatches insertText command", () => {
    const textarea = getTextarea(container);
    if (!textarea) throw new Error("textarea not found");

    // Simulate text input by setting value and dispatching input event
    textarea.value = "hello";
    // biome-ignore lint/plugin/no-type-assertion: expect: happy-dom Event cast
    textarea.dispatchEvent(new win.Event("input", { bubbles: true }) as unknown as Event);

    expect(collector.commands).toHaveLength(1);
    expect(collector.commands[0]).toEqual({ type: "insertText", text: "hello" });
  });

  test("input event clears textarea value after dispatching", () => {
    const textarea = getTextarea(container);
    if (!textarea) throw new Error("textarea not found");

    textarea.value = "test";
    // biome-ignore lint/plugin/no-type-assertion: expect: happy-dom Event cast
    textarea.dispatchEvent(new win.Event("input", { bubbles: true }) as unknown as Event);

    expect(textarea.value).toBe("");
  });

  test("empty input event does not dispatch command", () => {
    const textarea = getTextarea(container);
    if (!textarea) throw new Error("textarea not found");

    textarea.value = "";
    // biome-ignore lint/plugin/no-type-assertion: expect: happy-dom Event cast
    textarea.dispatchEvent(new win.Event("input", { bubbles: true }) as unknown as Event);

    expect(collector.commands).toHaveLength(0);
  });

  test("multiple characters dispatched in single insertText", () => {
    const textarea = getTextarea(container);
    if (!textarea) throw new Error("textarea not found");

    // IME might compose multiple characters before committing
    textarea.value = "world";
    // biome-ignore lint/plugin/no-type-assertion: expect: happy-dom Event cast
    textarea.dispatchEvent(new win.Event("input", { bubbles: true }) as unknown as Event);

    expect(collector.commands).toHaveLength(1);
    expect(collector.commands[0]).toEqual({ type: "insertText", text: "world" });
  });
});

// ── paste event handling ────────────────────────────────────────────────────

describe("InputHandler paste events", () => {
  let container: HTMLElement;
  let collector: ReturnType<typeof createCommandCollector>;
  let handler: InstanceType<typeof InputHandler>;

  beforeEach(() => {
    container = createContainer();
    collector = createCommandCollector();
    handler = new InputHandler(collector.callback);
    handler.mount(container);
  });

  afterEach(() => {
    handler.unmount();
    removeContainer(container);
  });

  test("paste event dispatches paste command", () => {
    const textarea = getTextarea(container);
    if (!textarea) throw new Error("textarea not found");

    const event = createPasteEvent("pasted text");
    textarea.dispatchEvent(event);

    expect(collector.commands).toHaveLength(1);
    expect(collector.commands[0]).toEqual({ type: "paste", text: "pasted text" });
  });

  test("paste with multiline text", () => {
    const textarea = getTextarea(container);
    if (!textarea) throw new Error("textarea not found");

    const event = createPasteEvent("line1\nline2\nline3");
    textarea.dispatchEvent(event);

    expect(collector.commands).toHaveLength(1);
    expect(collector.commands[0]).toEqual({
      type: "paste",
      text: "line1\nline2\nline3",
    });
  });

  test("paste with empty text does not dispatch command", () => {
    const textarea = getTextarea(container);
    if (!textarea) throw new Error("textarea not found");

    const event = createPasteEvent("");
    textarea.dispatchEvent(event);

    expect(collector.commands).toHaveLength(0);
  });

  test("paste event is prevented (default action blocked)", () => {
    const textarea = getTextarea(container);
    if (!textarea) throw new Error("textarea not found");

    const event = createPasteEvent("test");
    textarea.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });
});

// ── Custom keymap ───────────────────────────────────────────────────────────

describe("InputHandler with custom keymap", () => {
  let container: HTMLElement;
  let collector: ReturnType<typeof createCommandCollector>;

  beforeEach(() => {
    container = createContainer();
    collector = createCommandCollector();
  });

  afterEach(() => {
    removeContainer(container);
  });

  test("custom keymap binding is triggered", () => {
    const options: InputHandlerOptions = {
      keymap: {
        "Mod+S": { type: "custom", action: "save" },
      },
    };
    const handler = new InputHandler(collector.callback, options);
    handler.mount(container);

    const textarea = getTextarea(container);
    const event = createModKeyboardEvent("keydown", "s");
    textarea?.dispatchEvent(event);

    expect(collector.commands).toHaveLength(1);
    expect(collector.commands[0]).toEqual({ type: "custom", action: "save" });

    handler.unmount();
  });

  test("custom keymap null binding disables default", () => {
    const options: InputHandlerOptions = {
      keymap: {
        // Disable Ctrl+Z (undo)
        "Mod+Z": null,
      },
    };
    const handler = new InputHandler(collector.callback, options);
    handler.mount(container);

    const textarea = getTextarea(container);
    const event = createModKeyboardEvent("keydown", "z");
    textarea?.dispatchEvent(event);

    // No command should be dispatched (binding is null = disabled)
    expect(collector.commands).toHaveLength(0);

    handler.unmount();
  });

  test("chord binding (Mod+K Mod+C)", () => {
    const options: InputHandlerOptions = {
      keymap: {
        "Mod+K Mod+C": { type: "custom", action: "commentLine" },
      },
    };
    const handler = new InputHandler(collector.callback, options);
    handler.mount(container);

    const textarea = getTextarea(container);

    // First key: Mod+K (starts chord)
    const event1 = createModKeyboardEvent("keydown", "k");
    textarea?.dispatchEvent(event1);
    expect(collector.commands).toHaveLength(0); // No command yet, waiting for chord completion

    // Second key: Mod+C (completes chord)
    const event2 = createModKeyboardEvent("keydown", "c");
    textarea?.dispatchEvent(event2);
    expect(collector.commands).toHaveLength(1);
    expect(collector.commands[0]).toEqual({ type: "custom", action: "commentLine" });

    handler.unmount();
  });
});

// ── Chord cancellation ──────────────────────────────────────────────────────

describe("InputHandler chord cancellation", () => {
  let container: HTMLElement;
  let collector: ReturnType<typeof createCommandCollector>;

  beforeEach(() => {
    container = createContainer();
    collector = createCommandCollector();
  });

  afterEach(() => {
    removeContainer(container);
  });

  test("blur() cancels a pending chord", () => {
    const options: InputHandlerOptions = {
      keymap: {
        "Mod+K Mod+C": { type: "custom", action: "commentLine" },
      },
    };
    const handler = new InputHandler(collector.callback, options);
    handler.mount(container);

    const textarea = getTextarea(container);

    // Start chord: Mod+K
    const event1 = createModKeyboardEvent("keydown", "k");
    textarea?.dispatchEvent(event1);
    expect(collector.commands).toHaveLength(0);

    // Blur should clear the pending chord via _clearChord()
    handler.focus();
    handler.blur();

    // Now press Mod+C — should NOT complete the chord (it was cancelled)
    handler.focus();
    const event2 = createModKeyboardEvent("keydown", "c");
    textarea?.dispatchEvent(event2);

    // Mod+C alone maps to "copy" in the default keymap, not "commentLine"
    expect(collector.commands).toHaveLength(1);
    expect(collector.commands[0]).toEqual({ type: "copy" });

    handler.unmount();
  });

  test("chord auto-resets after 1500ms timeout", async () => {
    const options: InputHandlerOptions = {
      keymap: {
        "Mod+K Mod+C": { type: "custom", action: "commentLine" },
      },
    };
    const handler = new InputHandler(collector.callback, options);
    handler.mount(container);

    const textarea = getTextarea(container);

    // Start chord: Mod+K
    const event1 = createModKeyboardEvent("keydown", "k");
    textarea?.dispatchEvent(event1);
    expect(collector.commands).toHaveLength(0);

    // Wait for the 1500ms chord timeout to expire
    await new Promise((resolve) => setTimeout(resolve, 1600));

    // Now press Mod+C — chord should have been auto-reset
    const event2 = createModKeyboardEvent("keydown", "c");
    textarea?.dispatchEvent(event2);

    // Mod+C alone maps to "copy" in the default keymap, not "commentLine"
    expect(collector.commands).toHaveLength(1);
    expect(collector.commands[0]).toEqual({ type: "copy" });

    handler.unmount();
  });
});

// ── Event listener cleanup ──────────────────────────────────────────────────

describe("InputHandler event listener cleanup", () => {
  test("unmount removes event listeners (no double-dispatch)", () => {
    const container = createContainer();
    const collector = createCommandCollector();
    const handler = new InputHandler(collector.callback);

    handler.mount(container);
    const textarea = getTextarea(container);

    // Dispatch once
    const event1 = createKeyboardEvent("keydown", "ArrowUp");
    textarea?.dispatchEvent(event1);
    expect(collector.commands).toHaveLength(1);

    // Unmount
    handler.unmount();

    // Remount
    handler.mount(container);
    const newTextarea = getTextarea(container);

    // Dispatch again
    const event2 = createKeyboardEvent("keydown", "ArrowDown");
    newTextarea?.dispatchEvent(event2);

    // Should have exactly 2 commands (not duplicated due to stale listeners)
    expect(collector.commands).toHaveLength(2);

    handler.unmount();
    removeContainer(container);
  });
});
