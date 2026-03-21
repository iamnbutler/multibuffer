/**
 * Tests for FileNavigator: file-path → excerpt mapping on top of MultiBuffer.
 */

import { describe, expect, test } from "bun:test";
import { createMultiBuffer } from "../../src/multibuffer/multibuffer.ts";
import { createFileNavigator } from "../../src/multibuffer/file-navigator.ts";
import { keysEqual } from "../../src/multibuffer/slot_map.ts";
import { mbRow } from "../helpers.ts";

/** In-memory readFile helper. */
function makeReadFile(
  files: Record<string, string>,
): (path: string) => Promise<string> {
  return (path) => {
    const content = files[path];
    if (content === undefined) return Promise.reject(new Error(`File not found: ${path}`));
    return Promise.resolve(content);
  };
}

describe("createFileNavigator", () => {
  describe("openFile", () => {
    test("opens a file and returns an ExcerptId", async () => {
      const mb = createMultiBuffer();
      const nav = createFileNavigator(mb, {
        readFile: makeReadFile({ "/src/a.ts": "const x = 1;\n" }),
      });

      const id = await nav.openFile("/src/a.ts");

      expect(id).toBeDefined();
      expect(mb.excerpts).toHaveLength(1);
    });

    test("adds the file content as an excerpt in the MultiBuffer", async () => {
      const mb = createMultiBuffer();
      const nav = createFileNavigator(mb, {
        readFile: makeReadFile({ "/src/hello.ts": "hello\nworld\n" }),
      });

      await nav.openFile("/src/hello.ts");

      expect(mb.excerpts).toHaveLength(1);
      const snap = mb.snapshot();
      const lines = snap.lines(mbRow(0), mbRow(snap.lineCount));
      expect(lines).toContain("hello");
      expect(lines).toContain("world");
    });

    test("opening the same file twice returns the same ExcerptId", async () => {
      const mb = createMultiBuffer();
      const nav = createFileNavigator(mb, {
        readFile: makeReadFile({ "/src/a.ts": "export {};\n" }),
      });

      const id1 = await nav.openFile("/src/a.ts");
      const id2 = await nav.openFile("/src/a.ts");

      expect(id1).toBe(id2);
      // Should not create a duplicate excerpt
      expect(mb.excerpts).toHaveLength(1);
    });

    test("opening the same file twice does not call readFile a second time", async () => {
      const mb = createMultiBuffer();
      let calls = 0;
      const nav = createFileNavigator(mb, {
        readFile: async (_path) => {
          calls++;
          return "content\n";
        },
      });

      await nav.openFile("/src/a.ts");
      await nav.openFile("/src/a.ts");

      expect(calls).toBe(1);
    });

    test("multiple files load as separate excerpts", async () => {
      const mb = createMultiBuffer();
      const nav = createFileNavigator(mb, {
        readFile: makeReadFile({
          "/src/a.ts": "const a = 1;\n",
          "/src/b.ts": "const b = 2;\n",
        }),
      });

      const idA = await nav.openFile("/src/a.ts");
      const idB = await nav.openFile("/src/b.ts");

      expect(idA).not.toBe(idB);
      expect(mb.excerpts).toHaveLength(2);
    });

    test("stores filePath in excerpt metadata", async () => {
      const mb = createMultiBuffer();
      const nav = createFileNavigator(mb, {
        readFile: makeReadFile({ "/src/main.ts": "export {};\n" }),
      });

      const id = await nav.openFile("/src/main.ts");

      const info = mb.excerpts.find((e) => keysEqual(e.id, id));
      expect(info?.metadata?.filePath).toBe("/src/main.ts");
    });
  });

  describe("hasFile", () => {
    test("returns false before opening", async () => {
      const mb = createMultiBuffer();
      const nav = createFileNavigator(mb, { readFile: makeReadFile({}) });

      expect(nav.hasFile("/src/a.ts")).toBe(false);
    });

    test("returns true after opening", async () => {
      const mb = createMultiBuffer();
      const nav = createFileNavigator(mb, {
        readFile: makeReadFile({ "/src/a.ts": "content\n" }),
      });

      await nav.openFile("/src/a.ts");

      expect(nav.hasFile("/src/a.ts")).toBe(true);
    });

    test("returns false after closing", async () => {
      const mb = createMultiBuffer();
      const nav = createFileNavigator(mb, {
        readFile: makeReadFile({ "/src/a.ts": "content\n" }),
      });

      await nav.openFile("/src/a.ts");
      nav.closeFile("/src/a.ts");

      expect(nav.hasFile("/src/a.ts")).toBe(false);
    });
  });

  describe("getExcerptForFile", () => {
    test("returns undefined for unopened files", () => {
      const mb = createMultiBuffer();
      const nav = createFileNavigator(mb, { readFile: makeReadFile({}) });

      expect(nav.getExcerptForFile("/src/a.ts")).toBeUndefined();
    });

    test("returns OpenedFileInfo for opened files", async () => {
      const mb = createMultiBuffer();
      const nav = createFileNavigator(mb, {
        readFile: makeReadFile({ "/src/a.ts": "content\n" }),
      });

      const id = await nav.openFile("/src/a.ts");
      const info = nav.getExcerptForFile("/src/a.ts");

      expect(info).toBeDefined();
      expect(info?.filePath).toBe("/src/a.ts");
      expect(info?.excerptId).toBe(id);
    });
  });

  describe("closeFile", () => {
    test("removes the excerpt from the MultiBuffer", async () => {
      const mb = createMultiBuffer();
      const nav = createFileNavigator(mb, {
        readFile: makeReadFile({ "/src/a.ts": "content\n" }),
      });

      await nav.openFile("/src/a.ts");
      nav.closeFile("/src/a.ts");

      expect(mb.excerpts).toHaveLength(0);
    });

    test("is a no-op for unopened files", () => {
      const mb = createMultiBuffer();
      const nav = createFileNavigator(mb, { readFile: makeReadFile({}) });

      // Should not throw
      expect(() => nav.closeFile("/src/nonexistent.ts")).not.toThrow();
    });

    test("closes one file without affecting others", async () => {
      const mb = createMultiBuffer();
      const nav = createFileNavigator(mb, {
        readFile: makeReadFile({
          "/src/a.ts": "a\n",
          "/src/b.ts": "b\n",
        }),
      });

      await nav.openFile("/src/a.ts");
      await nav.openFile("/src/b.ts");
      nav.closeFile("/src/a.ts");

      expect(mb.excerpts).toHaveLength(1);
      expect(nav.hasFile("/src/a.ts")).toBe(false);
      expect(nav.hasFile("/src/b.ts")).toBe(true);
    });

    test("allows reopening a closed file", async () => {
      const mb = createMultiBuffer();
      const nav = createFileNavigator(mb, {
        readFile: makeReadFile({ "/src/a.ts": "content\n" }),
      });

      const id1 = await nav.openFile("/src/a.ts");
      nav.closeFile("/src/a.ts");
      const id2 = await nav.openFile("/src/a.ts");

      // Different ExcerptId since it was re-added
      expect(id1).not.toBe(id2);
      expect(mb.excerpts).toHaveLength(1);
    });
  });

  describe("external excerpt removal", () => {
    test("updates tracking when excerpt is removed externally", async () => {
      const mb = createMultiBuffer();
      const nav = createFileNavigator(mb, {
        readFile: makeReadFile({ "/src/a.ts": "content\n" }),
      });

      const id = await nav.openFile("/src/a.ts");
      // Remove externally
      mb.removeExcerpt(id);

      expect(nav.hasFile("/src/a.ts")).toBe(false);
      expect(nav.getExcerptForFile("/src/a.ts")).toBeUndefined();
    });
  });

  describe("files map", () => {
    test("is empty initially", () => {
      const mb = createMultiBuffer();
      const nav = createFileNavigator(mb, { readFile: makeReadFile({}) });

      expect(nav.files.size).toBe(0);
    });

    test("contains all open files", async () => {
      const mb = createMultiBuffer();
      const nav = createFileNavigator(mb, {
        readFile: makeReadFile({
          "/src/a.ts": "a\n",
          "/src/b.ts": "b\n",
        }),
      });

      await nav.openFile("/src/a.ts");
      await nav.openFile("/src/b.ts");

      expect(nav.files.size).toBe(2);
      expect(nav.files.has("/src/a.ts")).toBe(true);
      expect(nav.files.has("/src/b.ts")).toBe(true);
    });
  });
});
