/**
 * Tests for worker types and utilities.
 */

import { describe, expect, test } from "bun:test";
import { createRequestIdGenerator } from "../../src/worker/types.ts";

describe("createRequestIdGenerator", () => {
  test("generates monotonically increasing IDs", () => {
    const nextId = createRequestIdGenerator();

    const id1 = nextId();
    const id2 = nextId();
    const id3 = nextId();

    expect(id2).toBeGreaterThan(id1);
    expect(id3).toBeGreaterThan(id2);
  });

  test("starts from 1", () => {
    const nextId = createRequestIdGenerator();
    expect(nextId()).toBe(1);
  });

  test("each generator is independent", () => {
    const nextId1 = createRequestIdGenerator();
    const nextId2 = createRequestIdGenerator();

    expect(nextId1()).toBe(1);
    expect(nextId1()).toBe(2);
    expect(nextId2()).toBe(1); // Independent, starts from 1
    expect(nextId1()).toBe(3);
    expect(nextId2()).toBe(2);
  });

  test("handles many IDs", () => {
    const nextId = createRequestIdGenerator();

    for (let i = 1; i <= 1000; i++) {
      expect(nextId()).toBe(i);
    }
  });
});
