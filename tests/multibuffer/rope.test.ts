/**
 * Rope data structure tests.
 *
 * A rope is a balanced tree of text chunks for O(log n) editing.
 * Each node caches line count and byte count for fast position lookups.
 */

import { describe, expect, test } from "bun:test";
import { Rope } from "../../src/multibuffer/rope.ts";

describe("Rope - Construction", () => {
  test("empty rope", () => {
    const r = Rope.from("");
    expect(r.length).toBe(0);
    expect(r.lineCount).toBe(1);
    expect(r.text()).toBe("");
  });

  test("single line", () => {
    const r = Rope.from("Hello, world!");
    expect(r.length).toBe(13);
    expect(r.lineCount).toBe(1);
    expect(r.text()).toBe("Hello, world!");
  });

  test("multiple lines", () => {
    const r = Rope.from("Line 1\nLine 2\nLine 3");
    expect(r.length).toBe(20);
    expect(r.lineCount).toBe(3);
    expect(r.text()).toBe("Line 1\nLine 2\nLine 3");
  });

  test("trailing newline", () => {
    const r = Rope.from("A\nB\n");
    expect(r.lineCount).toBe(3);
    expect(r.text()).toBe("A\nB\n");
  });

  test("large text splits into chunks", () => {
    const lines = Array.from({ length: 1000 }, (_, i) => `Line ${i}`);
    const text = lines.join("\n");
    const r = Rope.from(text);
    expect(r.text()).toBe(text);
    expect(r.lineCount).toBe(1000);
  });
});

describe("Rope - Line Access", () => {
  test("line by index", () => {
    const r = Rope.from("AAA\nBBB\nCCC\nDDD");
    expect(r.line(0)).toBe("AAA");
    expect(r.line(1)).toBe("BBB");
    expect(r.line(2)).toBe("CCC");
    expect(r.line(3)).toBe("DDD");
  });

  test("line range", () => {
    const r = Rope.from("A\nB\nC\nD\nE");
    expect(r.lines(1, 4)).toEqual(["B", "C", "D"]);
  });

  test("line at end with trailing newline", () => {
    const r = Rope.from("X\nY\n");
    expect(r.line(0)).toBe("X");
    expect(r.line(1)).toBe("Y");
    expect(r.line(2)).toBe("");
  });

  test("out of bounds returns empty", () => {
    const r = Rope.from("Hello");
    expect(r.line(5)).toBe("");
  });
});

describe("Rope - Insert", () => {
  test("insert at start", () => {
    const r = Rope.from("World");
    const r2 = r.insert(0, "Hello ");
    expect(r2.text()).toBe("Hello World");
    // Original unchanged (immutable)
    expect(r.text()).toBe("World");
  });

  test("insert at end", () => {
    const r = Rope.from("Hello");
    const r2 = r.insert(5, " World");
    expect(r2.text()).toBe("Hello World");
  });

  test("insert in middle", () => {
    const r = Rope.from("Helo");
    const r2 = r.insert(2, "l");
    expect(r2.text()).toBe("Hello");
  });

  test("insert newline", () => {
    const r = Rope.from("AB");
    const r2 = r.insert(1, "\n");
    expect(r2.text()).toBe("A\nB");
    expect(r2.lineCount).toBe(2);
  });

  test("insert multiline text", () => {
    const r = Rope.from("Start End");
    const r2 = r.insert(6, "Line1\nLine2\n");
    expect(r2.text()).toBe("Start Line1\nLine2\nEnd");
    expect(r2.lineCount).toBe(3);
  });

  test("insert into empty", () => {
    const r = Rope.from("");
    const r2 = r.insert(0, "Hello");
    expect(r2.text()).toBe("Hello");
  });
});

describe("Rope - Delete", () => {
  test("delete from start", () => {
    const r = Rope.from("Hello World");
    const r2 = r.delete(0, 6);
    expect(r2.text()).toBe("World");
  });

  test("delete from end", () => {
    const r = Rope.from("Hello World");
    const r2 = r.delete(5, 11);
    expect(r2.text()).toBe("Hello");
  });

  test("delete from middle", () => {
    const r = Rope.from("Helllo");
    const r2 = r.delete(2, 3);
    expect(r2.text()).toBe("Hello");
  });

  test("delete newline joins lines", () => {
    const r = Rope.from("A\nB");
    const r2 = r.delete(1, 2);
    expect(r2.text()).toBe("AB");
    expect(r2.lineCount).toBe(1);
  });

  test("delete everything", () => {
    const r = Rope.from("Hello");
    const r2 = r.delete(0, 5);
    expect(r2.text()).toBe("");
    expect(r2.lineCount).toBe(1);
  });

  test("original unchanged after delete", () => {
    const r = Rope.from("Hello");
    r.delete(0, 3);
    expect(r.text()).toBe("Hello");
  });
});

