/**
 * Buffer tests - written BEFORE implementation.
 *
 * These tests define the expected behavior of the Buffer implementation.
 * Run `bun test` and watch them fail, then implement to make them pass.
 *
 * Key patterns
 * - Snapshots are immutable and survive mutations
 * - Position conversion must be O(1) for row access
 * - Clipping must preserve Bias semantics
 */

import { describe, test, expect, beforeEach } from "bun:test";
import {
  createBufferId,
  row,
  offset,
  point,
  generateText,
  generateEdgeCaseText,
  resetCounters,
  time,
  benchmark,
  Bias,
} from "../helpers.ts";
import type {
  Buffer,
  BufferSnapshot,
  BufferPoint,
} from "../../src/multibuffer/types.ts";

// TODO: Import actual implementation once created
// import { createBuffer } from "../../src/multibuffer/buffer.ts";

// Placeholder until implementation exists
function createBuffer(_id: string, _text: string): Buffer {
  throw new Error("Not implemented");
}

beforeEach(() => {
  resetCounters();
});

// =============================================================================
// Buffer Creation
// =============================================================================

describe("Buffer Creation", () => {
  test.todo("creates buffer from empty string", () => {
    const buffer = createBuffer(createBufferId(), "");
    const snapshot = buffer.snapshot();
    // GOTCHA: Empty buffer has ONE empty line, not zero lines
    expect(snapshot.lineCount).toBe(1);
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
    // GOTCHA: Trailing newline creates an empty last line
    const buffer = createBuffer(createBufferId(), "Line 1\nLine 2\n");
    const snapshot = buffer.snapshot();
    expect(snapshot.lineCount).toBe(3);
    expect(snapshot.line(row(0))).toBe("Line 1");
    expect(snapshot.line(row(1))).toBe("Line 2");
    expect(snapshot.line(row(2))).toBe(""); // Empty line from trailing \n
  });

  test.todo("handles multiple trailing newlines", () => {
    const buffer = createBuffer(createBufferId(), "Line 1\n\n\n");
    const snapshot = buffer.snapshot();
    expect(snapshot.lineCount).toBe(4);
    expect(snapshot.line(row(0))).toBe("Line 1");
    expect(snapshot.line(row(1))).toBe("");
    expect(snapshot.line(row(2))).toBe("");
    expect(snapshot.line(row(3))).toBe("");
  });

  test.todo("handles empty lines in middle", () => {
    const buffer = createBuffer(createBufferId(), "A\n\nB\n\nC");
    const snapshot = buffer.snapshot();
    expect(snapshot.lineCount).toBe(5);
    expect(snapshot.line(row(0))).toBe("A");
    expect(snapshot.line(row(1))).toBe("");
    expect(snapshot.line(row(2))).toBe("B");
    expect(snapshot.line(row(3))).toBe("");
    expect(snapshot.line(row(4))).toBe("C");
  });

  test.todo("handles unicode content", () => {
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

// =============================================================================
// Buffer Snapshot Immutability
// =============================================================================

describe("Buffer Snapshot", () => {
  test.todo("snapshot is immutable after edits", () => {
    const buffer = createBuffer(createBufferId(), "Original");
    const snapshot1 = buffer.snapshot();

    buffer.insert(offset(0), "Modified: ");
    const snapshot2 = buffer.snapshot();

    // Old snapshot unchanged
    expect(snapshot1.text()).toBe("Original");
    expect(snapshot1.lineCount).toBe(1);

    // New snapshot has changes
    expect(snapshot2.text()).toBe("Modified: Original");
  });

  test.todo("multiple snapshots coexist", () => {
    const buffer = createBuffer(createBufferId(), "v1");
    const s1 = buffer.snapshot();

    buffer.replace(offset(0), offset(2), "v2");
    const s2 = buffer.snapshot();

    buffer.replace(offset(0), offset(2), "v3");
    const s3 = buffer.snapshot();

    // All three snapshots should remain valid
    expect(s1.text()).toBe("v1");
    expect(s2.text()).toBe("v2");
    expect(s3.text()).toBe("v3");
  });

  test.todo("lines() returns range of lines", () => {
    const text = "A\nB\nC\nD\nE";
    const buffer = createBuffer(createBufferId(), text);
    const snapshot = buffer.snapshot();

    const lines = snapshot.lines(row(1), row(4));
    expect(lines).toEqual(["B", "C", "D"]);
  });

  test.todo("lines() with same start and end returns empty", () => {
    const buffer = createBuffer(createBufferId(), "A\nB\nC");
    const snapshot = buffer.snapshot();

    const lines = snapshot.lines(row(1), row(1));
    expect(lines).toEqual([]);
  });

  test.todo("textSummary is accurate", () => {
    const buffer = createBuffer(createBufferId(), "Hello\nWorld");
    const snapshot = buffer.snapshot();

    expect(snapshot.textSummary.lines).toBe(2);
    expect(snapshot.textSummary.bytes).toBe(11); // "Hello\nWorld" = 11 bytes
    expect(snapshot.textSummary.lastLineLength).toBe(5); // "World"
  });
});

// =============================================================================
// Buffer Editing - Insert
// =============================================================================

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

  test.todo("insert multiple newlines", () => {
    const buffer = createBuffer(createBufferId(), "AB");
    buffer.insert(offset(1), "\n\n\n");
    const snapshot = buffer.snapshot();
    expect(snapshot.lineCount).toBe(4);
    expect(snapshot.line(row(0))).toBe("A");
    expect(snapshot.line(row(1))).toBe("");
    expect(snapshot.line(row(2))).toBe("");
    expect(snapshot.line(row(3))).toBe("B");
  });

  test.todo("insert into empty buffer", () => {
    const buffer = createBuffer(createBufferId(), "");
    buffer.insert(offset(0), "Hello");
    expect(buffer.snapshot().text()).toBe("Hello");
    expect(buffer.snapshot().lineCount).toBe(1);
  });
});

// =============================================================================
// Buffer Editing - Delete
// =============================================================================

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

  test.todo("delete entire content", () => {
    const buffer = createBuffer(createBufferId(), "Hello World");
    buffer.delete(offset(0), offset(11));
    expect(buffer.snapshot().text()).toBe("");
    expect(buffer.snapshot().lineCount).toBe(1); // Still one empty line
  });

  test.todo("delete multiple lines", () => {
    const buffer = createBuffer(createBufferId(), "A\nB\nC\nD");
    buffer.delete(offset(2), offset(6)); // Delete "B\nC\n"
    expect(buffer.snapshot().text()).toBe("A\nD");
    expect(buffer.snapshot().lineCount).toBe(2);
  });

  test.todo("delete zero-length range is no-op", () => {
    const buffer = createBuffer(createBufferId(), "Hello");
    buffer.delete(offset(2), offset(2));
    expect(buffer.snapshot().text()).toBe("Hello");
  });
});

