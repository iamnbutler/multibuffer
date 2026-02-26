/**
 * Buffer tests - written BEFORE implementation.
 *
 * These tests define the expected behavior of the Buffer implementation.
 * Run `bun test` and watch them fail, then implement to make them pass.
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { createBufferId, row, offset, point, generateText, resetCounters, time } from "../helpers.ts";
import type { Buffer, BufferPoint } from "../../src/multibuffer/types.ts";

// TODO: Import actual implementation once created
// import { createBuffer } from "../../src/multibuffer/buffer.ts";

// Placeholder until implementation exists
function createBuffer(_id: string, _text: string): Buffer {
  throw new Error("Not implemented");
}

beforeEach(() => {
  resetCounters();
});

describe("Buffer Creation", () => {
  test.todo("creates buffer from empty string", () => {
    const buffer = createBuffer(createBufferId(), "");
    const snapshot = buffer.snapshot();
    expect(snapshot.lineCount).toBe(1); // Empty buffer has one empty line
    expect(snapshot.line(row(0))).toBe("");
  });

  test.todo("creates buffer from single line", () => {
    const buffer = createBuffer(createBufferId(), "Hello, world!");
    const snapshot = buffer.snapshot();
    expect(snapshot.lineCount).toBe(1);
    expect(snapshot.line(row(0))).toBe("Hello, world!");
  });

  test.todo("creates buffer from multiple lines", () => {
    const text = "Line 1\nLine 2\nLine 3";
    const buffer = createBuffer(createBufferId(), text);
    const snapshot = buffer.snapshot();
    expect(snapshot.lineCount).toBe(3);
    expect(snapshot.line(row(0))).toBe("Line 1");
    expect(snapshot.line(row(1))).toBe("Line 2");
    expect(snapshot.line(row(2))).toBe("Line 3");
  });

  test.todo("handles trailing newline", () => {
    const buffer = createBuffer(createBufferId(), "Line 1\nLine 2\n");
    const snapshot = buffer.snapshot();
    expect(snapshot.lineCount).toBe(3);
    expect(snapshot.line(row(2))).toBe("");
  });
});

describe("Buffer Snapshot", () => {
  test.todo("snapshot is immutable after edits", () => {
    const buffer = createBuffer(createBufferId(), "Original");
    const snapshot1 = buffer.snapshot();

    buffer.insert(offset(0), "Modified: ");
    const snapshot2 = buffer.snapshot();

    expect(snapshot1.text()).toBe("Original");
    expect(snapshot2.text()).toBe("Modified: Original");
  });

  test.todo("lines() returns range of lines", () => {
    const text = "A\nB\nC\nD\nE";
    const buffer = createBuffer(createBufferId(), text);
    const snapshot = buffer.snapshot();

    const lines = snapshot.lines(row(1), row(4));
    expect(lines).toEqual(["B", "C", "D"]);
  });
});

describe("Buffer Editing - Insert", () => {
  test.todo("insert at beginning", () => {
    const buffer = createBuffer(createBufferId(), "World");
    buffer.insert(offset(0), "Hello ");
    expect(buffer.snapshot().text()).toBe("Hello World");
  });

  test.todo("insert at end", () => {
    const buffer = createBuffer(createBufferId(), "Hello");
    buffer.insert(offset(5), " World");
    expect(buffer.snapshot().text()).toBe("Hello World");
  });

  test.todo("insert in middle", () => {
    const buffer = createBuffer(createBufferId(), "Helo");
    buffer.insert(offset(3), "l");
    expect(buffer.snapshot().text()).toBe("Hello");
  });

  test.todo("insert newline creates new line", () => {
    const buffer = createBuffer(createBufferId(), "HelloWorld");
    buffer.insert(offset(5), "\n");
    const snapshot = buffer.snapshot();
    expect(snapshot.lineCount).toBe(2);
    expect(snapshot.line(row(0))).toBe("Hello");
    expect(snapshot.line(row(1))).toBe("World");
  });
});

describe("Buffer Editing - Delete", () => {
  test.todo("delete from beginning", () => {
    const buffer = createBuffer(createBufferId(), "Hello World");
    buffer.delete(offset(0), offset(6));
    expect(buffer.snapshot().text()).toBe("World");
  });

  test.todo("delete from end", () => {
    const buffer = createBuffer(createBufferId(), "Hello World");
    buffer.delete(offset(5), offset(11));
    expect(buffer.snapshot().text()).toBe("Hello");
  });

  test.todo("delete newline merges lines", () => {
    const buffer = createBuffer(createBufferId(), "Hello\nWorld");
    buffer.delete(offset(5), offset(6)); // Delete the newline
    expect(buffer.snapshot().text()).toBe("HelloWorld");
    expect(buffer.snapshot().lineCount).toBe(1);
  });
});

describe("Buffer Editing - Replace", () => {
  test.todo("replace with same length", () => {
    const buffer = createBuffer(createBufferId(), "Hello World");
    buffer.replace(offset(0), offset(5), "HELLO");
    expect(buffer.snapshot().text()).toBe("HELLO World");
  });

  test.todo("replace with shorter", () => {
    const buffer = createBuffer(createBufferId(), "Hello World");
    buffer.replace(offset(0), offset(5), "Hi");
    expect(buffer.snapshot().text()).toBe("Hi World");
  });

  test.todo("replace with longer", () => {
    const buffer = createBuffer(createBufferId(), "Hi World");
    buffer.replace(offset(0), offset(2), "Hello");
    expect(buffer.snapshot().text()).toBe("Hello World");
  });
});

describe("Buffer Position Conversion", () => {
  test.todo("pointToOffset for first line", () => {
    const buffer = createBuffer(createBufferId(), "Hello\nWorld");
    const snapshot = buffer.snapshot();
    expect(snapshot.pointToOffset(point(0, 0)) as number).toBe(0);
    expect(snapshot.pointToOffset(point(0, 5)) as number).toBe(5);
  });

  test.todo("pointToOffset for second line", () => {
    const buffer = createBuffer(createBufferId(), "Hello\nWorld");
    const snapshot = buffer.snapshot();
    // "Hello\n" = 6 bytes, then "World"
    expect(snapshot.pointToOffset(point(1, 0)) as number).toBe(6);
    expect(snapshot.pointToOffset(point(1, 5)) as number).toBe(11);
  });

  test.todo("offsetToPoint for first line", () => {
    const buffer = createBuffer(createBufferId(), "Hello\nWorld");
    const snapshot = buffer.snapshot();
    const p1 = snapshot.offsetToPoint(offset(0));
    const p2 = snapshot.offsetToPoint(offset(5));
    expect({ row: p1.row as number, column: p1.column }).toEqual({ row: 0, column: 0 });
    expect({ row: p2.row as number, column: p2.column }).toEqual({ row: 0, column: 5 });
  });

  test.todo("offsetToPoint for second line", () => {
    const buffer = createBuffer(createBufferId(), "Hello\nWorld");
    const snapshot = buffer.snapshot();
    const p1 = snapshot.offsetToPoint(offset(6));
    const p2 = snapshot.offsetToPoint(offset(11));
    expect({ row: p1.row as number, column: p1.column }).toEqual({ row: 1, column: 0 });
    expect({ row: p2.row as number, column: p2.column }).toEqual({ row: 1, column: 5 });
  });
});

describe("Buffer Performance", () => {
  test.todo("creates 10k line buffer in <10ms", () => {
    const text = generateText(10_000);
    const { durationMs } = time(() => createBuffer(createBufferId(), text));
    expect(durationMs).toBeLessThan(10);
  });

  test.todo("line access is O(1) - consistent time for any line", () => {
    const buffer = createBuffer(createBufferId(), generateText(10_000));
    const snapshot = buffer.snapshot();

    // Access lines at different positions
    const { durationMs: early } = time(() => {
      for (let i = 0; i < 1000; i++) snapshot.line(row(10));
    });
    const { durationMs: middle } = time(() => {
      for (let i = 0; i < 1000; i++) snapshot.line(row(5000));
    });
    const { durationMs: late } = time(() => {
      for (let i = 0; i < 1000; i++) snapshot.line(row(9990));
    });

    // Times should be within 2x of each other (accounting for noise)
    expect(middle).toBeLessThan(early * 2 + 1);
    expect(late).toBeLessThan(early * 2 + 1);
  });
});
