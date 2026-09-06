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
   *
   * @param languageName - Optional language name for looking up the LanguageQuery
   *   (e.g., "markdown", "typescript"). When provided, the worker uses the
   *   language's skipChildren/styledParents sets for accurate highlighting.
   */
  init(treeSitterWasmUrl: string, languageWasmUrl: string, languageName?: string): Promise<void>;

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

interface PendingVoidRequest {
  readonly kind: "void";
  resolve: (result: undefined) => void;
  reject: (error: Error) => void;
}

interface PendingTokensRequest {
  readonly kind: "tokens";
  resolve: (result: Map<number, Token[]>) => void;
  reject: (error: Error) => void;
}

type PendingRequest = PendingVoidRequest | PendingTokensRequest;

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

  const _pending = new Map<number, PendingRequest>();

  // Token cache: bufferId -> row -> tokens
  const _tokenCache = new Map<string, Map<number, Token[]>>();

  // Track latest getTokens request per buffer to handle stale responses
  const _latestTokenRequests = new Map<string, number>();

  // Track in-flight parse requests per buffer to prevent stale token caching.
  // While a parse is in-flight, getTokensAsync will not populate the cache,
  // because the worker may hold an intermediate parse state.
  const _inflightParses = new Map<string, number>();

  // Track which request IDs correspond to parse operations, so the ack handler
  // can invalidate the cache and clear in-flight tracking on arrival.
  const _parseRequestBuffers = new Map<number, string>();

  // Cache generation per buffer, bumped on every invalidation. A tokens
  // response is only allowed to populate the cache if the generation it was
  // requested under is still current.
  const _cacheEpochs = new Map<string, number>();

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
              if (pending.kind === "void") {
                pending.resolve(undefined);
              }
            }
            break;

          case "ack": {
            // Handle parse-specific ack: invalidate cache and clear in-flight tracking
            const parseBufferId = _parseRequestBuffers.get(response.requestId);
            if (parseBufferId !== undefined) {
              _parseRequestBuffers.delete(response.requestId);
              invalidateCache(parseBufferId);
              if (_inflightParses.get(parseBufferId) === response.requestId) {
                _inflightParses.delete(parseBufferId);
              }
            }

            if (pending) {
              _pending.delete(response.requestId);
              if (response.success) {
                if (pending.kind === "void") {
                  pending.resolve(undefined);
                }
              } else {
                pending.reject(new Error(response.error ?? "Unknown error"));
              }
            }
            break;
          }

          case "tokens":
            if (pending) {
              _pending.delete(response.requestId);
              if (pending.kind === "tokens") {
                // Build a mutable Map from the readonly response tokens
                const tokens = new Map<number, Token[]>();
                for (const [row, rowTokens] of response.tokens) {
                  tokens.set(row, [...rowTokens]);
                }
                pending.resolve(tokens);
              }
            }
            break;
        }
      };

      _worker.onerror = (error) => {
        for (const pending of _pending.values()) {
          pending.reject(new Error(`Worker error: ${error.message}`));
        }
        _pending.clear();
        _parseRequestBuffers.clear();
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
    languageName?: string,
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
      languageName,
    };

    return new Promise((resolve, reject) => {
      _pending.set(requestId, { kind: "void", resolve, reject });
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

    const requestId = _nextRequestId();
    // Track this as an in-flight parse so getTokensAsync won't cache stale results
    _inflightParses.set(bufferId, requestId);
    _parseRequestBuffers.set(requestId, bufferId);

    const message: HighlightParseRequest = {
      type: "parse",
      requestId,
      bufferId,
      text,
      edit,
    };

    return new Promise((resolve, reject) => {
      _pending.set(requestId, { kind: "void", resolve, reject });
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
    let minMissing = Number.MAX_SAFE_INTEGER;
    let maxMissing = -1;
    let hasMissing = false;

    for (let row = startRow; row < endRow; row++) {
      const cachedTokens = cached?.get(row);
      if (cachedTokens !== undefined) {
        result.set(row, cachedTokens);
      } else {
        if (row < minMissing) minMissing = row;
        if (row > maxMissing) maxMissing = row;
        hasMissing = true;
      }
    }

    // If all rows are cached, return immediately
    if (!hasMissing) {
      return result;
    }

    // If worker not available, return what we have
    if (!_worker || !_workerAvailable || !_ready) {
      return result;
    }

    // Request missing rows from worker
    const requestId = _nextRequestId();
    _latestTokenRequests.set(bufferId, requestId);

    const message: HighlightGetTokensRequest = {
      type: "getTokens",
      requestId,
      bufferId,
      startRow: minMissing,
      endRow: maxMissing + 1,
    };

    // Capture whether a parse is in-flight at request time
    const parseInFlight = _inflightParses.has(bufferId);

    // Capture the cache generation at request time. If the buffer is
    // invalidated or deleted before the response lands, these tokens describe
    // text the client has already discarded.
    const epochAtRequest = _cacheEpochs.get(bufferId) ?? 0;

    return new Promise((resolve, reject) => {
      _pending.set(requestId, {
        kind: "tokens",
        resolve: (tokens: Map<number, Token[]>) => {
          // Check if this is still the latest request
          if (_latestTokenRequests.get(bufferId) !== requestId) {
            // Stale response - just return cached results
            resolve(result);
            return;
          }

          // Only populate cache if no parse was in-flight when the request was
          // made (otherwise the tokens may reflect an intermediate parse state)
          // and the buffer has not been invalidated or deleted since.
          const shouldCache =
            !parseInFlight &&
            !_inflightParses.has(bufferId) &&
            (_cacheEpochs.get(bufferId) ?? 0) === epochAtRequest;

          let bufferCache: Map<number, Token[]> | undefined;
          if (shouldCache) {
            bufferCache = _tokenCache.get(bufferId);
            if (!bufferCache) {
              bufferCache = new Map();
              _tokenCache.set(bufferId, bufferCache);
            }
          }

          for (const [row, rowTokens] of tokens) {
            if (bufferCache) {
              bufferCache.set(row, rowTokens);
            }
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
    _cacheEpochs.set(bufferId, (_cacheEpochs.get(bufferId) ?? 0) + 1);
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
      _pending.set(requestId, { kind: "void", resolve, reject });
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
    _latestTokenRequests.clear();
    _inflightParses.clear();
    _parseRequestBuffers.clear();
    _cacheEpochs.clear();

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