// =============================================================================
// Buffer Editing - Replace
// =============================================================================

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

  test.todo("replace with empty string (delete)", () => {
    const buffer = createBuffer(createBufferId(), "Hello World");
    buffer.replace(offset(5), offset(11), "");
    expect(buffer.snapshot().text()).toBe("Hello");
  });

  test.todo("replace zero-length range (insert)", () => {
    const buffer = createBuffer(createBufferId(), "HelloWorld");
    buffer.replace(offset(5), offset(5), " ");
    expect(buffer.snapshot().text()).toBe("Hello World");
  });
});

// =============================================================================
// Position Conversion
// =============================================================================

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
    expect({ row: p1.row as number, column: p1.column }).toEqual({
      row: 0,
      column: 0,
    });
    expect({ row: p2.row as number, column: p2.column }).toEqual({
      row: 0,
      column: 5,
    });
  });

  test.todo("offsetToPoint for second line", () => {
    const buffer = createBuffer(createBufferId(), "Hello\nWorld");
    const snapshot = buffer.snapshot();
    const p1 = snapshot.offsetToPoint(offset(6));
    const p2 = snapshot.offsetToPoint(offset(11));
    expect({ row: p1.row as number, column: p1.column }).toEqual({
      row: 1,
      column: 0,
    });
    expect({ row: p2.row as number, column: p2.column }).toEqual({
      row: 1,
      column: 5,
    });
  });

  test.todo("offsetToPoint for newline position", () => {
    const buffer = createBuffer(createBufferId(), "Hello\nWorld");
    const snapshot = buffer.snapshot();
    // Offset 5 is the newline character - should be end of line 0
    const p = snapshot.offsetToPoint(offset(5));
    expect({ row: p.row as number, column: p.column }).toEqual({
      row: 0,
      column: 5,
    });
  });

  test.todo("roundtrip: pointToOffset then offsetToPoint", () => {
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
      expect({
        row: roundtrip.row as number,
        column: roundtrip.column,
      }).toEqual({ row: p.row as number, column: p.column });
    }
  });
});

