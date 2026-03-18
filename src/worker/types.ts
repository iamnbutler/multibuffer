/**
 * Types for worker thread communication.
 *
 * Both diff and highlight workers use a request/response pattern with
 * monotonic requestIds to handle stale responses gracefully.
 */

import type { DiffOptions } from "../diff/diff.ts";
import type { DiffResult } from "../diff/types.ts";
import type { Token, TreeEdit } from "../renderer/highlighter.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Diff Worker Types
// ─────────────────────────────────────────────────────────────────────────────

export interface DiffRequest {
  readonly type: "diff";
  readonly requestId: number;
  readonly oldText: string;
  readonly newText: string;
  readonly options?: DiffOptions;
}

export interface DiffResponse {
  readonly type: "diff";
  readonly requestId: number;
  readonly result: DiffResult;
}

export type DiffWorkerMessage = DiffRequest;
export type DiffWorkerResponse = DiffResponse;

// ─────────────────────────────────────────────────────────────────────────────
// Highlight Worker Types
// ─────────────────────────────────────────────────────────────────────────────

/** Initialize the highlighter with tree-sitter WASM URLs. */
export interface HighlightInitRequest {
  readonly type: "init";
  readonly requestId: number;
  readonly treeSitterWasmUrl: string;
  readonly languageWasmUrl: string;
}

/** Load an additional language for injection highlighting. */
export interface HighlightLoadLanguageRequest {
  readonly type: "loadLanguage";
  readonly requestId: number;
  readonly name: string;
  readonly wasmUrl: string;
}

/** Parse a buffer's text (full or incremental). */
export interface HighlightParseRequest {
  readonly type: "parse";
  readonly requestId: number;
  readonly bufferId: string;
  readonly text: string;
  readonly edit?: TreeEdit;
}

/** Request tokens for a range of rows. */
export interface HighlightGetTokensRequest {
  readonly type: "getTokens";
  readonly requestId: number;
  readonly bufferId: string;
  readonly startRow: number;
  readonly endRow: number;
}

/** Delete cached tree for a buffer. */
export interface HighlightDeleteBufferRequest {
  readonly type: "deleteBuffer";
  readonly requestId: number;
  readonly bufferId: string;
}

export type HighlightWorkerMessage =
  | HighlightInitRequest
  | HighlightLoadLanguageRequest
  | HighlightParseRequest
  | HighlightGetTokensRequest
  | HighlightDeleteBufferRequest;

/** Ack response for operations that don't return data. */
export interface HighlightAckResponse {
  readonly type: "ack";
  readonly requestId: number;
  readonly success: boolean;
  readonly error?: string;
}

/** Tokens response for getTokens requests. */
export interface HighlightTokensResponse {
  readonly type: "tokens";
  readonly requestId: number;
  /** Map of row number to tokens for that row. */
  readonly tokens: ReadonlyMap<number, readonly Token[]>;
}

/** Ready state notification. */
export interface HighlightReadyResponse {
  readonly type: "ready";
  readonly requestId: number;
}

export type HighlightWorkerResponse =
  | HighlightAckResponse
  | HighlightTokensResponse
  | HighlightReadyResponse;

// ─────────────────────────────────────────────────────────────────────────────
// Shared utilities
// ─────────────────────────────────────────────────────────────────────────────

/** Generate a monotonically increasing request ID. */
export function createRequestIdGenerator(): () => number {
  let id = 0;
  return () => ++id;
}
