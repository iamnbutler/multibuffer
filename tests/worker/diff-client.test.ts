/**
 * Tests for the diff client.
 *
 * Note: These tests focus on the synchronous fallback path since
 * Web Workers are not available in the Bun test environment.
 */

import { describe, expect, test } from "bun:test";
import { createDiffClient, createSyncDiffClient } from "../../src/worker/diff-client.ts";

describe("createSyncDiffClient", () => {
  test("computes diff synchronously", async () => {
    const client = createSyncDiffClient();
    const result = await client.diff("hello\nworld", "hello\nearth");

    expect(result.isEqual).toBe(false);
    expect(result.hunks.length).toBe(1);
  });

  test("reports identical texts as equal", async () => {
    const client = createSyncDiffClient();
    const result = await client.diff("same", "same");

    expect(result.isEqual).toBe(true);
    expect(result.hunks).toEqual([]);
  });

  test("handles empty texts", async () => {
    const client = createSyncDiffClient();

    const emptyToEmpty = await client.diff("", "");
    expect(emptyToEmpty.isEqual).toBe(true);

    const emptyToText = await client.diff("", "hello");
    expect(emptyToText.isEqual).toBe(false);
    expect(emptyToText.hunks.length).toBe(1);

    const textToEmpty = await client.diff("hello", "");
    expect(textToEmpty.isEqual).toBe(false);
    expect(textToEmpty.hunks.length).toBe(1);
  });

  test("workerAvailable is false", () => {
    const client = createSyncDiffClient();
    expect(client.workerAvailable).toBe(false);
  });

  test("dispose is a no-op", () => {
    const client = createSyncDiffClient();
    expect(() => client.dispose()).not.toThrow();
  });

  test("passes options through", async () => {
    const client = createSyncDiffClient();

    // Create text with a change in the middle, far from edges
    const lines = Array.from({ length: 20 }, (_, i) => `line ${i}`);
    const oldText = lines.join("\n");
    lines[10] = "changed";
    const newText = lines.join("\n");

    // With context: 1, the hunk should be smaller
    const result = await client.diff(oldText, newText, { context: 1 });
    expect(result.hunks.length).toBe(1);
    const hunk = result.hunks[0];
    if (!hunk) throw new Error("expected hunk");
    // With context 1, we expect at most 1 equal line before and after the change
    const equalLines = hunk.lines.filter((l) => l.kind === "equal");
    expect(equalLines.length).toBeLessThanOrEqual(2);
  });
});

describe("createDiffClient without worker", () => {
  test("falls back to sync computation when no URL provided", async () => {
    // Without a worker URL, should use sync fallback
    const client = createDiffClient();
    const result = await client.diff("a\nb", "a\nc");

    expect(result.isEqual).toBe(false);
    expect(result.hunks.length).toBe(1);
    expect(client.workerAvailable).toBe(false);
  });
});
