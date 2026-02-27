/**
 * Editor state and command types.
 *
 * The editor is a state machine: commands produce new state from old state.
 * All state is immutable — commands return new objects.
 */

import type {
  Anchor,
  MultiBuffer,
  MultiBufferPoint,
  MultiBufferRow,
  MultiBufferSnapshot,
  Selection,
} from "../multibuffer/types.ts";

/** Direction for cursor movement and selection extension. */
export type Direction = "left" | "right" | "up" | "down";

/** Granularity of movement. */
export type Granularity = "character" | "word" | "line" | "page" | "buffer";

/** All editor commands. */
export type EditorCommand =
  | { type: "insertText"; text: string }
  | { type: "insertNewline" }
  | { type: "insertTab" }
  | { type: "deleteBackward"; granularity: Granularity }
  | { type: "deleteForward"; granularity: Granularity }
  | { type: "moveCursor"; direction: Direction; granularity: Granularity }
  | { type: "extendSelection"; direction: Direction; granularity: Granularity }
  | { type: "selectAll" }
  | { type: "collapseSelection"; to: "start" | "end" }
  | { type: "deleteLine" }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "copy" }
  | { type: "cut" }
  | { type: "paste"; text: string };

/**
 * The cursor position in the editor.
 * Backed by an anchor for stability across edits.
 */
export interface CursorState {
  /** Stable position that survives edits. */
  readonly anchor: Anchor;
  /**
   * Column goal for vertical movement.
   * When moving up/down, the cursor tries to maintain this column.
   * Reset on horizontal movement.
   */
  readonly goalColumn: number | undefined;
}

/**
 * Complete editor state.
 * Immutable — each command produces a new EditorState.
 */
export interface EditorState {
  /** The multibuffer being edited. */
  readonly multiBuffer: MultiBuffer;
  /** The current cursor position. */
  readonly cursor: CursorState;
  /** The current selection, or undefined if no selection active. */
  readonly selection: Selection | undefined;
  /** Whether the editor has focus. */
  readonly focused: boolean;
}

/**
 * Resolved positions for rendering — derived from EditorState by
 * resolving anchors against the current snapshot.
 */
export interface ResolvedEditorState {
  readonly cursorPoint: MultiBufferPoint;
  readonly selectionRange:
    | { start: MultiBufferPoint; end: MultiBufferPoint }
    | undefined;
}

/**
 * Resolve the editor state's anchors to concrete positions.
 */
export function resolveEditorState(
  state: EditorState,
  snapshot: MultiBufferSnapshot,
): ResolvedEditorState {
  const cursorPoint = snapshot.resolveAnchor(state.cursor.anchor);
  let selectionRange: ResolvedEditorState["selectionRange"];

  if (state.selection) {
    const start = snapshot.resolveAnchor(state.selection.range.start);
    const end = snapshot.resolveAnchor(state.selection.range.end);
    if (start && end) {
      selectionRange = { start, end };
    }
  }

  return {
    // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction for default point
    cursorPoint: cursorPoint ?? ({ row: 0 as MultiBufferRow, column: 0 } as MultiBufferPoint),
    selectionRange,
  };
}
