/**
 * Main-thread client for the highlight worker.
 *
 * Provides an async interface for syntax highlighting off the main thread.
 * Caches token results and handles stale response rejection.
 */

import type { SyntaxHighlighter, Token, TreeEdit } from "../renderer/highlighter.ts";
import type {
  HighlightDeleteBufferRequest,
  HighlightGetTokensRequest,
  HighlightInitRequest,
  HighlightParseRequest,
  HighlightWorkerMessage,
  HighlightWorkerResponse,
} from "./types.ts";
import { createRequestIdGenerator } from "./types.ts";

export interface HighlightClient extends SyntaxHighlighter {
  /**
   * Initialize the highlighter with tree-sitter WASM URLs.
   * Must be called before any other methods.
   */
  init(treeSitterWasmUrl: string, languageWasmUrl: string): Promise<void>;

  /**
   * Parse a buffer's text for syntax highlighting.
   * Supports incremental parsing when an edit descriptor is provided.
   */
  parseBufferAsync(bufferId: string, text: string, edit?: TreeEdit): Promise<void>;

  /**
   * Get tokens for a range of rows.
   * Results are cached and returned from cache when available.
   */
  getTokensAsync(bufferId: string, startRow: number, endRow: number): Promise<Map<number, Token[]>>;

  /**
   * Invalidate cached tokens for a buffer (e.g., after an edit).
   */
  invalidateCache(bufferId: string): void;

  /**
   * Delete a buffer from the worker's cache.
   */
  deleteBuffer(bufferId: string): Promise<void>;

  /**
   * Terminate the worker and release resources.
   */
  dispose(): void;

  /** Whether the worker is available and initialized. */
  readonly workerAvailable: boolean;
}

interface PendingRequest<T> {
  resolve: (result: T) => void;
  reject: (error: Error) => void;
}

/**
 * Create a highlight client that offloads computation to a Web Worker.
 *
 * @param workerUrl - URL to the highlight worker script.
 */
