/**
 * Keyboard input handler.
 *
 * Uses a hidden textarea to capture text input (IME-compatible).
 * Maps keyboard events to EditorCommands.
 */

import type { EditorCommand, KeyBinding, Keymap } from "./types.ts";

/** Callback invoked when the input handler produces a command. */
export type CommandCallback = (command: EditorCommand) => void;

/** Options for the InputHandler constructor. */
export interface InputHandlerOptions {
  /** Consumer keymap merged on top of built-in defaults. Consumer bindings win. */
  keymap?: Keymap;
}

const _isMac =
  typeof navigator !== "undefined" && navigator.platform.includes("Mac");

/**
 * Normalize a KeyboardEvent to a canonical key string.
 *
 * Format: `[Mod+][Alt+][Shift+]<key>`
 * - `Mod` = Cmd on macOS, Ctrl on Windows/Linux
 * - Single-char keys are normalized to uppercase
 * - Special keys use their `KeyboardEvent.key` name (`ArrowUp`, `Tab`, etc.)
 *
 * @example
 * normalizeKey(e) // ctrl+s → "Mod+S", shift+ArrowUp → "Shift+ArrowUp"
 */
export function normalizeKey(e: KeyboardEvent): string {
  const mod = _isMac ? e.metaKey : e.ctrlKey;
  const parts: string[] = [];
  if (mod) parts.push("Mod");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  const k = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  parts.push(k);
  return parts.join("+");
}

/**
 * Result of looking up a key (or chord continuation) in a keymap.
 */
export interface KeyBindingResult {
  /** Whether the key was handled by the keymap (either matched or is a chord prefix). */
  matched: boolean;
  /**
   * The resolved binding (if matched):
   * - `EditorCommand` — execute this command
   * - `null` — key is disabled (preventDefault, no command)
   * - `undefined` — key starts a chord (pendingChord will be set)
   */
  binding?: KeyBinding;
  /** Updated pending chord state. null means no chord pending. */
  pendingChord: string | null;
}

/**
 * Pure keymap lookup. Handles chord state transitions.
 *
 * @param keymap        - Consumer keymap
 * @param normalizedKey - Normalized current key string
 * @param pendingChord  - Active chord prefix, or null
 * @param chordPrefixes - Set of all single keys that start a chord
 */
export function resolveKeyBinding(
  keymap: Keymap,
  normalizedKey: string,
  pendingChord: string | null,
  chordPrefixes: Set<string>,
): KeyBindingResult {
  // If a chord is pending, try completing it first
  if (pendingChord !== null) {
    const chordKey = `${pendingChord} ${normalizedKey}`;
    if (Object.hasOwn(keymap, chordKey)) {
      return { matched: true, binding: keymap[chordKey], pendingChord: null };
    }
    // Wrong second key — reset chord and fall through to default handling
    return { matched: false, pendingChord: null };
  }

  // Direct keymap match
  if (Object.hasOwn(keymap, normalizedKey)) {
    return { matched: true, binding: keymap[normalizedKey], pendingChord: null };
  }

  // Chord prefix detection
  if (chordPrefixes.has(normalizedKey)) {
    return { matched: true, binding: undefined, pendingChord: normalizedKey };
  }

  return { matched: false, pendingChord: null };
}

/** Compute the set of keys that are first-key prefixes of chord bindings. */
function computeChordPrefixes(keymap: Keymap): Set<string> {
  const prefixes = new Set<string>();
  for (const k of Object.keys(keymap)) {
    const spaceIdx = k.indexOf(" ");
    if (spaceIdx !== -1) {
      prefixes.add(k.slice(0, spaceIdx));
    }
  }
  return prefixes;
}

/**
 * Manages a hidden textarea for text input and maps keyboard events to commands.
 */
export class InputHandler {
  private _textarea: HTMLTextAreaElement | null = null;
  private _onCommand: CommandCallback;
  private _onKeyDown: ((e: KeyboardEvent) => void) | null = null;
  private _onInput: ((e: Event) => void) | null = null;
  private _onPaste: ((e: ClipboardEvent) => void) | null = null;
  private _keymap: Keymap;
  private _chordPrefixes: Set<string>;
  private _pendingChord: string | null = null;
  private _chordTimeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor(onCommand: CommandCallback, options?: InputHandlerOptions) {
    this._onCommand = onCommand;
    this._keymap = options?.keymap ?? {};
    this._chordPrefixes = computeChordPrefixes(this._keymap);
  }

