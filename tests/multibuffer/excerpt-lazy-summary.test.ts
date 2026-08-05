/**
 * Excerpt.textSummary laziness tests — written BEFORE the implementation.
 *
 * `computeExcerptSummary()` walks every line in an excerpt's range to produce a
 * UTF-8 byte count. `createExcerpt()` runs on every excerpt creation *and* on
 * every excerpt refresh, which happens on every edit to a buffer — so the
 * traversal is on the keystroke path.
 *
 * These tests pin the deferral itself, not just its result:
 *
 * - Construction must not read lines (that is the whole point).
 * - The first read must produce exactly the value eager computation produced.
 * - The value must be memoised, so deferring never costs a repeat reader.
 * - Deferral must not turn into *live* reads: the summary is a function of the
 *   snapshot captured at construction, and snapshots are immutable. An excerpt
 *   built over snapshot v1 must keep reporting v1's content after the buffer
 *   moves on. This is the property that distinguishes lazy computation from
 *   the conditional-skip approach, which can leave a genuinely stale value.
 *
 * The `lines()` call counter is the observable: it is what the traversal costs.
 */

import { describe, expect, test } from "bun:test";
import { createBuffer } from "../../src/buffer/buffer.ts";
import type { BufferSnapshot } from "../../src/buffer/types.ts";
import {
  createExcerpt,
  withExcerptMetadata,
} from "../../src/multibuffer/excerpt.ts";
import {
  createBufferId,
  createExcerptId,
  excerptRange,
  offset,
} from "../helpers.ts";

/**
 * A BufferSnapshot that delegates everything to a real snapshot but counts
 * `lines()` calls. Written out member by member rather than proxied so it stays
 * fully typed with no assertions.
 */
function countingSnapshot(inner: BufferSnapshot): {
  snapshot: BufferSnapshot;
  linesCalls: () => number;
} {
  let calls = 0;
  const snapshot: BufferSnapshot = {
    id: inner.id,
    lineCount: inner.lineCount,
    textSummary: inner.textSummary,
    version: inner.version,
    line: (r) => inner.line(r),
    lines: (startRow, endRow) => {
      calls++;
      return inner.lines(startRow, endRow);
    },
    lineIterator: (startRow, endRow) => inner.lineIterator(startRow, endRow),
    text: () => inner.text(),
    pointToOffset: (point) => inner.pointToOffset(point),
    offsetToPoint: (offset) => inner.offsetToPoint(offset),
    clipPoint: (point, bias) => inner.clipPoint(point, bias),
    clipOffset: (offset, bias) => inner.clipOffset(offset, bias),
  };
  return { snapshot, linesCalls: () => calls };
}

/** UTF-8 byte length via the platform encoder — an oracle independent of the implementation. */
const encoder = new TextEncoder();
function utf8Bytes(text: string): number {
  return encoder.encode(text).length;
}

const SIX_LINES = "alpha\nbravo\ncharlie\ndelta\necho\nfoxtrot";

describe("Excerpt.textSummary is computed lazily", () => {
  test("construction does not walk the excerpt's lines", () => {
    const buf = createBuffer(createBufferId(), SIX_LINES);
    const { snapshot, linesCalls } = countingSnapshot(buf.snapshot());

    createExcerpt(createExcerptId(), snapshot, excerptRange(1, 4), false);

    expect(linesCalls()).toBe(0);
  });

  test("reading textSummary computes it, once", () => {
    const buf = createBuffer(createBufferId(), SIX_LINES);
    const { snapshot, linesCalls } = countingSnapshot(buf.snapshot());
    const excerpt = createExcerpt(
      createExcerptId(),
      snapshot,
      excerptRange(1, 4),
      false,
    );

    const first = excerpt.textSummary;
    expect(linesCalls()).toBe(1);

    const second = excerpt.textSummary;
    expect(linesCalls()).toBe(1);
    // Memoised, not recomputed into an equal-but-distinct object.
    expect(second).toBe(first);
  });

  test("the deferred value equals what eager computation produced", () => {
    const buf = createBuffer(createBufferId(), SIX_LINES);
    const excerpt = createExcerpt(
      createExcerptId(),
      buf.snapshot(),
      excerptRange(1, 4),
      false,
    );

    // Rows 1..3 — "bravo\ncharlie\ndelta"
    const expected = "bravo\ncharlie\ndelta";
    expect(excerpt.textSummary.lines).toBe(3);
    expect(excerpt.textSummary.chars).toBe(expected.length);
    expect(excerpt.textSummary.bytes).toBe(utf8Bytes(expected));
    expect(excerpt.textSummary.lastLineLength).toBe("delta".length);
  });

  test("non-ASCII byte counting is unaffected by deferral", () => {
    // Two-byte (é), three-byte (世), and a surrogate pair (4 bytes, 2 chars).
    const text = "ascii\ncafé\n世界\n😀x\ntail";
    const buf = createBuffer(createBufferId(), text);
    const excerpt = createExcerpt(
      createExcerptId(),
      buf.snapshot(),
      excerptRange(1, 4),
      false,
    );

    const expected = "café\n世界\n😀x";
    expect(excerpt.textSummary.bytes).toBe(utf8Bytes(expected));
    expect(excerpt.textSummary.chars).toBe(expected.length);
    expect(excerpt.textSummary.lines).toBe(3);
  });

  test("the whole-buffer fast path still returns the snapshot's own summary", () => {
    const buf = createBuffer(createBufferId(), SIX_LINES);
    const { snapshot, linesCalls } = countingSnapshot(buf.snapshot());
    const excerpt = createExcerpt(
      createExcerptId(),
      snapshot,
      excerptRange(0, 6),
      false,
    );

    // Reference equality pins the O(1) shortcut, not merely its value.
    expect(excerpt.textSummary).toBe(snapshot.textSummary);
    expect(linesCalls()).toBe(0);
  });

  test("an out-of-bounds range still throws at construction, not on read", () => {
    const buf = createBuffer(createBufferId(), SIX_LINES);
    const snapshot = buf.snapshot();

    expect(() =>
      createExcerpt(createExcerptId(), snapshot, excerptRange(0, 99), false),
    ).toThrow(RangeError);
  });
});

