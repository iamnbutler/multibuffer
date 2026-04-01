/**
 * moveExcerpt behavioural tests.
 *
 * The ordering/version/lineCount tests for moveExcerpt live in
 * multibuffer.test.ts.  This file adds deeper behavioural checks that
 * verify correctness beyond mere order:
 *
 *   - Text content is readable in the correct order after a reorder
 *   - Anchors created before a move resolve to the correct multibuffer
 *     position after the move
 *   - A stale/unknown `insertBefore` ID causes the excerpt to be appended
 *     to the end (the documented fallback behaviour)
 *   - Two sequential moves produce the expected final order and content
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { createBuffer } from "../../src/buffer/buffer.ts";
import { createMultiBuffer } from "../../src/multibuffer/multibuffer.ts";
import { Bias } from "../../src/multibuffer/types.ts";
import {
  createBufferId,
  excerptRange,
  generateText,
  mbPoint,
  mbRow,
  num,
  resetCounters,
} from "../helpers.ts";

beforeEach(() => {
  resetCounters();
});

// ---------------------------------------------------------------------------
// Content readability after reorder
// ---------------------------------------------------------------------------

describe("moveExcerpt — content after reorder", () => {
  test("lines are readable in the new excerpt order after moveExcerpt", () => {
    const mb = createMultiBuffer();
    const bufA = createBuffer(createBufferId(), "aaa\nbbb\nccc");
    const bufB = createBuffer(createBufferId(), "xxx\nyyy\nzzz");

    const idA = mb.addExcerpt(bufA, excerptRange(0, 3)); // "aaa","bbb","ccc" at rows 0-2
    const idB = mb.addExcerpt(bufB, excerptRange(0, 3)); // "xxx","yyy","zzz" at rows 3-5

    // Move B before A → B at rows 0-2, A at rows 3-5
    mb.moveExcerpt(idB, idA);

    const snap = mb.snapshot();
    const lines = snap.lines(mbRow(0), mbRow(6));
    expect(lines[0]).toBe("xxx");
    expect(lines[1]).toBe("yyy");
    expect(lines[2]).toBe("zzz");
    expect(lines[3]).toBe("aaa");
    expect(lines[4]).toBe("bbb");
    expect(lines[5]).toBe("ccc");
  });

  test("moving last excerpt to first position yields correct content", () => {
    const mb = createMultiBuffer();
    const buf = createBuffer(createBufferId(), generateText(9));

    const idA = mb.addExcerpt(buf, excerptRange(0, 3)); // "Line 1","Line 2","Line 3"
    const idB = mb.addExcerpt(buf, excerptRange(3, 6)); // "Line 4","Line 5","Line 6"
    const idC = mb.addExcerpt(buf, excerptRange(6, 9)); // "Line 7","Line 8","Line 9"

    // Move C before A → order becomes C, A, B
    mb.moveExcerpt(idC, idA);

    const snap = mb.snapshot();
    const lines = snap.lines(mbRow(0), mbRow(9));
    expect(lines[0]).toBe("Line 7");
    expect(lines[3]).toBe("Line 1");
    expect(lines[6]).toBe("Line 4");

    // Order check
    expect(mb.excerpts[0]?.id).toEqual(idC);
    expect(mb.excerpts[1]?.id).toEqual(idA);
    expect(mb.excerpts[2]?.id).toEqual(idB);
  });

  test("two sequential moves produce the expected final order and content", () => {
    const mb = createMultiBuffer();
    const bufA = createBuffer(createBufferId(), "AAA");
    const bufB = createBuffer(createBufferId(), "BBB");
    const bufC = createBuffer(createBufferId(), "CCC");

    const idA = mb.addExcerpt(bufA, excerptRange(0, 1)); // row 0
    const idB = mb.addExcerpt(bufB, excerptRange(0, 1)); // row 1
    const idC = mb.addExcerpt(bufC, excerptRange(0, 1)); // row 2

    // First move: C before A → order C, A, B
    mb.moveExcerpt(idC, idA);
    expect(mb.excerpts.map((e) => e.id)).toEqual([idC, idA, idB]);

    // Second move: B before C → order B, C, A
    mb.moveExcerpt(idB, idC);
    expect(mb.excerpts.map((e) => e.id)).toEqual([idB, idC, idA]);

    const snap = mb.snapshot();
    const lines = snap.lines(mbRow(0), mbRow(3));
    expect(lines[0]).toBe("BBB");
    expect(lines[1]).toBe("CCC");
    expect(lines[2]).toBe("AAA");
  });
});

// ---------------------------------------------------------------------------
// Anchor resolution after move
// ---------------------------------------------------------------------------

describe("moveExcerpt — anchor survival", () => {
  test("anchor in a moved excerpt resolves to the correct multibuffer row after the move", () => {
    const mb = createMultiBuffer();
    const bufA = createBuffer(createBufferId(), "hello");
    const bufB = createBuffer(createBufferId(), "world");

    const idA = mb.addExcerpt(bufA, excerptRange(0, 1)); // "hello" at mb row 0
    mb.addExcerpt(bufB, excerptRange(0, 1)); // "world" at mb row 1

    // Create anchor at start of excerptA (row 0)
    const anchor = mb.createAnchor(mbPoint(0, 0), Bias.Right);
    expect(anchor).not.toBeUndefined();

    // Move A to the end → A is now at mb row 1, B is at mb row 0
    mb.moveExcerpt(idA, undefined);

    if (anchor) {
      const resolved = mb.snapshot().resolveAnchor(anchor);
      expect(resolved).not.toBeUndefined();
      if (resolved) {
        // A moved to row 1 — anchor should follow
        expect(num(resolved.row)).toBe(1);
        expect(resolved.column).toBe(0);
      }
    }
  });

  test("anchor in an unmoved excerpt is unaffected when another excerpt moves", () => {
    const mb = createMultiBuffer();
    const bufA = createBuffer(createBufferId(), "alpha");
    const bufB = createBuffer(createBufferId(), "beta");

    const idA = mb.addExcerpt(bufA, excerptRange(0, 1)); // row 0
    mb.addExcerpt(bufB, excerptRange(0, 1)); // row 1

    // Create anchor in B (the excerpt that stays put… as far as its content goes)
    const anchor = mb.createAnchor(mbPoint(1, 0), Bias.Right);
    expect(anchor).not.toBeUndefined();

    // Move A to the end → order becomes B(row 0), A(row 1)
    mb.moveExcerpt(idA, undefined);

    if (anchor) {
      const resolved = mb.snapshot().resolveAnchor(anchor);
      expect(resolved).not.toBeUndefined();
      if (resolved) {
        // B is now at row 0
        expect(num(resolved.row)).toBe(0);
        expect(resolved.column).toBe(0);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Stale insertBefore falls back to end-append
// ---------------------------------------------------------------------------

describe("moveExcerpt — stale insertBefore", () => {
  test("stale insertBefore ID causes excerpt to be appended at the end", () => {
    const mb = createMultiBuffer();
    const buf = createBuffer(createBufferId(), generateText(30));
    const idA = mb.addExcerpt(buf, excerptRange(0, 10));
    const idB = mb.addExcerpt(buf, excerptRange(10, 20));
    const idC = mb.addExcerpt(buf, excerptRange(20, 30));

    // Remove B so its ID becomes stale
    mb.removeExcerpt(idB);

    // Move A with stale insertBefore → should fall back to appending A at end
    mb.moveExcerpt(idA, idB);

    // Remaining order: C, A  (B is gone, A was appended after C)
    expect(mb.excerpts.length).toBe(2);
    expect(mb.excerpts[0]?.id).toEqual(idC);
    expect(mb.excerpts[1]?.id).toEqual(idA);
  });

  test("stale insertBefore: content order reflects end-append", () => {
    const mb = createMultiBuffer();
    const bufA = createBuffer(createBufferId(), "AAAA");
    const bufB = createBuffer(createBufferId(), "BBBB");
    const bufC = createBuffer(createBufferId(), "CCCC");

    const idA = mb.addExcerpt(bufA, excerptRange(0, 1));
    const idB = mb.addExcerpt(bufB, excerptRange(0, 1));
    const idC = mb.addExcerpt(bufC, excerptRange(0, 1));

    mb.removeExcerpt(idB);

    // Move C with stale insertBefore=B → C appended to end
    mb.moveExcerpt(idC, idB);

    // Order: A, C  (B removed; C moved to end)
    const snap = mb.snapshot();
    const lines = snap.lines(mbRow(0), mbRow(2));
    expect(lines[0]).toBe("AAAA");
    expect(lines[1]).toBe("CCCC");
  });
});
