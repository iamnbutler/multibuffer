/**
 * Tests for the diff client.
 *
 * Workers ARE available here — `typeof Worker` is "function" under `bun test` —
 * so the worker-backed path is driven with real workers below, not just the
 * synchronous fallback.
 */

import { describe, expect, test } from "bun:test";
import { diff } from "../../src/diff/diff.ts";
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

describe("createDiffClient with a real worker", () => {
  const WORKING = new URL("../../src/worker/diff-worker.ts", import.meta.url);
  const UNRESOLVABLE = new URL("./fixtures/no-such-diff-worker.ts", import.meta.url);
  const THROWING = new URL("./fixtures/throwing-diff-worker.ts", import.meta.url);

  test("control: a working worker computes the diff off-thread", async () => {
    const client = createDiffClient(WORKING);
    expect(client.workerAvailable).toBe(true);

    const result = await client.diff("hello\nworld", "hello\nearth");
    expect(result.isEqual).toBe(false);
    expect(result.hunks.length).toBe(1);
    expect(client.workerAvailable).toBe(true);

    client.dispose();
  });

  test("a worker whose module never resolves still answers the first request", async () => {
    // The documented promise is "graceful fallback to main-thread computation
    // when workers are unavailable". A worker URL that 404s is the ordinary way
    // for a worker to be unavailable, and it is only detectable asynchronously.
    const client = createDiffClient(UNRESOLVABLE);

    const result = await client.diff("hello\nworld", "hello\nearth");
    expect(result.isEqual).toBe(false);
    expect(result.hunks.length).toBe(1);

    client.dispose();
  });

  test("the fallback answer is identical to a main-thread diff", async () => {
    const oldText = Array.from({ length: 20 }, (_, i) => `line ${i}`).join("\n");
    const newText = oldText.replace("line 10", "changed");

    const client = createDiffClient(UNRESOLVABLE);
    const viaClient = await client.diff(oldText, newText);
    client.dispose();

    expect(viaClient).toEqual(diff(oldText, newText));
  });

  test("options survive the fallback", async () => {
    const lines = Array.from({ length: 20 }, (_, i) => `line ${i}`);
    const oldText = lines.join("\n");
    lines[10] = "changed";
    const newText = lines.join("\n");

    const client = createDiffClient(UNRESOLVABLE);
    const result = await client.diff(oldText, newText, { context: 1 });
    client.dispose();

    const hunk = result.hunks[0];
    if (!hunk) throw new Error("expected hunk");
    const equalLines = hunk.lines.filter((l) => l.kind === "equal");
    expect(equalLines.length).toBeLessThanOrEqual(2);
  });

  test("a worker that throws while handling the message also falls back", async () => {
    const client = createDiffClient(THROWING);

    const result = await client.diff("hello\nworld", "hello\nearth");
    expect(result.isEqual).toBe(false);
    expect(result.hunks.length).toBe(1);

    client.dispose();
  });

  test("workerAvailable is false once the worker has failed", async () => {
    const client = createDiffClient(UNRESOLVABLE);
    await client.diff("a\nb", "a\nc");

    expect(client.workerAvailable).toBe(false);
    client.dispose();
  });

  // ── Guards against over-reaching: not every rejection is a worker failure ──

  test("dispose() still rejects in-flight requests rather than answering them", async () => {
    const client = createDiffClient(WORKING);

    const pending = client.diff("a\nb", "a\nc");
    const settled = pending.then(() => "resolved").catch((e: Error) => e.message);
    client.dispose();

    expect(await settled).toContain("Client disposed");
  });

  test("a superseded request still rejects", async () => {
    const client = createDiffClient(WORKING);

    const first = client.diff("a\nb", "a\nc");
    const firstSettled = first.then(() => "resolved").catch((e: Error) => e.message);
    const second = client.diff("x\ny", "x\nz");

    expect(await firstSettled).toContain("superseded");
    expect((await second).hunks.length).toBe(1);

    client.dispose();
  });
});
