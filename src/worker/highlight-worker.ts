/**
 * Web Worker for syntax highlighting.
 *
 * Offloads tree-sitter parsing and token extraction from the main thread.
 * Maintains parser state per buffer for incremental parsing.
 *
 * Usage:
 * ```ts
 * const worker = new Worker(new URL("./highlight-worker.ts", import.meta.url));
 * worker.postMessage({ type: "init", requestId: 1, treeSitterWasmUrl, languageWasmUrl });
 * // Wait for ready response
 * worker.postMessage({ type: "parse", requestId: 2, bufferId, text });
 * worker.postMessage({ type: "getTokens", requestId: 3, bufferId, startRow: 0, endRow: 50 });
 * ```
 */

import type { Token } from "../renderer/highlighter.ts";
import { Highlighter } from "../renderer/highlighter.ts";
import type {
  HighlightAckResponse,
  HighlightReadyResponse,
  HighlightTokensResponse,
  HighlightWorkerMessage,
} from "./types.ts";

declare const self: Worker;

let highlighter: Highlighter | null = null;

function sendAck(requestId: number, success: boolean, error?: string): void {
  const response: HighlightAckResponse = {
    type: "ack",
    requestId,
    success,
    error,
  };
  self.postMessage(response);
}

function sendReady(requestId: number): void {
  const response: HighlightReadyResponse = {
    type: "ready",
    requestId,
  };
  self.postMessage(response);
}

function sendTokens(requestId: number, tokens: Map<number, Token[]>): void {
  // Convert Map to array of entries for structured cloning
  const tokensArray: Array<[number, Token[]]> = Array.from(tokens.entries());
  const response: HighlightTokensResponse = {
    type: "tokens",
    requestId,
    // biome-ignore lint/plugin/no-type-assertion: expect: Map conversion for postMessage serialization
    tokens: new Map(tokensArray) as ReadonlyMap<number, readonly Token[]>,
  };
  self.postMessage(response);
}

self.onmessage = async (event: MessageEvent<HighlightWorkerMessage>) => {
  const message = event.data;

  switch (message.type) {
    case "init": {
      try {
        highlighter = new Highlighter();
        await highlighter.init(message.treeSitterWasmUrl, message.languageWasmUrl);
        sendReady(message.requestId);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        sendAck(message.requestId, false, errorMessage);
      }
      break;
    }

    case "loadLanguage": {
      // The base Highlighter doesn't support multiple languages.
      // This is a no-op for the simple highlighter.
      // For injection support, use InjectionHighlighter in a separate worker.
      sendAck(message.requestId, true);
      break;
    }

    case "parse": {
      if (!highlighter || !highlighter.ready) {
        sendAck(message.requestId, false, "Highlighter not initialized");
        break;
      }

      try {
        highlighter.parseBuffer(message.bufferId, message.text, message.edit);
        sendAck(message.requestId, true);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        sendAck(message.requestId, false, errorMessage);
      }
      break;
    }

    case "getTokens": {
      if (!highlighter || !highlighter.ready) {
        sendTokens(message.requestId, new Map());
        break;
      }

      const tokens = new Map<number, Token[]>();
      for (let row = message.startRow; row < message.endRow; row++) {
        const lineTokens = highlighter.getLineTokens(message.bufferId, row);
        if (lineTokens.length > 0) {
          tokens.set(row, lineTokens);
        }
      }
      sendTokens(message.requestId, tokens);
      break;
    }

    case "deleteBuffer": {
      // The Highlighter class doesn't expose a delete method, but we can
      // work around this by parsing with empty text (which will clear the tree).
      // In a production implementation, we'd add a deleteBuffer method to Highlighter.
      if (highlighter?.ready) {
        // Parse empty string to clear the tree for this buffer
        highlighter.parseBuffer(message.bufferId, "");
      }
      sendAck(message.requestId, true);
      break;
    }
  }
};
