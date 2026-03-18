/**
 * Tests for bracket matching (findMatchingBracket and Editor.bracketMatch).
 *
 * Covers:
 * - All three bracket pair types: (), [], {}
 * - Forward scan (cursor on open bracket)
 * - Backward scan (cursor on close bracket)
 * - Nested brackets
 * - Multi-line brackets
 * - No bracket at cursor → null
 * - No matching partner (unbalanced) → null
 * - EditorOptions.bracketMatching gate
 */

import { describe, expect, test } from "bun:test";
import { createBuffer } from "../../src/buffer/buffer.ts";
import { findMatchingBracket } from "../../src/editor/bracket-match.ts";
import { Editor } from "../../src/editor/editor.ts";
import { createMultiBuffer } from "../../src/multibuffer/multibuffer.ts";
import type { MultiBufferSnapshot } from "../../src/multibuffer/types.ts";
import {
  createBufferId,
  excerptRange,
  mbPoint,
} from "../helpers.ts";

/** Build a snapshot from a single string of text. */
function makeSnapshot(text: string): MultiBufferSnapshot {
  const buf = createBuffer(createBufferId(), text);
  const mb = createMultiBuffer();
  mb.addExcerpt(buf, excerptRange(0, text.split("\n").length));
  return mb.snapshot();
}

/** Build an Editor from text with the given options. */
function makeEditor(text: string, bracketMatching = false): Editor {
  const buf = createBuffer(createBufferId(), text);
  const mb = createMultiBuffer();
  mb.addExcerpt(buf, excerptRange(0, text.split("\n").length));
  return new Editor(mb, { bracketMatching });
}

// ─── findMatchingBracket — parentheses ──────────────────────────────────────

describe("findMatchingBracket — ()", () => {
  test("cursor on ( returns matched pair", () => {
    const snap = makeSnapshot("(hello)");
    const match = findMatchingBracket(snap, mbPoint(0, 0));
    expect(match).not.toBeNull();
    expect(match?.open).toEqual(mbPoint(0, 0));
    expect(match?.close).toEqual(mbPoint(0, 6));
  });

  test("cursor on ) returns matched pair", () => {
    const snap = makeSnapshot("(hello)");
    const match = findMatchingBracket(snap, mbPoint(0, 6));
    expect(match).not.toBeNull();
    expect(match?.open).toEqual(mbPoint(0, 0));
    expect(match?.close).toEqual(mbPoint(0, 6));
  });

  test("nested () — inner open", () => {
    const snap = makeSnapshot("((ab))");
    const match = findMatchingBracket(snap, mbPoint(0, 1));
    expect(match?.open).toEqual(mbPoint(0, 1));
    expect(match?.close).toEqual(mbPoint(0, 4));
  });

  test("nested () — outer open", () => {
    const snap = makeSnapshot("((ab))");
    const match = findMatchingBracket(snap, mbPoint(0, 0));
    expect(match?.open).toEqual(mbPoint(0, 0));
    expect(match?.close).toEqual(mbPoint(0, 5));
  });
});

// ─── findMatchingBracket — square brackets ──────────────────────────────────

describe("findMatchingBracket — []", () => {
  test("cursor on [ returns matched pair", () => {
    const snap = makeSnapshot("[abc]");
    const match = findMatchingBracket(snap, mbPoint(0, 0));
    expect(match?.open).toEqual(mbPoint(0, 0));
    expect(match?.close).toEqual(mbPoint(0, 4));
  });

  test("cursor on ] returns matched pair", () => {
    const snap = makeSnapshot("[abc]");
    const match = findMatchingBracket(snap, mbPoint(0, 4));
    expect(match?.open).toEqual(mbPoint(0, 0));
    expect(match?.close).toEqual(mbPoint(0, 4));
  });
});

// ─── findMatchingBracket — curly braces ─────────────────────────────────────

describe("findMatchingBracket — {}", () => {
  test("cursor on { returns matched pair", () => {
    const snap = makeSnapshot("{ x: 1 }");
    const match = findMatchingBracket(snap, mbPoint(0, 0));
    expect(match?.open).toEqual(mbPoint(0, 0));
    expect(match?.close).toEqual(mbPoint(0, 7));
  });

  test("cursor on } returns matched pair", () => {
    const snap = makeSnapshot("{ x: 1 }");
    const match = findMatchingBracket(snap, mbPoint(0, 7));
    expect(match?.open).toEqual(mbPoint(0, 0));
    expect(match?.close).toEqual(mbPoint(0, 7));
  });
});

