/**
 * Tests for rowForExcerpt method on MultiBuffer.
 *
 * Given an ExcerptId, returns the starting MultiBufferRow for that excerpt.
 * Returns undefined if the excerpt doesn't exist.
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { createBuffer } from "../../src/buffer/buffer.ts";
import { createMultiBuffer } from "../../src/multibuffer/multibuffer.ts";
import {
  createBufferId,
  excerptRange,
  generateText,
  num,
  resetCounters,
} from "../helpers.ts";

beforeEach(() => {
  resetCounters();
});

describe("rowForExcerpt", () => {
  test("returns undefined for empty multibuffer", () => {
    const mb = createMultiBuffer();
    // Create a fake excerpt ID that doesn't exist
    const fakeId = { index: 0, generation: 0 };
    // biome-ignore lint/plugin/no-type-assertion: expect: test helper for non-existent ID
    const result = mb.rowForExcerpt(fakeId as Parameters<typeof mb.rowForExcerpt>[0]);
    expect(result).toBeUndefined();
  });

  test("returns row 0 for single excerpt", () => {
    const mb = createMultiBuffer();
    const buffer = createBuffer(createBufferId(), generateText(10));
    const excerptId = mb.addExcerpt(buffer, excerptRange(0, 10));

    const result = mb.rowForExcerpt(excerptId);
    expect(result).toBeDefined();
    // biome-ignore lint/style/noNonNullAssertion: expect: test assertion after toBeDefined check
    expect(num(result!)).toBe(0);
  });

  test("returns correct row for second excerpt", () => {
    const mb = createMultiBuffer();
    const buffer1 = createBuffer(createBufferId(), generateText(10));
    const buffer2 = createBuffer(createBufferId(), generateText(5));

    const id1 = mb.addExcerpt(buffer1, excerptRange(0, 10));
    const id2 = mb.addExcerpt(buffer2, excerptRange(0, 5));

    // First excerpt starts at row 0
    // biome-ignore lint/style/noNonNullAssertion: expect: test assertions for known-valid IDs
    expect(num(mb.rowForExcerpt(id1)!)).toBe(0);
    // Second excerpt starts at row 10 (after the 10-line first excerpt)
    // biome-ignore lint/style/noNonNullAssertion: expect: test assertions for known-valid IDs
    expect(num(mb.rowForExcerpt(id2)!)).toBe(10);
  });

  test("returns correct row for multiple excerpts", () => {
    const mb = createMultiBuffer();
    const buffer1 = createBuffer(createBufferId(), generateText(5));
    const buffer2 = createBuffer(createBufferId(), generateText(3));
    const buffer3 = createBuffer(createBufferId(), generateText(7));

    const id1 = mb.addExcerpt(buffer1, excerptRange(0, 5));
    const id2 = mb.addExcerpt(buffer2, excerptRange(0, 3));
    const id3 = mb.addExcerpt(buffer3, excerptRange(0, 7));

    // biome-ignore lint/style/noNonNullAssertion: expect: test assertions for known-valid IDs
    expect(num(mb.rowForExcerpt(id1)!)).toBe(0);
    // biome-ignore lint/style/noNonNullAssertion: expect: test assertions for known-valid IDs
    expect(num(mb.rowForExcerpt(id2)!)).toBe(5);
    // biome-ignore lint/style/noNonNullAssertion: expect: test assertions for known-valid IDs
    expect(num(mb.rowForExcerpt(id3)!)).toBe(8);
  });

  test("returns undefined for removed excerpt", () => {
    const mb = createMultiBuffer();
    const buffer = createBuffer(createBufferId(), generateText(10));
    const excerptId = mb.addExcerpt(buffer, excerptRange(0, 10));

    // Verify it exists first
    expect(mb.rowForExcerpt(excerptId)).toBeDefined();

    // Remove it
    mb.removeExcerpt(excerptId);

    // Should now return undefined
    expect(mb.rowForExcerpt(excerptId)).toBeUndefined();
  });

  test("returns undefined for stale excerpt ID (wrong generation)", () => {
    const mb = createMultiBuffer();
    const buffer = createBuffer(createBufferId(), generateText(10));
    const excerptId = mb.addExcerpt(buffer, excerptRange(0, 10));

    // Create a stale ID with wrong generation
    const staleId = { index: excerptId.index, generation: excerptId.generation + 1 };
    // biome-ignore lint/plugin/no-type-assertion: expect: test helper for stale ID
    const result = mb.rowForExcerpt(staleId as typeof excerptId);
    expect(result).toBeUndefined();
  });

  test("returns correct row after excerpt reorder", () => {
    const mb = createMultiBuffer();
    const buffer1 = createBuffer(createBufferId(), generateText(5));
    const buffer2 = createBuffer(createBufferId(), generateText(3));

    const id1 = mb.addExcerpt(buffer1, excerptRange(0, 5));
    const id2 = mb.addExcerpt(buffer2, excerptRange(0, 3));

    // Initially: id1 at row 0, id2 at row 5
    // biome-ignore lint/style/noNonNullAssertion: expect: test assertions for known-valid IDs
    expect(num(mb.rowForExcerpt(id1)!)).toBe(0);
    // biome-ignore lint/style/noNonNullAssertion: expect: test assertions for known-valid IDs
    expect(num(mb.rowForExcerpt(id2)!)).toBe(5);

    // Move id2 before id1
    mb.moveExcerpt(id2, id1);

    // After move: id2 at row 0, id1 at row 3
    // biome-ignore lint/style/noNonNullAssertion: expect: test assertions for known-valid IDs
    expect(num(mb.rowForExcerpt(id2)!)).toBe(0);
    // biome-ignore lint/style/noNonNullAssertion: expect: test assertions for known-valid IDs
    expect(num(mb.rowForExcerpt(id1)!)).toBe(3);
  });

  test("snapshot also has rowForExcerpt", () => {
    const mb = createMultiBuffer();
    const buffer1 = createBuffer(createBufferId(), generateText(5));
    const buffer2 = createBuffer(createBufferId(), generateText(3));

    const id1 = mb.addExcerpt(buffer1, excerptRange(0, 5));
    const id2 = mb.addExcerpt(buffer2, excerptRange(0, 3));

    const snapshot = mb.snapshot();

    // biome-ignore lint/style/noNonNullAssertion: expect: test assertions for known-valid IDs
    expect(num(snapshot.rowForExcerpt(id1)!)).toBe(0);
    // biome-ignore lint/style/noNonNullAssertion: expect: test assertions for known-valid IDs
    expect(num(snapshot.rowForExcerpt(id2)!)).toBe(5);
  });

  test("handles partial excerpt ranges", () => {
    const mb = createMultiBuffer();
    const buffer = createBuffer(createBufferId(), generateText(20));

    // Add an excerpt covering lines 5-10 (5 lines)
    const id1 = mb.addExcerpt(buffer, excerptRange(5, 10));
    // Add an excerpt covering lines 15-20 (5 lines)
    const id2 = mb.addExcerpt(buffer, excerptRange(15, 20));

    // biome-ignore lint/style/noNonNullAssertion: expect: test assertions for known-valid IDs
    expect(num(mb.rowForExcerpt(id1)!)).toBe(0);
    // biome-ignore lint/style/noNonNullAssertion: expect: test assertions for known-valid IDs
    expect(num(mb.rowForExcerpt(id2)!)).toBe(5);
  });
});
