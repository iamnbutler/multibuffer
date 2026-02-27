/**
 * Cursor movement tests.
 */

import { beforeEach, describe, test } from "bun:test";
import { moveCursor } from "../../src/editor/cursor.ts";
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

describe("Cursor - Horizontal Movement", () => {
  test("move right within line", () => {
    const snap = setup("Hello").snapshot();
    expectPoint(moveCursor(snap, mbPoint(0, 0), "right", "character"), 0, 1);
  });

  test("move right at end of line wraps to next", () => {
    const snap = setup("AB\nCD").snapshot();
    expectPoint(moveCursor(snap, mbPoint(0, 2), "right", "character"), 1, 0);
  });

  test("move right at end of buffer stays put", () => {
    const snap = setup("AB").snapshot();
    expectPoint(moveCursor(snap, mbPoint(0, 2), "right", "character"), 0, 2);
  });

  test("move left within line", () => {
    const snap = setup("Hello").snapshot();
    expectPoint(moveCursor(snap, mbPoint(0, 3), "left", "character"), 0, 2);
  });

  test("move left at start of line wraps to prev", () => {
    const snap = setup("AB\nCD").snapshot();
    expectPoint(moveCursor(snap, mbPoint(1, 0), "left", "character"), 0, 2);
  });

  test("move left at start of buffer stays put", () => {
    const snap = setup("AB").snapshot();
    expectPoint(moveCursor(snap, mbPoint(0, 0), "left", "character"), 0, 0);
  });
});

describe("Cursor - Vertical Movement", () => {
  test("move down", () => {
    const snap = setup("AAA\nBBBB\nCC").snapshot();
    expectPoint(moveCursor(snap, mbPoint(0, 2), "down", "character"), 1, 2);
  });

  test("move down clamps to shorter line", () => {
    const snap = setup("AAAA\nBB").snapshot();
    expectPoint(moveCursor(snap, mbPoint(0, 4), "down", "character"), 1, 2);
  });

  test("move down at last line stays put", () => {
    const snap = setup("AB\nCD").snapshot();
    expectPoint(moveCursor(snap, mbPoint(1, 1), "down", "character"), 1, 1);
  });

  test("move up", () => {
    const snap = setup("AAA\nBBBB").snapshot();
    expectPoint(moveCursor(snap, mbPoint(1, 2), "up", "character"), 0, 2);
  });

  test("move up clamps to shorter line", () => {
    const snap = setup("BB\nAAAA").snapshot();
    expectPoint(moveCursor(snap, mbPoint(1, 4), "up", "character"), 0, 2);
  });

  test("move up at first line stays put", () => {
    const snap = setup("AB\nCD").snapshot();
    expectPoint(moveCursor(snap, mbPoint(0, 1), "up", "character"), 0, 1);
  });
});

describe("Cursor - Line Granularity", () => {
  test("move to line start", () => {
    const snap = setup("Hello World").snapshot();
    expectPoint(moveCursor(snap, mbPoint(0, 7), "left", "line"), 0, 0);
  });

  test("move to line end", () => {
    const snap = setup("Hello World").snapshot();
    expectPoint(moveCursor(snap, mbPoint(0, 3), "right", "line"), 0, 11);
  });
});

describe("Cursor - Buffer Granularity", () => {
  test("move to buffer start", () => {
    const snap = setup("AAA\nBBB\nCCC").snapshot();
    expectPoint(moveCursor(snap, mbPoint(2, 2), "left", "buffer"), 0, 0);
  });

  test("move to buffer end", () => {
    const snap = setup("AAA\nBBB\nCCC").snapshot();
    expectPoint(moveCursor(snap, mbPoint(0, 1), "right", "buffer"), 2, 3);
  });
});
