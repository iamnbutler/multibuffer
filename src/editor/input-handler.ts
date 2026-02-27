/**
 * Keyboard input handler.
 *
 * Uses a hidden textarea to capture text input (IME-compatible).
 * Maps keyboard events to EditorCommands.
 */

import type { EditorCommand } from "./types.ts";

/** Callback invoked when the input handler produces a command. */
export type CommandCallback = (command: EditorCommand) => void;

/**
 * Manages a hidden textarea for text input and maps keyboard events to commands.
 */
export class InputHandler {
  private _textarea: HTMLTextAreaElement | null = null;
  private _onCommand: CommandCallback;
  private _onKeyDown: ((e: KeyboardEvent) => void) | null = null;
  private _onInput: ((e: Event) => void) | null = null;
  private _onPaste: ((e: ClipboardEvent) => void) | null = null;

  constructor(onCommand: CommandCallback) {
    this._onCommand = onCommand;
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
    this._textarea?.blur();
  }

  get hasFocus(): boolean {
    return document.activeElement === this._textarea;
  }

  private _handleKeyDown(e: KeyboardEvent): void {
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

const isMac =
  typeof navigator !== "undefined" && navigator.platform.includes("Mac");

/**
 * Map a keyboard event to an EditorCommand, or undefined if not handled.
 */
export function keyEventToCommand(e: KeyboardEvent): EditorCommand | undefined {
  const mod = isMac ? e.metaKey : e.ctrlKey;
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
      const granularity = mod ? "buffer" : "character";
      if (shift) return { type: "extendSelection", direction: "up", granularity };
      return { type: "moveCursor", direction: "up", granularity };
    }

    case "ArrowDown": {
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
      return { type: "moveCursor", direction: "up", granularity: "page" };

    case "PageDown":
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
      return { type: "insertNewline" };

    case "Tab":
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

    default:
      return undefined;
  }
}