  mount(container: HTMLElement): void {
    const textarea = document.createElement("textarea");
    textarea.style.cssText = [
      "position:absolute",
      "left:-9999px",
      "top:0",
      "width:1px",
      "height:1px",
      "opacity:0",
      "overflow:hidden",
      "resize:none",
      "white-space:pre",
    ].join(";");
    textarea.setAttribute("autocomplete", "off");
    textarea.setAttribute("autocorrect", "off");
    textarea.setAttribute("autocapitalize", "off");
    textarea.setAttribute("spellcheck", "false");
    textarea.setAttribute("tabindex", "0");

    this._textarea = textarea;
    container.appendChild(textarea);

    this._onKeyDown = (e: KeyboardEvent) => this._handleKeyDown(e);
    this._onInput = () => this._handleInput();
    this._onPaste = (e: ClipboardEvent) => this._handlePaste(e);

    textarea.addEventListener("keydown", this._onKeyDown);
    textarea.addEventListener("input", this._onInput);
    textarea.addEventListener("paste", this._onPaste);
  }

  unmount(): void {
    if (this._textarea) {
      if (this._onKeyDown) {
        this._textarea.removeEventListener("keydown", this._onKeyDown);
      }
      if (this._onInput) {
        this._textarea.removeEventListener("input", this._onInput);
      }
      if (this._onPaste) {
        this._textarea.removeEventListener("paste", this._onPaste);
      }
      this._textarea.remove();
    }
    this._textarea = null;
    this._onKeyDown = null;
    this._onInput = null;
    this._onPaste = null;
  }

  focus(): void {
    this._textarea?.focus();
  }

  blur(): void {
    this._clearChord();
    this._textarea?.blur();
  }

  private _clearChord(): void {
    this._pendingChord = null;
    if (this._chordTimeoutId !== null) {
      clearTimeout(this._chordTimeoutId);
      this._chordTimeoutId = null;
    }
  }

  private _startChord(key: string): void {
    this._pendingChord = key;
    if (this._chordTimeoutId !== null) clearTimeout(this._chordTimeoutId);
    this._chordTimeoutId = setTimeout(() => {
      this._pendingChord = null;
      this._chordTimeoutId = null;
    }, 1500);
  }

  get hasFocus(): boolean {
    return document.activeElement === this._textarea;
  }

  private _handleKeyDown(e: KeyboardEvent): void {
    const normalized = normalizeKey(e);
    const result = resolveKeyBinding(
      this._keymap,
      normalized,
      this._pendingChord,
      this._chordPrefixes,
    );

    if (result.pendingChord !== null) {
      // Starting a chord — update state and swallow the key
      this._startChord(result.pendingChord);
      e.preventDefault();
      return;
    }

    // Clear chord state after any key (whether chord completed or reset)
    if (this._pendingChord !== null) this._clearChord();

    if (result.matched) {
      e.preventDefault();
      if (result.binding !== undefined && result.binding !== null) {
        this._onCommand(result.binding);
        if (this._textarea) this._textarea.value = "";
      }
      // binding === null means disabled — preventDefault already done, no command
      return;
    }

    // Fall through to built-in default bindings
    const cmd = keyEventToCommand(e);
    if (cmd) {
      e.preventDefault();
      this._onCommand(cmd);
      // Clear textarea after command (prevents stale input)
      if (this._textarea) this._textarea.value = "";
    }
    // If no command matched, let the input event handle it (for text input / IME)
  }

  private _handleInput(): void {
    if (!this._textarea) return;
    const text = this._textarea.value;
    if (text.length > 0) {
      this._onCommand({ type: "insertText", text });
      this._textarea.value = "";
    }
  }

  private _handlePaste(e: ClipboardEvent): void {
    e.preventDefault();
    const text = e.clipboardData?.getData("text/plain") ?? "";
    if (text.length > 0) {
      this._onCommand({ type: "paste", text });
      if (this._textarea) this._textarea.value = "";
    }
  }
}

