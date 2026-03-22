/**
 * Anchor replacement and resolution tests.
 *
 * Covers anchor behavior across excerpt replacement via setExcerptsForBuffer,
 * singleton multibuffer anchor semantics, and anchor resolution after buffer edits.
 *
 * Inspired by Zed's test_resolving_anchors_after_replacing_their_excerpts and
 * test_singleton_multibuffer_anchors.
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { createBuffer } from "../../src/buffer/buffer.ts";
import { createMultiBuffer } from "../../src/multibuffer/multibuffer.ts";
import {
  Bias,
  createBufferId,
  excerptRange,
  expectPoint,
  mbPoint,
  offset,
  resetCounters,
} from "../helpers.ts";

beforeEach(() => {
  resetCounters();
});


describe("Anchor resolution after excerpt replacement", () => {
  test("anchor survives setExcerptsForBuffer when excerpt range is unchanged", () => {
    const buf = createBuffer(createBufferId(), "Line 0\nLine 1\nLine 2\nLine 3");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 4));

    const a = mb.createAnchor(mbPoint(2, 3), Bias.Right);
    expect(a).toBeDefined();
    if (!a) return;

    // Replace with the same range
    mb.setExcerptsForBuffer(buf, [excerptRange(0, 4)]);

    const resolved = mb.snapshot().resolveAnchor(a);
    expect(resolved).toBeDefined();
    if (!resolved) return;
    expectPoint(resolved, 2, 3);
  });

  test("anchor resolves to updated position after setExcerptsForBuffer changes range", () => {
    // Buffer with 6 lines
    const buf = createBuffer(createBufferId(), "AA\nBB\nCC\nDD\nEE\nFF");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 6));

    // Anchor at row 3 ("DD"), col 1
    const a = mb.createAnchor(mbPoint(3, 1), Bias.Right);
    expect(a).toBeDefined();
    if (!a) return;

    // Replace with a narrower range that still includes the anchor's buffer row
    mb.setExcerptsForBuffer(buf, [excerptRange(2, 6)]);

    // Buffer row 3 is now at mb row 1 in the new excerpt (rows 2-5, so row 3 = offset 1)
    const resolved = mb.snapshot().resolveAnchor(a);
    expect(resolved).toBeDefined();
    if (!resolved) return;
    expectPoint(resolved, 1, 1);
  });

  test("multiple anchors all resolve correctly after bulk replacement", () => {
    const buf = createBuffer(createBufferId(), "Line 0\nLine 1\nLine 2\nLine 3\nLine 4\nLine 5");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 6));

    // Create anchors at different rows
    const a0 = mb.createAnchor(mbPoint(0, 2), Bias.Right);
    const a1 = mb.createAnchor(mbPoint(2, 4), Bias.Left);
    const a2 = mb.createAnchor(mbPoint(4, 0), Bias.Right);
    expect(a0).toBeDefined();
    expect(a1).toBeDefined();
    expect(a2).toBeDefined();
    if (!a0 || !a1 || !a2) return;

    // Replace with same full range
    mb.setExcerptsForBuffer(buf, [excerptRange(0, 6)]);

    const snap = mb.snapshot();
    const r0 = snap.resolveAnchor(a0);
    const r1 = snap.resolveAnchor(a1);
    const r2 = snap.resolveAnchor(a2);
    expect(r0).toBeDefined();
    expect(r1).toBeDefined();
    expect(r2).toBeDefined();
    if (!r0 || !r1 || !r2) return;

    expectPoint(r0, 0, 2);
    expectPoint(r1, 2, 4);
    expectPoint(r2, 4, 0);
  });

  test("anchor in removed excerpt returns undefined (or fallback behavior)", () => {
    const buf1 = createBuffer(createBufferId(), "Buffer One");
    const buf2 = createBuffer(createBufferId(), "Buffer Two");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf1, excerptRange(0, 1));

    const a = mb.createAnchor(mbPoint(0, 3), Bias.Right);
    expect(a).toBeDefined();
    if (!a) return;

    // Replace buf1's excerpts with nothing — remove all excerpts for buf1
    mb.setExcerptsForBuffer(buf1, []);

    // Add an excerpt from a different buffer so the multibuffer is non-empty
    mb.addExcerpt(buf2, excerptRange(0, 1));

    // The old anchor's excerpt is gone and the replacement chain points to
    // excerpts that no longer exist (buf1 excerpts removed, no new buf1 excerpts).
    // Depending on the implementation this either returns undefined or falls back.
    const resolved = mb.snapshot().resolveAnchor(a);
    // If the replacement chain leads nowhere, it should be undefined
    expect(resolved).toBeUndefined();
  });
});


describe("Singleton multibuffer anchors", () => {
  test("anchor at end of singleton buffer resolves correctly", () => {
    const buf = createBuffer(createBufferId(), "abcd");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 1));

    // "abcd" is one line, anchor at end (col 4)
    const a = mb.createAnchor(mbPoint(0, 4), Bias.Right);
    expect(a).toBeDefined();
    if (!a) return;

    const resolved = mb.snapshot().resolveAnchor(a);
    expect(resolved).toBeDefined();
    if (!resolved) return;
    expectPoint(resolved, 0, 4);
  });

  test("anchor survives edits to the underlying buffer", () => {
    const buf = createBuffer(createBufferId(), "abcd");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 1));

    // Anchor at offset 2 (between 'b' and 'c')
    const a = mb.createAnchor(mbPoint(0, 2), Bias.Right);
    expect(a).toBeDefined();
    if (!a) return;

    // Insert "X" at the beginning and "Y" at the end
    buf.insert(offset(0), "X");    // "Xabcd"
    buf.insert(offset(5), "Y");    // "XabcdY"

    const resolved = mb.snapshot().resolveAnchor(a);
    expect(resolved).toBeDefined();
    if (!resolved) return;
    // Original offset 2, insert at 0 shifts +1 -> 3, insert at 5 is after -> still 3
    expectPoint(resolved, 0, 3);
  });

  test("anchor with Bias.Left at edit insertion point stays before inserted text", () => {
    const buf = createBuffer(createBufferId(), "abcd");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 1));

    // Bias.Left anchor at offset 0
    const a = mb.createAnchor(mbPoint(0, 0), Bias.Left);
    expect(a).toBeDefined();
    if (!a) return;

    // Insert "X" at offset 0
    buf.insert(offset(0), "X");

    const resolved = mb.snapshot().resolveAnchor(a);
    expect(resolved).toBeDefined();
    if (!resolved) return;
    // Bias.Left: stays at 0 (before inserted text)
    expectPoint(resolved, 0, 0);
  });

  test("anchor with Bias.Right at edit insertion point moves after inserted text", () => {
    const buf = createBuffer(createBufferId(), "abcd");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 1));

    // Bias.Right anchor at offset 0
    const a = mb.createAnchor(mbPoint(0, 0), Bias.Right);
    expect(a).toBeDefined();
    if (!a) return;

    // Insert "X" at offset 0
    buf.insert(offset(0), "X");

    const resolved = mb.snapshot().resolveAnchor(a);
    expect(resolved).toBeDefined();
    if (!resolved) return;
    // Bias.Right: moves to 1 (after inserted text)
    expectPoint(resolved, 0, 1);
  });

  test("anchor before edit point is unchanged after edit", () => {
    const buf = createBuffer(createBufferId(), "abcd");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 1));

    // Anchor at col 1 ("a|bcd")
    const a = mb.createAnchor(mbPoint(0, 1), Bias.Right);
    expect(a).toBeDefined();
    if (!a) return;

    // Insert "XYZ" at offset 3 (after the anchor)
    buf.insert(offset(3), "XYZ");

    const resolved = mb.snapshot().resolveAnchor(a);
    expect(resolved).toBeDefined();
    if (!resolved) return;
    expectPoint(resolved, 0, 1);
  });

  test("anchor after edit point shifts by edit delta", () => {
    const buf = createBuffer(createBufferId(), "abcd");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 1));

    // Anchor at end (col 4)
    const a = mb.createAnchor(mbPoint(0, 4), Bias.Right);
    expect(a).toBeDefined();
    if (!a) return;

    // Insert "XY" at offset 0
    buf.insert(offset(0), "XY");

    const resolved = mb.snapshot().resolveAnchor(a);
    expect(resolved).toBeDefined();
    if (!resolved) return;
    // offset 4 + 2 inserted = 6
    expectPoint(resolved, 0, 6);
  });
});


describe("Anchor resolution after buffer edits", () => {
  test("create anchor, edit buffer, resolveAnchor returns updated position", () => {
    const buf = createBuffer(createBufferId(), "Hello World");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 1));

    // Anchor at col 5 ("Hello| World")
    const a = mb.createAnchor(mbPoint(0, 5), Bias.Right);
    expect(a).toBeDefined();
    if (!a) return;

    // Insert "ABC" at offset 5
    buf.insert(offset(5), "ABC");
    // Buffer now: "HelloABC World"

    const resolved = mb.snapshot().resolveAnchor(a);
    expect(resolved).toBeDefined();
    if (!resolved) return;
    // Bias.Right at insertion point -> moves after inserted text
    expectPoint(resolved, 0, 8);
  });

  test("create anchor, delete text before it, anchor shifts left", () => {
    const buf = createBuffer(createBufferId(), "ABCDEFGHIJ");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 1));

    // Anchor at col 8
    const a = mb.createAnchor(mbPoint(0, 8), Bias.Right);
    expect(a).toBeDefined();
    if (!a) return;

    // Delete first 3 characters (offsets 0-3)
    buf.delete(offset(0), offset(3));
    // Buffer now: "DEFGHIJ"

    const resolved = mb.snapshot().resolveAnchor(a);
    expect(resolved).toBeDefined();
    if (!resolved) return;
    // 8 - 3 = 5
    expectPoint(resolved, 0, 5);
  });

  test("create anchor, insert text before it, anchor shifts right", () => {
    const buf = createBuffer(createBufferId(), "ABCDEFGHIJ");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 1));

    // Anchor at col 5
    const a = mb.createAnchor(mbPoint(0, 5), Bias.Left);
    expect(a).toBeDefined();
    if (!a) return;

    // Insert "123" at offset 2 (before the anchor)
    buf.insert(offset(2), "123");
    // Buffer now: "AB123CDEFGHIJ"

    const resolved = mb.snapshot().resolveAnchor(a);
    expect(resolved).toBeDefined();
    if (!resolved) return;
    // 5 + 3 = 8
    expectPoint(resolved, 0, 8);
  });

  test("create anchor in middle of deleted range, anchor clamps to deletion start", () => {
    const buf = createBuffer(createBufferId(), "ABCDEFGHIJKLMNOP");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 1));

    // Anchor at col 8 (middle of text)
    const a = mb.createAnchor(mbPoint(0, 8), Bias.Left);
    expect(a).toBeDefined();
    if (!a) return;

    // Delete from offset 5 to offset 12 — anchor at 8 is inside the deleted range
    buf.delete(offset(5), offset(12));
    // Buffer now: "ABCDEMNOP"

    const resolved = mb.snapshot().resolveAnchor(a);
    expect(resolved).toBeDefined();
    if (!resolved) return;
    // Anchor within deleted range clamps to deletion start
    expectPoint(resolved, 0, 5);
  });
});
