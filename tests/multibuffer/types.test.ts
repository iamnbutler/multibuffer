/**
 * Type system tests - verify branded types work correctly.
 */

import { describe, test, expect, beforeEach } from "bun:test";
import {
  createBufferId,
  createExcerptId,
  row,
  mbRow,
  offset,
  point,
  range,
  resetCounters,
} from "../helpers.ts";

beforeEach(() => {
  resetCounters();
});

describe("Branded Types", () => {
  test("BufferId creates unique identifiers", () => {
    const id1 = createBufferId();
    const id2 = createBufferId();
    expect(id1).not.toBe(id2);
  });

  test("ExcerptId creates unique identifiers", () => {
    const id1 = createExcerptId();
    const id2 = createExcerptId();
    expect(id1).not.toBe(id2);
  });

  test("BufferRow preserves numeric value", () => {
    const r = row(42);
    expect(r as number).toBe(42);
  });

  test("MultiBufferRow preserves numeric value", () => {
    const r = mbRow(100);
    expect(r as number).toBe(100);
  });

  test("BufferOffset preserves numeric value", () => {
    const o = offset(256);
    expect(o as number).toBe(256);
  });
});

describe("Position Types", () => {
  test("point creates valid BufferPoint", () => {
    const p = point(10, 5);
    expect(p.row as number).toBe(10);
    expect(p.column).toBe(5);
  });

  test("range creates valid BufferRange", () => {
    const r = range(0, 0, 10, 20);
    expect(r.start.row as number).toBe(0);
    expect(r.start.column).toBe(0);
    expect(r.end.row as number).toBe(10);
    expect(r.end.column).toBe(20);
  });
});
