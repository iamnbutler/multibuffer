/**
 * Tests for MultiBuffer excerpt observer/event API.
 *
 * Covers on/off lifecycle and excerpt events:
 *   excerptAdded, excerptRemoved
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { createBuffer } from "../../src/buffer/buffer.ts";
import { createMultiBuffer } from "../../src/multibuffer/multibuffer.ts";
import type {
  ExcerptId,
  ExcerptInfo,
  MultiBuffer,
} from "../../src/multibuffer/types.ts";
import { createBufferId, excerptRange, resetCounters } from "../helpers.ts";

function setup(): { mb: MultiBuffer } {
  const mb = createMultiBuffer();
  return { mb };
}

function setupWithExcerpt(text: string = "Hello\nWorld"): {
  mb: MultiBuffer;
  excerptId: ExcerptId;
} {
  const buf = createBuffer(createBufferId(), text);
  const mb = createMultiBuffer();
  const excerptId = mb.addExcerpt(buf, excerptRange(0, text.split("\n").length));
  return { mb, excerptId };
}

beforeEach(() => {
  resetCounters();
});

// ─── on / off lifecycle ──────────────────────────────────────────

describe("MultiBuffer events - on/off lifecycle", () => {
  test("on registers a listener that receives events", () => {
    const { mb } = setup();
    let fired = false;
    mb.on("excerptAdded", () => {
      fired = true;
    });
    const buf = createBuffer(createBufferId(), "test");
    mb.addExcerpt(buf, excerptRange(0, 1));
    expect(fired).toBe(true);
  });

  test("off removes a registered listener", () => {
    const { mb } = setup();
    let count = 0;
    const cb = () => {
      count++;
    };
    mb.on("excerptAdded", cb);
    const buf = createBuffer(createBufferId(), "test");
    mb.addExcerpt(buf, excerptRange(0, 1));
    expect(count).toBe(1);

    mb.off("excerptAdded", cb);
    mb.addExcerpt(buf, excerptRange(0, 1));
    expect(count).toBe(1); // not incremented after off
  });

  test("off with unknown callback is a no-op", () => {
    const { mb } = setup();
    // Should not throw
    mb.off("excerptAdded", () => {});
  });

  test("multiple listeners on same event all fire", () => {
    const { mb } = setup();
    let a = 0;
    let b = 0;
    mb.on("excerptAdded", () => {
      a++;
    });
    mb.on("excerptAdded", () => {
      b++;
    });
    const buf = createBuffer(createBufferId(), "test");
    mb.addExcerpt(buf, excerptRange(0, 1));
    expect(a).toBe(1);
    expect(b).toBe(1);
  });

  test("same callback registered twice fires once (Set semantics)", () => {
    const { mb } = setup();
    let count = 0;
    const cb = () => {
      count++;
    };
    mb.on("excerptAdded", cb);
    mb.on("excerptAdded", cb);
    const buf = createBuffer(createBufferId(), "test");
    mb.addExcerpt(buf, excerptRange(0, 1));
    expect(count).toBe(1);
  });
});

// ─── excerptAdded ─────────────────────────────────────────────────

describe("MultiBuffer events - excerptAdded", () => {
  test("fires on addExcerpt with excerpt info", () => {
    const { mb } = setup();
    let receivedInfo: ExcerptInfo | undefined;
    mb.on("excerptAdded", (info) => {
      receivedInfo = info;
    });
    const buf = createBuffer(createBufferId(), "Hello\nWorld");
    const id = mb.addExcerpt(buf, excerptRange(0, 2));
    expect(receivedInfo).toBeDefined();
    expect(receivedInfo?.id.index).toBe(id.index);
    expect(receivedInfo?.id.generation).toBe(id.generation);
  });

  test("fires for each excerpt in addExcerpts batch", () => {
    const { mb } = setup();
    const received: ExcerptInfo[] = [];
    mb.on("excerptAdded", (info) => {
      received.push(info);
    });
    const buf1 = createBuffer(createBufferId(), "Line1");
    const buf2 = createBuffer(createBufferId(), "Line2");
    const ids = mb.addExcerpts([
      { buffer: buf1, range: excerptRange(0, 1) },
      { buffer: buf2, range: excerptRange(0, 1) },
    ]);
    expect(received.length).toBe(2);
    expect(received[0]?.id.index).toBe(ids[0]?.index);
    expect(received[1]?.id.index).toBe(ids[1]?.index);
  });

  test("fires for each new excerpt in setExcerpts", () => {
    const { mb } = setupWithExcerpt();
    const addedInfos: ExcerptInfo[] = [];
    mb.on("excerptAdded", (info) => {
      addedInfos.push(info);
    });
    const buf = createBuffer(createBufferId(), "New content");
    mb.setExcerpts([
      { buffer: buf, range: excerptRange(0, 1) },
      { buffer: buf, range: excerptRange(0, 1) },
    ]);
    expect(addedInfos.length).toBe(2);
  });

  test("fires for each new excerpt in setExcerptsForBuffer", () => {
    const buf = createBuffer(createBufferId(), "Line1\nLine2\nLine3");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 1));

    const addedInfos: ExcerptInfo[] = [];
    mb.on("excerptAdded", (info) => {
      addedInfos.push(info);
    });

    mb.setExcerptsForBuffer(buf, [excerptRange(0, 1), excerptRange(1, 2)]);
    expect(addedInfos.length).toBe(2);
  });
});

// ─── excerptRemoved ───────────────────────────────────────────────

describe("MultiBuffer events - excerptRemoved", () => {
  test("fires on removeExcerpt with excerpt id", () => {
    const { mb, excerptId } = setupWithExcerpt();
    let receivedId: ExcerptId | undefined;
    mb.on("excerptRemoved", (id) => {
      receivedId = id;
    });
    mb.removeExcerpt(excerptId);
    expect(receivedId).toBeDefined();
    expect(receivedId?.index).toBe(excerptId.index);
    expect(receivedId?.generation).toBe(excerptId.generation);
  });

  test("fires for each excerpt in clearExcerpts", () => {
    const buf = createBuffer(createBufferId(), "Hello");
    const mb = createMultiBuffer();
    const id1 = mb.addExcerpt(buf, excerptRange(0, 1));
    const id2 = mb.addExcerpt(buf, excerptRange(0, 1));

    const removedIds: ExcerptId[] = [];
    mb.on("excerptRemoved", (id) => {
      removedIds.push(id);
    });

    mb.clearExcerpts();
    expect(removedIds.length).toBe(2);
    expect(removedIds.some((id) => id.index === id1.index)).toBe(true);
    expect(removedIds.some((id) => id.index === id2.index)).toBe(true);
  });

  test("fires for each removed excerpt in setExcerpts", () => {
    const buf = createBuffer(createBufferId(), "Hello");
    const mb = createMultiBuffer();
    const id1 = mb.addExcerpt(buf, excerptRange(0, 1));
    const id2 = mb.addExcerpt(buf, excerptRange(0, 1));

    const removedIds: ExcerptId[] = [];
    mb.on("excerptRemoved", (id) => {
      removedIds.push(id);
    });

    const newBuf = createBuffer(createBufferId(), "New");
    mb.setExcerpts([{ buffer: newBuf, range: excerptRange(0, 1) }]);
    expect(removedIds.length).toBe(2);
    expect(removedIds.some((id) => id.index === id1.index)).toBe(true);
    expect(removedIds.some((id) => id.index === id2.index)).toBe(true);
  });

  test("fires for each removed excerpt in setExcerptsForBuffer", () => {
    const buf = createBuffer(createBufferId(), "Line1\nLine2\nLine3");
    const mb = createMultiBuffer();
    const id1 = mb.addExcerpt(buf, excerptRange(0, 1));
    const id2 = mb.addExcerpt(buf, excerptRange(1, 2));

    const removedIds: ExcerptId[] = [];
    mb.on("excerptRemoved", (id) => {
      removedIds.push(id);
    });

    mb.setExcerptsForBuffer(buf, [excerptRange(0, 3)]);
    expect(removedIds.length).toBe(2);
    expect(removedIds.some((id) => id.index === id1.index)).toBe(true);
    expect(removedIds.some((id) => id.index === id2.index)).toBe(true);
  });

  test("does NOT fire when removeExcerpt called with invalid id", () => {
    const { mb } = setupWithExcerpt();
    let fired = false;
    mb.on("excerptRemoved", () => {
      fired = true;
    });
    // biome-ignore lint/plugin/no-type-assertion: expect: creating invalid excerpt id for test
    const invalidId = { index: 999, generation: 0 } as unknown as ExcerptId;
    mb.removeExcerpt(invalidId);
    expect(fired).toBe(false);
  });
});

// ─── Event ordering ───────────────────────────────────────────────

describe("MultiBuffer events - ordering", () => {
  test("setExcerpts fires removed events before added events", () => {
    const { mb } = setupWithExcerpt();
    const order: string[] = [];
    mb.on("excerptRemoved", () => {
      order.push("removed");
    });
    mb.on("excerptAdded", () => {
      order.push("added");
    });

    const newBuf = createBuffer(createBufferId(), "New");
    mb.setExcerpts([{ buffer: newBuf, range: excerptRange(0, 1) }]);

    expect(order[0]).toBe("removed");
    expect(order[1]).toBe("added");
  });

  test("setExcerptsForBuffer fires removed events before added events", () => {
    const buf = createBuffer(createBufferId(), "Line1\nLine2");
    const mb = createMultiBuffer();
    mb.addExcerpt(buf, excerptRange(0, 1));

    const order: string[] = [];
    mb.on("excerptRemoved", () => {
      order.push("removed");
    });
    mb.on("excerptAdded", () => {
      order.push("added");
    });

    mb.setExcerptsForBuffer(buf, [excerptRange(0, 2)]);

    expect(order[0]).toBe("removed");
    expect(order[1]).toBe("added");
  });

  test("clearExcerpts does NOT fire added events", () => {
    const { mb } = setupWithExcerpt();
    let addedFired = false;
    mb.on("excerptAdded", () => {
      addedFired = true;
    });
    mb.clearExcerpts();
    expect(addedFired).toBe(false);
  });
});

// ─── Edge cases ───────────────────────────────────────────────────

describe("MultiBuffer events - edge cases", () => {
  test("removing one listener does not affect others on same event", () => {
    const { mb } = setup();
    let a = 0;
    let b = 0;
    const cbA = () => {
      a++;
    };
    const cbB = () => {
      b++;
    };
    mb.on("excerptAdded", cbA);
    mb.on("excerptAdded", cbB);
    mb.off("excerptAdded", cbA);

    const buf = createBuffer(createBufferId(), "test");
    mb.addExcerpt(buf, excerptRange(0, 1));
    expect(a).toBe(0);
    expect(b).toBe(1);
  });

  test("listener can access updated excerpts list during callback", () => {
    const { mb } = setup();
    let excerptCountDuringCallback = 0;
    mb.on("excerptAdded", () => {
      excerptCountDuringCallback = mb.excerpts.length;
    });

    const buf = createBuffer(createBufferId(), "test");
    mb.addExcerpt(buf, excerptRange(0, 1));
    expect(excerptCountDuringCallback).toBe(1);
  });

  test("multiple rapid mutations fire events correctly", () => {
    const { mb } = setup();
    const addedIds: ExcerptId[] = [];
    const removedIds: ExcerptId[] = [];

    mb.on("excerptAdded", (info) => {
      addedIds.push(info.id);
    });
    mb.on("excerptRemoved", (id) => {
      removedIds.push(id);
    });

    const buf = createBuffer(createBufferId(), "test");
    const id1 = mb.addExcerpt(buf, excerptRange(0, 1));
    mb.addExcerpt(buf, excerptRange(0, 1)); // id2
    mb.removeExcerpt(id1);
    mb.addExcerpt(buf, excerptRange(0, 1)); // id3

    expect(addedIds.length).toBe(3);
    expect(removedIds.length).toBe(1);
    expect(removedIds[0]?.index).toBe(id1.index);
  });
});