describe("Rope - Replace", () => {
  test("replace range", () => {
    const r = Rope.from("Hello World");
    const r2 = r.replace(6, 11, "Rope");
    expect(r2.text()).toBe("Hello Rope");
  });

  test("replace with longer text", () => {
    const r = Rope.from("AB");
    const r2 = r.replace(1, 2, "BCD");
    expect(r2.text()).toBe("ABCD");
  });

  test("replace with shorter text", () => {
    const r = Rope.from("ABCD");
    const r2 = r.replace(1, 3, "X");
    expect(r2.text()).toBe("AXD");
  });
});

describe("Rope - Position Conversion", () => {
  test("offset to line and column", () => {
    const r = Rope.from("AAA\nBBBB\nCC");
    // offset 0 -> row 0, col 0
    expect(r.offsetToLineCol(0)).toEqual({ line: 0, col: 0 });
    // offset 3 -> row 0, col 3 (end of "AAA")
    expect(r.offsetToLineCol(3)).toEqual({ line: 0, col: 3 });
    // offset 4 -> row 1, col 0 (start of "BBBB")
    expect(r.offsetToLineCol(4)).toEqual({ line: 1, col: 0 });
    // offset 9 -> row 2, col 0 (start of "CC")
    expect(r.offsetToLineCol(9)).toEqual({ line: 2, col: 0 });
    // offset 11 -> row 2, col 2 (end)
    expect(r.offsetToLineCol(11)).toEqual({ line: 2, col: 2 });
  });

  test("line and column to offset", () => {
    const r = Rope.from("AAA\nBBBB\nCC");
    expect(r.lineColToOffset(0, 0)).toBe(0);
    expect(r.lineColToOffset(0, 3)).toBe(3);
    expect(r.lineColToOffset(1, 0)).toBe(4);
    expect(r.lineColToOffset(1, 4)).toBe(8);
    expect(r.lineColToOffset(2, 0)).toBe(9);
    expect(r.lineColToOffset(2, 2)).toBe(11);
  });

  test("roundtrip offset -> lineCol -> offset", () => {
    const r = Rope.from("Hello\nWorld\nFoo\nBar");
    for (let offset = 0; offset <= r.length; offset++) {
      const { line, col } = r.offsetToLineCol(offset);
      expect(r.lineColToOffset(line, col)).toBe(offset);
    }
  });
});

describe("Rope - Slice", () => {
  test("slice range", () => {
    const r = Rope.from("Hello, World!");
    expect(r.slice(0, 5)).toBe("Hello");
    expect(r.slice(7, 12)).toBe("World");
  });

  test("slice full text", () => {
    const r = Rope.from("ABC");
    expect(r.slice(0, 3)).toBe("ABC");
  });

  test("slice empty range", () => {
    const r = Rope.from("ABC");
    expect(r.slice(2, 2)).toBe("");
  });
});

describe("Rope - Stress", () => {
  test("many small inserts", () => {
    let r = Rope.from("");
    for (let i = 0; i < 1000; i++) {
      r = r.insert(r.length, `${i}\n`);
    }
    expect(r.lineCount).toBe(1001); // 1000 lines + trailing empty
    expect(r.line(0)).toBe("0");
    expect(r.line(999)).toBe("999");
  });

  test("random inserts and deletes", () => {
    let r = Rope.from("Initial text content here");
    const ops = 500;
    for (let i = 0; i < ops; i++) {
      if (r.length > 0 && Math.random() < 0.4) {
        // Delete
        const start = Math.floor(Math.random() * r.length);
        const end = Math.min(start + Math.floor(Math.random() * 10) + 1, r.length);
        r = r.delete(start, end);
      } else {
        // Insert
        const pos = Math.floor(Math.random() * (r.length + 1));
        r = r.insert(pos, `x${i}`);
      }
    }
    // Verify internal consistency
    const text = r.text();
    expect(r.length).toBe(text.length);
    expect(r.lineCount).toBe(text.split("\n").length);
  });
});