// ─── findMatchingBracket — multi-line ───────────────────────────────────────

describe("findMatchingBracket — multi-line", () => {
  test("open bracket on line 0, close on line 1", () => {
    const snap = makeSnapshot("(\n)");
    const match = findMatchingBracket(snap, mbPoint(0, 0));
    expect(match?.open).toEqual(mbPoint(0, 0));
    expect(match?.close).toEqual(mbPoint(1, 0));
  });

  test("close bracket on line 1, open on line 0", () => {
    const snap = makeSnapshot("(\n)");
    const match = findMatchingBracket(snap, mbPoint(1, 0));
    expect(match?.open).toEqual(mbPoint(0, 0));
    expect(match?.close).toEqual(mbPoint(1, 0));
  });

  test("nested brackets across multiple lines", () => {
    const text = "{\n  [\n    x\n  ]\n}";
    const snap = makeSnapshot(text);
    const outer = findMatchingBracket(snap, mbPoint(0, 0));
    expect(outer?.open).toEqual(mbPoint(0, 0));
    expect(outer?.close).toEqual(mbPoint(4, 0));

    const inner = findMatchingBracket(snap, mbPoint(1, 2));
    expect(inner?.open).toEqual(mbPoint(1, 2));
    expect(inner?.close).toEqual(mbPoint(3, 2));
  });
});

// ─── findMatchingBracket — edge cases ───────────────────────────────────────

describe("findMatchingBracket — edge cases", () => {
  test("non-bracket character → null", () => {
    const snap = makeSnapshot("hello");
    expect(findMatchingBracket(snap, mbPoint(0, 0))).toBeNull();
  });

  test("unbalanced open bracket → null", () => {
    const snap = makeSnapshot("(no close");
    expect(findMatchingBracket(snap, mbPoint(0, 0))).toBeNull();
  });

  test("unbalanced close bracket → null", () => {
    const snap = makeSnapshot("no open)");
    expect(findMatchingBracket(snap, mbPoint(0, 7))).toBeNull();
  });

  test("adjacent brackets match correctly", () => {
    // "()" — cursor at 0 should match 1
    const snap = makeSnapshot("()");
    const match = findMatchingBracket(snap, mbPoint(0, 0));
    expect(match?.open).toEqual(mbPoint(0, 0));
    expect(match?.close).toEqual(mbPoint(0, 1));
  });
});

// ─── Editor.bracketMatch ────────────────────────────────────────────────────

describe("Editor.bracketMatch", () => {
  test("returns null when bracketMatching is disabled (default)", () => {
    const editor = makeEditor("(hello)");
    // cursor starts at 0,0 which is `(`
    expect(editor.bracketMatch).toBeNull();
  });

  test("returns null when bracketMatching disabled even with bracket at cursor", () => {
    const editor = makeEditor("(hello)", false);
    expect(editor.bracketMatch).toBeNull();
  });

  test("returns bracket pair when bracketMatching is enabled", () => {
    const editor = makeEditor("(hello)", true);
    // cursor starts at 0,0 which is `(`
    const match = editor.bracketMatch;
    expect(match).not.toBeNull();
    expect(match?.open).toEqual(mbPoint(0, 0));
    expect(match?.close).toEqual(mbPoint(0, 6));
  });

  test("returns null when cursor is not on a bracket", () => {
    const editor = makeEditor("(hello)", true);
    editor.setCursor(mbPoint(0, 1)); // `h`
    expect(editor.bracketMatch).toBeNull();
  });

  test("bracketMatch updates as cursor moves", () => {
    const editor = makeEditor("(ab) [cd]", true);

    editor.setCursor(mbPoint(0, 0));
    const first = editor.bracketMatch;
    expect(first?.open).toEqual(mbPoint(0, 0));
    expect(first?.close).toEqual(mbPoint(0, 3));

    editor.setCursor(mbPoint(0, 5));
    const second = editor.bracketMatch;
    expect(second?.open).toEqual(mbPoint(0, 5));
    expect(second?.close).toEqual(mbPoint(0, 8));
  });
});