/**
 * Map a keyboard event to an EditorCommand, or undefined if not handled.
 */
export function keyEventToCommand(e: KeyboardEvent): EditorCommand | undefined {
  const mod = _isMac ? e.metaKey : e.ctrlKey;
  const alt = e.altKey;
  const shift = e.shiftKey;

  // Don't intercept if both Ctrl and Meta are pressed (system shortcuts)
  if (e.ctrlKey && e.metaKey) return undefined;

  switch (e.key) {
    // ── Navigation ──────────────────────────────────────────────
    //
    // Granularity priority: mod (Cmd/Ctrl) > alt (Opt) > character
    //   Horizontal: mod=line, alt=word, none=character
    //   Vertical:   mod=buffer, none=character

    case "ArrowLeft": {
      const granularity = mod ? "line" : alt ? "word" : "character";
      if (shift) return { type: "extendSelection", direction: "left", granularity };
      return { type: "moveCursor", direction: "left", granularity };
    }

    case "ArrowRight": {
      const granularity = mod ? "line" : alt ? "word" : "character";
      if (shift) return { type: "extendSelection", direction: "right", granularity };
      return { type: "moveCursor", direction: "right", granularity };
    }

    case "ArrowUp": {
      if (alt && shift) return { type: "duplicateLine", direction: "up" };
      if (alt) return { type: "moveLine", direction: "up" };
      const granularity = mod ? "buffer" : "character";
      if (shift) return { type: "extendSelection", direction: "up", granularity };
      return { type: "moveCursor", direction: "up", granularity };
    }

    case "ArrowDown": {
      if (alt && shift) return { type: "duplicateLine", direction: "down" };
      if (alt) return { type: "moveLine", direction: "down" };
      const granularity = mod ? "buffer" : "character";
      if (shift) return { type: "extendSelection", direction: "down", granularity };
      return { type: "moveCursor", direction: "down", granularity };
    }

    case "Home":
      if (shift) {
        return { type: "extendSelection", direction: "left", granularity: mod ? "buffer" : "line" };
      }
      return { type: "moveCursor", direction: "left", granularity: mod ? "buffer" : "line" };

    case "End":
      if (shift) {
        return { type: "extendSelection", direction: "right", granularity: mod ? "buffer" : "line" };
      }
      return { type: "moveCursor", direction: "right", granularity: mod ? "buffer" : "line" };

    case "PageUp":
      if (shift) return { type: "extendSelection", direction: "up", granularity: "page" };
      return { type: "moveCursor", direction: "up", granularity: "page" };

    case "PageDown":
      if (shift) return { type: "extendSelection", direction: "down", granularity: "page" };
      return { type: "moveCursor", direction: "down", granularity: "page" };

    // ── Editing ─────────────────────────────────────────────────
    //
    // Granularity: mod=line, alt=word, none=character

    case "Backspace": {
      const granularity = mod ? "line" : alt ? "word" : "character";
      return { type: "deleteBackward", granularity };
    }

    case "Delete": {
      const granularity = alt ? "word" : "character";
      return { type: "deleteForward", granularity };
    }

    case "k":
      if (mod && shift) return { type: "deleteLine" };
      return undefined;

    case "Enter":
      if (mod && shift) return { type: "insertLineAbove" };
      if (mod) return { type: "insertLineBelow" };
      return { type: "insertNewline" };

    case "Tab":
      if (shift) return { type: "dedentLines" };
      return { type: "insertTab" };

    // ── Shortcuts ───────────────────────────────────────────────

    case "a":
      if (mod) return { type: "selectAll" };
      return undefined;

    case "z":
      if (mod && shift) return { type: "redo" };
      if (mod) return { type: "undo" };
      return undefined;

    case "y":
      if (mod) return { type: "redo" };
      return undefined;

    case "c":
      if (mod) return { type: "copy" };
      return undefined;

    case "x":
      if (mod) return { type: "cut" };
      return undefined;

    case "v":
      // Paste is handled via the paste event, not keydown
      return undefined;

    case "]":
      if (mod) return { type: "indentLines" };
      return undefined;

    case "[":
      if (mod) return { type: "dedentLines" };
      return undefined;

    default:
      return undefined;
  }
}
