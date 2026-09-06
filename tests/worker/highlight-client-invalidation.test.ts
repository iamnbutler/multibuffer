/**
 * Tests for token cache invalidation in the real (worker-backed) highlight
 * client.
 *
 * `Worker` is a global in Bun, so the client can be driven end-to-end by
 * substituting a fake Worker that records posted messages and lets each test
 * deliver responses by hand. That makes the cache's staleness rules — which
 * decide whether a tokens response is allowed to populate the cache —
 * directly observable through `getLineTokens`.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Token } from "../../src/renderer/highlighter.ts";
import type { HighlightClient } from "../../src/worker/highlight-client.ts";
import { createHighlightClient } from "../../src/worker/highlight-client.ts";
import type { HighlightWorkerMessage, HighlightWorkerResponse } from "../../src/worker/types.ts";

/** Stand-in for a Web Worker that never runs any code of its own. */
class FakeWorker {
  onmessage: ((event: MessageEvent<HighlightWorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  readonly posted: HighlightWorkerMessage[] = [];
  terminated = false;

  postMessage(message: HighlightWorkerMessage): void {
    this.posted.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  /** Deliver a worker response to the client. */
  respond(response: HighlightWorkerResponse): void {
    this.onmessage?.(new MessageEvent("message", { data: response }));
  }
}

let created: FakeWorker[] = [];
let originalWorker: typeof globalThis.Worker;

function installFakeWorker(): void {
  created = [];
  originalWorker = globalThis.Worker;
  Object.defineProperty(globalThis, "Worker", {
    value: class extends FakeWorker {
      constructor(_url: URL | string, _options?: { type?: string }) {
        super();
        created.push(this);
      }
    },
    writable: true,
    configurable: true,
  });
}

function restoreWorker(): void {
  Object.defineProperty(globalThis, "Worker", {
    value: originalWorker,
    writable: true,
    configurable: true,
  });
}

/** The most recent request id posted for a given message type. */
function requestIdFor(worker: FakeWorker, type: HighlightWorkerMessage["type"]): number {
  for (let i = worker.posted.length - 1; i >= 0; i--) {
    const message = worker.posted[i];
    if (message !== undefined && message.type === type) {
      return message.requestId;
    }
  }
  throw new Error(`no ${type} message was posted`);
}

function countPosted(worker: FakeWorker, type: HighlightWorkerMessage["type"]): number {
  return worker.posted.filter((message) => message.type === type).length;
}

const TOKEN: Token = { startColumn: 0, endColumn: 5, color: "#ff0000" };
const ROW_0_TOKENS: ReadonlyMap<number, readonly Token[]> = new Map([[0, [TOKEN]]]);

/** Create a client and drive it through init to the ready state. */
async function createReadyClient(): Promise<{ client: HighlightClient; worker: FakeWorker }> {
  const client = createHighlightClient("fake://highlight-worker");
  const worker = created[0];
  if (worker === undefined) {
    throw new Error("client did not construct a Worker");
  }

  const ready = client.init("tree-sitter.wasm", "language.wasm");
  worker.respond({ type: "ready", requestId: requestIdFor(worker, "init") });
  await ready;

  return { client, worker };
}

describe("createHighlightClient cache invalidation", () => {
  beforeEach(installFakeWorker);
  afterEach(restoreWorker);

  test("caches tokens returned by the worker", async () => {
    const { client, worker } = await createReadyClient();

    const first = client.getTokensAsync("buffer1", 0, 1);
    worker.respond({
      type: "tokens",
      requestId: requestIdFor(worker, "getTokens"),
      tokens: ROW_0_TOKENS,
    });
    await first;

    expect(client.getLineTokens("buffer1", 0)).toEqual([TOKEN]);

    // A second read for the same row is served from cache, not the worker.
    const second = await client.getTokensAsync("buffer1", 0, 1);
    expect(second.get(0)).toEqual([TOKEN]);
    expect(countPosted(worker, "getTokens")).toBe(1);
  });

  test("does not cache tokens requested before invalidateCache", async () => {
    const { client, worker } = await createReadyClient();

    const pending = client.getTokensAsync("buffer1", 0, 1);
    const requestId = requestIdFor(worker, "getTokens");

    // The buffer changed while the request was in flight.
    client.invalidateCache("buffer1");

    worker.respond({ type: "tokens", requestId, tokens: ROW_0_TOKENS });
    await pending;

    expect(client.getLineTokens("buffer1", 0)).toEqual([]);
  });

  test("does not cache tokens requested before deleteBuffer", async () => {
    const { client, worker } = await createReadyClient();

    const pending = client.getTokensAsync("buffer1", 0, 1);
    const requestId = requestIdFor(worker, "getTokens");

    // The buffer is dropped while the tokens request is in flight.
    const deleted = client.deleteBuffer("buffer1");

    worker.respond({ type: "tokens", requestId, tokens: ROW_0_TOKENS });
    await pending;

    worker.respond({
      type: "ack",
      requestId: requestIdFor(worker, "deleteBuffer"),
      success: true,
    });
    await deleted;

    // The worker has forgotten this buffer, so the client must not keep
    // serving tokens for it.
    expect(client.getLineTokens("buffer1", 0)).toEqual([]);
  });

  test("does not cache tokens requested while a parse is in flight", async () => {
    const { client, worker } = await createReadyClient();

    const parsed = client.parseBufferAsync("buffer1", "const x = 1;");
    const pending = client.getTokensAsync("buffer1", 0, 1);

    worker.respond({
      type: "tokens",
      requestId: requestIdFor(worker, "getTokens"),
      tokens: ROW_0_TOKENS,
    });
    await pending;

    worker.respond({ type: "ack", requestId: requestIdFor(worker, "parse"), success: true });
    await parsed;

    expect(client.getLineTokens("buffer1", 0)).toEqual([]);
  });
});
