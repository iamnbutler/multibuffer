/**
 * DiffView - React component for displaying a diff between two text strings.
 *
 * Declarative wrapper around useDiffView for simple diff rendering.
 *
 * @example
 * ```tsx
 * <DiffView
 *   oldText="hello\nworld"
 *   newText="hello\nthere"
 *   readOnly
 *   style={{ height: 400 }}
 * />
 * ```
 */

import { type CSSProperties, forwardRef, type HTMLAttributes, useImperativeHandle } from "react";
import type { DiffController, DiffControllerOptions } from "../diff/controller.ts";
import type { Editor } from "../editor/editor.ts";
import type { Keymap } from "../editor/types.ts";
import type { Decoration, Measurements, Theme } from "../renderer/types.ts";
import { useDiffView } from "./use-diff-view.ts";

export interface DiffViewProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  /** The "old" or "before" text content. */
  oldText: string;
  /** The "new" or "after" text content. */
  newText: string;
  /** Read-only mode. Default: true. */
  readOnly?: boolean;
  /** Custom measurements (lineHeight, gutterWidth, charWidth, wrapWidth). */
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

export interface DiffViewHandle {
  /** The DiffController instance. */
  controller: DiffController | null;
  /** The underlying Editor instance. */
  editor: Editor | null;
  /** Whether the old and new text are equal. */
  isEqual: boolean;
  /** Current diff decorations. */
  decorations: readonly Decoration[];
  /** Update decorations imperatively. */
  setDecorations: (key: string, decorations: Decoration[]) => void;
  /** Update theme imperatively. */
  setTheme: (theme: Partial<Theme>) => void;
  /** Force re-diff. */
  reDiff: () => void;
}

/**
 * DiffView component - renders a diff between two text strings.
 *
 * For more control, use the useDiffView hook directly.
 */
export const DiffView = forwardRef<DiffViewHandle, DiffViewProps>(function DiffView(
  {
    oldText,
    newText,
    readOnly = true,
    measurements,
    keymap,
    onCustomCommand,
    theme,
    decorations,
    diffOptions,
    onDiffChange,
    style,
    className,
    ...divProps
  },
  ref,
) {
  const {
    containerRef,
    controller,
    isEqual,
    decorations: diffDecorations,
    editor,
    setDecorations,
    setTheme,
    reDiff,
  } = useDiffView({
    oldText,
    newText,
    readOnly,
    measurements,
    keymap,
    onCustomCommand,
    theme,
    decorations,
    diffOptions,
    onDiffChange,
  });

  // Expose imperative handle
  useImperativeHandle(ref, () => ({
    controller,
    editor,
    isEqual,
    decorations: diffDecorations,
    setDecorations,
    setTheme,
    reDiff,
  }), [controller, editor, isEqual, diffDecorations, setDecorations, setTheme, reDiff]);

  // Default styles for the container
  const containerStyle: CSSProperties = {
    position: "relative",
    overflow: "hidden",
    fontFamily: "monospace",
    fontSize: 14,
    ...style,
  };

  return (
    <div
      ref={containerRef}
      className={className}
      style={containerStyle}
      {...divProps}
    />
  );
});
