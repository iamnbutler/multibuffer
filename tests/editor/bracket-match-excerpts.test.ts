/**
 * Tests for bracket matching across excerpt boundaries.
 *
 * The existing bracket-match suite builds every fixture from a single excerpt,
 * so nothing pinned what happens when a multibuffer holds more than one. These
 * cover the multi-excerpt cases:
 *
 * - Excerpts backed by *different* buffers must never match each other. A
 *   bracket in one file cannot be closed by a bracket in another.
 * - Excerpts backed by the *same* buffer are still scanned as one region. That
 *   is deliberate and unchanged; see the PR discussion.
 */

import { describe, expect, test } from "bun:test";
import { createBuffer } from "../../src/buffer/buffer.ts";
import { findMatchingBracket } from "../../src/editor/bracket-match.ts";
import { createMultiBuffer } from "../../src/multibuffer/multibuffer.ts";
import type { MultiBufferSnapshot } from "../../src/multibuffer/types.ts";
import { createBufferId, excerptRange, mbPoint, mbRow } from "../helpers.ts";

/** Build a snapshot holding one excerpt per supplied text, each its own buffer. */
function snapshotOfSeparateBuffers(...texts: string[]): MultiBufferSnapshot {
  const mb = createMultiBuffer();
  for (const text of texts) {
    const buf = createBuffer(createBufferId(), text);
    mb.addExcerpt(buf, excerptRange(0, text.split("\n").length));
  }
  return mb.snapshot();
}

describe("findMatchingBracket — across different buffers", () => {
  test("open bracket does not match a close bracket in another buffer", () => {
    // Row 0 is "alpha(" in buffer A; the only ")" lives in buffer B.
    const snap = snapshotOfSeparateBuffers("alpha(\nbeta\n", "gamma)\ndelta\n");
    expect(findMatchingBracket(snap, mbPoint(0, 5))).toBeNull();
  });

  test("close bracket does not match an open bracket in another buffer", () => {
    const snap = snapshotOfSeparateBuffers("alpha(\nbeta\n", "gamma)\ndelta\n");
    // Buffer B starts at row 3; "gamma)" puts the ")" at column 5.
    expect(snap.lines(mbRow(3), mbRow(4))).toEqual(["gamma)"]);
    expect(findMatchingBracket(snap, mbPoint(3, 5))).toBeNull();
  });

  test("a balanced pair inside one buffer still matches when other buffers follow", () => {
    // Guards against the bound being clamped too aggressively.
    const snap = snapshotOfSeparateBuffers("f(x)\n", "g(y)\n");
    const match = findMatchingBracket(snap, mbPoint(0, 1));
    expect(match?.open).toEqual(mbPoint(0, 1));
    expect(match?.close).toEqual(mbPoint(0, 3));
  });

  test("a pair spanning rows within one buffer still matches", () => {
    const snap = snapshotOfSeparateBuffers("{\n  x\n}\n", "unrelated }\n");
    const match = findMatchingBracket(snap, mbPoint(0, 0));
    expect(match?.open).toEqual(mbPoint(0, 0));
    expect(match?.close).toEqual(mbPoint(2, 0));
  });

  test("an unmatched bracket in the last buffer scans off the end and returns null", () => {
    const snap = snapshotOfSeparateBuffers("a(\n", "b(\n");
    // Buffer B starts at row 2; its "(" is unmatched and buffer A's is behind it.
    expect(snap.lines(mbRow(2), mbRow(3))).toEqual(["b("]);
    expect(findMatchingBracket(snap, mbPoint(2, 1))).toBeNull();
  });
});

describe("findMatchingBracket — two excerpts of the SAME buffer", () => {
  test("still matches across the excerpt boundary (deliberately unchanged)", () => {
    // Non-contiguous ranges of one file are treated as a single scan region.
    // Whether that is desirable is a semantic call left to the maintainer; this
    // test records today's behaviour so a future change is a visible decision.
    const buf = createBuffer(createBufferId(), "open(\nmiddle\nclose)\n");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 1));
    mb.addExcerpt(buf, excerptRange(2, 3));
    const snap = mb.snapshot();
    const match = findMatchingBracket(snap, mbPoint(0, 4));
    expect(match).not.toBeNull();
    expect(match?.open).toEqual(mbPoint(0, 4));
  });
});