// =============================================================================
// Clipping with Bias
// =============================================================================

describe("Buffer Clipping with Bias", () => {
  test.todo("clipPoint clamps column to line length", () => {
    const buffer = createBuffer(createBufferId(), "Hi\nWorld");
    const snapshot = buffer.snapshot();

    // Line 0 is "Hi" (length 2), requesting column 10
    const clipped = snapshot.clipPoint(point(0, 10), Bias.Right);
    expect({ row: clipped.row as number, column: clipped.column }).toEqual({
      row: 0,
      column: 2,
    });
  });

  test.todo("clipPoint clamps row to valid range", () => {
    const buffer = createBuffer(createBufferId(), "A\nB");
    const snapshot = buffer.snapshot();

    // Row 5 doesn't exist, should clamp to last row
    const clipped = snapshot.clipPoint(point(5, 0), Bias.Right);
    expect({ row: clipped.row as number, column: clipped.column }).toEqual({
      row: 1,
      column: 1, // End of "B"
    });
  });

  test.todo("clipPoint with Bias.Left at end of line", () => {
    const buffer = createBuffer(createBufferId(), "Hello\nWorld");
    const snapshot = buffer.snapshot();

    // GOTCHA: Bias.Left should prefer position before boundary
    const clipped = snapshot.clipPoint(point(0, 10), Bias.Left);
    expect({ row: clipped.row as number, column: clipped.column }).toEqual({
      row: 0,
      column: 5, // "Hello" length
    });
  });

  test.todo("clipPoint preserves valid position", () => {
    const buffer = createBuffer(createBufferId(), "Hello");
    const snapshot = buffer.snapshot();

    const clipped = snapshot.clipPoint(point(0, 3), Bias.Right);
    expect({ row: clipped.row as number, column: clipped.column }).toEqual({
      row: 0,
      column: 3,
    });
  });

  test.todo("clipOffset clamps to buffer bounds", () => {
    const buffer = createBuffer(createBufferId(), "Hello"); // 5 bytes
    const snapshot = buffer.snapshot();

    const clipped = snapshot.clipOffset(offset(100), Bias.Right);
    expect(clipped as number).toBe(5);
  });

  test.todo("clipOffset with Bias.Left at boundary", () => {
    const buffer = createBuffer(createBufferId(), "Hello");
    const snapshot = buffer.snapshot();

    // At boundary, Bias.Left prefers the position before
    const clipped = snapshot.clipOffset(offset(100), Bias.Left);
    expect(clipped as number).toBe(5);
  });
});

// =============================================================================
// Performance Tests
// =============================================================================

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
    const early = benchmark(() => snapshot.line(row(10)), 1000);
    const middle = benchmark(() => snapshot.line(row(5000)), 1000);
    const late = benchmark(() => snapshot.line(row(9990)), 1000);

    // Times should be within 3x of each other (accounting for noise)
    expect(middle.avgMs).toBeLessThan(early.avgMs * 3 + 0.001);
    expect(late.avgMs).toBeLessThan(early.avgMs * 3 + 0.001);
  });

  test.todo("pointToOffset is O(1) for row lookup", () => {
    const buffer = createBuffer(createBufferId(), generateText(10_000));
    const snapshot = buffer.snapshot();

    const early = benchmark(() => snapshot.pointToOffset(point(10, 0)), 1000);
    const late = benchmark(() => snapshot.pointToOffset(point(9990, 0)), 1000);

    // Should be similar times
    expect(late.avgMs).toBeLessThan(early.avgMs * 3 + 0.001);
  });

  test.todo("snapshot creation is fast", () => {
    const buffer = createBuffer(createBufferId(), generateText(10_000));

    // Snapshot should be O(1) - just a reference copy
    const { durationMs } = time(() => {
      for (let i = 0; i < 1000; i++) {
        buffer.snapshot();
      }
    });

    expect(durationMs).toBeLessThan(10); // 1000 snapshots in <10ms
  });

  test.todo("insert performance is acceptable", () => {
    const buffer = createBuffer(createBufferId(), generateText(1000));

    // Insert at random positions
    const { durationMs } = time(() => {
      for (let i = 0; i < 100; i++) {
        buffer.insert(offset(i * 10), "X");
      }
    });

    expect(durationMs).toBeLessThan(50); // 100 inserts in <50ms
  });
});
