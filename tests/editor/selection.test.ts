/**
 * Selection management tests.
 */

import { beforeEach, describe, expect, test } from "bun:test";
import {
  collapseSelection,
  extendSelection,
  isCollapsed,
  selectAll,
  selectionAtPoint,
} from "../../src/editor/selection.ts";
import { createBuffer } from "../../src/multibuffer/buffer.ts";
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
