/**
 * EditorView: high-level facade that bundles Editor + DomRenderer + InputHandler.
 *
 * Wires up the three components so callers don't need to manage their lifecycles
 * separately. Supports keyed decoration groups and CSS-variable-based theming.
 *
 * @example
 * ```ts
 * const view = createEditorView(container, "hello\nworld");
 * view.setDecorations("errors", [{ range: ..., className: "error" }]);
 * view.setTheme({ "--editor-cursor": "#ffffff" });
 * view.destroy();
 * ```
 */

import { resolveAnchorRange } from "../multibuffer/anchor.ts";
import type { MultiBufferRow } from "../multibuffer/types.ts";
import { createDomRenderer } from "../renderer/dom.ts";
import type { Decoration, Measurements } from "../renderer/types.ts";
import type { Editor } from "./editor.ts";
import { createSingleBufferEditor } from "./factories.ts";
import { InputHandler } from "./input-handler.ts";
import type { EditorOptions } from "./types.ts";

/** CSS variable name → value map for theming the editor chrome and syntax. */
export type Theme = Record<string, string>;

/** Options for createEditorView. */
export interface EditorViewOptions extends EditorOptions {
  /** Custom measurements. Defaults: lineHeight=20, gutterWidth=48. */
  measurements?: Partial<Measurements>;
}

/** The EditorView facade — bundles Editor, DomRenderer, and InputHandler. */
export interface EditorView {
  /** The underlying Editor instance for advanced use. */
  readonly editor: Editor;
  /** The DOM renderer instance. */
  readonly renderer: ReturnType<typeof createDomRenderer>;
  /** The keyboard/input handler instance. */
  readonly inputHandler: InputHandler;

  /**
   * Update a named group of decorations. Multiple groups are merged before
   * rendering. Passing an empty array removes the group.
   */
  setDecorations(key: string, decorations: Decoration[]): void;

  /**
   * Apply a theme by setting CSS custom properties on the container element.
   * Keys are CSS variable names (e.g. `--editor-cursor`). Use `GRUVBOX_THEME`
   * or `THEME_CSS_VARIABLES` as references.
   */
  setTheme(theme: Theme): void;

  /** Unmount the renderer and input handler and release all event listeners. */
  destroy(): void;
}

/**
 * Merge all decoration groups from the keyed map into a flat array.
 * Exported for testing; callers should use the EditorView API.
 */
export function mergeDecorations(map: Map<string, Decoration[]>): Decoration[] {
  const result: Decoration[] = [];
  for (const decs of map.values()) {
    for (const d of decs) result.push(d);
  }
  return result;
}

class EditorViewImpl implements EditorView {
  readonly editor: Editor;
  readonly renderer: ReturnType<typeof createDomRenderer>;
  readonly inputHandler: InputHandler;

  private _container: HTMLElement;
  private _decorations = new Map<string, Decoration[]>();
  private _rafId: number | null = null;
  private _onEditorChange = () => this._scheduleRender();

  constructor(container: HTMLElement, text: string, options?: EditorViewOptions) {
    this._container = container;

    const measurements: Measurements = {
      lineHeight: options?.measurements?.lineHeight ?? 20,
      gutterWidth: options?.measurements?.gutterWidth ?? 48,
      charWidth: options?.measurements?.charWidth,
      wrapWidth: options?.measurements?.wrapWidth,
    };

    this.editor = createSingleBufferEditor(text, options);
    this.renderer = createDomRenderer(measurements);
    this.inputHandler = new InputHandler((cmd) => {
      // Intercept copy/cut to populate the clipboard before the state update
      if (cmd.type === "copy" || cmd.type === "cut") {
        const selected = this.editor.getSelectedText();
        if (selected && typeof navigator !== "undefined") {
          navigator.clipboard?.writeText(selected);
        }
      }
      this.editor.dispatch(cmd);
    });

    // Mount renderer and input handler into the container
    this.renderer.mount(container);
    this.inputHandler.mount(container);

    // Wire click/drag callbacks from renderer → editor
    this.renderer.onClickPosition((point) => {
      this.editor.setCursor(point);
      this.inputHandler.focus();
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

    // Wire editor state changes → deferred render
    const initialSnap = this.editor.multiBuffer.snapshot();
    this.renderer.setSnapshot(initialSnap);
    this.editor.on("change", this._onEditorChange);

    // Initial render
    this._render();
  }

  setDecorations(key: string, decorations: Decoration[]): void {
    if (decorations.length === 0) {
      this._decorations.delete(key);
    } else {
      this._decorations.set(key, decorations);
    }
    this._scheduleRender();
  }

  setTheme(theme: Theme): void {
    for (const [key, value] of Object.entries(theme)) {
      this._container.style.setProperty(key, value);
    }
  }

  destroy(): void {
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    this.editor.off("change", this._onEditorChange);
    this.inputHandler.unmount();
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
        decorations: mergeDecorations(this._decorations),
        excerptHeaders,
        focused: this.inputHandler.hasFocus,
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
 * Create an EditorView that bundles a single-buffer Editor, DomRenderer, and
 * InputHandler, wired together and mounted into `container`.
 *
 * @param container - The DOM element to render into.
 * @param text      - Initial text content.
 * @param options   - Optional configuration (readOnly, measurements).
 */
export function createEditorView(
  container: HTMLElement,
  text: string,
  options?: EditorViewOptions,
): EditorView {
  return new EditorViewImpl(container, text, options);
}
