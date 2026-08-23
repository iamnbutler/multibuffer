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
  /** Inputs retained so the request can be answered on the main thread if the worker dies. */
  readonly oldText: string;
  readonly newText: string;
  readonly options?: DiffOptions;
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
            pending.resolve(response.result);
          }
        }
      };

      _worker.onerror = (error) => {
        // On worker error, fall back to main thread. Mark the worker unavailable
        // first so anything queued from these continuations takes the fast path.
        _workerAvailable = false;

        const stranded = [..._pending.values()];
        _pending.clear();

        for (const pending of stranded) {
          // The in-flight requests are answerable here: diff() is the same pure
          // function the worker would have run. Failing them would strand the
          // very first request behind an error the fallback exists to absorb.
          try {
            pending.resolve(diff(pending.oldText, pending.newText, pending.options));
          } catch {
            pending.reject(new Error(`Worker error: ${error.message}`));
          }
        }
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

    // Reject any pending requests (they're now stale)
    for (const [id, pending] of _pending) {
      if (id !== requestId) {
        pending.reject(new Error("Request superseded by newer request"));
        _pending.delete(id);
      }
    }

    return new Promise<DiffResult>((resolve, reject) => {
      _pending.set(requestId, { resolve, reject, oldText, newText, options });

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
