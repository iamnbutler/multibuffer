/**
 * SlotMap tests - generational arena for O(1) insert/remove/lookup
 * with stale key detection.
 */

import { describe, test, expect } from "bun:test";
import { SlotMap, keysEqual, keysCompare } from "../../src/multibuffer/slot_map.ts";

describe("SlotMap - Insert & Get", () => {
  test("insert returns a key, get retrieves the value", () => {
    const map = new SlotMap<string>();
    const key = map.insert("hello");
    expect(map.get(key)).toBe("hello");
  });

  test("insert multiple values", () => {
    const map = new SlotMap<number>();
    const k1 = map.insert(10);
    const k2 = map.insert(20);
    const k3 = map.insert(30);

    expect(map.get(k1)).toBe(10);
    expect(map.get(k2)).toBe(20);
    expect(map.get(k3)).toBe(30);
  });

  test("size tracks live entries", () => {
    const map = new SlotMap<string>();
    expect(map.size).toBe(0);

    const k1 = map.insert("a");
    expect(map.size).toBe(1);

    map.insert("b");
    expect(map.size).toBe(2);

    map.remove(k1);
    expect(map.size).toBe(1);
  });

  test("get returns undefined for invalid key", () => {
    const map = new SlotMap<string>();
    expect(map.get({ index: 0, generation: 0 })).toBeUndefined();
    expect(map.get({ index: 999, generation: 0 })).toBeUndefined();
  });
});

describe("SlotMap - Remove", () => {
  test("remove returns the value", () => {
    const map = new SlotMap<string>();
    const key = map.insert("hello");
    const removed = map.remove(key);
    expect(removed).toBe("hello");
  });

  test("get returns undefined after remove", () => {
    const map = new SlotMap<string>();
    const key = map.insert("hello");
    map.remove(key);
    expect(map.get(key)).toBeUndefined();
  });

  test("remove returns undefined for stale key", () => {
    const map = new SlotMap<string>();
    const key = map.insert("hello");
    map.remove(key);
    expect(map.remove(key)).toBeUndefined();
  });

  test("remove returns undefined for invalid key", () => {
    const map = new SlotMap<string>();
    expect(map.remove({ index: 0, generation: 0 })).toBeUndefined();
  });
});

describe("SlotMap - Generational Stale Detection", () => {
  test("old key becomes stale after remove and reuse", () => {
    const map = new SlotMap<string>();

    const oldKey = map.insert("first");
    map.remove(oldKey);

    const newKey = map.insert("second");

    // Old key is stale - generation mismatch
    expect(map.get(oldKey)).toBeUndefined();
    expect(map.has(oldKey)).toBe(false);

    // New key works
    expect(map.get(newKey)).toBe("second");
    expect(map.has(newKey)).toBe(true);
  });

  test("slot reuse increments generation", () => {
    const map = new SlotMap<string>();

    const k1 = map.insert("a");
    expect(k1.generation).toBe(0);

    map.remove(k1);
    const k2 = map.insert("b");

    // Same index, different generation
    expect(k2.index).toBe(k1.index);
    expect(k2.generation).toBe(1);
  });

  test("multiple generations at same slot", () => {
    const map = new SlotMap<number>();

    const keys: Array<{ index: number; generation: number }> = [];

    for (let gen = 0; gen < 10; gen++) {
      const key = map.insert(gen);
      keys.push(key);
      map.remove(key);
    }

    // All old keys should be stale
    for (const key of keys) {
      expect(map.get(key)).toBeUndefined();
    }

    // Insert one more - should reuse the slot
    const final = map.insert(999);
    expect(final.index).toBe(0);
    expect(final.generation).toBe(10);
    expect(map.get(final)).toBe(999);
  });

  test("stale key cannot remove new occupant", () => {
    const map = new SlotMap<string>();

    const oldKey = map.insert("old");
    map.remove(oldKey);

    const newKey = map.insert("new");

    // Old key cannot clobber new value
    expect(map.remove(oldKey)).toBeUndefined();
    expect(map.get(newKey)).toBe("new");
  });
});

describe("SlotMap - Has", () => {
  test("has returns true for live key", () => {
    const map = new SlotMap<string>();
    const key = map.insert("hello");
    expect(map.has(key)).toBe(true);
  });

  test("has returns false for removed key", () => {
    const map = new SlotMap<string>();
    const key = map.insert("hello");
    map.remove(key);
    expect(map.has(key)).toBe(false);
  });

  test("has returns false for invalid key", () => {
    const map = new SlotMap<string>();
    expect(map.has({ index: 0, generation: 0 })).toBe(false);
  });
});

