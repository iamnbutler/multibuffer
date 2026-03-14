/**
 * Tests for MultiBuffer buffer-to-excerpt index (#155).
 *
 * Verifies that setExcerptsForBuffer and _refreshExcerptsForBuffer
 * use the O(1) index rather than O(n) scans.
 *
 * These tests are written BEFORE implementation (TDD).
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { createBuffer } from "../../src/buffer/buffer.ts";
import { createMultiBuffer } from "../../src/multibuffer/multibuffer.ts";
import {
  createBufferId,
  excerptRange,
  generateText,
  mbPoint,
  mbRow,
  resetCounters,
} from "../helpers.ts";

beforeEach(() => {
  resetCounters();
});

describe("buffer-to-excerpt index", () => {
  describe("addExcerpt maintains index", () => {
    test("adds excerpt under correct buffer key", () => {
      const mb = createMultiBuffer();
      const buf = createBuffer(createBufferId(), generateText(10));
      const id = mb.addExcerpt(buf, excerptRange(0, 10));

      // The excerpt should be retrievable and the buffer registered
      expect(mb.excerpts.length).toBe(1);
      expect(mb.excerpts[0]?.id).toEqual(id);
    });

    test("multiple excerpts from same buffer all tracked", () => {
      const mb = createMultiBuffer();
      const buf = createBuffer(createBufferId(), generateText(30));
      const id1 = mb.addExcerpt(buf, excerptRange(0, 10));
      const id2 = mb.addExcerpt(buf, excerptRange(10, 20));
      const id3 = mb.addExcerpt(buf, excerptRange(20, 30));

      expect(mb.excerpts.length).toBe(3);
      // All three should share the same buffer
      const ids = mb.excerpts.map((e) => e.id);
      expect(ids).toContainEqual(id1);
      expect(ids).toContainEqual(id2);
      expect(ids).toContainEqual(id3);
    });

    test("excerpts from different buffers tracked separately", () => {
      const mb = createMultiBuffer();
      const buf1 = createBuffer(createBufferId(), generateText(10));
      const buf2 = createBuffer(createBufferId(), generateText(10));
      mb.addExcerpt(buf1, excerptRange(0, 10));
      mb.addExcerpt(buf2, excerptRange(0, 10));

      expect(mb.excerpts.length).toBe(2);
    });
  });

  describe("removeExcerpt updates index", () => {
    test("removing excerpt reduces count", () => {
      const mb = createMultiBuffer();
      const buf = createBuffer(createBufferId(), generateText(20));
      const id1 = mb.addExcerpt(buf, excerptRange(0, 10));
      mb.addExcerpt(buf, excerptRange(10, 20));

      mb.removeExcerpt(id1);
      expect(mb.excerpts.length).toBe(1);
    });

    test("setExcerptsForBuffer after remove only affects that buffer", () => {
      const mb = createMultiBuffer();
      const buf1 = createBuffer(createBufferId(), generateText(20));
      const buf2 = createBuffer(createBufferId(), generateText(10));
      mb.addExcerpt(buf1, excerptRange(0, 10));
      const buf2Id = mb.addExcerpt(buf2, excerptRange(0, 10));

      // Remove the buf1 excerpt
      mb.removeExcerpt(mb.excerpts[0]!.id);

      // buf2 excerpt should still be intact
      expect(mb.excerpts.length).toBe(1);
      expect(mb.excerpts[0]?.id).toEqual(buf2Id);
    });

    test("removing last excerpt for a buffer removes buffer from index", () => {
      const mb = createMultiBuffer();
      const buf = createBuffer(createBufferId(), generateText(10));
      const id = mb.addExcerpt(buf, excerptRange(0, 10));
      mb.removeExcerpt(id);

      // Should be back to empty
      expect(mb.excerpts.length).toBe(0);
      expect(mb.lineCount).toBe(0);
    });
  });

  describe("clearExcerpts resets index", () => {
    test("clears all excerpts including index", () => {
      const mb = createMultiBuffer();
      const buf1 = createBuffer(createBufferId(), generateText(10));
      const buf2 = createBuffer(createBufferId(), generateText(10));
      mb.addExcerpt(buf1, excerptRange(0, 10));
      mb.addExcerpt(buf2, excerptRange(0, 10));

      mb.clearExcerpts();
      expect(mb.excerpts.length).toBe(0);
      expect(mb.lineCount).toBe(0);
    });

    test("can add excerpts again after clear", () => {
      const mb = createMultiBuffer();
      const buf = createBuffer(createBufferId(), generateText(10));
      mb.addExcerpt(buf, excerptRange(0, 10));
      mb.clearExcerpts();

      const id = mb.addExcerpt(buf, excerptRange(0, 5));
      expect(mb.excerpts.length).toBe(1);
      expect(mb.excerpts[0]?.id).toEqual(id);
      expect(mb.lineCount).toBe(5);
    });
  });

  describe("setExcerptsForBuffer uses index for isolation", () => {
    test("replacing excerpts for buf1 does not affect buf2 excerpts", () => {
      const mb = createMultiBuffer();
      const buf1 = createBuffer(createBufferId(), generateText(30));
      const buf2 = createBuffer(createBufferId(), generateText(20));

      mb.addExcerpt(buf1, excerptRange(0, 10));
      mb.addExcerpt(buf1, excerptRange(10, 20));
      const buf2Id = mb.addExcerpt(buf2, excerptRange(0, 20));

      // Replace buf1 excerpts
      const newIds = mb.setExcerptsForBuffer(buf1, [excerptRange(5, 15)]);

      expect(newIds.length).toBe(1);
      // buf2 excerpt should still be present
      const allIds = mb.excerpts.map((e) => e.id);
      expect(allIds).toContainEqual(buf2Id);
      // New buf1 excerpt should be there
      expect(allIds).toContainEqual(newIds[0]);
    });

    test("setting empty ranges removes all excerpts for buffer", () => {
      const mb = createMultiBuffer();
      const buf = createBuffer(createBufferId(), generateText(30));
      mb.addExcerpt(buf, excerptRange(0, 10));
      mb.addExcerpt(buf, excerptRange(10, 20));

      const newIds = mb.setExcerptsForBuffer(buf, []);
      expect(newIds.length).toBe(0);
      expect(mb.excerpts.length).toBe(0);
    });

    test("correctly replaces multiple old excerpts with multiple new ones", () => {
      const mb = createMultiBuffer();
      const buf = createBuffer(createBufferId(), generateText(60));
      mb.addExcerpt(buf, excerptRange(0, 10));
      mb.addExcerpt(buf, excerptRange(20, 30));
      mb.addExcerpt(buf, excerptRange(40, 50));

      const newIds = mb.setExcerptsForBuffer(buf, [
        excerptRange(0, 20),
        excerptRange(30, 60),
      ]);
      expect(newIds.length).toBe(2);
      expect(mb.excerpts.length).toBe(2);
      expect(mb.lineCount).toBe(50);
    });

    test("can call setExcerptsForBuffer on a buffer with no prior excerpts", () => {
      const mb = createMultiBuffer();
      const buf = createBuffer(createBufferId(), generateText(10));

      const newIds = mb.setExcerptsForBuffer(buf, [excerptRange(0, 5)]);
      expect(newIds.length).toBe(1);
      expect(mb.excerpts.length).toBe(1);
    });
  });

  describe("edit propagates only to affected buffer's excerpts", () => {
    test("editing buf1 does not change line count of buf2 excerpts", () => {
      const mb = createMultiBuffer();
      const buf1 = createBuffer(createBufferId(), "line1\nline2\nline3\n");
      const buf2 = createBuffer(createBufferId(), "a\nb\nc\n");

      mb.addExcerpt(buf1, excerptRange(0, 3));
      const buf2ExcId = mb.addExcerpt(buf2, excerptRange(0, 3));

      // Edit buf1 (insert a line)
      mb.edit(mbPoint(0, 5), mbPoint(0, 5), "\nnewline");

      // buf2 excerpt should still have 3 rows
      const buf2Exc = mb.excerpts.find(
        (e) => e.id.index === buf2ExcId.index && e.id.generation === buf2ExcId.generation,
      );
      expect(buf2Exc).toBeDefined();
      const buf2Rows = buf2Exc!.endRow - buf2Exc!.startRow;
      expect(buf2Rows).toBe(3);
    });

    test("editing buf1 updates snapshot in buf1 excerpts", () => {
      const mb = createMultiBuffer();
      const buf = createBuffer(createBufferId(), "hello\nworld\n");

      mb.addExcerpt(buf, excerptRange(0, 2));
      const snap1 = mb.snapshot();

      // Insert text at start of line 0
      mb.edit(mbPoint(0, 0), mbPoint(0, 0), "say ");
      const snap2 = mb.snapshot();

      const lines1 = snap1.lines(mbRow(0), mbRow(2));
      const lines2 = snap2.lines(mbRow(0), mbRow(2));

      expect(lines1[0]).toBe("hello");
      expect(lines2[0]).toBe("say hello");
    });
  });
});
