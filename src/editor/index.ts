export { moveCursor } from "./cursor.ts";
export { Editor } from "./editor.ts";
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
  EditorState,
  Granularity,
  ResolvedEditorState,
} from "./types.ts";
export { resolveEditorState } from "./types.ts";
