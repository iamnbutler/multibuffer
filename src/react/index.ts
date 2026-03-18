/**
 * React bindings for multibuffer.
 *
 * Provides hooks and components for integrating multibuffer's editor
 * and diff views into React applications.
 *
 * @example
 * ```tsx
 * import { DiffView, useDiffView, useEditorView, EditorViewComponent } from "multibuffer/react";
 *
 * // Simple diff view component
 * <DiffView oldText={old} newText={new} />
 *
 * // Diff view with hook for more control
 * const { containerRef, isEqual } = useDiffView({ oldText, newText });
 *
 * // Simple editor component
 * <EditorViewComponent text={content} />
 *
 * // Editor with hook for more control
 * const { containerRef, view } = useEditorView({ text: initialText });
 * ```
 */

export type { DiffController, DiffControllerOptions } from "../diff/controller.ts";
export type { Editor } from "../editor/editor.ts";
export type { EditorView, Theme } from "../editor/editor-view.ts";
export type { EditorCommand, KeyBinding, Keymap } from "../editor/types.ts";
// Re-export commonly needed types from core
export type { Decoration, Measurements, Viewport } from "../renderer/types.ts";
export type { DiffViewHandle, DiffViewProps } from "./diff-view.tsx";
export { DiffView } from "./diff-view.tsx";
// Components
export type { EditorViewComponentHandle, EditorViewComponentProps } from "./editor-view.tsx";
export { EditorViewComponent } from "./editor-view.tsx";
export type { UseDiffViewOptions, UseDiffViewResult } from "./use-diff-view.ts";
export { useDiffView } from "./use-diff-view.ts";
// Hooks
export type { UseEditorViewOptions, UseEditorViewResult } from "./use-editor-view.ts";
export { useEditorView } from "./use-editor-view.ts";
