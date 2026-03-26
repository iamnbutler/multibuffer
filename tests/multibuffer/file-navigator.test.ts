/**
 * FileNavigator tests - written BEFORE implementation (TDD).
 *
 * Tests for the file-to-excerpt navigation bridge that maps file paths
 * to excerpts in a MultiBuffer, creating them on demand.
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { createFileNavigator } from "../../src/multibuffer/file-navigator.ts";
import { createMultiBuffer } from "../../src/multibuffer/multibuffer.ts";
import {
  generateText,
  resetCounters,
  row,
} from "../helpers.ts";

beforeEach(() => {
  resetCounters();
});

/** In-memory file system for testing. */
function createMockFs(files: Record<string, string>) {
  return (path: string): Promise<string> => {
    const content = files[path];
    if (content === undefined) {
      return Promise.reject(new Error(`File not found: ${path}`));
    }
    return Promise.resolve(content);
  };
}

describe("FileNavigator - openFile", () => {
  test("opens a file and creates an excerpt", async () => {
    const mb = createMultiBuffer();
    const nav = createFileNavigator(mb, {
      readFile: createMockFs({ "/src/foo.ts": generateText(10) }),
    });

    const id = await nav.openFile("/src/foo.ts");

    expect(id).toBeDefined();
    expect(mb.excerpts.length).toBe(1);
    expect(mb.excerpts[0]?.metadata?.filePath).toBe("/src/foo.ts");
  });

  test("returns existing excerpt ID when file already open", async () => {
    const mb = createMultiBuffer();
    const nav = createFileNavigator(mb, {
      readFile: createMockFs({ "/src/foo.ts": generateText(10) }),
    });

    const id1 = await nav.openFile("/src/foo.ts");
    const id2 = await nav.openFile("/src/foo.ts");

    expect(id1).toEqual(id2);
    expect(mb.excerpts.length).toBe(1);
  });

  test("opens multiple different files", async () => {
    const mb = createMultiBuffer();
    const nav = createFileNavigator(mb, {
      readFile: createMockFs({
        "/src/a.ts": generateText(5),
        "/src/b.ts": generateText(8),
      }),
    });

    const id1 = await nav.openFile("/src/a.ts");
    const id2 = await nav.openFile("/src/b.ts");

    expect(id1).not.toEqual(id2);
    expect(mb.excerpts.length).toBe(2);
  });

  test("throws when file cannot be read", async () => {
    const mb = createMultiBuffer();
    const nav = createFileNavigator(mb, {
      readFile: createMockFs({}),
    });

    await expect(nav.openFile("/missing.ts")).rejects.toThrow("File not found");
  });

  test("creates full-file excerpt by default", async () => {
    const text = generateText(10);
    const mb = createMultiBuffer();
    const nav = createFileNavigator(mb, {
      readFile: createMockFs({ "/src/foo.ts": text }),
    });

    await nav.openFile("/src/foo.ts");

    const excerpt = mb.excerpts[0];
    expect(excerpt).toBeDefined();
    // Context range should cover full file (row 0 to lineCount)
    expect(excerpt?.range.context.start.row).toBe(row(0));
  });

  test("stores filePath in excerpt metadata", async () => {
    const mb = createMultiBuffer();
    const nav = createFileNavigator(mb, {
      readFile: createMockFs({ "/src/foo.ts": generateText(5) }),
    });

    await nav.openFile("/src/foo.ts");

    expect(mb.excerpts[0]?.metadata?.filePath).toBe("/src/foo.ts");
  });
});

describe("FileNavigator - hasFile", () => {
  test("returns false for unopened file", () => {
    const mb = createMultiBuffer();
    const nav = createFileNavigator(mb, {
      readFile: createMockFs({}),
    });

    expect(nav.hasFile("/src/foo.ts")).toBe(false);
  });

  test("returns true for opened file", async () => {
    const mb = createMultiBuffer();
    const nav = createFileNavigator(mb, {
      readFile: createMockFs({ "/src/foo.ts": generateText(5) }),
    });

    await nav.openFile("/src/foo.ts");

    expect(nav.hasFile("/src/foo.ts")).toBe(true);
  });

  test("returns false after file is closed", async () => {
    const mb = createMultiBuffer();
    const nav = createFileNavigator(mb, {
      readFile: createMockFs({ "/src/foo.ts": generateText(5) }),
    });

    await nav.openFile("/src/foo.ts");
    nav.closeFile("/src/foo.ts");

    expect(nav.hasFile("/src/foo.ts")).toBe(false);
  });
});

