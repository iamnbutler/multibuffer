/**
 * Selection management tests.
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { createBuffer } from "../../src/buffer/buffer.ts";
import {
  collapseSelection,
  extendSelection,
  isCollapsed,
  selectAll,
  selectionAtPoint,
} from "../../src/editor/selection.ts";
import { createMultiBuffer } from "../../src/multibuffer/multibuffer.ts";
import {
  createBufferId,
  excerptRange,
  expectPoint,
  mbPoint,
  resetCounters,
} from "../helpers.ts";

function setup(text: string) {
  const buf = createBuffer(createBufferId(), text);
  const mb = createMultiBuffer();
  mb.addExcerpt(buf, excerptRange(0, text.split("\n").length));
  return mb;
}

beforeEach(() => {
  resetCounters();
});

describe("Selection - Create", () => {
  test("create collapsed selection at point", () => {
    const mb = setup("Hello World");
    const sel = selectionAtPoint(mb, mbPoint(0, 5));
    expect(sel).toBeDefined();
    if (!sel) return;

    const snap = mb.snapshot();
    expect(isCollapsed(snap, sel)).toBe(true);

    const start = snap.resolveAnchor(sel.range.start);
    expect(start).toBeDefined();
    if (start) expectPoint(start, 0, 5);
  });
});

describe("Selection - Extend", () => {
  test("extend right creates selection", () => {
    const mb = setup("Hello World");
    const sel = selectionAtPoint(mb, mbPoint(0, 5));
    if (!sel) return;

    const snap = mb.snapshot();
    const extended = extendSelection(snap, mb, sel, "right", "character");
    expect(extended).toBeDefined();
    if (!extended) return;

    expect(isCollapsed(snap, extended)).toBe(false);
    const start = snap.resolveAnchor(extended.range.start);
    const end = snap.resolveAnchor(extended.range.end);
    if (start) expectPoint(start, 0, 5);
    if (end) expectPoint(end, 0, 6);
    expect(extended.head).toBe("end");
  });

  test("extend left from selection moves head back", () => {
    const mb = setup("Hello World");
    const sel = selectionAtPoint(mb, mbPoint(0, 5));
    if (!sel) return;

    const snap = mb.snapshot();
    const extended = extendSelection(snap, mb, sel, "left", "character");
    expect(extended).toBeDefined();
    if (!extended) return;

    const start = snap.resolveAnchor(extended.range.start);
    const end = snap.resolveAnchor(extended.range.end);
    if (start) expectPoint(start, 0, 4);
    if (end) expectPoint(end, 0, 5);
    expect(extended.head).toBe("start");
  });

  test("head flips to start when extending past anchor leftward", () => {
    // Extend right from col 4 twice to build (4,6), head="end".
    // Then reverse and extend left past the anchor (col 4) → head must flip to "start".
    const mb = setup("ABCDEFGH");
    const snap = mb.snapshot();

    const sel0 = selectionAtPoint(mb, mbPoint(0, 4));
    if (!sel0) return;
    // Extend right twice: range (4,5), then (4,6), head="end"
    const sel1 = extendSelection(snap, mb, sel0, "right", "character");
    if (!sel1) return;
    const sel2 = extendSelection(snap, mb, sel1, "right", "character");
    if (!sel2) return;
    expect(sel2.head).toBe("end");

    // Extend left three times: (4,5) → (4,4) → collapsed at (4,4) with head="start" → (3,4)
    const sel3 = extendSelection(snap, mb, sel2, "left", "character");
    if (!sel3) return;
    const sel4 = extendSelection(snap, mb, sel3, "left", "character");
    if (!sel4) return;
    const sel5 = extendSelection(snap, mb, sel4, "left", "character");
    if (!sel5) return;

    // Head has crossed the anchor at col 4 and is now at col 3 → head="start"
    expect(sel5.head).toBe("start");
    const start = snap.resolveAnchor(sel5.range.start);
    const end = snap.resolveAnchor(sel5.range.end);
    if (start) expectPoint(start, 0, 3);
    if (end) expectPoint(end, 0, 4);
  });

  test("head flips to end when extending past anchor rightward", () => {
    // Extend left from col 5 to get head="start" at col 4, anchor="end" at col 5.
    // Then reverse and extend right past col 5 → head must flip to "end".
    const mb = setup("ABCDEFGH");
    const snap = mb.snapshot();

    const sel0 = selectionAtPoint(mb, mbPoint(0, 5));
    if (!sel0) return;
    // Extend left: range (4,5), head="start"
    const sel1 = extendSelection(snap, mb, sel0, "left", "character");
    if (!sel1) return;
    expect(sel1.head).toBe("start");

    // Extend right twice: (4,5) → collapsed at (5,5) → (5,6)
    const sel2 = extendSelection(snap, mb, sel1, "right", "character");
    if (!sel2) return;
    const sel3 = extendSelection(snap, mb, sel2, "right", "character");
    if (!sel3) return;

    // Head has crossed the anchor at col 5 and is now at col 6 → head="end"
    expect(sel3.head).toBe("end");
    const start = snap.resolveAnchor(sel3.range.start);
    const end = snap.resolveAnchor(sel3.range.end);
    if (start) expectPoint(start, 0, 5);
    if (end) expectPoint(end, 0, 6);
  });

  test("extend down selects across lines", () => {
    const mb = setup("AAA\nBBB\nCCC");
    const sel = selectionAtPoint(mb, mbPoint(0, 1));
    if (!sel) return;

    const snap = mb.snapshot();
    const extended = extendSelection(snap, mb, sel, "down", "character");
    expect(extended).toBeDefined();
    if (!extended) return;

    const start = snap.resolveAnchor(extended.range.start);
    const end = snap.resolveAnchor(extended.range.end);
    if (start) expectPoint(start, 0, 1);
    if (end) expectPoint(end, 1, 1);
  });
});

describe("Selection - Collapse", () => {
  test("collapse to start", () => {
    const mb = setup("Hello World");
    const sel = selectionAtPoint(mb, mbPoint(0, 3));
    if (!sel) return;

    const snap = mb.snapshot();
    const extended = extendSelection(snap, mb, sel, "right", "character");
    if (!extended) return;
    const extended2 = extendSelection(snap, mb, extended, "right", "character");
    if (!extended2) return;

    const collapsed = collapseSelection(snap, mb, extended2, "start");
    expect(collapsed).toBeDefined();
    if (!collapsed) return;
    expect(isCollapsed(snap, collapsed)).toBe(true);

    const pos = snap.resolveAnchor(collapsed.range.start);
    if (pos) expectPoint(pos, 0, 3);
  });

  test("collapse to end", () => {
    const mb = setup("Hello World");
    const sel = selectionAtPoint(mb, mbPoint(0, 3));
    if (!sel) return;

    const snap = mb.snapshot();
    const extended = extendSelection(snap, mb, sel, "right", "character");
    if (!extended) return;
    const extended2 = extendSelection(snap, mb, extended, "right", "character");
    if (!extended2) return;

    const collapsed = collapseSelection(snap, mb, extended2, "end");
    expect(collapsed).toBeDefined();
    if (!collapsed) return;

    const pos = snap.resolveAnchor(collapsed.range.start);
    if (pos) expectPoint(pos, 0, 5);
  });
});

describe("Selection - Select All", () => {
  test("select all content", () => {
    const mb = setup("AAA\nBBB\nCCC");
    const snap = mb.snapshot();
    const sel = selectAll(snap, mb);
    expect(sel).toBeDefined();
    if (!sel) return;

    const start = snap.resolveAnchor(sel.range.start);
    const end = snap.resolveAnchor(sel.range.end);
    if (start) expectPoint(start, 0, 0);
    if (end) expectPoint(end, 2, 3);
  });
});
