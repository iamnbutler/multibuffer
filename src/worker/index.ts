/**
 * Worker module for offloading expensive operations from the main thread.
 *
 * Provides Web Worker implementations for:
 * - Diff computation (Myers algorithm)
 * - Syntax highlighting (tree-sitter)
 *
 * Both workers use a request/response pattern with monotonic requestIds
 * to handle stale responses gracefully.
 *
 * @example
 * ```ts
 * import { createDiffClient, createHighlightClient } from "multibuffer/worker";
 *
 * // Diff client with worker offloading
 * const diffClient = createDiffClient(
 *   new URL("./worker/diff-worker.ts", import.meta.url)
 * );
 * const result = await diffClient.diff(oldText, newText);
 *
 * // Highlight client with worker offloading
 * const highlightClient = createHighlightClient(
 *   new URL("./worker/highlight-worker.ts", import.meta.url)
 * );
 * await highlightClient.init(treeSitterWasmUrl, languageWasmUrl);
 * await highlightClient.parseBufferAsync(bufferId, text);
 * const tokens = await highlightClient.getTokensAsync(bufferId, 0, 100);
 * ```
 */

// Diff client
export type { DiffClient } from "./diff-client.ts";
export { createDiffClient, createSyncDiffClient } from "./diff-client.ts";

// Highlight client
export type { HighlightClient } from "./highlight-client.ts";
export { createHighlightClient, createNoOpHighlightClient } from "./highlight-client.ts";

// Worker message types (for custom worker implementations)
export type {
  DiffRequest,
  DiffResponse,
  DiffWorkerMessage,
  DiffWorkerResponse,
  HighlightAckResponse,
  HighlightDeleteBufferRequest,
  HighlightGetTokensRequest,
  HighlightInitRequest,
  HighlightLoadLanguageRequest,
  HighlightParseRequest,
  HighlightReadyResponse,
  HighlightTokensResponse,
  HighlightWorkerMessage,
  HighlightWorkerResponse,
} from "./types.ts";
export { createRequestIdGenerator } from "./types.ts";
