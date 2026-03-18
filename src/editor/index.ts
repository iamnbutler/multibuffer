export { moveCursor } from "./cursor.ts";
export { Editor } from "./editor.ts";
export type { EditorView, EditorViewOptions, Theme } from "./editor-view.ts";
export {
  createEditorView,
  mergeDecorations,
} from "./editor-view.ts";
export {
  createMultiBufferEditor,
  createSingleBufferEditor,
} from "./factories.ts";
export type { CommandCallback } from "./input-handler.ts";
export { InputHandler, keyEventToCommand } from "./input-handler.ts";
export {
  collapseSelection,
  extendSelection,
  isCollapsed,
  selectAll,
  selectionAtPoint,
} from "./selection.ts";
export type {
  CursorState,
  Direction,
  EditorCommand,
  EditorEventMap,
  EditorOptions,
  EditorState,
  Granularity,
  ResolvedEditorState,
} from "./types.ts";
export { resolveEditorState } from "./types.ts";