describe("FileNavigator - getExcerptForFile", () => {
  test("returns null for unopened file", () => {
    const mb = createMultiBuffer();
    const nav = createFileNavigator(mb, {
      readFile: createMockFs({}),
    });

    expect(nav.getExcerptForFile("/src/foo.ts")).toBeNull();
  });

  test("returns info for opened file", async () => {
    const mb = createMultiBuffer();
    const nav = createFileNavigator(mb, {
      readFile: createMockFs({ "/src/foo.ts": generateText(5) }),
    });

    const id = await nav.openFile("/src/foo.ts");

    const info = nav.getExcerptForFile("/src/foo.ts");
    expect(info).not.toBeNull();
    expect(info?.excerptId).toEqual(id);
    expect(info?.filePath).toBe("/src/foo.ts");
  });
});

describe("FileNavigator - closeFile", () => {
  test("removes excerpt from multibuffer", async () => {
    const mb = createMultiBuffer();
    const nav = createFileNavigator(mb, {
      readFile: createMockFs({ "/src/foo.ts": generateText(5) }),
    });

    await nav.openFile("/src/foo.ts");
    expect(mb.excerpts.length).toBe(1);

    nav.closeFile("/src/foo.ts");
    expect(mb.excerpts.length).toBe(0);
  });

  test("no-op for unopened file", () => {
    const mb = createMultiBuffer();
    const nav = createFileNavigator(mb, {
      readFile: createMockFs({}),
    });

    // Should not throw
    expect(() => nav.closeFile("/src/foo.ts")).not.toThrow();
  });

  test("allows re-opening after close", async () => {
    const mb = createMultiBuffer();
    const nav = createFileNavigator(mb, {
      readFile: createMockFs({ "/src/foo.ts": generateText(5) }),
    });

    const id1 = await nav.openFile("/src/foo.ts");
    nav.closeFile("/src/foo.ts");

    const id2 = await nav.openFile("/src/foo.ts");
    // New excerpt should be created (different ID)
    expect(id2).not.toEqual(id1);
    expect(mb.excerpts.length).toBe(1);
  });
});

describe("FileNavigator - files", () => {
  test("starts empty", () => {
    const mb = createMultiBuffer();
    const nav = createFileNavigator(mb, {
      readFile: createMockFs({}),
    });

    expect(nav.files.size).toBe(0);
  });

  test("tracks opened files", async () => {
    const mb = createMultiBuffer();
    const nav = createFileNavigator(mb, {
      readFile: createMockFs({
        "/src/a.ts": generateText(3),
        "/src/b.ts": generateText(4),
      }),
    });

    await nav.openFile("/src/a.ts");
    await nav.openFile("/src/b.ts");

    expect(nav.files.size).toBe(2);
    expect(nav.files.has("/src/a.ts")).toBe(true);
    expect(nav.files.has("/src/b.ts")).toBe(true);
  });
});

describe("FileNavigator - external excerpt removal sync", () => {
  test("syncs when excerpt is removed externally via removeExcerpt", async () => {
    const mb = createMultiBuffer();
    const nav = createFileNavigator(mb, {
      readFile: createMockFs({ "/src/foo.ts": generateText(5) }),
    });

    const id = await nav.openFile("/src/foo.ts");

    // Remove excerpt externally (not through navigator)
    mb.removeExcerpt(id);

    expect(nav.hasFile("/src/foo.ts")).toBe(false);
    expect(nav.files.size).toBe(0);
  });

  test("syncs when excerpts are cleared externally", async () => {
    const mb = createMultiBuffer();
    const nav = createFileNavigator(mb, {
      readFile: createMockFs({
        "/src/a.ts": generateText(3),
        "/src/b.ts": generateText(4),
      }),
    });

    await nav.openFile("/src/a.ts");
    await nav.openFile("/src/b.ts");

    mb.clearExcerpts();

    expect(nav.hasFile("/src/a.ts")).toBe(false);
    expect(nav.hasFile("/src/b.ts")).toBe(false);
    expect(nav.files.size).toBe(0);
  });
});

describe("FileNavigator - destroy", () => {
  test("cleans up event listeners and state", async () => {
    const mb = createMultiBuffer();
    const nav = createFileNavigator(mb, {
      readFile: createMockFs({ "/src/foo.ts": generateText(5) }),
    });

    await nav.openFile("/src/foo.ts");
    nav.destroy();

    // After destroy, files map should be empty
    expect(nav.files.size).toBe(0);

    // Removing excerpts externally should not cause errors
    // (listener was unregistered)
    expect(() => mb.clearExcerpts()).not.toThrow();
  });
});
