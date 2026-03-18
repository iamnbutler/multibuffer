/**
 * Tests for ProjectTree file discovery.
 */

import { describe, expect, test } from "bun:test";
import {
  createMemoryFsAdapter,
  createProjectTree,
  type ProjectEntry,
} from "../../src/project/index.ts";

/**
 * Helper to collect all entries from an async iterable.
 */
async function collectEntries(
  iterable: AsyncIterable<ProjectEntry>,
): Promise<ProjectEntry[]> {
  const entries: ProjectEntry[] = [];
  for await (const entry of iterable) {
    entries.push(entry);
  }
  return entries;
}

/**
 * Helper to collect entry paths.
 */
async function collectPaths(
  iterable: AsyncIterable<ProjectEntry>,
): Promise<string[]> {
  const entries = await collectEntries(iterable);
  return entries.map((e) => e.relativePath);
}

describe("createProjectTree", () => {
  describe("basic enumeration", () => {
    test("enumerates all files in a flat directory", async () => {
      const adapter = createMemoryFsAdapter({
        "/root": { type: "directory" },
        "/root/a.ts": { type: "file" },
        "/root/b.ts": { type: "file" },
        "/root/c.ts": { type: "file" },
      });

      const tree = createProjectTree("/root", { adapter });
      const paths = await collectPaths(tree.entries());

      expect(paths).toEqual(["a.ts", "b.ts", "c.ts"]);
    });

    test("enumerates files and directories recursively", async () => {
      const adapter = createMemoryFsAdapter({
        "/root": { type: "directory" },
        "/root/src": { type: "directory" },
        "/root/src/index.ts": { type: "file" },
        "/root/src/lib": { type: "directory" },
        "/root/src/lib/utils.ts": { type: "file" },
        "/root/package.json": { type: "file" },
      });

      const tree = createProjectTree("/root", { adapter });
      const entries = await collectEntries(tree.entries());
      const paths = entries.map((e) => e.relativePath);

      // Should have directories and files in sorted order
      expect(paths).toContain("src");
      expect(paths).toContain("src/index.ts");
      expect(paths).toContain("src/lib");
      expect(paths).toContain("src/lib/utils.ts");
      expect(paths).toContain("package.json");
    });

    test("sorts entries: directories first, then alphabetically", async () => {
      const adapter = createMemoryFsAdapter({
        "/root": { type: "directory" },
        "/root/z.ts": { type: "file" },
        "/root/a.ts": { type: "file" },
        "/root/lib": { type: "directory" },
        "/root/lib/index.ts": { type: "file" },
        "/root/src": { type: "directory" },
        "/root/src/index.ts": { type: "file" },
      });

      const tree = createProjectTree("/root", { adapter });
      const entries = await collectEntries(tree.children("."));

      // Directories first (alphabetically), then files (alphabetically)
      expect(entries[0]?.name).toBe("lib");
      expect(entries[1]?.name).toBe("src");
      expect(entries[2]?.name).toBe("a.ts");
      expect(entries[3]?.name).toBe("z.ts");
    });
  });

  describe("include patterns", () => {
    test("filters files by extension", async () => {
      const adapter = createMemoryFsAdapter({
        "/root": { type: "directory" },
        "/root/index.ts": { type: "file" },
        "/root/styles.css": { type: "file" },
        "/root/data.json": { type: "file" },
      });

      const tree = createProjectTree("/root", {
        adapter,
        include: ["*.ts"],
      });
      const paths = await collectPaths(tree.entries());

      expect(paths).toEqual(["index.ts"]);
    });

    test("filters with ** pattern", async () => {
      const adapter = createMemoryFsAdapter({
        "/root": { type: "directory" },
        "/root/src": { type: "directory" },
        "/root/src/index.ts": { type: "file" },
        "/root/src/lib": { type: "directory" },
        "/root/src/lib/utils.ts": { type: "file" },
        "/root/styles.css": { type: "file" },
      });

      const tree = createProjectTree("/root", {
        adapter,
        include: ["**/*.ts"],
      });
      const entries = await collectEntries(tree.entries());
      const filePaths = entries
        .filter((e) => e.type === "file")
        .map((e) => e.relativePath);

      expect(filePaths).toContain("src/index.ts");
      expect(filePaths).toContain("src/lib/utils.ts");
      expect(filePaths).not.toContain("styles.css");
    });

    test("multiple include patterns", async () => {
      const adapter = createMemoryFsAdapter({
        "/root": { type: "directory" },
        "/root/index.ts": { type: "file" },
        "/root/App.tsx": { type: "file" },
        "/root/styles.css": { type: "file" },
      });

      const tree = createProjectTree("/root", {
        adapter,
        include: ["*.ts", "*.tsx"],
      });
      const paths = await collectPaths(tree.entries());

      expect(paths).toContain("index.ts");
      expect(paths).toContain("App.tsx");
      expect(paths).not.toContain("styles.css");
    });
  });

  describe("exclude patterns", () => {
    test("excludes directories by name", async () => {
      const adapter = createMemoryFsAdapter({
        "/root": { type: "directory" },
        "/root/src": { type: "directory" },
        "/root/src/index.ts": { type: "file" },
        "/root/node_modules": { type: "directory" },
        "/root/node_modules/pkg": { type: "directory" },
        "/root/node_modules/pkg/index.js": { type: "file" },
      });

      const tree = createProjectTree("/root", {
        adapter,
        exclude: ["node_modules"],
      });
      const paths = await collectPaths(tree.entries());

      expect(paths).toContain("src");
      expect(paths).toContain("src/index.ts");
      expect(paths).not.toContain("node_modules");
      expect(paths).not.toContain("node_modules/pkg");
    });

    test("excludes files by pattern", async () => {
      const adapter = createMemoryFsAdapter({
        "/root": { type: "directory" },
        "/root/index.ts": { type: "file" },
        "/root/index.test.ts": { type: "file" },
        "/root/utils.ts": { type: "file" },
        "/root/utils.test.ts": { type: "file" },
      });

      const tree = createProjectTree("/root", {
        adapter,
        exclude: ["*.test.ts"],
      });
      const paths = await collectPaths(tree.entries());

      expect(paths).toContain("index.ts");
      expect(paths).toContain("utils.ts");
      expect(paths).not.toContain("index.test.ts");
      expect(paths).not.toContain("utils.test.ts");
    });

    test("include and exclude combined", async () => {
      const adapter = createMemoryFsAdapter({
        "/root": { type: "directory" },
        "/root/src": { type: "directory" },
        "/root/src/index.ts": { type: "file" },
        "/root/src/index.test.ts": { type: "file" },
        "/root/dist": { type: "directory" },
        "/root/dist/index.js": { type: "file" },
      });

      const tree = createProjectTree("/root", {
        adapter,
        include: ["**/*.ts"],
        exclude: ["dist", "**/*.test.ts"],
      });
      const entries = await collectEntries(tree.entries());
      const filePaths = entries
        .filter((e) => e.type === "file")
        .map((e) => e.relativePath);

      expect(filePaths).toContain("src/index.ts");
      expect(filePaths).not.toContain("src/index.test.ts");
      expect(filePaths).not.toContain("dist/index.js");
    });
  });

  describe("lazy enumeration", () => {
    test("children() returns lazy iterator", async () => {
      const adapter = createMemoryFsAdapter({
        "/root": { type: "directory" },
        "/root/src": { type: "directory" },
        "/root/src/index.ts": { type: "file" },
        "/root/lib": { type: "directory" },
        "/root/lib/utils.ts": { type: "file" },
      });

      const tree = createProjectTree("/root", { adapter });

      // Get top-level children
      const topLevel = await collectEntries(tree.children("/root"));

      expect(topLevel).toHaveLength(2);
      expect(topLevel[0]?.type).toBe("directory");
      expect(topLevel[1]?.type).toBe("directory");
    });

    test("directory entry has children() method", async () => {
      const adapter = createMemoryFsAdapter({
        "/root": { type: "directory" },
        "/root/src": { type: "directory" },
        "/root/src/index.ts": { type: "file" },
        "/root/src/utils.ts": { type: "file" },
      });

      const tree = createProjectTree("/root", { adapter });

      const topLevel = await collectEntries(tree.children("."));
      const srcDir = topLevel.find((e) => e.name === "src");

      expect(srcDir?.type).toBe("directory");
      if (srcDir?.type === "directory") {
        const children = await collectEntries(srcDir.children());
        expect(children).toHaveLength(2);
        expect(children.map((c) => c.name).sort()).toEqual([
          "index.ts",
          "utils.ts",
        ]);
      }
    });
  });

  describe("path handling", () => {
    test("get() returns entry by path", async () => {
      const adapter = createMemoryFsAdapter({
        "/root": { type: "directory" },
        "/root/src": { type: "directory" },
        "/root/src/index.ts": { type: "file", size: 100 },
      });

      const tree = createProjectTree("/root", { adapter });

      const entry = await tree.get("src/index.ts");
      expect(entry?.type).toBe("file");
      expect(entry?.name).toBe("index.ts");
      expect(entry?.relativePath).toBe("src/index.ts");
    });

    test("get() returns undefined for non-existent path", async () => {
      const adapter = createMemoryFsAdapter({
        "/root": { type: "directory" },
      });

      const tree = createProjectTree("/root", { adapter });

      const entry = await tree.get("nonexistent.ts");
      expect(entry).toBeUndefined();
    });

    test("has() checks path existence", async () => {
      const adapter = createMemoryFsAdapter({
        "/root": { type: "directory" },
        "/root/exists.ts": { type: "file" },
      });

      const tree = createProjectTree("/root", { adapter });

      expect(await tree.has("exists.ts")).toBe(true);
      expect(await tree.has("missing.ts")).toBe(false);
    });

    test("handles trailing slashes in root", async () => {
      const adapter = createMemoryFsAdapter({
        "/root": { type: "directory" },
        "/root/file.ts": { type: "file" },
      });

      const tree = createProjectTree("/root/", { adapter });
      const paths = await collectPaths(tree.entries());

      expect(paths).toEqual(["file.ts"]);
    });
  });

  describe("metadata", () => {
    test("includes metadata when option is set", async () => {
      const adapter = createMemoryFsAdapter({
        "/root": { type: "directory" },
        "/root/file.ts": { type: "file", size: 1234, mtime: 1234567890 },
      });

      const tree = createProjectTree("/root", {
        adapter,
        includeMetadata: true,
      });
      const entries = await collectEntries(tree.entries());
      const file = entries.find((e) => e.type === "file");

      expect(file?.type).toBe("file");
      if (file?.type === "file") {
        expect(file.size).toBe(1234);
        expect(file.mtime).toBe(1234567890);
      }
    });

    test("omits metadata when option is false", async () => {
      const adapter = createMemoryFsAdapter({
        "/root": { type: "directory" },
        "/root/file.ts": { type: "file", size: 1234, mtime: 1234567890 },
      });

      const tree = createProjectTree("/root", {
        adapter,
        includeMetadata: false,
      });
      const entries = await collectEntries(tree.entries());
      const file = entries.find((e) => e.type === "file");

      expect(file?.type).toBe("file");
      if (file?.type === "file") {
        expect(file.size).toBeUndefined();
        expect(file.mtime).toBeUndefined();
      }
    });
  });

  describe("depth limiting", () => {
    test("maxDepth limits traversal", async () => {
      const adapter = createMemoryFsAdapter({
        "/root": { type: "directory" },
        "/root/a": { type: "directory" },
        "/root/a/b": { type: "directory" },
        "/root/a/b/c": { type: "directory" },
        "/root/a/b/c/deep.ts": { type: "file" },
        "/root/a/b/mid.ts": { type: "file" },
        "/root/a/shallow.ts": { type: "file" },
        "/root/top.ts": { type: "file" },
      });

      const tree = createProjectTree("/root", { adapter, maxDepth: 2 });
      const paths = await collectPaths(tree.entries());

      expect(paths).toContain("top.ts");
      expect(paths).toContain("a");
      expect(paths).toContain("a/shallow.ts");
      expect(paths).toContain("a/b");
      expect(paths).toContain("a/b/mid.ts");
      // Should not include depth 3+
      expect(paths).not.toContain("a/b/c");
      expect(paths).not.toContain("a/b/c/deep.ts");
    });

    test("maxDepth 0 returns only root entries", async () => {
      const adapter = createMemoryFsAdapter({
        "/root": { type: "directory" },
        "/root/src": { type: "directory" },
        "/root/src/index.ts": { type: "file" },
        "/root/file.ts": { type: "file" },
      });

      const tree = createProjectTree("/root", { adapter, maxDepth: 0 });
      const paths = await collectPaths(tree.entries());

      expect(paths).toContain("src");
      expect(paths).toContain("file.ts");
      expect(paths).not.toContain("src/index.ts");
    });
  });

  describe("entry properties", () => {
    test("file entries have correct properties", async () => {
      const adapter = createMemoryFsAdapter({
        "/project": { type: "directory" },
        "/project/src": { type: "directory" },
        "/project/src/index.ts": { type: "file" },
      });

      const tree = createProjectTree("/project", { adapter });
      const entries = await collectEntries(tree.entries());
      const file = entries.find((e) => e.name === "index.ts");

      expect(file).toBeDefined();
      expect(file?.type).toBe("file");
      expect(file?.name).toBe("index.ts");
      expect(file?.path).toBe("/project/src/index.ts");
      expect(file?.relativePath).toBe("src/index.ts");
    });

    test("directory entries have correct properties", async () => {
      const adapter = createMemoryFsAdapter({
        "/project": { type: "directory" },
        "/project/src": { type: "directory" },
        "/project/src/index.ts": { type: "file" },
      });

      const tree = createProjectTree("/project", { adapter });
      const entries = await collectEntries(tree.children("."));
      const dir = entries.find((e) => e.name === "src");

      expect(dir).toBeDefined();
      expect(dir?.type).toBe("directory");
      expect(dir?.name).toBe("src");
      expect(dir?.path).toBe("/project/src");
      expect(dir?.relativePath).toBe("src");
    });
  });
});

