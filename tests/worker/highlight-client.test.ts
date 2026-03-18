/**
 * Tests for the highlight client.
 *
 * Note: These tests focus on the no-op fallback since
 * Web Workers are not available in the Bun test environment.
 */

import { describe, expect, test } from "bun:test";
import { createNoOpHighlightClient } from "../../src/worker/highlight-client.ts";

describe("createNoOpHighlightClient", () => {
  test("init resolves immediately", async () => {
    const client = createNoOpHighlightClient();
    await expect(client.init("", "")).resolves.toBeUndefined();
  });

  test("parseBuffer is a no-op", () => {
    const client = createNoOpHighlightClient();
    expect(() => client.parseBuffer("buffer1", "const x = 1;")).not.toThrow();
  });

  test("parseBufferAsync resolves immediately", async () => {
    const client = createNoOpHighlightClient();
    await expect(client.parseBufferAsync("buffer1", "const x = 1;")).resolves.toBeUndefined();
  });

  test("getLineTokens returns empty array", () => {
    const client = createNoOpHighlightClient();
    const tokens = client.getLineTokens("buffer1", 0);
    expect(tokens).toEqual([]);
  });

  test("getTokensAsync returns empty map", async () => {
    const client = createNoOpHighlightClient();
    const tokens = await client.getTokensAsync("buffer1", 0, 10);
    expect(tokens.size).toBe(0);
  });

  test("invalidateCache is a no-op", () => {
    const client = createNoOpHighlightClient();
    expect(() => client.invalidateCache("buffer1")).not.toThrow();
  });

  test("deleteBuffer resolves immediately", async () => {
    const client = createNoOpHighlightClient();
    await expect(client.deleteBuffer("buffer1")).resolves.toBeUndefined();
  });

  test("dispose is a no-op", () => {
    const client = createNoOpHighlightClient();
    expect(() => client.dispose()).not.toThrow();
  });

  test("ready is false", () => {
    const client = createNoOpHighlightClient();
    expect(client.ready).toBe(false);
  });

  test("workerAvailable is false", () => {
    const client = createNoOpHighlightClient();
    expect(client.workerAvailable).toBe(false);
  });

  test("implements SyntaxHighlighter interface", () => {
    const client = createNoOpHighlightClient();

    // SyntaxHighlighter requires: ready, parseBuffer, getLineTokens
    expect(typeof client.ready).toBe("boolean");
    expect(typeof client.parseBuffer).toBe("function");
    expect(typeof client.getLineTokens).toBe("function");
  });
});
