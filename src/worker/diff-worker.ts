/**
 * Web Worker for diff computation.
 *
 * Offloads Myers diff algorithm from the main thread to avoid blocking
 * UI during large file comparisons.
 *
 * Usage:
 * ```ts
 * const worker = new Worker(new URL("./diff-worker.ts", import.meta.url));
 * worker.postMessage({ type: "diff", requestId: 1, oldText, newText });
 * worker.onmessage = (e) => console.log(e.data.result);
 * ```
 */

import { diff } from "../diff/diff.ts";
import type { DiffWorkerMessage, DiffWorkerResponse } from "./types.ts";

declare const self: Worker;

self.onmessage = (event: MessageEvent<DiffWorkerMessage>) => {
  const message = event.data;

  if (message.type === "diff") {
    const result = diff(message.oldText, message.newText, message.options);
    const response: DiffWorkerResponse = {
      type: "diff",
      requestId: message.requestId,
      result,
    };
    self.postMessage(response);
  }
};