describe("createMemoryFsAdapter", () => {
  test("readdir returns direct children", async () => {
    const adapter = createMemoryFsAdapter({
      "/root": { type: "directory" },
      "/root/a.ts": { type: "file" },
      "/root/b.ts": { type: "file" },
      "/root/sub": { type: "directory" },
      "/root/sub/c.ts": { type: "file" },
    });

    const entries = await adapter.readdir("/root");
    const names = entries.map((e) => e.name).sort();

    expect(names).toEqual(["a.ts", "b.ts", "sub"]);
  });

  test("readdir throws for non-existent path", async () => {
    const adapter = createMemoryFsAdapter({
      "/root": { type: "directory" },
    });

    await expect(adapter.readdir("/nonexistent")).rejects.toThrow("ENOENT");
  });

  test("stat returns file metadata", async () => {
    const adapter = createMemoryFsAdapter({
      "/root/file.ts": { type: "file", size: 100, mtime: 1234567890 },
    });

    const stat = await adapter.stat?.("/root/file.ts");

    expect(stat.size).toBe(100);
    expect(stat.mtime).toBe(1234567890);
  });

  test("stat throws for non-existent path", async () => {
    const adapter = createMemoryFsAdapter({});

    await expect(adapter.stat?.("/nonexistent")).rejects.toThrow("ENOENT");
  });
});