describe("Excerpt.textSummary deferral does not become a live read", () => {
  test("an excerpt keeps its snapshot's content after the buffer moves on", () => {
    const buf = createBuffer(createBufferId(), SIX_LINES);
    const excerpt = createExcerpt(
      createExcerptId(),
      buf.snapshot(),
      excerptRange(1, 4),
      false,
    );

    // Mutate the buffer *before* the summary has ever been read.
    buf.insert(offset(0), "PREPENDED TEXT\n");

    // The excerpt holds snapshot v1, so it must still describe v1's rows 1..3.
    const expected = "bravo\ncharlie\ndelta";
    expect(excerpt.textSummary.chars).toBe(expected.length);
    expect(excerpt.textSummary.bytes).toBe(utf8Bytes(expected));
    expect(excerpt.textSummary.lines).toBe(3);
  });

  test("a summary read before the edit matches one read after it", () => {
    const buf = createBuffer(createBufferId(), SIX_LINES);
    const excerpt = createExcerpt(
      createExcerptId(),
      buf.snapshot(),
      excerptRange(2, 5),
      false,
    );

    const before = { ...excerpt.textSummary };
    buf.insert(offset(0), "X");
    const after = excerpt.textSummary;

    expect(after.lines).toBe(before.lines);
    expect(after.chars).toBe(before.chars);
    expect(after.bytes).toBe(before.bytes);
    expect(after.lastLineLength).toBe(before.lastLineLength);
  });
});

describe("withExcerptMetadata preserves the deferral", () => {
  test("updating metadata does not force the summary", () => {
    const buf = createBuffer(createBufferId(), SIX_LINES);
    const { snapshot, linesCalls } = countingSnapshot(buf.snapshot());
    const excerpt = createExcerpt(
      createExcerptId(),
      snapshot,
      excerptRange(1, 4),
      false,
      true,
      { language: "ts" },
    );

    const updated = withExcerptMetadata(excerpt, { language: "tsx" });

    expect(updated.metadata?.language).toBe("tsx");
    expect(linesCalls()).toBe(0);
  });

  test("the updated excerpt still reports the right summary", () => {
    const buf = createBuffer(createBufferId(), SIX_LINES);
    const excerpt = createExcerpt(
      createExcerptId(),
      buf.snapshot(),
      excerptRange(1, 4),
      false,
      true,
      { language: "ts" },
    );

    const updated = withExcerptMetadata(excerpt, { language: "tsx" });

    const expected = "bravo\ncharlie\ndelta";
    expect(updated.textSummary.chars).toBe(expected.length);
    expect(updated.textSummary.bytes).toBe(utf8Bytes(expected));
  });

  test("metadata is shallow-merged, and the original is untouched", () => {
    const buf = createBuffer(createBufferId(), SIX_LINES);
    const excerpt = createExcerpt(
      createExcerptId(),
      buf.snapshot(),
      excerptRange(1, 4),
      false,
      true,
      { language: "ts", filePath: "a.ts" },
    );

    const updated = withExcerptMetadata(excerpt, { language: "tsx" });

    expect(updated.metadata?.language).toBe("tsx");
    expect(updated.metadata?.filePath).toBe("a.ts");
    expect(excerpt.metadata?.language).toBe("ts");
  });

  test("every non-metadata field carries over unchanged", () => {
    const buf = createBuffer(createBufferId(), SIX_LINES);
    const snapshot = buf.snapshot();
    const id = createExcerptId();
    const range = excerptRange(1, 4);
    const excerpt = createExcerpt(id, snapshot, range, true, false, {
      language: "ts",
    });

    const updated = withExcerptMetadata(excerpt, { language: "tsx" });

    expect(updated.id).toBe(excerpt.id);
    expect(updated.bufferId).toBe(excerpt.bufferId);
    expect(updated.buffer).toBe(snapshot);
    expect(updated.range).toBe(range);
    expect(updated.hasTrailingNewline).toBe(true);
    expect(updated.editable).toBe(false);
  });
});
