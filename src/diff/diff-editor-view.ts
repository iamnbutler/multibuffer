/**
 * DiffEditorView: high-level facade for inline (unified) diff editing.
 *
 * Bundles DiffController + Editor + DomRenderer + InputHandler into a single
 * component. Supports live re-diff on edit, keyed decoration groups, and
 * CSS-variable-based theming.
 *
 * @example
 * ```ts
 * const view = createDiffEditorView(container, "old text", "new text");
 * view.setDecorations("errors", [{ range: ..., className: "error" }]);
 * view.setTheme({ "--editor-cursor": "#ffffff" });
 * view.destroy();
 * ```
 */

import { createBuffer } from "../buffer/buffer.ts";
import type { Buffer, BufferId } from "../buffer/types.ts";
import { Editor } from "../editor/editor.ts";
import type { ThemeVars } from "../editor/editor-view.ts";
import { InputHandler } from "../editor/input-handler.ts";
import type { Keymap } from "../editor/types.ts";
import { resolveAnchorRange } from "../multibuffer/anchor.ts";
import type { MultiBufferRow } from "../multibuffer/types.ts";
import { createDomRenderer } from "../renderer/dom.ts";
import type { Decoration, Measurements } from "../renderer/types.ts";
import type { DiffController, DiffControllerOptions } from "./controller.ts";
import { createDiffController } from "./controller.ts";

/** Unique buffer ID counter for diff editor buffers. */
let diffBufferIdCounter = 0;

function createDiffBufferId(prefix: string): BufferId {
  // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction for internal buffer ID
  return `diff-${prefix}-${++diffBufferIdCounter}` as BufferId;
}

/** Reset the buffer ID counter. For testing only. */
export function resetDiffEditorViewCounter(): void {
  diffBufferIdCounter = 0;
}

/** Options for createDiffEditorView. */
export interface DiffEditorViewOptions extends DiffControllerOptions {
  /** Custom measurements. Defaults: lineHeight=20, gutterWidth=48. */
  measurements?: Partial<Measurements>;
  /**
   * Consumer keymap merged on top of built-in defaults. Consumer wins.
   * Use `null` to disable a binding; spaces separate chord keys.
   */
  keymap?: Keymap;
  /**
   * Called when a `{ type: 'custom', action }` command fires from the keymap.
   */
  onCustomCommand?: (action: string) => void;
  /**
   * When true, hide the cursor. Useful for read-only viewers.
   * Default: false (cursor visible). If readOnly is true and this is not
   * explicitly set, cursor is hidden automatically.
   */
  hideCursor?: boolean;
  /**
   * When true, skip mounting the input handler entirely. This prevents
   * the editor from capturing keyboard events, leaving them for the page.
   * Useful for pure read-only viewers. Default: false.
   */
  skipInputHandler?: boolean;
}

/** The DiffEditorView facade — bundles DiffController, Editor, DomRenderer, and InputHandler. */
export interface DiffEditorView {
  /** The underlying DiffController for diff state management. */
  readonly diffController: DiffController;
  /** The underlying Editor instance for advanced use. */
  readonly editor: Editor;
  /** The DOM renderer instance. */
  readonly renderer: ReturnType<typeof createDomRenderer>;
  /**
   * The keyboard/input handler instance.
   * May be undefined if skipInputHandler was true.
   */
  readonly inputHandler: InputHandler | undefined;
  /** Whether the old and new content are identical. */
  readonly isEqual: boolean;

  /**
   * Update a named group of decorations. Multiple groups are merged before
   * rendering. The "diff" group is reserved for internal diff styling.
   * Passing an empty array removes the group.
   */
  setDecorations(key: string, decorations: Decoration[]): void;

  /**
   * Apply a theme by setting CSS custom properties on the container element.
   * Keys are CSS variable names (e.g. `--editor-cursor`). Use `GRUVBOX_THEME`
   * or `THEME_CSS_VARIABLES` as references.
   */
  setTheme(theme: ThemeVars): void;

  /**
   * Manually trigger a re-diff. Useful when you've edited the underlying
   * buffers directly and want to update immediately without waiting for
   * the debounce timer.
   */
  reDiff(): void;

  /** Unmount the renderer and input handler and release all event listeners. */
  destroy(): void;
}

