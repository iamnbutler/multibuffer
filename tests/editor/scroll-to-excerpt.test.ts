/**
 * Tests for scrollToExcerpt on EditorView.
 *
 * The scrollToExcerpt method combines rowForExcerpt lookup with renderer.scrollTo.
 * These tests verify the pure logic portions without DOM mounting.
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { createBuffer } from "../../src/buffer/buffer.ts";
import { createMultiBuffer } from "../../src/multibuffer/multibuffer.ts";
import type { ExcerptId, MultiBufferRow } from "../../src/multibuffer/types.ts";
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

describe("scrollToExcerpt helper logic", () => {
  // These tests verify that we can compute the correct scroll target row
  // from an ExcerptId using rowForExcerpt. The actual scrollTo call
  // requires DOM and is tested separately in DOM integration tests.

  test("computes scroll target for first excerpt", () => {
    const mb = createMultiBuffer();
    const buffer = createBuffer(createBufferId(), generateText(10));
    const excerptId = mb.addExcerpt(buffer, excerptRange(0, 10));

    const targetRow = mb.rowForExcerpt(excerptId);
    expect(targetRow).toBeDefined();
    // biome-ignore lint/style/noNonNullAssertion: expect: test assertion after toBeDefined check
    expect(num(targetRow!)).toBe(0);
  });

  test("computes scroll target for second excerpt", () => {
    const mb = createMultiBuffer();
    const buffer1 = createBuffer(createBufferId(), generateText(50));
    const buffer2 = createBuffer(createBufferId(), generateText(30));

    mb.addExcerpt(buffer1, excerptRange(0, 50));
    const excerptId2 = mb.addExcerpt(buffer2, excerptRange(0, 30));

    const targetRow = mb.rowForExcerpt(excerptId2);
    expect(targetRow).toBeDefined();
    // biome-ignore lint/style/noNonNullAssertion: expect: test assertion after toBeDefined check
    expect(num(targetRow!)).toBe(50);
  });

  test("returns undefined for non-existent excerpt", () => {
    const mb = createMultiBuffer();
    const fakeId = { index: 999, generation: 0 };
    // biome-ignore lint/plugin/no-type-assertion: expect: test helper for non-existent ID
    const targetRow = mb.rowForExcerpt(fakeId as ExcerptId);
    expect(targetRow).toBeUndefined();
  });

  test("scroll target can be offset by lines within excerpt", () => {
    const mb = createMultiBuffer();
    const buffer = createBuffer(createBufferId(), generateText(100));
    const excerptId = mb.addExcerpt(buffer, excerptRange(0, 100));

    const startRow = mb.rowForExcerpt(excerptId);
    expect(startRow).toBeDefined();

    // If we want to scroll to line 42 within this excerpt,
    // the target row is startRow + 42
    const targetLine = 42;
    // biome-ignore lint/style/noNonNullAssertion: expect: test assertion after toBeDefined check
    // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic in test
    const targetRow = (num(startRow!) + targetLine) as MultiBufferRow;
    expect(num(targetRow)).toBe(42);
  });

  test("scroll target accounts for multiple excerpts", () => {
    const mb = createMultiBuffer();
    const buffer1 = createBuffer(createBufferId(), generateText(20));
    const buffer2 = createBuffer(createBufferId(), generateText(30));
    const buffer3 = createBuffer(createBufferId(), generateText(50));

    mb.addExcerpt(buffer1, excerptRange(0, 20));
    mb.addExcerpt(buffer2, excerptRange(0, 30));
    const excerptId3 = mb.addExcerpt(buffer3, excerptRange(0, 50));

    const startRow = mb.rowForExcerpt(excerptId3);
    // biome-ignore lint/style/noNonNullAssertion: expect: test assertion for known-valid ID
    expect(num(startRow!)).toBe(50); // 20 + 30

    // To scroll to line 10 within excerpt 3:
    const targetLine = 10;
    // biome-ignore lint/style/noNonNullAssertion: expect: test assertion for known-valid ID
    // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic in test
    const targetRow = (num(startRow!) + targetLine) as MultiBufferRow;
    expect(num(targetRow)).toBe(60);
  });
});

describe("scrollToExcerpt with line offset", () => {
  test("navigates to specific line within excerpt", () => {
    const mb = createMultiBuffer();
    const buffer = createBuffer(createBufferId(), generateText(100));

    // Add excerpt for lines 10-60 (50 lines)
    const excerptId = mb.addExcerpt(buffer, excerptRange(10, 60));

    const startRow = mb.rowForExcerpt(excerptId);
    // biome-ignore lint/style/noNonNullAssertion: expect: test assertion for known-valid ID
    expect(num(startRow!)).toBe(0);

    // Buffer line 25 is at offset 15 within the excerpt (25 - 10 = 15)
    // In multibuffer coordinates: startRow + 15 = 0 + 15 = 15
    const bufferLine = 25;
    const excerptStartBufferLine = 10;
    const offsetWithinExcerpt = bufferLine - excerptStartBufferLine;
    // biome-ignore lint/style/noNonNullAssertion: expect: test assertion for known-valid ID
    // biome-ignore lint/plugin/no-type-assertion: expect: branded arithmetic in test
    const targetRow = (num(startRow!) + offsetWithinExcerpt) as MultiBufferRow;
    expect(num(targetRow)).toBe(15);
  });

  test("clamps line offset to excerpt bounds", () => {
    const mb = createMultiBuffer();
    const buffer = createBuffer(createBufferId(), generateText(100));

    // Add excerpt for lines 10-20 (10 lines)
    const excerptId = mb.addExcerpt(buffer, excerptRange(10, 20));
    const info = mb.excerpts.find((e) => e.id.index === excerptId.index && e.id.generation === excerptId.generation);
    expect(info).toBeDefined();

    // biome-ignore lint/style/noNonNullAssertion: expect: test assertion after toBeDefined check
    const excerptLineCount = num(info!.endRow) - num(info!.startRow);
    expect(excerptLineCount).toBe(10);

    // If requested line is beyond excerpt, should clamp to last line
    const requestedOffset = 100; // Way beyond the 10-line excerpt
    const clampedOffset = Math.min(requestedOffset, excerptLineCount - 1);
    expect(clampedOffset).toBe(9);
  });
});
