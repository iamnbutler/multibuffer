/**
 * Tests for addExcerpts (batch excerpt creation).
 *
 * Written BEFORE implementation per TDD discipline.
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { createBuffer } from "../../src/buffer/buffer.ts";
import { createMultiBuffer } from "../../src/multibuffer/multibuffer.ts";
import type { ExcerptSpec } from "../../src/multibuffer/types.ts";
import {
  createBufferId,
  excerptRange,
  generateText,
  resetCounters,
  time,
} from "../helpers.ts";

beforeEach(() => {
  resetCounters();
});

describe("MultiBuffer - addExcerpts (batch)", () => {
  test("empty batch returns empty array", () => {
    const mb = createMultiBuffer();
    const ids = mb.addExcerpts([]);
    expect(ids).toEqual([]);
  });

  test("batch with one spec returns single ID", () => {
    const mb = createMultiBuffer();
    const buf = createBuffer(createBufferId(), generateText(10));
    const ids = mb.addExcerpts([{ buffer: buf, range: excerptRange(0, 10) }]);
    expect(ids.length).toBe(1);
    expect(mb.excerpts.length).toBe(1);
    expect(mb.lineCount).toBe(10);
  });

  test("batch result is equivalent to sequential addExcerpt calls", () => {
    const text = generateText(30);

    // Sequential approach
    const seqMb = createMultiBuffer();
    const seqBuf = createBuffer(createBufferId(), text);
    const _seqId0 = seqMb.addExcerpt(seqBuf, excerptRange(0, 10));
    const _seqId1 = seqMb.addExcerpt(seqBuf, excerptRange(10, 20));
    const _seqId2 = seqMb.addExcerpt(seqBuf, excerptRange(20, 30));

    // Batch approach
    const batchMb = createMultiBuffer();
    const batchBuf = createBuffer(createBufferId(), text);
    const specs: ExcerptSpec[] = [
      { buffer: batchBuf, range: excerptRange(0, 10) },
      { buffer: batchBuf, range: excerptRange(10, 20) },
      { buffer: batchBuf, range: excerptRange(20, 30) },
    ];
    const batchIds = batchMb.addExcerpts(specs);

    // Same number of excerpts and total line count
    expect(batchIds.length).toBe(3);
    expect(batchMb.lineCount).toBe(seqMb.lineCount);
    expect(batchMb.excerpts.length).toBe(seqMb.excerpts.length);
    expect(batchMb.excerpts[0]?.startRow).toBe(seqMb.excerpts[0]?.startRow);
    expect(batchMb.excerpts[1]?.startRow).toBe(seqMb.excerpts[1]?.startRow);
    expect(batchMb.excerpts[2]?.startRow).toBe(seqMb.excerpts[2]?.startRow);
  });

  test("IDs returned are unique and valid", () => {
    const mb = createMultiBuffer();
    const buf = createBuffer(createBufferId(), generateText(30));
    const ids = mb.addExcerpts([
      { buffer: buf, range: excerptRange(0, 10) },
      { buffer: buf, range: excerptRange(10, 20) },
      { buffer: buf, range: excerptRange(20, 30) },
    ]);
    expect(ids.length).toBe(3);
    const keys = new Set(ids.map((id) => `${id.index}:${id.generation}`));
    expect(keys.size).toBe(3);
  });

  test("batch from multiple buffers", () => {
    const mb = createMultiBuffer();
    const buf1 = createBuffer(createBufferId(), generateText(10));
    const buf2 = createBuffer(createBufferId(), generateText(20));
    const ids = mb.addExcerpts([
      { buffer: buf1, range: excerptRange(0, 10) },
      { buffer: buf2, range: excerptRange(0, 10) },
      { buffer: buf2, range: excerptRange(10, 20) },
    ]);
    expect(ids.length).toBe(3);
    expect(mb.lineCount).toBe(30);
    expect(mb.excerpts.length).toBe(3);
  });

  test("options forwarded correctly (hasTrailingNewline, editable)", () => {
    const mb = createMultiBuffer();
    const buf = createBuffer(createBufferId(), generateText(10));
    const ids = mb.addExcerpts([
      { buffer: buf, range: excerptRange(0, 5), options: { hasTrailingNewline: true, editable: false } },
      { buffer: buf, range: excerptRange(5, 10) },
    ]);
    expect(ids.length).toBe(2);
    const exc0 = mb.excerpts[0];
    const exc1 = mb.excerpts[1];
    expect(exc0?.hasTrailingNewline).toBe(true);
    expect(exc0?.editable).toBe(false);
    expect(exc1?.hasTrailingNewline).toBe(false);
    expect(exc1?.editable).toBe(true);
  });

  test("version increments exactly once for a batch (not N times)", () => {
    const mb = createMultiBuffer();
    const buf = createBuffer(createBufferId(), generateText(100));

    const vBefore = mb.snapshot().version;

    const specs: ExcerptSpec[] = Array.from({ length: 10 }, (_, i) =>
      ({ buffer: buf, range: excerptRange(i * 10, (i + 1) * 10) })
    );
    mb.addExcerpts(specs);

    const vAfter = mb.snapshot().version;
    // Version should have advanced by exactly 1 (single cache rebuild)
    expect(vAfter).toBe(vBefore + 1);
  });

  test("100 excerpts via addExcerpts completes in <50ms", () => {
    const mb = createMultiBuffer();
    const buf = createBuffer(createBufferId(), generateText(100));
    const specs: ExcerptSpec[] = Array.from({ length: 100 }, (_, i) =>
      ({ buffer: buf, range: excerptRange(i, i + 1) })
    );
    const { durationMs } = time(() => mb.addExcerpts(specs));
    expect(durationMs).toBeLessThan(50);
  });

  test("addExcerpts after existing excerpts appends correctly", () => {
    const mb = createMultiBuffer();
    const buf = createBuffer(createBufferId(), generateText(30));
    mb.addExcerpt(buf, excerptRange(0, 10));
    expect(mb.lineCount).toBe(10);

    mb.addExcerpts([
      { buffer: buf, range: excerptRange(10, 20) },
      { buffer: buf, range: excerptRange(20, 30) },
    ]);
    expect(mb.lineCount).toBe(30);
    expect(mb.excerpts.length).toBe(3);
  });
});