describe("SlotMap - Iteration", () => {
  test("entries iterates live pairs", () => {
    const map = new SlotMap<string>();
    const k1 = map.insert("a");
    const k2 = map.insert("b");
    map.insert("c");
    map.remove(k2);

    const entries = [...map.entries()];
    expect(entries.length).toBe(2);

    const values = entries.map(([_, v]) => v);
    expect(values).toContain("a");
    expect(values).toContain("c");
    expect(values).not.toContain("b");
  });

  test("values iterates live values", () => {
    const map = new SlotMap<number>();
    map.insert(1);
    const k2 = map.insert(2);
    map.insert(3);
    map.remove(k2);

    const values = [...map.values()];
    expect(values).toEqual([1, 3]);
  });

  test("keys iterates live keys", () => {
    const map = new SlotMap<string>();
    map.insert("a");
    const k2 = map.insert("b");
    map.insert("c");
    map.remove(k2);

    const keys = [...map.keys()];
    expect(keys.length).toBe(2);
  });

  test("empty map iterates nothing", () => {
    const map = new SlotMap<string>();
    expect([...map.entries()]).toEqual([]);
    expect([...map.values()]).toEqual([]);
    expect([...map.keys()]).toEqual([]);
  });
});

describe("SlotMap - Clear", () => {
  test("clear removes all entries", () => {
    const map = new SlotMap<string>();
    const k1 = map.insert("a");
    const k2 = map.insert("b");

    map.clear();

    expect(map.size).toBe(0);
    expect(map.get(k1)).toBeUndefined();
    expect(map.get(k2)).toBeUndefined();
  });

  test("insert after clear reuses slots with incremented generation", () => {
    const map = new SlotMap<string>();
    const k1 = map.insert("before");
    map.clear();

    const k2 = map.insert("after");
    expect(k2.index).toBe(k1.index);
    expect(k2.generation).toBe(k1.generation + 1);
  });
});

describe("Key Utilities", () => {
  test("keysEqual compares index and generation", () => {
    expect(keysEqual({ index: 0, generation: 0 }, { index: 0, generation: 0 })).toBe(true);
    expect(keysEqual({ index: 0, generation: 0 }, { index: 0, generation: 1 })).toBe(false);
    expect(keysEqual({ index: 0, generation: 0 }, { index: 1, generation: 0 })).toBe(false);
  });

  test("keysCompare orders by index then generation", () => {
    expect(keysCompare({ index: 0, generation: 0 }, { index: 1, generation: 0 })).toBeLessThan(0);
    expect(keysCompare({ index: 1, generation: 0 }, { index: 0, generation: 0 })).toBeGreaterThan(0);
    expect(keysCompare({ index: 0, generation: 0 }, { index: 0, generation: 1 })).toBeLessThan(0);
    expect(keysCompare({ index: 0, generation: 0 }, { index: 0, generation: 0 })).toBe(0);
  });
});

describe("SlotMap - Performance Characteristics", () => {
  test("handles 10k inserts", () => {
    const map = new SlotMap<number>();
    const keys = [];

    const start = performance.now();
    for (let i = 0; i < 10_000; i++) {
      keys.push(map.insert(i));
    }
    const insertMs = performance.now() - start;

    expect(map.size).toBe(10_000);
    expect(insertMs).toBeLessThan(50);
  });

  test("handles interleaved insert/remove", () => {
    const map = new SlotMap<number>();

    for (let i = 0; i < 10_000; i++) {
      const key = map.insert(i);
      if (i % 3 === 0) {
        map.remove(key);
      }
    }

    // ~6667 should remain (2/3 of 10k)
    expect(map.size).toBeGreaterThan(6000);
    expect(map.size).toBeLessThan(7000);
  });

  test("stale detection is O(1)", () => {
    const map = new SlotMap<number>();
    const staleKeys = [];

    // Create and remove 1000 entries to build up stale keys
    for (let i = 0; i < 1000; i++) {
      const key = map.insert(i);
      staleKeys.push(key);
      map.remove(key);
    }

    // Fill slots back up
    for (let i = 0; i < 1000; i++) {
      map.insert(i + 1000);
    }

    // Checking stale keys should be O(1) each, not O(chain_length)
    const start = performance.now();
    for (const key of staleKeys) {
      map.get(key); // Should return undefined via generation check
    }
    const checkMs = performance.now() - start;

    // 1000 checks should be well under 1ms
    expect(checkMs).toBeLessThan(5);
  });
});
