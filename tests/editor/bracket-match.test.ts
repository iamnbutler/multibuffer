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
import { type BracketMatch, findMatchingBracket } from "../../src/editor/bracket-match.ts";
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

// ─── bracketMatch event ─────────────────────────────────────────────────────

describe("bracketMatch event", () => {
  test("does NOT fire when bracketMatching is disabled", () => {
    const editor = makeEditor("(hello)", false);
    // Move cursor away from bracket first so the subsequent move is a real change
    editor.setCursor(mbPoint(0, 3));
    let eventCount = 0;
    editor.on("bracketMatch", () => { eventCount++; });
    // Now move to '(' — this is a genuine cursor change, but the guard should prevent firing
    editor.setCursor(mbPoint(0, 0));
    expect(eventCount).toBe(0);
  });

  test("fires when cursor moves to bracket (bracketMatching enabled)", () => {
    const editor = makeEditor("a(bc)d", true);
    let match: BracketMatch | null | undefined;
    let eventCount = 0;
    editor.on("bracketMatch", (m) => {
      match = m;
      eventCount++;
    });
    // Move cursor to '(' at column 1
    editor.setCursor(mbPoint(0, 1));
    expect(eventCount).toBe(1);
    expect(match).not.toBeNull();
    expect(match?.open).toEqual(mbPoint(0, 1));
    expect(match?.close).toEqual(mbPoint(0, 4));
  });

  test("fires with null when cursor moves away from bracket", () => {
    const editor = makeEditor("(hello)", true);
    let match: BracketMatch | null | undefined;
    let eventCount = 0;
    editor.on("bracketMatch", (m) => {
      match = m;
      eventCount++;
    });
    // Cursor starts at '(' (col 0), move to 'h' (col 1)
    editor.setCursor(mbPoint(0, 1));
    expect(eventCount).toBe(1);
    expect(match).toBeNull();
  });

  test("fires on cursor movement via dispatch", () => {
    const editor = makeEditor("(ab)", true);
    let match: BracketMatch | null | undefined;
    let eventCount = 0;
    editor.on("bracketMatch", (m) => {
      match = m;
      eventCount++;
    });
    // dispatch moveCursor to move right (from col 0 to col 1)
    editor.dispatch({ type: "moveCursor", direction: "right", granularity: "character" });
    expect(eventCount).toBe(1);
    // Cursor now at 'a' (col 1), not a bracket
    expect(match).toBeNull();
  });

  test("fires on text change that affects bracket at cursor", () => {
    const editor = makeEditor("(ab)", true);
    let match: BracketMatch | null | undefined;
    let eventCount = 0;
    // Start at '(' which matches ')'. Insert 'x' -> "x(ab)" with cursor at col 1 (on '(')
    editor.on("bracketMatch", (m) => {
      match = m;
      eventCount++;
    });
    // Insert text, cursor advances to col 1 which lands on '('
    editor.dispatch({ type: "insertText", text: "x" });
    expect(eventCount).toBe(1);
    // Cursor is now at col 1 (after 'x'), which is on '(' in "x(ab)"
    expect(match).not.toBeNull();
    expect(match?.open).toEqual(mbPoint(0, 1));
    expect(match?.close).toEqual(mbPoint(0, 4));
  });

  test("fires with null when bracket at cursor is deleted", () => {
    const editor = makeEditor("(ab)", true);
    let match: BracketMatch | null | undefined = { open: mbPoint(0, 0), close: mbPoint(0, 0) };
    let eventCount = 0;
    editor.on("bracketMatch", (m) => {
      match = m;
      eventCount++;
    });
    // Delete the '(' at cursor position
    editor.dispatch({ type: "deleteForward", granularity: "character" });
    expect(eventCount).toBe(1);
    // Text is now "ab)", cursor at col 0 which is 'a', not a bracket
    expect(match).toBeNull();
  });

  test("fires on extendSelectionTo", () => {
    const editor = makeEditor("(hello)", true);
    let match: BracketMatch | null | undefined;
    editor.setCursor(mbPoint(0, 3)); // in the middle
    editor.on("bracketMatch", (m) => { match = m; });
    editor.extendSelectionTo(mbPoint(0, 6)); // extend to ')'
    expect(match).not.toBeNull();
    expect(match?.close).toEqual(mbPoint(0, 6));
  });

  test("fires on selectWordAt", () => {
    const editor = makeEditor("foo(bar)baz", true);
    let eventCount = 0;
    editor.on("bracketMatch", () => { eventCount++; });
    // Select word 'bar' - cursor ends at col 7
    editor.selectWordAt(mbPoint(0, 5));
    expect(eventCount).toBe(1);
  });

  test("fires on selectLineAt", () => {
    const editor = makeEditor("(hello)", true);
    let eventCount = 0;
    let match: BracketMatch | null | undefined;
    editor.on("bracketMatch", (m) => {
      match = m;
      eventCount++;
    });
    // Select entire line - cursor ends at col 7 (end of line)
    editor.selectLineAt(mbPoint(0, 0));
    expect(eventCount).toBe(1);
    // Cursor is at end of line (col 7), not on a bracket
    expect(match).toBeNull();
  });

  test("can unsubscribe from bracketMatch event", () => {
    const editor = makeEditor("(hello)", true);
    let eventCount = 0;
    const cb = () => { eventCount++; };
    editor.on("bracketMatch", cb);
    editor.setCursor(mbPoint(0, 1));
    expect(eventCount).toBe(1);

    editor.off("bracketMatch", cb);
    editor.setCursor(mbPoint(0, 0));
    expect(eventCount).toBe(1); // still 1, not incremented after off
  });

  test("multiple listeners receive the same event", () => {
    const editor = makeEditor("(hello)", true);
    let count1 = 0;
    let count2 = 0;
    editor.on("bracketMatch", () => { count1++; });
    editor.on("bracketMatch", () => { count2++; });
    editor.setCursor(mbPoint(0, 6));
    expect(count1).toBe(1);
    expect(count2).toBe(1);
  });
});
