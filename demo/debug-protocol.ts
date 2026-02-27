/**
 * Debug protocol types shared between server, browser, and CLI.
 */

import type { EditorCommand } from "../src/editor/types.ts";

export type DebugCommand =
  | { id: string; cmd: "getState" }
  | { id: string; cmd: "getText" }
  | { id: string; cmd: "dispatch"; command: EditorCommand }
  | { id: string; cmd: "press"; key: string }
  | { id: string; cmd: "type"; text: string }
  | { id: string; cmd: "click"; row: number; column: number };

export interface DebugResponse {
  id: string;
  result: unknown;
  error?: string;
}

export interface EditorState {
  cursor: { row: number; column: number };
  lineCount: number;
  selectionRange: {
    start: { row: number; column: number };
    end: { row: number; column: number };
  } | null;
}
