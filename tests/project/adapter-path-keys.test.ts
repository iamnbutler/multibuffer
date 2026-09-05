/**
 * Tests for path-key normalization in createMemoryFsAdapter.
 *
 * The adapter normalizes every path it is *asked* about, so a caller may pass
 * "/root/src" or "/root/src/" interchangeably. These tests cover the other
 * side of the same coin: a path used as a *key* of the `files` record must be
 * normalized too, so that a fixture written with a trailing slash describes the
 * same directory that readdir enumerates.
 */

import { describe, expect, test } from "bun:test";
import { createMemoryFsAdapter, type FsAdapter } from "../../src/project/index.ts";

/**
 * `FsAdapter.stat` is optional, but the memory adapter always implements it.
 */
function statOf(adapter: FsAdapter): NonNullable<FsAdapter["stat"]> {
  const stat = adapter.stat;
  if (!stat) {
    throw new Error("createMemoryFsAdapter always defines stat");
  }
  return stat.bind(adapter);
}

describe("createMemoryFsAdapter path keys", () => {
  test("stat finds an entry whose key carries a trailing slash", async () => {
    const adapter = createMemoryFsAdapter({
      "/root/src/": { type: "directory" },
      "/root/src/index.ts": { type: "file", size: 10 },
    });

    const stats = await statOf(adapter)("/root/src");

    expect(stats.size).toBe(0);
  });

  test("stat agrees with readdir about which directories exist", async () => {
    const adapter = createMemoryFsAdapter({
      "/root/src/": { type: "directory" },
      "/root/src/index.ts": { type: "file", size: 10 },
    });

    // readdir already normalizes stored keys when enumerating children, so it
    // reports "src" as a directory of "/root".
    const listed = await adapter.readdir("/root");
    expect(listed).toEqual([{ name: "src", isDirectory: true }]);

    // stat must agree that the entry readdir just listed is reachable.
    await expect(statOf(adapter)("/root/src")).resolves.toBeDefined();
  });

  test("readdir returns [] for an empty directory keyed with a trailing slash", async () => {
    const adapter = createMemoryFsAdapter({
      "/root/empty/": { type: "directory" },
    });

    expect(await adapter.readdir("/root/empty")).toEqual([]);
  });

  test("readdir rejects with ENOTDIR for a file keyed with a trailing slash", async () => {
    const adapter = createMemoryFsAdapter({
      "/root/file.ts/": { type: "file", size: 3 },
    });

    await expect(adapter.readdir("/root/file.ts")).rejects.toThrow("ENOTDIR");
  });

  test("a key with redundant trailing slashes is reachable", async () => {
    const adapter = createMemoryFsAdapter({
      "/root/src///": { type: "directory" },
    });

    await expect(statOf(adapter)("/root/src")).resolves.toBeDefined();
  });

  test("still rejects with ENOENT for a genuinely missing path", async () => {
    const adapter = createMemoryFsAdapter({
      "/root/src/": { type: "directory" },
    });

    await expect(statOf(adapter)("/root/nope")).rejects.toThrow("ENOENT");
    await expect(adapter.readdir("/root/nope")).rejects.toThrow("ENOENT");
  });

  test("the root key is preserved", async () => {
    const adapter = createMemoryFsAdapter({
      "/": { type: "directory" },
      "/a.ts": { type: "file", size: 1 },
    });

    await expect(statOf(adapter)("/")).resolves.toBeDefined();
    expect(await adapter.readdir("/")).toEqual([
      { name: "a.ts", isDirectory: false },
    ]);
  });
});