/**
 * Resolve readOnly-related options into concrete hideCursor / skipInputHandler
 * booleans. Extracted as a pure function so it is testable without a DOM.
 *
 * Rules:
 * - `hideCursor` defaults to `readOnly` when not explicitly set.
 * - `skipInputHandler` defaults to `readOnly` when not explicitly set.
 * - Explicit values always win over the `readOnly` default.
 */
export function resolveDiffReadOnlyOptions(
  options?: Pick<DiffEditorViewOptions, "readOnly" | "hideCursor" | "skipInputHandler">,
): {
  hideCursor: boolean;
  skipInputHandler: boolean;
} {
  const readOnly = options?.readOnly === true;
  return {
    hideCursor: options?.hideCursor ?? readOnly,
    skipInputHandler: options?.skipInputHandler ?? readOnly,
  };
}

/**
 * Merge all decoration groups from the keyed map into a flat array.
 * Exported for testing; callers should use the DiffEditorView API.
 */
export function mergeDiffDecorations(map: Map<string, readonly Decoration[]>): Decoration[] {
  const result: Decoration[] = [];
  for (const decs of map.values()) {
    for (const d of decs) result.push(d);
  }
  return result;
}

class DiffEditorViewImpl implements DiffEditorView {
  readonly diffController: DiffController;
  readonly editor: Editor;
  readonly renderer: ReturnType<typeof createDomRenderer>;
  readonly inputHandler: InputHandler | undefined;

  private _container: HTMLElement;
  private _decorations = new Map<string, readonly Decoration[]>();
  private _rafId: number | null = null;
  private _onEditorChange: () => void;
  private _unsubscribeDiffUpdate: () => void;

  constructor(
    container: HTMLElement,
    oldBuffer: Buffer,
    newBuffer: Buffer,
    options?: DiffEditorViewOptions,
  ) {
    this._container = container;

    const measurements: Measurements = {
      lineHeight: options?.measurements?.lineHeight ?? 20,
      gutterWidth: options?.measurements?.gutterWidth ?? 48,
      charWidth: options?.measurements?.charWidth,
      wrapWidth: options?.measurements?.wrapWidth,
    };

    // Determine cursor visibility and input handler from readOnly/explicit options
    const { hideCursor, skipInputHandler } = resolveDiffReadOnlyOptions(options);

    // Create diff controller
    this.diffController = createDiffController(oldBuffer, newBuffer, options);

    // Create editor wrapping the diff multiBuffer
    this.editor = new Editor(this.diffController.multiBuffer, {
      readOnly: options?.readOnly,
    });

    // Create renderer
    this.renderer = createDomRenderer(measurements);

    // Hide cursor in read-only mode
    if (hideCursor) {
      this.renderer.setCursorHidden(true);
    }

    // Only create input handler if not skipped
    if (!skipInputHandler) {
      this.inputHandler = new InputHandler(
        (cmd) => {
          // Intercept copy/cut to populate the clipboard before the state update
          if (cmd.type === "copy" || cmd.type === "cut") {
            const selected = this.editor.getSelectedText();
            if (selected && typeof navigator !== "undefined") {
              navigator.clipboard?.writeText(selected);
            }
          }
          this.editor.dispatch(cmd);
        },
        { keymap: options?.keymap },
      );
    } else {
      this.inputHandler = undefined;
    }

    if (options?.onCustomCommand) {
      this.editor.onCustomCommand(options.onCustomCommand);
    }

    // Mount renderer and input handler into the container
    this.renderer.mount(container);
    this.inputHandler?.mount(container);

    // Wire click/drag callbacks from renderer → editor
    this.renderer.onClickPosition((point) => {
      this.editor.setCursor(point);
      this.inputHandler?.focus();
    });
    this.renderer.onDrag((point) => {
      this.editor.extendSelectionTo(point);
    });
    this.renderer.onDoubleClick((point) => {
      this.editor.selectWordAt(point);
    });
    this.renderer.onTripleClick((point) => {
      this.editor.selectLineAt(point);
    });

    // Set initial diff decorations
    this._decorations.set("diff", this.diffController.decorations);

    // Wire editor state changes → deferred render + notify diff controller
    const initialSnap = this.editor.multiBuffer.snapshot();
    this.renderer.setSnapshot(initialSnap);

    this._onEditorChange = () => {
      this._scheduleRender();
      // Notify controller for debounced re-diff
      this.diffController.notifyChange();
    };
    this.editor.on("change", this._onEditorChange);

    // Subscribe to diff controller updates
    this._unsubscribeDiffUpdate = this.diffController.onUpdate((decorations) => {
      this._decorations.set("diff", decorations);
      this._scheduleRender();
    });

    // Initial render
    this._render();
  }

