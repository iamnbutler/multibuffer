/**
 * Main-thread client for the diff worker.
 *
 * Provides an async interface for computing diffs off the main thread.
 * Handles stale response rejection and graceful fallback to main-thread
 * computation when workers are unavailable.
 */

import type { DiffOptions } from "../diff/diff.ts";
import { diff } from "../diff/diff.ts";
import type { DiffResult } from "../diff/types.ts";
import type { DiffWorkerMessage, DiffWorkerResponse } from "./types.ts";
import { createRequestIdGenerator } from "./types.ts";

export interface DiffClient {
  /**
   * Compute a diff between two texts.
   * Returns a promise that resolves with the diff result.
   * If a newer request is made before this one completes, the promise rejects.
   */
  diff(oldText: string, newText: string, options?: DiffOptions): Promise<DiffResult>;

  /**
   * Terminate the worker and release resources.
   * After calling dispose(), the client falls back to main-thread computation.
   */
  dispose(): void;

  /** Whether the worker is available. */
  readonly workerAvailable: boolean;
}

interface PendingRequest {
  resolve: (result: DiffResult) => void;
  reject: (error: Error) => void;
}

/**
 * Create a diff client that offloads computation to a Web Worker.
 *
 * @param workerUrl - URL to the diff worker script. If undefined, uses main-thread fallback.
 */
export function createDiffClient(workerUrl?: URL | string): DiffClient {
  let _worker: Worker | null = null;
  let _workerAvailable = false;
  const _nextRequestId = createRequestIdGenerator();
  const _pending = new Map<number, PendingRequest>();
  let _latestRequestId = 0;

  // Try to create the worker
  if (workerUrl && typeof Worker !== "undefined") {
    try {
      _worker = new Worker(workerUrl, { type: "module" });
      _workerAvailable = true;

      _worker.onmessage = (event: MessageEvent<DiffWorkerResponse>) => {
        const response = event.data;
        if (response.type === "diff") {
          const pending = _pending.get(response.requestId);
          _pending.delete(response.requestId);

          if (pending) {
            // Only resolve if this is the latest request
            if (response.requestId === _latestRequestId) {
              pending.resolve(response.result);
            } else {
              // Stale response - reject with a specific error
              pending.reject(new Error("Request superseded by newer request"));
            }
          }
        }
      };

      _worker.onerror = (error) => {
        // On worker error, reject all pending requests and fall back to main thread
        for (const pending of _pending.values()) {
          pending.reject(new Error(`Worker error: ${error.message}`));
        }
        _pending.clear();
        _workerAvailable = false;
      };
    } catch {
      // Worker creation failed, will use fallback
      _workerAvailable = false;
    }
  }

  function computeDiff(
    oldText: string,
    newText: string,
    options?: DiffOptions,
  ): Promise<DiffResult> {
    // Fast path: if worker is not available, compute on main thread
    if (!_worker || !_workerAvailable) {
      return Promise.resolve(diff(oldText, newText, options));
    }

    const requestId = _nextRequestId();
    _latestRequestId = requestId;

    // Reject any pending requests (they're now stale)
    for (const [id, pending] of _pending) {
      if (id !== requestId) {
        pending.reject(new Error("Request superseded by newer request"));
        _pending.delete(id);
      }
    }

    return new Promise<DiffResult>((resolve, reject) => {
      _pending.set(requestId, { resolve, reject });

      const message: DiffWorkerMessage = {
        type: "diff",
        requestId,
        oldText,
        newText,
        options,
      };

      _worker?.postMessage(message);
    });
  }

  function dispose(): void {
    if (_worker) {
      _worker.terminate();
      _worker = null;
    }
    _workerAvailable = false;

    // Reject all pending requests
    for (const pending of _pending.values()) {
      pending.reject(new Error("Client disposed"));
    }
    _pending.clear();
  }

  return {
    diff: computeDiff,
    dispose,
    get workerAvailable() {
      return _workerAvailable;
    },
  };
}

/**
 * Create a diff client that always uses main-thread computation.
 * Useful for environments without Worker support or for testing.
 */
export function createSyncDiffClient(): DiffClient {
  return {
    diff: (oldText, newText, options) =>
      Promise.resolve(diff(oldText, newText, options)),
    dispose: () => {},
    workerAvailable: false,
  };
}
