/**
 * useDiffView - React hook for rendering a diff between two text strings.
 *
 * Creates and manages a DiffController, EditorView, and handles automatic
 * re-diffing when oldText or newText props change.
 *
 * @example
 * ```tsx
 * function MyDiffViewer({ oldText, newText }: Props) {
 *   const { containerRef, isEqual } = useDiffView({ oldText, newText, readOnly: true });
 *   return (
 *     <div>
 *       {isEqual && <span>Files are identical</span>}
 *       <div ref={containerRef} style={{ height: 400 }} />
 *     </div>
 *   );
 * }
 * ```
 */

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { createBuffer } from "../buffer/buffer.ts";
import type { Buffer, BufferId } from "../buffer/types.ts";
import type { DiffController, DiffControllerOptions } from "../diff/controller.ts";
import { createDiffController } from "../diff/controller.ts";
import type { Editor } from "../editor/editor.ts";
import { mergeDecorations } from "../editor/editor-view.ts";
import { createMultiBufferEditor } from "../editor/factories.ts";
import { InputHandler } from "../editor/input-handler.ts";
import type { Keymap } from "../editor/types.ts";
import { resolveAnchorRange } from "../multibuffer/anchor.ts";
import type { MultiBufferRow } from "../multibuffer/types.ts";
import { createDomRenderer } from "../renderer/dom.ts";
import { themeToVars } from "../renderer/theme.ts";
import type { Decoration, Measurements, Theme } from "../renderer/types.ts";

let _diffBufferIdCounter = 0;

function nextDiffBufferId(prefix: string): BufferId {
  // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction for internal buffer ID
  return `diff-${prefix}-${_diffBufferIdCounter++}` as BufferId;
}

export interface UseDiffViewOptions {
  /** The "old" or "before" text content. */
  oldText: string;
  /** The "new" or "after" text content. */
  newText: string;
  /** Read-only mode. Default: true for diff views. */
  readOnly?: boolean;
  /** Custom measurements (lineHeight, gutterWidth, charWidth, wrapWidth). gutterMode is forced to "diff". */
  measurements?: Partial<Omit<Measurements, "gutterMode">>;
  /** Custom keymap merged on top of defaults. */
  keymap?: Keymap;
  /** Callback for custom commands from keymap. */
  onCustomCommand?: (action: string) => void;
  /** Theme CSS variables to apply. Partial themes merge with defaults. */
  theme?: Partial<Theme>;
  /** Additional decorations to merge with diff decorations. */
  decorations?: Decoration[];
  /** Diff controller options (context lines, debounce, etc.). */
  diffOptions?: DiffControllerOptions;
  /** Callback when diff state changes. */
  onDiffChange?: (isEqual: boolean, decorations: readonly Decoration[]) => void;
}

export interface UseDiffViewResult {
  /** Ref to attach to the container element. */
  containerRef: RefObject<HTMLDivElement>;
  /** The DiffController instance (null during SSR or before mount). */
  controller: DiffController | null;
  /** Whether the old and new text are equal. */
  isEqual: boolean;
  /** Current diff decorations. */
  decorations: readonly Decoration[];
  /** The underlying Editor instance (null during SSR or before mount). */
  editor: Editor | null;
  /** Update additional decorations imperatively. */
  setDecorations: (key: string, decorations: Decoration[]) => void;
  /** Update theme imperatively. */
  setTheme: (theme: Partial<Theme>) => void;
  /** Force re-diff (normally automatic on prop changes). */
  reDiff: () => void;
}

/**
 * React hook for creating and managing a diff view.
 *
 * Automatically re-diffs when oldText or newText props change.
 */
