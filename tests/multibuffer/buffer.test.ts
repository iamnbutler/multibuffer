/**
 * Buffer tests - written BEFORE implementation.
 *
 * These tests define the expected behavior of the Buffer implementation.
 * Run `bun test` and watch them fail, then implement to make them pass.
 *
 * Key patterns:
 * - Snapshots are immutable and survive mutations
 * - Position conversion must be O(1) for row access
 * - Clipping must preserve Bias semantics
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { createBuffer } from "../../src/multibuffer/buffer.ts";
import {
  Bias,
  benchmark,
  createBufferId,
  expectOffset,
  expectPoint,
  generateText,
  num,
  offset,
  point,
  resetCounters,
  row,
  time,
} from "../helpers.ts";

beforeEach(() => {
  resetCounters();
});


describe("Buffer Creation", () => {
  test("creates buffer from empty string", () => {
    const buffer = createBuffer(createBufferId(), "");
    const snapshot = buffer.snapshot();
    expect(snapshot.lineCount).toBe(1);
    expect(snapshot.line(row(0))).toBe("");
  });

  test("creates buffer from single line", () => {
    const buffer = createBuffer(createBufferId(), "Hello, world!");
    const snapshot = buffer.snapshot();
    expect(snapshot.lineCount).toBe(1);
    expect(snapshot.line(row(0))).toBe("Hello, world!");
  });

  test("creates buffer from multiple lines", () => {
    const text = "Line 1\nLine 2\nLine 3";
    const buffer = createBuffer(createBufferId(), text);
    const snapshot = buffer.snapshot();
    expect(snapshot.lineCount).toBe(3);
    expect(snapshot.line(row(0))).toBe("Line 1");
    expect(snapshot.line(row(1))).toBe("Line 2");
    expect(snapshot.line(row(2))).toBe("Line 3");
  });

  test("handles trailing newline", () => {
    const buffer = createBuffer(createBufferId(), "Line 1\nLine 2\n");
    const snapshot = buffer.snapshot();
    expect(snapshot.lineCount).toBe(3);
    expect(snapshot.line(row(0))).toBe("Line 1");
    expect(snapshot.line(row(1))).toBe("Line 2");
    expect(snapshot.line(row(2))).toBe("");
  });

  test("handles multiple trailing newlines", () => {
    const buffer = createBuffer(createBufferId(), "Line 1\n\n\n");
    const snapshot = buffer.snapshot();
    expect(snapshot.lineCount).toBe(4);
    expect(snapshot.line(row(0))).toBe("Line 1");
    expect(snapshot.line(row(1))).toBe("");
    expect(snapshot.line(row(2))).toBe("");
    expect(snapshot.line(row(3))).toBe("");
  });

  test("handles empty lines in middle", () => {
    const buffer = createBuffer(createBufferId(), "A\n\nB\n\nC");
    const snapshot = buffer.snapshot();
    expect(snapshot.lineCount).toBe(5);
    expect(snapshot.line(row(0))).toBe("A");
    expect(snapshot.line(row(1))).toBe("");
    expect(snapshot.line(row(2))).toBe("B");
    expect(snapshot.line(row(3))).toBe("");
    expect(snapshot.line(row(4))).toBe("C");
  });

  test("handles unicode content", () => {
    const buffer = createBuffer(
      createBufferId(),
      "Hello 世界\nПривет мир\n🎉🎊",
    );
    const snapshot = buffer.snapshot();
    expect(snapshot.lineCount).toBe(3);
    expect(snapshot.line(row(0))).toBe("Hello 世界");
    expect(snapshot.line(row(1))).toBe("Привет мир");
    expect(snapshot.line(row(2))).toBe("🎉🎊");
  });
});


describe("Buffer Snapshot", () => {
  test("snapshot is immutable after edits", () => {
    const buffer = createBuffer(createBufferId(), "Original");
    const snapshot1 = buffer.snapshot();

    buffer.insert(offset(0), "Modified: ");
    const snapshot2 = buffer.snapshot();

    expect(snapshot1.text()).toBe("Original");
    expect(snapshot1.lineCount).toBe(1);
    expect(snapshot2.text()).toBe("Modified: Original");
  });

  test("multiple snapshots coexist", () => {
    const buffer = createBuffer(createBufferId(), "v1");
    const s1 = buffer.snapshot();

    buffer.replace(offset(0), offset(2), "v2");
    const s2 = buffer.snapshot();

    buffer.replace(offset(0), offset(2), "v3");
    const s3 = buffer.snapshot();

    expect(s1.text()).toBe("v1");
    expect(s2.text()).toBe("v2");
    expect(s3.text()).toBe("v3");
  });

  test("lines() returns range of lines", () => {
    const text = "A\nB\nC\nD\nE";
    const buffer = createBuffer(createBufferId(), text);
    const snapshot = buffer.snapshot();

    const lines = snapshot.lines(row(1), row(4));
    expect(lines).toEqual(["B", "C", "D"]);
  });

  test("lines() with same start and end returns empty", () => {
    const buffer = createBuffer(createBufferId(), "A\nB\nC");
    const snapshot = buffer.snapshot();

    const lines = snapshot.lines(row(1), row(1));
    expect(lines).toEqual([]);
  });

  test("textSummary is accurate", () => {
    const buffer = createBuffer(createBufferId(), "Hello\nWorld");
    const snapshot = buffer.snapshot();

    expect(snapshot.textSummary.lines).toBe(2);
    expect(snapshot.textSummary.bytes).toBe(11);
    expect(snapshot.textSummary.lastLineLength).toBe(5);
  });
});


describe("Buffer Editing - Insert", () => {
  test("insert at beginning", () => {
    const buffer = createBuffer(createBufferId(), "World");
    buffer.insert(offset(0), "Hello ");
    expect(buffer.snapshot().text()).toBe("Hello World");
  });

  test("insert at end", () => {
    const buffer = createBuffer(createBufferId(), "Hello");
    buffer.insert(offset(5), " World");
    expect(buffer.snapshot().text()).toBe("Hello World");
  });

  test("insert in middle", () => {
    const buffer = createBuffer(createBufferId(), "Helo");
    buffer.insert(offset(3), "l");
    expect(buffer.snapshot().text()).toBe("Hello");
  });

  test("insert newline creates new line", () => {
    const buffer = createBuffer(createBufferId(), "HelloWorld");
    buffer.insert(offset(5), "\n");
    const snapshot = buffer.snapshot();
    expect(snapshot.lineCount).toBe(2);
    expect(snapshot.line(row(0))).toBe("Hello");
    expect(snapshot.line(row(1))).toBe("World");
  });

  test("insert multiple newlines", () => {
    const buffer = createBuffer(createBufferId(), "AB");
    buffer.insert(offset(1), "\n\n\n");
    const snapshot = buffer.snapshot();
    expect(snapshot.lineCount).toBe(4);
    expect(snapshot.line(row(0))).toBe("A");
    expect(snapshot.line(row(1))).toBe("");
    expect(snapshot.line(row(2))).toBe("");
    expect(snapshot.line(row(3))).toBe("B");
  });

  test("insert into empty buffer", () => {
    const buffer = createBuffer(createBufferId(), "");
    buffer.insert(offset(0), "Hello");
    expect(buffer.snapshot().text()).toBe("Hello");
    expect(buffer.snapshot().lineCount).toBe(1);
  });
});


describe("Buffer Editing - Delete", () => {
  test("delete from beginning", () => {
    const buffer = createBuffer(createBufferId(), "Hello World");
    buffer.delete(offset(0), offset(6));
    expect(buffer.snapshot().text()).toBe("World");
  });

  test("delete from end", () => {
    const buffer = createBuffer(createBufferId(), "Hello World");
    buffer.delete(offset(5), offset(11));
    expect(buffer.snapshot().text()).toBe("Hello");
  });

  test("delete newline merges lines", () => {
    const buffer = createBuffer(createBufferId(), "Hello\nWorld");
    buffer.delete(offset(5), offset(6));
    expect(buffer.snapshot().text()).toBe("HelloWorld");
    expect(buffer.snapshot().lineCount).toBe(1);
  });

  test("delete entire content", () => {
    const buffer = createBuffer(createBufferId(), "Hello World");
    buffer.delete(offset(0), offset(11));
    expect(buffer.snapshot().text()).toBe("");
    expect(buffer.snapshot().lineCount).toBe(1);
  });

  test("delete multiple lines", () => {
    const buffer = createBuffer(createBufferId(), "A\nB\nC\nD");
    buffer.delete(offset(2), offset(6));
    expect(buffer.snapshot().text()).toBe("A\nD");
    expect(buffer.snapshot().lineCount).toBe(2);
  });

  test("delete zero-length range is no-op", () => {
    const buffer = createBuffer(createBufferId(), "Hello");
    buffer.delete(offset(2), offset(2));
    expect(buffer.snapshot().text()).toBe("Hello");
  });
});


describe("Buffer Editing - Replace", () => {
  test("replace with same length", () => {
    const buffer = createBuffer(createBufferId(), "Hello World");
    buffer.replace(offset(0), offset(5), "HELLO");
    expect(buffer.snapshot().text()).toBe("HELLO World");
  });

  test("replace with shorter", () => {
    const buffer = createBuffer(createBufferId(), "Hello World");
    buffer.replace(offset(0), offset(5), "Hi");
    expect(buffer.snapshot().text()).toBe("Hi World");
  });

  test("replace with longer", () => {
    const buffer = createBuffer(createBufferId(), "Hi World");
    buffer.replace(offset(0), offset(2), "Hello");
    expect(buffer.snapshot().text()).toBe("Hello World");
  });

  test("replace with empty string (delete)", () => {
    const buffer = createBuffer(createBufferId(), "Hello World");
    buffer.replace(offset(5), offset(11), "");
    expect(buffer.snapshot().text()).toBe("Hello");
  });

  test("replace zero-length range (insert)", () => {
    const buffer = createBuffer(createBufferId(), "HelloWorld");
    buffer.replace(offset(5), offset(5), " ");
    expect(buffer.snapshot().text()).toBe("Hello World");
  });
});


describe("Buffer Position Conversion", () => {
  test("pointToOffset for first line", () => {
    const buffer = createBuffer(createBufferId(), "Hello\nWorld");
    const snapshot = buffer.snapshot();
    expectOffset(snapshot.pointToOffset(point(0, 0)), 0);
    expectOffset(snapshot.pointToOffset(point(0, 5)), 5);
  });

  test("pointToOffset for second line", () => {
    const buffer = createBuffer(createBufferId(), "Hello\nWorld");
    const snapshot = buffer.snapshot();
    expectOffset(snapshot.pointToOffset(point(1, 0)), 6);
    expectOffset(snapshot.pointToOffset(point(1, 5)), 11);
  });

  test("offsetToPoint for first line", () => {
    const buffer = createBuffer(createBufferId(), "Hello\nWorld");
    const snapshot = buffer.snapshot();
    expectPoint(snapshot.offsetToPoint(offset(0)), 0, 0);
    expectPoint(snapshot.offsetToPoint(offset(5)), 0, 5);
  });

  test("offsetToPoint for second line", () => {
    const buffer = createBuffer(createBufferId(), "Hello\nWorld");
    const snapshot = buffer.snapshot();
    expectPoint(snapshot.offsetToPoint(offset(6)), 1, 0);
    expectPoint(snapshot.offsetToPoint(offset(11)), 1, 5);
  });

  test("offsetToPoint for newline position", () => {
    const buffer = createBuffer(createBufferId(), "Hello\nWorld");
    const snapshot = buffer.snapshot();
    expectPoint(snapshot.offsetToPoint(offset(5)), 0, 5);
  });

  test("roundtrip: pointToOffset then offsetToPoint", () => {
    const buffer = createBuffer(createBufferId(), "Hello\nWorld\nTest");
    const snapshot = buffer.snapshot();

    const testPoints = [
      point(0, 0),
      point(0, 3),
      point(1, 0),
      point(1, 5),
      point(2, 4),
    ];

    for (const p of testPoints) {
      const off = snapshot.pointToOffset(p);
      const roundtrip = snapshot.offsetToPoint(off);
      expectPoint(roundtrip, num(p.row), p.column);
    }
  });
});


describe("Buffer Clipping with Bias", () => {
  test("clipPoint clamps column to line length", () => {
    const buffer = createBuffer(createBufferId(), "Hi\nWorld");
    const snapshot = buffer.snapshot();
    expectPoint(snapshot.clipPoint(point(0, 10), Bias.Right), 0, 2);
  });

  test("clipPoint clamps row to valid range", () => {
    const buffer = createBuffer(createBufferId(), "A\nB");
    const snapshot = buffer.snapshot();
    expectPoint(snapshot.clipPoint(point(5, 0), Bias.Right), 1, 1);
  });

  test("clipPoint with Bias.Left at end of line", () => {
    const buffer = createBuffer(createBufferId(), "Hello\nWorld");
    const snapshot = buffer.snapshot();
    expectPoint(snapshot.clipPoint(point(0, 10), Bias.Left), 0, 5);
  });

  test("clipPoint preserves valid position", () => {
    const buffer = createBuffer(createBufferId(), "Hello");
    const snapshot = buffer.snapshot();
    expectPoint(snapshot.clipPoint(point(0, 3), Bias.Right), 0, 3);
  });

  test("clipOffset clamps to buffer bounds", () => {
    const buffer = createBuffer(createBufferId(), "Hello");
    const snapshot = buffer.snapshot();
    expectOffset(snapshot.clipOffset(offset(100), Bias.Right), 5);
  });

  test("clipOffset with Bias.Left at boundary", () => {
    const buffer = createBuffer(createBufferId(), "Hello");
    const snapshot = buffer.snapshot();
    expectOffset(snapshot.clipOffset(offset(100), Bias.Left), 5);
  });
});


describe("Buffer Performance", () => {
  test("creates 10k line buffer in <10ms", () => {
    const text = generateText(10_000);
    const { durationMs } = time(() => createBuffer(createBufferId(), text));
    expect(durationMs).toBeLessThan(10);
  });

  test("line access is O(1) - consistent time for any line", () => {
    const buffer = createBuffer(createBufferId(), generateText(10_000));
    const snapshot = buffer.snapshot();

    const early = benchmark(() => snapshot.line(row(10)), 1000);
    const middle = benchmark(() => snapshot.line(row(5000)), 1000);
    const late = benchmark(() => snapshot.line(row(9990)), 1000);

    expect(middle.avgMs).toBeLessThan(early.avgMs * 3 + 0.001);
    // Generous tolerance for CI runners where timing is noisy
    expect(late.avgMs).toBeLessThan(early.avgMs * 10 + 0.01);
  });

  test("pointToOffset is O(1) for row lookup", () => {
    const buffer = createBuffer(createBufferId(), generateText(10_000));
    const snapshot = buffer.snapshot();

    const early = benchmark(() => snapshot.pointToOffset(point(10, 0)), 1000);
    const late = benchmark(() => snapshot.pointToOffset(point(9990, 0)), 1000);

    // Generous tolerance for CI runners where timing is noisy
    expect(late.avgMs).toBeLessThan(early.avgMs * 10 + 0.01);
  });

  test("snapshot creation is fast", () => {
    const buffer = createBuffer(createBufferId(), generateText(10_000));

    const { durationMs } = time(() => {
      for (let i = 0; i < 1000; i++) {
        buffer.snapshot();
      }
    });

    expect(durationMs).toBeLessThan(10);
  });

  test("insert performance is acceptable", () => {
    const buffer = createBuffer(createBufferId(), generateText(1000));

    const { durationMs } = time(() => {
      for (let i = 0; i < 100; i++) {
        buffer.insert(offset(i * 10), "X");
      }
    });

    expect(durationMs).toBeLessThan(50);
  });
});
