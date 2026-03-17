/**
 * Tests for MultiBuffer excerpt observer API (on/off).
 * Written BEFORE implementation (TDD).
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { createBuffer } from "../../src/buffer/buffer.ts";
import { createMultiBuffer } from "../../src/multibuffer/multibuffer.ts";
import type { ExcerptId, ExcerptInfo } from "../../src/multibuffer/types.ts";
import {
  createBufferId,
  excerptRange,
  generateText,
  resetCounters,
} from "../helpers.ts";

beforeEach(() => {
  resetCounters();
});

describe("MultiBuffer observer: excerptAdded", () => {
  test("fires when addExcerpt is called", () => {
    const mb = createMultiBuffer();
    const buffer = createBuffer(createBufferId(), generateText(5));
    const events: ExcerptInfo[] = [];
    mb.on("excerptAdded", (info) => events.push(info));

    const id = mb.addExcerpt(buffer, excerptRange(0, 5));

    expect(events).toHaveLength(1);
    expect(events[0]?.id).toBe(id);
  });

  test("excerptAdded payload matches the new excerpt's public info", () => {
    const mb = createMultiBuffer();
    const buffer = createBuffer(createBufferId(), generateText(10));
    let received: ExcerptInfo | undefined;
    mb.on("excerptAdded", (info) => {
      received = info;
    });

    const id = mb.addExcerpt(buffer, excerptRange(0, 10));

    expect(received).toBeDefined();
    expect(received?.id).toBe(id);
    expect(received && (received.endRow - received.startRow)).toBe(10);
  });

  test("fires once per addExcerpt call", () => {
    const mb = createMultiBuffer();
    const buffer = createBuffer(createBufferId(), generateText(5));
    let count = 0;
    mb.on("excerptAdded", () => {
      count++;
    });

    mb.addExcerpt(buffer, excerptRange(0, 2));
    mb.addExcerpt(buffer, excerptRange(2, 5));

    expect(count).toBe(2);
  });

  test("fires for each excerpt in setExcerpts (and removed for prior ones)", () => {
    const mb = createMultiBuffer();
    const buf1 = createBuffer(createBufferId(), generateText(5));
    const buf2 = createBuffer(createBufferId(), generateText(5));

    // Add an initial excerpt that will be replaced
    mb.addExcerpt(buf1, excerptRange(0, 3));

    const addedIds: ExcerptId[] = [];
    const removedIds: ExcerptId[] = [];
    mb.on("excerptAdded", (info) => addedIds.push(info.id));
    mb.on("excerptRemoved", (id) => removedIds.push(id));

    const newIds = mb.setExcerpts([
      { buffer: buf1, range: excerptRange(0, 3) },
      { buffer: buf2, range: excerptRange(0, 5) },
    ]);

    expect(addedIds).toHaveLength(2);
    expect(removedIds).toHaveLength(1);
    expect(newIds.every((id) => addedIds.includes(id))).toBe(true);
  });

  test("fires for each excerpt in setExcerptsForBuffer (and removed for old ones)", () => {
    const mb = createMultiBuffer();
    const buffer = createBuffer(createBufferId(), generateText(10));

    const initialId = mb.addExcerpt(buffer, excerptRange(0, 5));

    const addedIds: ExcerptId[] = [];
    const removedIds: ExcerptId[] = [];
    mb.on("excerptAdded", (info) => addedIds.push(info.id));
    mb.on("excerptRemoved", (id) => removedIds.push(id));

    const newIds = mb.setExcerptsForBuffer(buffer, [excerptRange(0, 3), excerptRange(5, 10)]);

    expect(removedIds).toHaveLength(1);
    expect(removedIds[0]).toBe(initialId);
    expect(addedIds).toHaveLength(2);
    expect(newIds.every((id) => addedIds.includes(id))).toBe(true);
  });

  test("multiple listeners all receive the event", () => {
    const mb = createMultiBuffer();
    const buffer = createBuffer(createBufferId(), generateText(5));
    const calls1: ExcerptInfo[] = [];
    const calls2: ExcerptInfo[] = [];
    mb.on("excerptAdded", (info) => calls1.push(info));
    mb.on("excerptAdded", (info) => calls2.push(info));

    mb.addExcerpt(buffer, excerptRange(0, 5));

    expect(calls1).toHaveLength(1);
    expect(calls2).toHaveLength(1);
  });
});

describe("MultiBuffer observer: excerptRemoved", () => {
  test("fires when removeExcerpt is called", () => {
    const mb = createMultiBuffer();
    const buffer = createBuffer(createBufferId(), generateText(5));
    const id = mb.addExcerpt(buffer, excerptRange(0, 5));

    const events: ExcerptId[] = [];
    mb.on("excerptRemoved", (removedId) => events.push(removedId));
    mb.removeExcerpt(id);

    expect(events).toHaveLength(1);
    expect(events[0]).toBe(id);
  });

  test("fires for each excerpt when clearExcerpts is called", () => {
    const mb = createMultiBuffer();
    const buffer = createBuffer(createBufferId(), generateText(10));
    const id1 = mb.addExcerpt(buffer, excerptRange(0, 3));
    const id2 = mb.addExcerpt(buffer, excerptRange(5, 10));

    const removedIds: ExcerptId[] = [];
    mb.on("excerptRemoved", (id) => removedIds.push(id));
    mb.clearExcerpts();

    expect(removedIds).toHaveLength(2);
    expect(removedIds).toContain(id1);
    expect(removedIds).toContain(id2);
  });

  test("does not fire when removeExcerpt is called with unknown id", () => {
    const mb = createMultiBuffer();
    const buffer = createBuffer(createBufferId(), generateText(5));
    mb.addExcerpt(buffer, excerptRange(0, 5));

    // Grab a fresh but unused id by adding then removing one
    const tempBuf = createBuffer(createBufferId(), generateText(1));
    const tempId = mb.addExcerpt(tempBuf, excerptRange(0, 1));
    mb.removeExcerpt(tempId);

    // Now register listener and try to remove tempId again (stale)
    const events: ExcerptId[] = [];
    mb.on("excerptRemoved", (id) => events.push(id));
    mb.removeExcerpt(tempId);

    expect(events).toHaveLength(0);
  });
});

describe("MultiBuffer observer: off", () => {
  test("off removes a specific listener", () => {
    const mb = createMultiBuffer();
    const buffer = createBuffer(createBufferId(), generateText(5));
    let count = 0;
    const cb = () => {
      count++;
    };

    mb.on("excerptAdded", cb);
    mb.addExcerpt(buffer, excerptRange(0, 2));
    expect(count).toBe(1);

    mb.off("excerptAdded", cb);
    mb.addExcerpt(buffer, excerptRange(2, 5));
    expect(count).toBe(1); // no new calls after off
  });

  test("off is a no-op for unregistered callback", () => {
    const mb = createMultiBuffer();
    const buffer = createBuffer(createBufferId(), generateText(5));
    const cb = () => {};

    // Should not throw
    expect(() => mb.off("excerptAdded", cb)).not.toThrow();

    mb.on("excerptAdded", cb);
    mb.addExcerpt(buffer, excerptRange(0, 5));
    // Still works even if we call off with a different cb
    mb.off("excerptAdded", () => {});
  });

  test("off only removes the specified listener, others remain", () => {
    const mb = createMultiBuffer();
    const buffer = createBuffer(createBufferId(), generateText(5));
    let count1 = 0;
    let count2 = 0;
    const cb1 = () => {
      count1++;
    };
    const cb2 = () => {
      count2++;
    };

    mb.on("excerptAdded", cb1);
    mb.on("excerptAdded", cb2);

    mb.off("excerptAdded", cb1);
    mb.addExcerpt(buffer, excerptRange(0, 5));

    expect(count1).toBe(0);
    expect(count2).toBe(1);
  });
});

describe("MultiBuffer observer: event isolation", () => {
  test("excerptAdded does not fire for non-mutating operations", () => {
    const mb = createMultiBuffer();
    const buffer = createBuffer(createBufferId(), generateText(5));
    mb.addExcerpt(buffer, excerptRange(0, 5));

    let count = 0;
    mb.on("excerptAdded", () => {
      count++;
    });

    // These should not fire excerptAdded
    mb.snapshot();
    mb.lineCount;
    mb.excerpts;

    expect(count).toBe(0);
  });

  test("excerptRemoved does not fire when no excerpts exist", () => {
    const mb = createMultiBuffer();
    let count = 0;
    mb.on("excerptRemoved", () => {
      count++;
    });

    mb.clearExcerpts(); // no-op on empty

    expect(count).toBe(0);
  });
});