export function useDiffView(options: UseDiffViewOptions): UseDiffViewResult {
  // biome-ignore lint/style/noNonNullAssertion: expect: ref will be assigned by React before first effect runs
  const containerRef = useRef<HTMLDivElement>(null!);

  // Core instances
  const controllerRef = useRef<DiffController | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const rendererRef = useRef<ReturnType<typeof createDomRenderer> | null>(null);
  const inputHandlerRef = useRef<InputHandler | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const decorationsMapRef = useRef(new Map<string, Decoration[]>());

  // React state for re-renders
  const [controller, setController] = useState<DiffController | null>(null);
  const [isEqual, setIsEqual] = useState(false);
  const [decorations, setDecorations] = useState<readonly Decoration[]>([]);
  const [editor, setEditor] = useState<Editor | null>(null);

  // Store latest options in refs
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Buffer refs (mutable to allow text replacement)
  const oldBufferRef = useRef<Buffer | null>(null);
  const newBufferRef = useRef<Buffer | null>(null);

  // Track text for change detection
  const prevOldTextRef = useRef<string | null>(null);
  const prevNewTextRef = useRef<string | null>(null);

  // Schedule render using RAF
  // biome-ignore lint/correctness/useExhaustiveDependencies: render is stable (uses only refs)
  const scheduleRender = useCallback(() => {
    if (rafIdRef.current !== null) return;
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null;
      render();
    });
  }, []);

  // Render function
  const render = useCallback(() => {
    const ed = editorRef.current;
    const renderer = rendererRef.current;
    const ctrl = controllerRef.current;
    const inputHandler = inputHandlerRef.current;
    if (!ed || !renderer || !ctrl) return;

    const snap = ed.multiBuffer.snapshot();
    renderer.setSnapshot(snap);

    const viewport = renderer.getViewport();
    const { startRow, endRow } = viewport;
    const lines = snap.lines(startRow, endRow);
    const boundaries = snap.excerptBoundaries(startRow, endRow);

    // Build excerpt headers
    const excerptHeaders = boundaries
      .filter((b) => b.prev !== undefined)
      .map((b) => ({
        // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic for header row offset
        row: (b.row - 1) as MultiBufferRow,
        path: b.next.bufferId,
        label: `L${b.next.range.context.start.row + 1}\u2013${b.next.range.context.end.row}`,
      }));

    // Merge decorations: diff decorations + user decorations
    decorationsMapRef.current.set("diff", [...ctrl.decorations]);
    const allDecorations = mergeDecorations(decorationsMapRef.current);

    renderer.render(
      {
        viewport,
        selections: ed.selection ? [ed.selection] : [],
        decorations: allDecorations,
        excerptHeaders,
        focused: inputHandler?.hasFocus ?? false,
      },
      lines,
    );

    // Render cursor and selection
    renderer.renderCursor(ed.cursor);
    if (ed.selection) {
      const resolved = resolveAnchorRange(snap, ed.selection.range);
      renderer.renderSelection(resolved?.start, resolved?.end);
    } else {
      renderer.renderSelection(undefined, undefined);
    }
  }, []);

  // Initialize on mount
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only effect; render/scheduleRender are stable (use only refs)
  useEffect(() => {
    // SSR safety
    if (typeof document === "undefined") return;
    if (!containerRef.current) return;

    const opts = optionsRef.current;
    const container = containerRef.current;

    // Create buffers
    const oldBuffer = createBuffer(nextDiffBufferId("old"), opts.oldText);
    const newBuffer = createBuffer(nextDiffBufferId("new"), opts.newText);
    oldBufferRef.current = oldBuffer;
    newBufferRef.current = newBuffer;
    prevOldTextRef.current = opts.oldText;
    prevNewTextRef.current = opts.newText;

    // Create diff controller
    const ctrl = createDiffController(oldBuffer, newBuffer, opts.diffOptions);
    controllerRef.current = ctrl;
    setController(ctrl);
    setIsEqual(ctrl.isEqual);
    setDecorations(ctrl.decorations);

    // Create editor from diff's multiBuffer
    const ed = createMultiBufferEditor(ctrl.multiBuffer, {
      readOnly: opts.readOnly ?? true,
    });
    editorRef.current = ed;
    setEditor(ed);

    // Create renderer with diff gutter mode
    const measurements: Measurements = {
      lineHeight: opts.measurements?.lineHeight ?? 20,
      gutterWidth: opts.measurements?.gutterWidth ?? 96, // Wider for diff gutters
      charWidth: opts.measurements?.charWidth,
      wrapWidth: opts.measurements?.wrapWidth,
      gutterMode: "diff",
    };
    const renderer = createDomRenderer(measurements);
    rendererRef.current = renderer;

    // Create input handler
    const inputHandler = new InputHandler(
      (cmd) => {
        if (cmd.type === "copy" || cmd.type === "cut") {
          const selected = ed.getSelectedText();
          if (selected && typeof navigator !== "undefined") {
            navigator.clipboard?.writeText(selected);
          }
        }
        ed.dispatch(cmd);
      },
      { keymap: opts.keymap },
    );
    inputHandlerRef.current = inputHandler;

    if (opts.onCustomCommand) {
      ed.onCustomCommand(opts.onCustomCommand);
    }

    // Mount
    renderer.mount(container);
    inputHandler.mount(container);

    // Wire click/drag callbacks
    renderer.onClickPosition((point) => {
      ed.setCursor(point);
      inputHandler.focus();
    });
    renderer.onDrag((point) => {
      ed.extendSelectionTo(point);
    });
    renderer.onDoubleClick((point) => {
      ed.selectWordAt(point);
    });
    renderer.onTripleClick((point) => {
      ed.selectLineAt(point);
    });

    // Subscribe to editor changes
    const onEditorChange = () => scheduleRender();
    ed.on("change", onEditorChange);

    // Subscribe to diff updates
    const unsubscribeDiff = ctrl.onUpdate((newDecorations) => {
      setDecorations(newDecorations);
      setIsEqual(ctrl.isEqual);
      scheduleRender();
      opts.onDiffChange?.(ctrl.isEqual, newDecorations);
    });

    // Apply initial theme
    if (opts.theme) {
      for (const [cssVar, value] of Object.entries(themeToVars(opts.theme))) {
        container.style.setProperty(cssVar, value);
      }
    }

    // Apply initial user decorations
    if (opts.decorations) {
      decorationsMapRef.current.set("user", opts.decorations);
    }

    // Set initial snapshot and render
    const initialSnap = ctrl.multiBuffer.snapshot();
    renderer.setSnapshot(initialSnap);
    render();

    // Cleanup
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      ed.off("change", onEditorChange);
      unsubscribeDiff();
      ctrl.dispose();
      inputHandler.unmount();
      renderer.unmount();

      controllerRef.current = null;
      editorRef.current = null;
      rendererRef.current = null;
      inputHandlerRef.current = null;
      oldBufferRef.current = null;
      newBufferRef.current = null;

      setController(null);
      setEditor(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle text changes - recreate buffers and re-diff
  useEffect(() => {
    const ctrl = controllerRef.current;
    const oldBuffer = oldBufferRef.current;
    const newBuffer = newBufferRef.current;
    if (!ctrl || !oldBuffer || !newBuffer) return;

    const oldChanged = options.oldText !== prevOldTextRef.current;
    const newChanged = options.newText !== prevNewTextRef.current;

    if (!oldChanged && !newChanged) return;

    // Replace buffer contents and re-diff
    if (oldChanged) {
      const snap = oldBuffer.snapshot();
      const len = snap.textSummary.chars;
      // biome-ignore lint/plugin/no-type-assertion: expect: branded type for buffer offset
      oldBuffer.replace(0 as import("../buffer/types.ts").BufferOffset, len as import("../buffer/types.ts").BufferOffset, options.oldText);
      prevOldTextRef.current = options.oldText;
    }

    if (newChanged) {
      const snap = newBuffer.snapshot();
      const len = snap.textSummary.chars;
      // biome-ignore lint/plugin/no-type-assertion: expect: branded type for buffer offset
      newBuffer.replace(0 as import("../buffer/types.ts").BufferOffset, len as import("../buffer/types.ts").BufferOffset, options.newText);
      prevNewTextRef.current = options.newText;
    }

    // Trigger re-diff
    ctrl.reDiff();
  }, [options.oldText, options.newText]);

  // Sync readOnly changes
  useEffect(() => {
    if (editorRef.current && options.readOnly !== undefined) {
      editorRef.current.setReadOnly(options.readOnly);
    }
  }, [options.readOnly]);

  // Sync theme changes
  useEffect(() => {
    if (containerRef.current && options.theme) {
      for (const [cssVar, value] of Object.entries(themeToVars(options.theme))) {
        containerRef.current.style.setProperty(cssVar, value);
      }
    }
  }, [options.theme]);

  // Sync user decorations
  useEffect(() => {
    if (options.decorations) {
      decorationsMapRef.current.set("user", options.decorations);
      scheduleRender();
    }
  }, [options.decorations, scheduleRender]);

  // Imperative APIs
  const setDecorationsImperative = useCallback((key: string, decs: Decoration[]) => {
    if (decs.length === 0) {
      decorationsMapRef.current.delete(key);
    } else {
      decorationsMapRef.current.set(key, decs);
    }
    scheduleRender();
  }, [scheduleRender]);

  const setThemeImperative = useCallback((theme: Partial<Theme>) => {
    if (containerRef.current) {
      for (const [cssVar, value] of Object.entries(themeToVars(theme))) {
        containerRef.current.style.setProperty(cssVar, value);
      }
    }
  }, []);

  const reDiffImperative = useCallback(() => {
    controllerRef.current?.reDiff();
  }, []);

  return {
    containerRef,
    controller,
    isEqual,
    decorations,
    editor,
    setDecorations: setDecorationsImperative,
    setTheme: setThemeImperative,
    reDiff: reDiffImperative,
  };
}
