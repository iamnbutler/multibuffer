/**
 * EditorViewComponent - React component for rendering an editor.
 *
 * Declarative wrapper around useEditorView for simple editor rendering.
 * Named EditorViewComponent to avoid collision with the core EditorView type.
 *
 * @example
 * ```tsx
 * <EditorViewComponent
 *   text="hello\nworld"
 *   readOnly={false}
 *   style={{ height: 400 }}
 * />
 * ```
 */

import { type CSSProperties, forwardRef, type HTMLAttributes, useImperativeHandle } from "react";
import type { EditorView } from "../editor/editor-view.ts";
import type { Keymap } from "../editor/types.ts";
import type { Decoration, Measurements, Theme } from "../renderer/types.ts";
import { useEditorView } from "./use-editor-view.ts";

export interface EditorViewComponentProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
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
  /** Theme CSS variables to apply. Partial themes merge with defaults. */
  theme?: Partial<Theme>;
  /** Decorations to render. Can be updated after mount. */
  decorations?: Decoration[];
}

export interface EditorViewComponentHandle {
  /** The EditorView instance. */
  view: EditorView | null;
  /** Update decorations imperatively. */
  setDecorations: (key: string, decorations: Decoration[]) => void;
  /** Update theme imperatively. */
  setTheme: (theme: Partial<Theme>) => void;
}

/**
 * EditorViewComponent - renders a text editor.
 *
 * For more control, use the useEditorView hook directly.
 */
export const EditorViewComponent = forwardRef<EditorViewComponentHandle, EditorViewComponentProps>(
  function EditorViewComponent(
    {
      text,
      readOnly,
      bracketMatching,
      measurements,
      keymap,
      onCustomCommand,
      theme,
      decorations,
      style,
      className,
      ...divProps
    },
    ref,
  ) {
    const {
      containerRef,
      view,
      setDecorations,
      setTheme,
    } = useEditorView({
      text,
      readOnly,
      bracketMatching,
      measurements,
      keymap,
      onCustomCommand,
      theme,
      decorations,
    });

    // Expose imperative handle
    useImperativeHandle(ref, () => ({
      view,
      setDecorations,
      setTheme,
    }), [view, setDecorations, setTheme]);

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
  },
);
