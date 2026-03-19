export { moveCursor } from "./cursor.ts";
export { Editor } from "./editor.ts";
export type { EditorView, EditorViewOptions, ThemeVars } from "./editor-view.ts";
export {
  createEditorView,
  mergeDecorations,
  resolveReadOnlyOptions,
} from "./editor-view.ts";
export {
  createMultiBufferEditor,
  createSingleBufferEditor,
} from "./factories.ts";
export type { CommandCallback, InputHandlerOptions, KeyBindingResult } from "./input-handler.ts";
export { InputHandler, keyEventToCommand, normalizeKey, resolveKeyBinding } from "./input-handler.ts";
export type { SearchOptions, SearchResult, SearchState } from "./search.ts";
export { SearchController } from "./search.ts";
export {
  collapseSelection,
  extendSelection,
  isCollapsed,
  selectAll,
  selectionAtPoint,
} from "./selection.ts";
export type {
  BracketMatchResult,
  CursorState,
  Direction,
  EditorCommand,
  EditorEventMap,
  EditorOptions,
  EditorState,
  Granularity,
  KeyBinding,
  Keymap,
  ResolvedEditorState,
} from "./types.ts";
export { resolveEditorState } from "./types.ts";
