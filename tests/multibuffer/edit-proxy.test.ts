/**
 * MultiBuffer edit proxy tests.
 * Editing through multibuffer coordinates → buffer coordinates.
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { createBuffer } from "../../src/multibuffer/buffer.ts";
import { createMultiBuffer } from "../../src/multibuffer/multibuffer.ts";
import {
  Bias,
  createBufferId,
  excerptRange,
  expectPoint,
  mbPoint,
  mbRow,
  resetCounters,
} from "../helpers.ts";

beforeEach(() => {
  resetCounters();
});

describe("MultiBuffer Edit Proxy - Insert", () => {
  test("insert text at a point", () => {
    const buf = createBuffer(createBufferId(), "Hello World");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 1));

    mb.edit(mbPoint(0, 5), mbPoint(0, 5), " Beautiful");
    expect(mb.snapshot().lines(mbRow(0), mbRow(1))).toEqual(["Hello Beautiful World"]);
  });

  test("insert newline splits line", () => {
    const buf = createBuffer(createBufferId(), "HelloWorld\nExtra");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 2));

    mb.edit(mbPoint(0, 5), mbPoint(0, 5), "\n");
    const snap = mb.snapshot();
    expect(snap.lineCount).toBe(2);
    expect(snap.lines(mbRow(0), mbRow(2))).toEqual(["Hello", "World"]);
  });

  test("insert at start of excerpt", () => {
    const buf = createBuffer(createBufferId(), "World");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 1));

    mb.edit(mbPoint(0, 0), mbPoint(0, 0), "Hello ");
    expect(mb.snapshot().lines(mbRow(0), mbRow(1))).toEqual(["Hello World"]);
  });
});

describe("MultiBuffer Edit Proxy - Delete", () => {
  test("delete a range", () => {
    const buf = createBuffer(createBufferId(), "Hello Beautiful World");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 1));

    mb.edit(mbPoint(0, 5), mbPoint(0, 15), "");
    expect(mb.snapshot().lines(mbRow(0), mbRow(1))).toEqual(["Hello World"]);
  });

  test("delete across lines joins them", () => {
    const buf = createBuffer(createBufferId(), "Hello\nWorld");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 2));

    mb.edit(mbPoint(0, 5), mbPoint(1, 0), "");
    const snap = mb.snapshot();
    expect(snap.lines(mbRow(0), mbRow(1))).toEqual(["HelloWorld"]);
  });
});

describe("MultiBuffer Edit Proxy - Replace", () => {
  test("replace a range with text", () => {
    const buf = createBuffer(createBufferId(), "Hello World");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 1));

    mb.edit(mbPoint(0, 6), mbPoint(0, 11), "Rope");
    expect(mb.snapshot().lines(mbRow(0), mbRow(1))).toEqual(["Hello Rope"]);
  });
});

describe("MultiBuffer Edit Proxy - Anchors", () => {
  test("anchor survives edit through proxy", () => {
    const buf = createBuffer(createBufferId(), "Hello World");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 1));

    const a = mb.createAnchor(mbPoint(0, 8), Bias.Right);
    expect(a).toBeDefined();
    if (!a) return;

    mb.edit(mbPoint(0, 0), mbPoint(0, 0), "Say ");

    const resolved = mb.snapshot().resolveAnchor(a);
    expect(resolved).toBeDefined();
    if (!resolved) return;
    expectPoint(resolved, 0, 12);
  });

  test("edit in one excerpt doesn't affect anchors in another", () => {
    const buf1 = createBuffer(createBufferId(), "Buffer One");
    const buf2 = createBuffer(createBufferId(), "Buffer Two");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf1, excerptRange(0, 1), { hasTrailingNewline: true });
    mb.addExcerpt(buf2, excerptRange(0, 1));

    const a = mb.createAnchor(mbPoint(2, 5), Bias.Right);
    expect(a).toBeDefined();
    if (!a) return;

    mb.edit(mbPoint(0, 0), mbPoint(0, 0), "XXX");

    const resolved = mb.snapshot().resolveAnchor(a);
    expect(resolved).toBeDefined();
    if (!resolved) return;
    expectPoint(resolved, 2, 5);
  });
});

describe("MultiBuffer Edit Proxy - Multi-excerpt same buffer", () => {
  test("edit in one excerpt updates other excerpts from same buffer", () => {
    const buf = createBuffer(createBufferId(), "Line 0\nLine 1\nLine 2\nLine 3");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 2), { hasTrailingNewline: true });
    mb.addExcerpt(buf, excerptRange(2, 4));

    mb.edit(mbPoint(0, 0), mbPoint(0, 0), "XXX");

    const snap = mb.snapshot();
    expect(snap.lines(mbRow(0), mbRow(1))).toEqual(["XXXLine 0"]);
    expect(snap.lines(mbRow(3), mbRow(5))).toEqual(["Line 2", "Line 3"]);
  });
});
