/**
 * Convenience factory functions for common editor setup patterns.
 *
 * These reduce boilerplate for the typical "single file editor" use case
 * while leaving the low-level API available for advanced multi-buffer scenarios.
 */

import { createBuffer } from "../multibuffer/buffer.ts";
import { createMultiBuffer } from "../multibuffer/multibuffer.ts";
import type {
  BufferId,
  BufferRow,
  ExcerptRange,
  MultiBuffer,
} from "../multibuffer/types.ts";
import { Editor } from "./editor.ts";
import type { EditorOptions } from "./types.ts";

let _bufferIdCounter = 0;

function _nextBufferId(): BufferId {
  // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction for internal buffer ID
  return `editor-buffer-${_bufferIdCounter++}` as BufferId;
}

/**
 * Create an editor backed by a single full-file buffer.
 *
 * Handles all boilerplate: creates a Buffer, MultiBuffer, and adds a
 * full-file excerpt. Use this for the common "edit a single file" case.
 *
 * @example
 * ```ts
 * const editor = createSingleBufferEditor("hello\nworld");
 * editor.dispatch({ type: "moveCursor", direction: "right", granularity: "character" });
 * ```
 */
export function createSingleBufferEditor(
  text: string,
  options?: EditorOptions,
): Editor {
  const buffer = createBuffer(_nextBufferId(), text);
  const mb = createMultiBuffer();
  const lineCount = text.split("\n").length;
  // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction for row bounds
  const startRow = 0 as BufferRow;
  // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction for row bounds
  const endRow = lineCount as BufferRow;
  const fullRange: ExcerptRange = {
    context: { start: { row: startRow, column: 0 }, end: { row: endRow, column: 0 } },
    primary: { start: { row: startRow, column: 0 }, end: { row: endRow, column: 0 } },
  };
  mb.addExcerpt(buffer, fullRange);
  return new Editor(mb, options);
}

/**
 * Create an editor from an existing MultiBuffer.
 *
 * Use this for advanced multi-buffer scenarios where you've already assembled
 * the MultiBuffer (e.g. search results across multiple files).
 *
 * @example
 * ```ts
 * const mb = createMultiBuffer();
 * mb.addExcerpt(buffer1, range1);
 * mb.addExcerpt(buffer2, range2);
 * const editor = createMultiBufferEditor(mb);
 * ```
 */
export function createMultiBufferEditor(
  multiBuffer: MultiBuffer,
  options?: EditorOptions,
): Editor {
  return new Editor(multiBuffer, options);
}
