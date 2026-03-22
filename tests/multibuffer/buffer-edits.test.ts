/**
 * Buffer edit sequence tests — inspired by Zed's test_edit, test_line_len,
 * test_text_summary_for_range, and test_chars_at.
 *
 * TDD: these tests define expected behavior. Some may fail until
 * implementation catches up.
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { createBuffer } from "../../src/buffer/buffer.ts";
import {
  createBufferId,
  expectOffset,
  expectPoint,
  num,
  offset,
  point,
  resetCounters,
  row,
  textSummary,
} from "../helpers.ts";


beforeEach(() => {
  resetCounters();
});


describe("Buffer edit sequences (from Zed test_edit)", () => {
  test("append 'def' at end of 'abc'", () => {
    const buffer = createBuffer(createBufferId(), "abc");
    buffer.insert(offset(3), "def");
    expect(buffer.snapshot().text()).toBe("abcdef");
  });

  test("prepend 'ghi' at start", () => {
    const buffer = createBuffer(createBufferId(), "abcdef");
    buffer.insert(offset(0), "ghi");
    expect(buffer.snapshot().text()).toBe("ghiabcdef");
  });

  test("insert 'jkl' in middle", () => {
    const buffer = createBuffer(createBufferId(), "ghiabcdef");
    buffer.insert(offset(5), "jkl");
    expect(buffer.snapshot().text()).toBe("ghiabjklcdef");
  });

  test("delete single char", () => {
    const buffer = createBuffer(createBufferId(), "ghiabjklcdef");
    buffer.delete(offset(6), offset(7));
    expect(buffer.snapshot().text()).toBe("ghiabjlcdef");
  });

  test("replace range with shorter text", () => {
    const buffer = createBuffer(createBufferId(), "ghiabjlcdef");
    buffer.replace(offset(4), offset(9), "mno");
    expect(buffer.snapshot().text()).toBe("ghiamnoef");
  });

  test("full sequential test matching Zed's exact sequence", () => {
    const buffer = createBuffer(createBufferId(), "abc");
    expect(buffer.snapshot().text()).toBe("abc");

    buffer.insert(offset(3), "def");
    expect(buffer.snapshot().text()).toBe("abcdef");

    buffer.insert(offset(0), "ghi");
    expect(buffer.snapshot().text()).toBe("ghiabcdef");

    buffer.insert(offset(5), "jkl");
    expect(buffer.snapshot().text()).toBe("ghiabjklcdef");

    buffer.delete(offset(6), offset(7));
    expect(buffer.snapshot().text()).toBe("ghiabjlcdef");

    buffer.replace(offset(4), offset(9), "mno");
    expect(buffer.snapshot().text()).toBe("ghiamnoef");
  });
});


describe("Line length after edits", () => {
  test("line length correct after inserting text on a line", () => {
    const buffer = createBuffer(createBufferId(), "hello");
    buffer.insert(offset(5), " world");
    const snap = buffer.snapshot();
    expect(snap.line(row(0))).toBe("hello world");
    expect(snap.line(row(0)).length).toBe(11);
  });

  test("line length correct after deleting from a line", () => {
    const buffer = createBuffer(createBufferId(), "hello world");
    buffer.delete(offset(5), offset(11));
    const snap = buffer.snapshot();
    expect(snap.line(row(0))).toBe("hello");
    expect(snap.line(row(0)).length).toBe(5);
  });

  test("line length after inserting newline (line splits)", () => {
    const buffer = createBuffer(createBufferId(), "helloworld");
    buffer.insert(offset(5), "\n");
    const snap = buffer.snapshot();
    expect(snap.lineCount).toBe(2);
    expect(snap.line(row(0))).toBe("hello");
    expect(snap.line(row(0)).length).toBe(5);
    expect(snap.line(row(1))).toBe("world");
    expect(snap.line(row(1)).length).toBe(5);
  });

  test("line length after deleting newline (lines join)", () => {
    const buffer = createBuffer(createBufferId(), "hello\nworld");
    buffer.delete(offset(5), offset(6));
    const snap = buffer.snapshot();
    expect(snap.lineCount).toBe(1);
    expect(snap.line(row(0))).toBe("helloworld");
    expect(snap.line(row(0)).length).toBe(10);
  });

  test("line length for empty line is 0", () => {
    const buffer = createBuffer(createBufferId(), "a\n\nb");
    const snap = buffer.snapshot();
    expect(snap.line(row(1))).toBe("");
    expect(snap.line(row(1)).length).toBe(0);
  });

  test("line lengths after Zed test_line_len edit sequence", () => {
    // Reproduces Zed's test_line_len:
    //   edit(0..0, "abcd\nefg\nhij")  → "abcd\nefg\nhij"
    //   edit(12..12, "kl\nmno")       → "abcd\nefg\nhijkl\nmno"
    //   edit(18..18, "\npqrs\n")      → "abcd\nefg\nhijkl\nmno\npqrs\n"
    //   edit(18..21, "\nPQ")          → "abcd\nefg\nhijkl\nmno\nPQ\npqrs\n"
    //                                   but Zed's expected line lengths are:
    //                                   [4, 3, 5, 3, 4, 0]
    // Replicate via insert/replace:
    const buffer = createBuffer(createBufferId(), "");

    buffer.insert(offset(0), "abcd\nefg\nhij");
    expect(buffer.snapshot().text()).toBe("abcd\nefg\nhij");

    buffer.insert(offset(12), "kl\nmno");
    expect(buffer.snapshot().text()).toBe("abcd\nefg\nhijkl\nmno");

    buffer.insert(offset(18), "\npqrs\n");
    expect(buffer.snapshot().text()).toBe("abcd\nefg\nhijkl\nmno\npqrs\n");

    buffer.replace(offset(18), offset(21), "\nPQ");
    // After replace: "abcd\nefg\nhijkl\nmno\nPQ\nrs\n"
    // Zed expects line lengths: [4, 3, 5, 3, 4, 0]
    // Zed line_len is chars without the newline.
    const snap = buffer.snapshot();
    expect(snap.line(row(0)).length).toBe(4); // "abcd"
    expect(snap.line(row(1)).length).toBe(3); // "efg"
    expect(snap.line(row(2)).length).toBe(5); // "hijkl"
    expect(snap.line(row(3)).length).toBe(3); // "mno" (Zed) or check actual
    expect(snap.line(row(4)).length).toBe(4); // "pqrs" (Zed)
    expect(snap.line(row(5)).length).toBe(0); // "" trailing
  });
});


describe("Text summary for range", () => {
  test("summary for full buffer", () => {
    const buffer = createBuffer(createBufferId(), "ab\nefg\nhklm\nnopqrs\ntuvwxyz");
    const snap = buffer.snapshot();
    const summary = snap.textSummary;

    expect(summary.lines).toBe(5);
    // "ab\nefg\nhklm\nnopqrs\ntuvwxyz" has length 26
    expect(summary.chars).toBe(26);
    expect(summary.lastLineLength).toBe(7); // "tuvwxyz"
  });

  test("summary for single line range", () => {
    const text = "hello";
    const summary = textSummary(text);
    expect(summary.lines).toBe(1);
    expect(summary.chars).toBe(5);
    expect(summary.bytes).toBe(5);
    expect(summary.lastLineLength).toBe(5);
  });

  test("summary for range spanning multiple lines", () => {
    const text = "ab\nefg\nhklm";
    const summary = textSummary(text);
    expect(summary.lines).toBe(3);
    expect(summary.chars).toBe(11);
    expect(summary.lastLineLength).toBe(4); // "hklm"
  });

  test("summary chars count matches actual character count", () => {
    const text = "Hello\nWorld";
    const buffer = createBuffer(createBufferId(), text);
    const snap = buffer.snapshot();
    expect(snap.textSummary.chars).toBe(text.length);
  });

  test("summary bytes count matches UTF-8 byte length", () => {
    const text = "Hello\nWorld";
    const buffer = createBuffer(createBufferId(), text);
    const snap = buffer.snapshot();
    const expectedBytes = new TextEncoder().encode(text).length;
    expect(snap.textSummary.bytes).toBe(expectedBytes);
  });

  test("summary with unicode/multibyte content", () => {
    // Each CJK character is 3 bytes in UTF-8, 1 code unit in UTF-16
    const text = "Hello 世界";
    const buffer = createBuffer(createBufferId(), text);
    const snap = buffer.snapshot();

    // UTF-16 length: "Hello " (6) + "世界" (2) = 8
    expect(snap.textSummary.chars).toBe(8);
    // UTF-8 bytes: "Hello " (6) + "世" (3) + "界" (3) = 12
    expect(snap.textSummary.bytes).toBe(12);
    expect(snap.textSummary.lines).toBe(1);
    expect(snap.textSummary.lastLineLength).toBe(8);
  });

  test("summary updates correctly after edits", () => {
    const buffer = createBuffer(createBufferId(), "ab\ncd");
    buffer.insert(offset(5), "\nef");
    const snap = buffer.snapshot();

    expect(snap.textSummary.lines).toBe(3);
    expect(snap.textSummary.chars).toBe(8); // "ab\ncd\nef"
    expect(snap.textSummary.lastLineLength).toBe(2); // "ef"
  });
});


describe("Unicode buffer operations", () => {
  test("insert emoji (surrogate pairs)", () => {
    const buffer = createBuffer(createBufferId(), "ab");
    // Emoji U+1F600 is a surrogate pair in UTF-16: length 2
    buffer.insert(offset(1), "\uD83D\uDE00");
    const snap = buffer.snapshot();
    expect(snap.text()).toBe("a\uD83D\uDE00b");
    // Total UTF-16 length: 'a' (1) + emoji (2) + 'b' (1) = 4
    expect(snap.textSummary.chars).toBe(4);
  });

  test("delete within emoji handled correctly", () => {
    // "a😀b" in UTF-16 = ['a', '\uD83D', '\uDE00', 'b'], length 4
    const buffer = createBuffer(createBufferId(), "a\uD83D\uDE00b");
    // Delete the emoji entirely (offsets 1..3)
    buffer.delete(offset(1), offset(3));
    expect(buffer.snapshot().text()).toBe("ab");
  });

  test("pointToOffset with CJK characters", () => {
    // "你好\n世界" — each CJK char is 1 UTF-16 code unit
    const buffer = createBuffer(createBufferId(), "你好\n世界");
    const snap = buffer.snapshot();
    // Row 0: "你好" (length 2), newline at offset 2
    // Row 1: "世界" starts at offset 3
    expectOffset(snap.pointToOffset(point(0, 0)), 0);
    expectOffset(snap.pointToOffset(point(0, 2)), 2);
    expectOffset(snap.pointToOffset(point(1, 0)), 3);
    expectOffset(snap.pointToOffset(point(1, 2)), 5);
  });

  test("offsetToPoint with CJK characters", () => {
    const buffer = createBuffer(createBufferId(), "你好\n世界");
    const snap = buffer.snapshot();

    expectPoint(snap.offsetToPoint(offset(0)), 0, 0); // start of "你好"
    expectPoint(snap.offsetToPoint(offset(2)), 0, 2); // end of "你好"
    expectPoint(snap.offsetToPoint(offset(3)), 1, 0); // start of "世界"
    expectPoint(snap.offsetToPoint(offset(5)), 1, 2); // end of "世界"
  });

  test("line length with mixed ASCII and multibyte", () => {
    // "Hello 世界!" — "Hello " (6) + "世界" (2) + "!" (1) = 9 UTF-16 code units
    const buffer = createBuffer(createBufferId(), "Hello 世界!");
    const snap = buffer.snapshot();
    expect(snap.line(row(0)).length).toBe(9);
  });

  test("insert and delete around emoji preserves surrounding text", () => {
    const buffer = createBuffer(createBufferId(), "a🎉b🎊c");
    // "a🎉b🎊c" in UTF-16: a(1) + 🎉(2) + b(1) + 🎊(2) + c(1) = 7
    expect(buffer.snapshot().textSummary.chars).toBe(7);

    // Delete 🎉 (offset 1..3)
    buffer.delete(offset(1), offset(3));
    expect(buffer.snapshot().text()).toBe("ab🎊c");

    // Insert 🌍 before b (offset 1)
    buffer.insert(offset(1), "🌍");
    expect(buffer.snapshot().text()).toBe("a🌍b🎊c");
  });
});


describe("editsSince version tracking", () => {
  test("editsSince returns empty for current version", () => {
    const buffer = createBuffer(createBufferId(), "hello");
    const edits = buffer.editsSince(buffer.version);
    expect(edits.length).toBe(0);
  });

  test("editsSince returns edits after a prior version", () => {
    const buffer = createBuffer(createBufferId(), "hello");
    const v0 = buffer.version;

    buffer.insert(offset(5), " world");
    const edits = buffer.editsSince(v0);
    expect(edits.length).toBe(1);
    expect(num(edits[0].offset)).toBe(5);
    expect(edits[0].deletedLength).toBe(0);
    expect(edits[0].insertedLength).toBe(6);
  });

  test("multiple edits tracked in order", () => {
    const buffer = createBuffer(createBufferId(), "abc");
    const v0 = buffer.version;

    buffer.insert(offset(3), "d");       // edit 0: insert at 3
    buffer.insert(offset(0), "z");       // edit 1: insert at 0
    buffer.delete(offset(2), offset(3)); // edit 2: delete at 2

    const edits = buffer.editsSince(v0);
    expect(edits.length).toBe(3);

    // First edit: insert "d" at offset 3
    expect(num(edits[0].offset)).toBe(3);
    expect(edits[0].insertedLength).toBe(1);
    expect(edits[0].deletedLength).toBe(0);

    // Second edit: insert "z" at offset 0
    expect(num(edits[1].offset)).toBe(0);
    expect(edits[1].insertedLength).toBe(1);
    expect(edits[1].deletedLength).toBe(0);

    // Third edit: delete 1 char at offset 2
    expect(num(edits[2].offset)).toBe(2);
    expect(edits[2].deletedLength).toBe(1);
    expect(edits[2].insertedLength).toBe(0);
  });

  test("version increments on each edit", () => {
    const buffer = createBuffer(createBufferId(), "abc");
    expect(buffer.version).toBe(0);

    buffer.insert(offset(0), "x");
    expect(buffer.version).toBe(1);

    buffer.delete(offset(0), offset(1));
    expect(buffer.version).toBe(2);

    buffer.replace(offset(0), offset(1), "y");
    expect(buffer.version).toBe(3);
  });

  test("editsSince with intermediate version returns only later edits", () => {
    const buffer = createBuffer(createBufferId(), "abc");

    buffer.insert(offset(3), "d");  // version 0 → 1
    const v1 = buffer.version;

    buffer.insert(offset(4), "e");  // version 1 → 2
    buffer.insert(offset(5), "f");  // version 2 → 3

    const editsSinceV1 = buffer.editsSince(v1);
    expect(editsSinceV1.length).toBe(2);
    expect(num(editsSinceV1[0].offset)).toBe(4);
    expect(num(editsSinceV1[1].offset)).toBe(5);
  });

  test("snapshot version matches buffer version at time of snapshot", () => {
    const buffer = createBuffer(createBufferId(), "abc");
    const snap0 = buffer.snapshot();
    expect(snap0.version).toBe(0);

    buffer.insert(offset(0), "x");
    const snap1 = buffer.snapshot();
    expect(snap1.version).toBe(1);

    // Original snapshot still has version 0
    expect(snap0.version).toBe(0);
  });
});