export function createHighlightClient(workerUrl: URL | string): HighlightClient {
  let _worker: Worker | null = null;
  let _workerAvailable = false;
  let _ready = false;
  const _nextRequestId = createRequestIdGenerator();

  // biome-ignore lint/suspicious/noExplicitAny: expect: pending requests have different resolve types
  const _pending = new Map<number, PendingRequest<any>>();

  // Token cache: bufferId -> row -> tokens
  const _tokenCache = new Map<string, Map<number, Token[]>>();

  // Track latest getTokens request per buffer to handle stale responses
  const _latestTokenRequests = new Map<string, number>();

  // Try to create the worker
  if (typeof Worker !== "undefined") {
    try {
      _worker = new Worker(workerUrl, { type: "module" });
      _workerAvailable = true;

      _worker.onmessage = (event: MessageEvent<HighlightWorkerResponse>) => {
        const response = event.data;
        const pending = _pending.get(response.requestId);

        switch (response.type) {
          case "ready":
            _ready = true;
            if (pending) {
              _pending.delete(response.requestId);
              pending.resolve(undefined);
            }
            break;

          case "ack":
            if (pending) {
              _pending.delete(response.requestId);
              if (response.success) {
                pending.resolve(undefined);
              } else {
                pending.reject(new Error(response.error ?? "Unknown error"));
              }
            }
            break;

          case "tokens":
            if (pending) {
              _pending.delete(response.requestId);
              // Convert to mutable Map for internal use
              const tokens = new Map(response.tokens);
              pending.resolve(tokens);
            }
            break;
        }
      };

      _worker.onerror = (error) => {
        for (const pending of _pending.values()) {
          pending.reject(new Error(`Worker error: ${error.message}`));
        }
        _pending.clear();
        _workerAvailable = false;
        _ready = false;
      };
    } catch {
      _workerAvailable = false;
    }
  }

  function sendMessage(message: HighlightWorkerMessage): void {
    _worker?.postMessage(message);
  }

  async function init(
    treeSitterWasmUrl: string,
    languageWasmUrl: string,
  ): Promise<void> {
    if (!_worker || !_workerAvailable) {
      throw new Error("Worker not available");
    }

    const requestId = _nextRequestId();
    const message: HighlightInitRequest = {
      type: "init",
      requestId,
      treeSitterWasmUrl,
      languageWasmUrl,
    };

    return new Promise((resolve, reject) => {
      _pending.set(requestId, { resolve, reject });
      sendMessage(message);
    });
  }

  async function parseBufferAsync(
    bufferId: string,
    text: string,
    edit?: TreeEdit,
  ): Promise<void> {
    if (!_worker || !_workerAvailable || !_ready) {
      return;
    }

    // Invalidate cache for this buffer
    invalidateCache(bufferId);

    const requestId = _nextRequestId();
    const message: HighlightParseRequest = {
      type: "parse",
      requestId,
      bufferId,
      text,
      edit,
    };

    return new Promise((resolve, reject) => {
      _pending.set(requestId, { resolve, reject });
      sendMessage(message);
    });
  }

  async function getTokensAsync(
    bufferId: string,
    startRow: number,
    endRow: number,
  ): Promise<Map<number, Token[]>> {
    // Check cache first
    const cached = _tokenCache.get(bufferId);
    const result = new Map<number, Token[]>();
    const missingRows: number[] = [];

    for (let row = startRow; row < endRow; row++) {
      const cachedTokens = cached?.get(row);
      if (cachedTokens !== undefined) {
        result.set(row, cachedTokens);
      } else {
        missingRows.push(row);
      }
    }

    // If all rows are cached, return immediately
    if (missingRows.length === 0) {
      return result;
    }

    // If worker not available, return what we have
    if (!_worker || !_workerAvailable || !_ready) {
      return result;
    }

    // Request missing rows from worker
    const requestId = _nextRequestId();
    _latestTokenRequests.set(bufferId, requestId);

    const minRow = Math.min(...missingRows);
    const maxRow = Math.max(...missingRows) + 1;

    const message: HighlightGetTokensRequest = {
      type: "getTokens",
      requestId,
      bufferId,
      startRow: minRow,
      endRow: maxRow,
    };

    return new Promise((resolve, reject) => {
      _pending.set(requestId, {
        resolve: (tokens: Map<number, Token[]>) => {
          // Check if this is still the latest request
          if (_latestTokenRequests.get(bufferId) !== requestId) {
            // Stale response - just return cached results
            resolve(result);
            return;
          }

          // Update cache and result
          let bufferCache = _tokenCache.get(bufferId);
          if (!bufferCache) {
            bufferCache = new Map();
            _tokenCache.set(bufferId, bufferCache);
          }

          for (const [row, rowTokens] of tokens) {
            bufferCache.set(row, rowTokens);
            result.set(row, rowTokens);
          }

          resolve(result);
        },
        reject,
      });
      sendMessage(message);
    });
  }

  function invalidateCache(bufferId: string): void {
    _tokenCache.delete(bufferId);
  }

  async function deleteBuffer(bufferId: string): Promise<void> {
    invalidateCache(bufferId);

    if (!_worker || !_workerAvailable) {
      return;
    }

    const requestId = _nextRequestId();
    const message: HighlightDeleteBufferRequest = {
      type: "deleteBuffer",
      requestId,
      bufferId,
    };

    return new Promise((resolve, reject) => {
      _pending.set(requestId, { resolve, reject });
      sendMessage(message);
    });
  }

  function dispose(): void {
    if (_worker) {
      _worker.terminate();
      _worker = null;
    }
    _workerAvailable = false;
    _ready = false;
    _tokenCache.clear();

    for (const pending of _pending.values()) {
      pending.reject(new Error("Client disposed"));
    }
    _pending.clear();
  }

  // Synchronous SyntaxHighlighter interface (uses cache, returns empty if not cached)
  function parseBuffer(bufferId: string, text: string, edit?: TreeEdit): void {
    // Fire and forget async parse
    parseBufferAsync(bufferId, text, edit).catch(() => {});
  }

  function getLineTokens(bufferId: string, row: number): Token[] {
    const cached = _tokenCache.get(bufferId);
    return cached?.get(row) ?? [];
  }

  return {
    init,
    parseBuffer,
    parseBufferAsync,
    getLineTokens,
    getTokensAsync,
    invalidateCache,
    deleteBuffer,
    dispose,
    get ready() {
      return _ready;
    },
    get workerAvailable() {
      return _workerAvailable && _ready;
    },
  };
}

/**
 * Create a highlight client that always returns empty tokens.
 * Useful for environments without Worker support or for testing.
 */
export function createNoOpHighlightClient(): HighlightClient {
  return {
    init: () => Promise.resolve(),
    parseBuffer: () => {},
    parseBufferAsync: () => Promise.resolve(),
    getLineTokens: () => [],
    getTokensAsync: () => Promise.resolve(new Map()),
    invalidateCache: () => {},
    deleteBuffer: () => Promise.resolve(),
    dispose: () => {},
    ready: false,
    workerAvailable: false,
  };
}