  get isEqual(): boolean {
    return this.diffController.isEqual;
  }

  setDecorations(key: string, decorations: Decoration[]): void {
    if (key === "diff") {
      // Reserved for internal diff decorations; ignore external attempts
      return;
    }
    if (decorations.length === 0) {
      this._decorations.delete(key);
    } else {
      this._decorations.set(key, decorations);
    }
    this._scheduleRender();
  }

  setTheme(theme: ThemeVars): void {
    for (const [key, value] of Object.entries(theme)) {
      this._container.style.setProperty(key, value);
    }
  }

  reDiff(): void {
    this.diffController.reDiff();
  }

  destroy(): void {
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    this.editor.off("change", this._onEditorChange);
    this._unsubscribeDiffUpdate();
    this.diffController.dispose();
    this.inputHandler?.unmount();
    this.renderer.unmount();
  }

  private _scheduleRender(): void {
    if (this._rafId !== null) return;
    this._rafId = requestAnimationFrame(() => {
      this._rafId = null;
      this._render();
    });
  }

  private _render(): void {
    const snap = this.editor.multiBuffer.snapshot();
    this.renderer.setSnapshot(snap);

    const viewport = this.renderer.getViewport();
    const { startRow, endRow } = viewport;
    const lines = snap.lines(startRow, endRow);
    const boundaries = snap.excerptBoundaries(startRow, endRow);

    // Build excerpt headers: each excerpt after the first uses the
    // trailing-newline row of the previous excerpt as its header row.
    const excerptHeaders = boundaries
      .filter((b) => b.prev !== undefined)
      .map((b) => ({
        // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic for header row offset
        row: (b.row - 1) as MultiBufferRow,
        path: b.next.bufferId,
        label: `L${b.next.range.context.start.row + 1}\u2013${b.next.range.context.end.row}`,
      }));

    this.renderer.render(
      {
        viewport,
        selections: this.editor.selection ? [this.editor.selection] : [],
        decorations: mergeDiffDecorations(this._decorations),
        excerptHeaders,
        focused: this.inputHandler?.hasFocus ?? false,
      },
      lines,
    );

    // Render cursor and selection overlay separately (DomRenderer API)
    this.renderer.renderCursor(this.editor.cursor);

    if (this.editor.selection) {
      const resolved = resolveAnchorRange(snap, this.editor.selection.range);
      this.renderer.renderSelection(resolved?.start, resolved?.end);
    } else {
      this.renderer.renderSelection(undefined, undefined);
    }
  }
}

/**
 * Create a DiffEditorView from two text strings.
 *
 * This is the main entry point for creating an inline diff editor. It creates
 * the underlying buffers, wires up the DiffController, Editor, DomRenderer,
 * and InputHandler, and mounts everything into the container.
 *
 * @param container - The DOM element to render into.
 * @param oldText   - The original/old text content.
 * @param newText   - The modified/new text content.
 * @param options   - Optional configuration (readOnly, debounceMs, measurements).
 *
 * @example
 * ```ts
 * const view = createDiffEditorView(
 *   document.getElementById("editor"),
 *   "function old() {}",
 *   "function new() {}",
 *   { readOnly: true }
 * );
 * ```
 */
export function createDiffEditorView(
  container: HTMLElement,
  oldText: string,
  newText: string,
  options?: DiffEditorViewOptions,
): DiffEditorView {
  const oldBuffer = createBuffer(createDiffBufferId("old"), oldText);
  const newBuffer = createBuffer(createDiffBufferId("new"), newText);
  return new DiffEditorViewImpl(container, oldBuffer, newBuffer, options);
}

/**
 * Create a DiffEditorView from existing Buffer instances.
 *
 * Use this when you already have Buffer objects (e.g., from file handles)
 * and want to create a diff view between them.
 *
 * @param container - The DOM element to render into.
 * @param oldBuffer - The original/old buffer.
 * @param newBuffer - The modified/new buffer.
 * @param options   - Optional configuration (readOnly, debounceMs, measurements).
 */
export function createDiffEditorViewFromBuffers(
  container: HTMLElement,
  oldBuffer: Buffer,
  newBuffer: Buffer,
  options?: DiffEditorViewOptions,
): DiffEditorView {
  return new DiffEditorViewImpl(container, oldBuffer, newBuffer, options);
}
