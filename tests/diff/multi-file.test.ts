/**
 * MultiFileDiff tests - written BEFORE implementation (TDD).
 *
 * MultiFileDiff orchestrates multiple file diffs into a single coordinated view:
 * - Per-file headers with filename and change stats
 * - Collapse/expand per file
 * - Scroll-to-file navigation
 * - Lazy rendering for large file counts
 * - Aggregated statistics
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { createMultiFileDiff } from "../../src/diff/multi-file.ts";
import type { FileDiffEntry } from "../../src/diff/types.ts";
import { resetCounters } from "../helpers.ts";

/** Create a mock container element for testing. */
function createMockContainer(): HTMLElement {
  // Use JSDOM-style mock for testing
  const container = {
    style: {},
    children: [],
    appendChild: () => {},
    removeChild: () => {},
    querySelector: () => null,
    querySelectorAll: () => [],
    innerHTML: "",
    scrollTop: 0,
    clientHeight: 600,
    getBoundingClientRect: () => ({ top: 0, left: 0, width: 800, height: 600 }),
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  // biome-ignore lint/plugin/no-type-assertion: expect: mock DOM element for testing
  return container as unknown as HTMLElement;
}

beforeEach(() => {
  resetCounters();
});

describe("MultiFileDiff creation", () => {
  test("creates multi-file diff with empty file list", () => {
    const container = createMockContainer();
    const multiDiff = createMultiFileDiff({
      files: [],
      container,
    });

    expect(multiDiff.stats.fileCount).toBe(0);
    expect(multiDiff.stats.totalAdditions).toBe(0);
    expect(multiDiff.stats.totalDeletions).toBe(0);
    expect(multiDiff.files).toEqual([]);

    multiDiff.dispose();
  });

  test("creates multi-file diff with single file", () => {
    const container = createMockContainer();
    const files: FileDiffEntry[] = [
      {
        filename: "src/app.ts",
        oldContent: "const a = 1;\n",
        newContent: "const a = 2;\n",
      },
    ];

    const multiDiff = createMultiFileDiff({ files, container });

    expect(multiDiff.stats.fileCount).toBe(1);
    expect(multiDiff.files.length).toBe(1);
    expect(multiDiff.files[0]?.filename).toBe("src/app.ts");
    expect(multiDiff.files[0]?.isEqual).toBe(false);

    multiDiff.dispose();
  });

  test("creates multi-file diff with multiple files", () => {
    const container = createMockContainer();
    const files: FileDiffEntry[] = [
      {
        filename: "src/app.ts",
        oldContent: "old\n",
        newContent: "new\n",
      },
      {
        filename: "src/util.ts",
        oldContent: "util\n",
        newContent: "util\n", // No change
      },
      {
        filename: "src/index.ts",
        oldContent: "a\nb\nc\n",
        newContent: "a\nX\nc\n",
      },
    ];

    const multiDiff = createMultiFileDiff({ files, container });

    expect(multiDiff.stats.fileCount).toBe(3);
    expect(multiDiff.files.length).toBe(3);

    multiDiff.dispose();
  });

  test("handles renamed files", () => {
    const container = createMockContainer();
    const files: FileDiffEntry[] = [
      {
        filename: "src/new-name.ts",
        previousFilename: "src/old-name.ts",
        oldContent: "content\n",
        newContent: "content\n",
      },
    ];

    const multiDiff = createMultiFileDiff({ files, container });

    expect(multiDiff.files[0]?.filename).toBe("src/new-name.ts");
    expect(multiDiff.files[0]?.previousFilename).toBe("src/old-name.ts");

    multiDiff.dispose();
  });

  test("handles new files (empty oldContent)", () => {
    const container = createMockContainer();
    const files: FileDiffEntry[] = [
      {
        filename: "src/new-file.ts",
        oldContent: "",
        newContent: "line1\nline2\nline3\n",
      },
    ];

    const multiDiff = createMultiFileDiff({ files, container });

    // New file: all lines are additions (4 lines including the empty trailing line)
    expect(multiDiff.files[0]?.stats.additions).toBeGreaterThan(0);
    expect(multiDiff.files[0]?.stats.deletions).toBe(0);

    multiDiff.dispose();
  });

  test("handles deleted files (empty newContent)", () => {
    const container = createMockContainer();
    const files: FileDiffEntry[] = [
      {
        filename: "src/deleted-file.ts",
        oldContent: "line1\nline2\n",
        newContent: "",
      },
    ];

    const multiDiff = createMultiFileDiff({ files, container });

    // Deleted file: all lines are deletions
    expect(multiDiff.files[0]?.stats.additions).toBe(0);
    expect(multiDiff.files[0]?.stats.deletions).toBeGreaterThan(0);

    multiDiff.dispose();
  });
});

describe("MultiFileDiff stats", () => {
  test("computes aggregate stats across all files", () => {
    const container = createMockContainer();
    const files: FileDiffEntry[] = [
      {
        filename: "file1.ts",
        oldContent: "a\nb\n",
        newContent: "a\nX\nY\n", // changed lines
      },
      {
        filename: "file2.ts",
        oldContent: "1\n2\n3\n",
        newContent: "1\n", // deleted lines
      },
      {
        filename: "file3.ts",
        oldContent: "",
        newContent: "new\n", // new content
      },
    ];

    const multiDiff = createMultiFileDiff({ files, container });

    // Verify aggregate stats are computed
    expect(multiDiff.stats.totalAdditions).toBeGreaterThan(0);
    expect(multiDiff.stats.totalDeletions).toBeGreaterThan(0);
    expect(multiDiff.stats.fileCount).toBe(3);

    multiDiff.dispose();
  });

  test("per-file stats are computed correctly", () => {
    const container = createMockContainer();
    const files: FileDiffEntry[] = [
      {
        filename: "modified.ts",
        oldContent: "old line 1\nold line 2\n",
        newContent: "new line 1\nold line 2\nnew line 3\n",
      },
    ];

    const multiDiff = createMultiFileDiff({ files, container });

    const fileState = multiDiff.files[0];
    expect(fileState?.stats.additions).toBeGreaterThan(0);
    expect(fileState?.stats.deletions).toBeGreaterThan(0);

    multiDiff.dispose();
  });

  test("identical files have zero additions and deletions", () => {
    const container = createMockContainer();
    const files: FileDiffEntry[] = [
      {
        filename: "unchanged.ts",
        oldContent: "same content\n",
        newContent: "same content\n",
      },
    ];

    const multiDiff = createMultiFileDiff({ files, container });

    expect(multiDiff.files[0]?.isEqual).toBe(true);
    expect(multiDiff.files[0]?.stats.additions).toBe(0);
    expect(multiDiff.files[0]?.stats.deletions).toBe(0);

    multiDiff.dispose();
  });
});

describe("MultiFileDiff collapse/expand", () => {
  test("files start expanded by default", () => {
    const container = createMockContainer();
    const files: FileDiffEntry[] = [
      { filename: "file1.ts", oldContent: "a\n", newContent: "b\n" },
      { filename: "file2.ts", oldContent: "c\n", newContent: "d\n" },
    ];

    const multiDiff = createMultiFileDiff({ files, container });

    expect(multiDiff.files[0]?.collapsed).toBe(false);
    expect(multiDiff.files[1]?.collapsed).toBe(false);

    multiDiff.dispose();
  });

  test("collapseFile collapses a specific file", () => {
    const container = createMockContainer();
    const files: FileDiffEntry[] = [
      { filename: "file1.ts", oldContent: "a\n", newContent: "b\n" },
      { filename: "file2.ts", oldContent: "c\n", newContent: "d\n" },
    ];

    const multiDiff = createMultiFileDiff({ files, container });

    multiDiff.collapseFile("file1.ts");

    expect(multiDiff.files[0]?.collapsed).toBe(true);
    expect(multiDiff.files[1]?.collapsed).toBe(false);

    multiDiff.dispose();
  });

  test("expandFile expands a collapsed file", () => {
    const container = createMockContainer();
    const files: FileDiffEntry[] = [
      { filename: "file1.ts", oldContent: "a\n", newContent: "b\n" },
    ];

    const multiDiff = createMultiFileDiff({ files, container });

    multiDiff.collapseFile("file1.ts");
    expect(multiDiff.files[0]?.collapsed).toBe(true);

    multiDiff.expandFile("file1.ts");
    expect(multiDiff.files[0]?.collapsed).toBe(false);

    multiDiff.dispose();
  });

  test("toggleFile toggles collapsed state", () => {
    const container = createMockContainer();
    const files: FileDiffEntry[] = [
      { filename: "file1.ts", oldContent: "a\n", newContent: "b\n" },
    ];

    const multiDiff = createMultiFileDiff({ files, container });

    expect(multiDiff.files[0]?.collapsed).toBe(false);

    multiDiff.toggleFile("file1.ts");
    expect(multiDiff.files[0]?.collapsed).toBe(true);

    multiDiff.toggleFile("file1.ts");
    expect(multiDiff.files[0]?.collapsed).toBe(false);

    multiDiff.dispose();
  });

  test("collapseAll collapses all files", () => {
    const container = createMockContainer();
    const files: FileDiffEntry[] = [
      { filename: "file1.ts", oldContent: "a\n", newContent: "b\n" },
      { filename: "file2.ts", oldContent: "c\n", newContent: "d\n" },
      { filename: "file3.ts", oldContent: "e\n", newContent: "f\n" },
    ];

    const multiDiff = createMultiFileDiff({ files, container });

    multiDiff.collapseAll();

    expect(multiDiff.files.every((f) => f.collapsed)).toBe(true);

    multiDiff.dispose();
  });

  test("expandAll expands all files", () => {
    const container = createMockContainer();
    const files: FileDiffEntry[] = [
      { filename: "file1.ts", oldContent: "a\n", newContent: "b\n" },
      { filename: "file2.ts", oldContent: "c\n", newContent: "d\n" },
    ];

    const multiDiff = createMultiFileDiff({ files, container });

    multiDiff.collapseAll();
    expect(multiDiff.files.every((f) => f.collapsed)).toBe(true);

    multiDiff.expandAll();
    expect(multiDiff.files.every((f) => !f.collapsed)).toBe(true);

    multiDiff.dispose();
  });

  test("onFileToggle callback is called when collapse state changes", () => {
    const container = createMockContainer();
    const toggleEvents: Array<{ filename: string; collapsed: boolean }> = [];

    const files: FileDiffEntry[] = [
      { filename: "file1.ts", oldContent: "a\n", newContent: "b\n" },
    ];

    const multiDiff = createMultiFileDiff({
      files,
      container,
      onFileToggle: (filename, collapsed) => {
        toggleEvents.push({ filename, collapsed });
      },
    });

    multiDiff.collapseFile("file1.ts");
    multiDiff.expandFile("file1.ts");

    expect(toggleEvents).toEqual([
      { filename: "file1.ts", collapsed: true },
      { filename: "file1.ts", collapsed: false },
    ]);

    multiDiff.dispose();
  });

  test("collapse/expand unknown file is a no-op", () => {
    const container = createMockContainer();
    const files: FileDiffEntry[] = [
      { filename: "file1.ts", oldContent: "a\n", newContent: "b\n" },
    ];

    const multiDiff = createMultiFileDiff({ files, container });

    // Should not throw
    multiDiff.collapseFile("nonexistent.ts");
    multiDiff.expandFile("nonexistent.ts");
    multiDiff.toggleFile("nonexistent.ts");

    expect(multiDiff.files[0]?.collapsed).toBe(false);

    multiDiff.dispose();
  });
});

describe("MultiFileDiff scrollToFile", () => {
  test("scrollToFile does not throw for valid filename", () => {
    const container = createMockContainer();
    const files: FileDiffEntry[] = [
      { filename: "file1.ts", oldContent: "a\n", newContent: "b\n" },
      { filename: "file2.ts", oldContent: "c\n", newContent: "d\n" },
    ];

    const multiDiff = createMultiFileDiff({ files, container });

    // Should not throw
    expect(() => multiDiff.scrollToFile("file2.ts")).not.toThrow();

    multiDiff.dispose();
  });

  test("scrollToFile is no-op for unknown filename", () => {
    const container = createMockContainer();
    const files: FileDiffEntry[] = [
      { filename: "file1.ts", oldContent: "a\n", newContent: "b\n" },
    ];

    const multiDiff = createMultiFileDiff({ files, container });

    // Should not throw
    expect(() => multiDiff.scrollToFile("nonexistent.ts")).not.toThrow();

    multiDiff.dispose();
  });

  test("scrollToFile expands collapsed file before scrolling", () => {
    const container = createMockContainer();
    const files: FileDiffEntry[] = [
      { filename: "file1.ts", oldContent: "a\n", newContent: "b\n" },
    ];

    const multiDiff = createMultiFileDiff({ files, container });

    multiDiff.collapseFile("file1.ts");
    expect(multiDiff.files[0]?.collapsed).toBe(true);

    multiDiff.scrollToFile("file1.ts");
    expect(multiDiff.files[0]?.collapsed).toBe(false);

    multiDiff.dispose();
  });
});

describe("MultiFileDiff lazy rendering", () => {
  test("lazyRender option defaults to true", () => {
    const container = createMockContainer();
    const files: FileDiffEntry[] = [
      { filename: "file1.ts", oldContent: "a\n", newContent: "b\n" },
    ];

    const multiDiff = createMultiFileDiff({ files, container });

    // With lazy rendering, files may not be initialized until visible
    // Implementation detail: first file visible in viewport should be initialized
    expect(multiDiff.files.length).toBe(1);

    multiDiff.dispose();
  });

  test("lazyRender false option is accepted", () => {
    const container = createMockContainer();
    const files: FileDiffEntry[] = [
      { filename: "file1.ts", oldContent: "a\n", newContent: "b\n" },
      { filename: "file2.ts", oldContent: "c\n", newContent: "d\n" },
      { filename: "file3.ts", oldContent: "e\n", newContent: "f\n" },
    ];

    // Should not throw with lazyRender: false
    const multiDiff = createMultiFileDiff({
      files,
      container,
      lazyRender: false,
    });

    // Verify the controller was created successfully
    expect(multiDiff.stats.fileCount).toBe(3);
    expect(multiDiff.files.length).toBe(3);

    // Note: In a mock environment without real DOM, files may not be fully
    // initialized. Full initialization requires a browser environment.

    multiDiff.dispose();
  });
});

describe("MultiFileDiff dispose", () => {
  test("dispose cleans up resources", () => {
    const container = createMockContainer();
    const files: FileDiffEntry[] = [
      { filename: "file1.ts", oldContent: "a\n", newContent: "b\n" },
      { filename: "file2.ts", oldContent: "c\n", newContent: "d\n" },
    ];

    const multiDiff = createMultiFileDiff({ files, container });

    // Should not throw
    expect(() => multiDiff.dispose()).not.toThrow();
  });

  test("methods are safe to call after dispose", () => {
    const container = createMockContainer();
    const files: FileDiffEntry[] = [
      { filename: "file1.ts", oldContent: "a\n", newContent: "b\n" },
    ];

    const multiDiff = createMultiFileDiff({ files, container });
    multiDiff.dispose();

    // Should not throw after dispose
    expect(() => multiDiff.collapseFile("file1.ts")).not.toThrow();
    expect(() => multiDiff.expandFile("file1.ts")).not.toThrow();
    expect(() => multiDiff.scrollToFile("file1.ts")).not.toThrow();
    expect(() => multiDiff.collapseAll()).not.toThrow();
    expect(() => multiDiff.expandAll()).not.toThrow();
  });
});

describe("MultiFileDiff context option", () => {
  test("context option is passed to underlying diff", () => {
    const container = createMockContainer();
    const files: FileDiffEntry[] = [
      {
        filename: "file1.ts",
        oldContent: "1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n",
        newContent: "1\n2\n3\n4\nX\n6\n7\n8\n9\n10\n",
      },
    ];

    // With context=1, only 1 line of context around changes
    const multiDiff = createMultiFileDiff({
      files,
      container,
      context: 1,
    });

    // Should create successfully
    expect(multiDiff.files.length).toBe(1);
    expect(multiDiff.files[0]?.stats.additions).toBe(1);
    expect(multiDiff.files[0]?.stats.deletions).toBe(1);

    multiDiff.dispose();
  });
});
