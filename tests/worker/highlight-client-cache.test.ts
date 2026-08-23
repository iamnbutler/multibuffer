/**
 * Tests for the real (worker-backed) highlight client's token cache.
 *
 * These drive `createHighlightClient` against a stub Worker that reproduces the
 * shipped `highlight-worker.ts` protocol, including its `lineTokens.length > 0`
 * filter — the worker omits token-less rows from its response entirely.
 *
 * `Worker` is a global in the Bun test environment, so the client's worker path
 * is reachable here; a stub is used rather than a real worker only so that the
 * message protocol and the number of round-trips can be asserted directly.
 */

import { beforeEach, describe, expect, test } from "bun:test";
import type { Token } from "../../src/renderer/highlighter.ts";
import { createHighlightClient } from "../../src/worker/highlight-client.ts";

interface SentMessage {
  readonly type: string;
  readonly requestId: number;
  readonly startRow?: number;
  readonly endRow?: number;
}

/** Rows the stub grammar produces tokens for. Every other row is token-less. */
let tokenedRows: Set<number> = new Set();

class StubWorker {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: { message: string }) => void) | null = null;
  readonly sent: SentMessage[] = [];
  /** Rows the worker had to tokenize across all getTokens requests. */
  rowsTokenized = 0;
  private terminated = false;

  constructor(_url?: unknown, _options?: unknown) {
    currentWorker = this;
  }

  postMessage(message: SentMessage): void {
    this.sent.push(message);
    queueMicrotask(() => {
      this.respond(message);
    });
  }

  terminate(): void {
    this.terminated = true;
  }

  get getTokensRequests(): SentMessage[] {
    return this.sent.filter((m) => m.type === "getTokens");
  }

  private respond(message: SentMessage): void {
    if (this.terminated) return;
    const post = (data: unknown) => {
      this.onmessage?.({ data });
    };

    switch (message.type) {
      case "init":
        post({ type: "ready", requestId: message.requestId });
        break;

      case "parse":
      case "deleteBuffer":
        post({ type: "ack", requestId: message.requestId, success: true });
        break;

      case "getTokens": {
        // Mirrors highlight-worker.ts: rows with no tokens are left out.
        const tokens = new Map<number, Token[]>();
        const startRow = message.startRow ?? 0;
        const endRow = message.endRow ?? 0;
        for (let row = startRow; row < endRow; row++) {
          this.rowsTokenized++;
          if (tokenedRows.has(row)) {
            tokens.set(row, [makeToken()]);
          }
        }
        post({ type: "tokens", requestId: message.requestId, tokens });
        break;
      }
    }
  }
}

function makeToken(): Token {
  return { startColumn: 0, endColumn: 1, color: "#abcdef" };
}

let currentWorker: StubWorker;

function installStubWorker(): void {
  // biome-ignore lint/suspicious/noExplicitAny: expect: the stub stands in for the Worker global, whose real constructor signature we intentionally do not satisfy
  // biome-ignore lint/plugin/no-type-assertion: expect: assigning a test double onto globalThis requires widening
  (globalThis as any).Worker = StubWorker;
}

function rowsExcept(count: number, blanks: readonly number[]): Set<number> {
  return new Set(
    Array.from({ length: count }, (_, i) => i).filter((row) => !blanks.includes(row)),
  );
}

/** Create an initialized, parsed client with a warm-able cache. */
async function createReadyClient() {
  const client = createHighlightClient("stub://highlight-worker");
  await client.init("tree-sitter.wasm", "language.wasm");
  await client.parseBufferAsync("buffer1", "text");
  // The parse ack invalidates the cache; let it arrive before measuring.
  await new Promise((resolve) => setTimeout(resolve, 0));
  return client;
}

describe("highlight client token cache", () => {
  beforeEach(() => {
    installStubWorker();
  });

  test("warms after one request when every row has tokens", async () => {
    tokenedRows = rowsExcept(50, []);
    const client = await createReadyClient();

    for (let i = 0; i < 10; i++) {
      await client.getTokensAsync("buffer1", 0, 50);
    }

    expect(currentWorker.getTokensRequests.length).toBe(1);
    client.dispose();
  });

  test("warms when a row in the middle has no tokens", async () => {
    tokenedRows = rowsExcept(50, [10]);
    const client = await createReadyClient();

    for (let i = 0; i < 10; i++) {
      await client.getTokensAsync("buffer1", 0, 50);
    }

    // Without negative caching, row 10 reads as a miss on every call.
    expect(currentWorker.getTokensRequests.length).toBe(1);
    client.dispose();
  });

  test("does not re-tokenize the viewport when token-less rows sit near both ends", async () => {
    tokenedRows = rowsExcept(50, [2, 48]);
    const client = await createReadyClient();

    for (let i = 0; i < 10; i++) {
      await client.getTokensAsync("buffer1", 0, 50);
    }

    expect(currentWorker.getTokensRequests.length).toBe(1);
    // 50 rows on the first request and nothing after it.
    expect(currentWorker.rowsTokenized).toBe(50);
    client.dispose();
  });

  test("a fully token-less range is requested once, not on every call", async () => {
    tokenedRows = new Set();
    const client = await createReadyClient();

    for (let i = 0; i < 5; i++) {
      await client.getTokensAsync("buffer1", 0, 20);
    }

    expect(currentWorker.getTokensRequests.length).toBe(1);
    client.dispose();
  });

  test("token-less rows stay out of the returned map", async () => {
    tokenedRows = rowsExcept(50, [10]);
    const client = await createReadyClient();

    const first = await client.getTokensAsync("buffer1", 0, 50);
    const second = await client.getTokensAsync("buffer1", 0, 50);

    // Same shape on the cached path as on the worker path: row 10 is absent
    // from both, and never present as an empty array.
    expect(first.has(10)).toBe(false);
    expect(second.has(10)).toBe(false);
    expect(first.size).toBe(49);
    expect(second.size).toBe(49);
    client.dispose();
  });

  test("a parse invalidates the cached token-less rows", async () => {
    tokenedRows = rowsExcept(50, [10]);
    const client = await createReadyClient();

    await client.getTokensAsync("buffer1", 0, 50);
    const afterWarm = currentWorker.getTokensRequests.length;

    // Row 10 gains tokens after an edit; the parse ack must clear the negative
    // entry so the new tokens are picked up.
    tokenedRows = rowsExcept(50, []);
    await client.parseBufferAsync("buffer1", "text2");
    await new Promise((resolve) => setTimeout(resolve, 0));

    const reloaded = await client.getTokensAsync("buffer1", 0, 50);

    expect(currentWorker.getTokensRequests.length).toBeGreaterThan(afterWarm);
    expect(reloaded.has(10)).toBe(true);
    client.dispose();
  });
});
