/**
 * useEditorView - React hook for mounting an EditorView into a container.
 *
 * Handles lifecycle (create on mount, destroy on unmount), SSR safety,
 * and prop synchronization without full teardown on every render.
 *
 * @example
 * ```tsx
 * function MyEditor({ initialText }: Props) {
 *   const { containerRef, view } = useEditorView({ text: initialText });
 *   return <div ref={containerRef} style={{ height: 400 }} />;
 * }
 * ```
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { EditorView, EditorViewOptions, Theme } from "../editor/editor-view.ts";
import { createEditorView } from "../editor/editor-view.ts";
import type { Keymap } from "../editor/types.ts";
import type { Decoration, Measurements } from "../renderer/types.ts";

export interface UseEditorViewOptions {
  /** Initial text content. Changes after mount are ignored (uncontrolled). */
  text: string;
  /** Read-only mode. Can be updated after mount. */
  readOnly?: boolean;
  /** Enable bracket matching. */
  bracketMatching?: boolean;
  /** Custom measurements (lineHeight, gutterWidth, charWidth, wrapWidth, gutterMode). */
  measurements?: Partial<Measurements>;
  /** Custom keymap merged on top of defaults. */
  keymap?: Keymap;
  /** Callback for custom commands from keymap. */
  onCustomCommand?: (action: string) => void;
  /** Theme CSS variables to apply. Can be updated after mount. */
  theme?: Theme;
  /** Decorations to render. Can be updated after mount. */
  decorations?: Decoration[];
}

export interface UseEditorViewResult {
  /** Ref to attach to the container element. */
  containerRef: React.RefObject<HTMLDivElement>;
  /** The EditorView instance (null during SSR or before mount). */
  view: EditorView | null;
  /** Update decorations imperatively (alternative to props). */
  setDecorations: (key: string, decorations: Decoration[]) => void;
  /** Update theme imperatively (alternative to props). */
  setTheme: (theme: Theme) => void;
}

/**
 * React hook for creating and managing an EditorView.
 *
 * The `text` prop is used only on initial mount (uncontrolled pattern).
 * For controlled content, use the view.editor API directly.
 */
export function useEditorView(options: UseEditorViewOptions): UseEditorViewResult {
  // biome-ignore lint/style/noNonNullAssertion: expect: ref will be assigned by React before first effect runs
  const containerRef = useRef<HTMLDivElement>(null!);
  const viewRef = useRef<EditorView | null>(null);
  const [view, setView] = useState<EditorView | null>(null);

  // Store latest options in refs to avoid re-creating view on every render
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Create view on mount, destroy on unmount
  useEffect(() => {
    // SSR safety: skip if no document
    if (typeof document === "undefined") return;
    if (!containerRef.current) return;

    const opts = optionsRef.current;
    const editorViewOptions: EditorViewOptions = {
      readOnly: opts.readOnly,
      bracketMatching: opts.bracketMatching,
      measurements: opts.measurements,
      keymap: opts.keymap,
      onCustomCommand: opts.onCustomCommand,
    };

    const editorView = createEditorView(
      containerRef.current,
      opts.text,
      editorViewOptions,
    );

    // Apply initial theme if provided
    if (opts.theme) {
      editorView.setTheme(opts.theme);
    }

    // Apply initial decorations if provided
    if (opts.decorations) {
      editorView.setDecorations("props", opts.decorations);
    }

    viewRef.current = editorView;
    setView(editorView);

    return () => {
      editorView.destroy();
      viewRef.current = null;
      setView(null);
    };
    // Only run on mount/unmount - text is initial value only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync readOnly changes
  useEffect(() => {
    if (viewRef.current && options.readOnly !== undefined) {
      viewRef.current.editor.setReadOnly(options.readOnly);
    }
  }, [options.readOnly]);

  // Sync theme changes
  useEffect(() => {
    if (viewRef.current && options.theme) {
      viewRef.current.setTheme(options.theme);
    }
  }, [options.theme]);

  // Sync decoration changes
  useEffect(() => {
    if (viewRef.current && options.decorations) {
      viewRef.current.setDecorations("props", options.decorations);
    }
  }, [options.decorations]);

  // Imperative API
  const setDecorations = useCallback((key: string, decorations: Decoration[]) => {
    viewRef.current?.setDecorations(key, decorations);
  }, []);

  const setTheme = useCallback((theme: Theme) => {
    viewRef.current?.setTheme(theme);
  }, []);

  return {
    containerRef,
    view,
    setDecorations,
    setTheme,
  };
}
