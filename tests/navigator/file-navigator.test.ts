/**
 * Tests for FileNavigator - the file-to-excerpt navigation bridge.
 *
 * FileNavigator bridges file selection (e.g., from a file tree) and
 * excerpt management in a MultiBuffer view.
 *
 * Key features:
 * - openFile(path, options?) - navigate to file, create excerpt if needed
 * - hasFile(path) - check if file is currently shown
 * - getExcerptForFile(path) - get excerpt info for a file
 * - closeFile(path) - remove a file's excerpt
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { createMultiBuffer } from "../../src/multibuffer/multibuffer.ts";
import type { BufferId } from "../../src/multibuffer/types.ts";
import { createFileNavigator } from "../../src/navigator/file-navigator.ts";
import { generateText, num, resetCounters } from "../helpers.ts";

beforeEach(() => {
  resetCounters();
});

// Mock file reader for testing
function createMockFileReader(
  files: Record<string, string>,
): (path: string) => Promise<string> {
  return async (path: string) => {
    const content = files[path];
    if (content === undefined) {
      throw new Error(`File not found: ${path}`);
    }
    return content;
  };
}

describe("FileNavigator creation", () => {
  test("creates navigator with multibuffer", () => {
    const mb = createMultiBuffer();
    const navigator = createFileNavigator(mb, {
      readFile: createMockFileReader({}),
    });
    expect(navigator).toBeDefined();
    expect(navigator.multiBuffer).toBe(mb);
  });

  test("requires readFile option", () => {
    const mb = createMultiBuffer();
    // @ts-expect-error - Testing missing required option
    expect(() => createFileNavigator(mb, {})).toThrow();
  });
});

describe("FileNavigator.hasFile", () => {
  test("returns false for empty navigator", () => {
    const mb = createMultiBuffer();
    const navigator = createFileNavigator(mb, {
      readFile: createMockFileReader({}),
    });
    expect(navigator.hasFile("/path/to/file.ts")).toBe(false);
  });

  test("returns true after file is opened", async () => {
    const mb = createMultiBuffer();
    const navigator = createFileNavigator(mb, {
      readFile: createMockFileReader({
        "/path/to/file.ts": generateText(10),
      }),
    });

    await navigator.openFile("/path/to/file.ts");
    expect(navigator.hasFile("/path/to/file.ts")).toBe(true);
  });

  test("returns false for different file", async () => {
    const mb = createMultiBuffer();
    const navigator = createFileNavigator(mb, {
      readFile: createMockFileReader({
        "/path/to/file1.ts": generateText(10),
      }),
    });

    await navigator.openFile("/path/to/file1.ts");
    expect(navigator.hasFile("/path/to/file2.ts")).toBe(false);
  });

  test("returns false after file is closed", async () => {
    const mb = createMultiBuffer();
    const navigator = createFileNavigator(mb, {
      readFile: createMockFileReader({
        "/path/to/file.ts": generateText(10),
      }),
    });

    await navigator.openFile("/path/to/file.ts");
    expect(navigator.hasFile("/path/to/file.ts")).toBe(true);

    navigator.closeFile("/path/to/file.ts");
    expect(navigator.hasFile("/path/to/file.ts")).toBe(false);
  });
});

describe("FileNavigator.openFile", () => {
  test("loads file content and creates excerpt", async () => {
    const mb = createMultiBuffer();
    const navigator = createFileNavigator(mb, {
      readFile: createMockFileReader({
        "/path/to/file.ts": generateText(10),
      }),
    });

    expect(mb.excerpts.length).toBe(0);

    await navigator.openFile("/path/to/file.ts");

    expect(mb.excerpts.length).toBe(1);
    expect(navigator.hasFile("/path/to/file.ts")).toBe(true);
  });

  test("does not duplicate excerpt if file already open", async () => {
    const mb = createMultiBuffer();
    const navigator = createFileNavigator(mb, {
      readFile: createMockFileReader({
        "/path/to/file.ts": generateText(10),
      }),
    });

    await navigator.openFile("/path/to/file.ts");
    await navigator.openFile("/path/to/file.ts");

    expect(mb.excerpts.length).toBe(1);
  });

  test("returns excerpt info", async () => {
    const mb = createMultiBuffer();
    const navigator = createFileNavigator(mb, {
      readFile: createMockFileReader({
        "/path/to/file.ts": generateText(10),
      }),
    });

    const result = await navigator.openFile("/path/to/file.ts");

    expect(result.excerptId).toBeDefined();
    expect(result.bufferId).toBeDefined();
    expect(result.startRow).toBeDefined();
    expect(num(result.startRow)).toBe(0);
  });

  test("stores filePath in excerpt metadata", async () => {
    const mb = createMultiBuffer();
    const navigator = createFileNavigator(mb, {
      readFile: createMockFileReader({
        "/path/to/file.ts": generateText(10),
      }),
    });

    await navigator.openFile("/path/to/file.ts");

    const excerpt = mb.excerpts[0];
    expect(excerpt?.metadata?.filePath).toBe("/path/to/file.ts");
  });

  test("opens multiple files in sequence", async () => {
    const mb = createMultiBuffer();
    const navigator = createFileNavigator(mb, {
      readFile: createMockFileReader({
        "/file1.ts": generateText(5),
        "/file2.ts": generateText(10),
        "/file3.ts": generateText(15),
      }),
    });

    const result1 = await navigator.openFile("/file1.ts");
    const result2 = await navigator.openFile("/file2.ts");
    const result3 = await navigator.openFile("/file3.ts");

    expect(mb.excerpts.length).toBe(3);
    expect(num(result1.startRow)).toBe(0);
    expect(num(result2.startRow)).toBe(5);
    expect(num(result3.startRow)).toBe(15); // 5 + 10
  });

  test("throws on file not found", async () => {
    const mb = createMultiBuffer();
    const navigator = createFileNavigator(mb, {
      readFile: createMockFileReader({}),
    });

    await expect(navigator.openFile("/nonexistent.ts")).rejects.toThrow(
      "File not found",
    );
  });

  test("accepts line option to navigate to specific line", async () => {
    const mb = createMultiBuffer();
    const navigator = createFileNavigator(mb, {
      readFile: createMockFileReader({
        "/path/to/file.ts": generateText(100),
      }),
    });

    const result = await navigator.openFile("/path/to/file.ts", { line: 42 });

    // The result should include the target row
    expect(result.targetRow).toBeDefined();
    // biome-ignore lint/style/noNonNullAssertion: expect: test assertion after toBeDefined check
    expect(num(result.targetRow!)).toBe(41); // 0-indexed, so line 42 = row 41
  });

  test("existing file returns cached info with line navigation", async () => {
    const mb = createMultiBuffer();
    let readCount = 0;
    const navigator = createFileNavigator(mb, {
      readFile: async (_path) => {
        readCount++;
        return generateText(100);
      },
    });

    await navigator.openFile("/path/to/file.ts");
    expect(readCount).toBe(1);

    // Opening again should NOT re-read the file
    await navigator.openFile("/path/to/file.ts", { line: 50 });
    expect(readCount).toBe(1);
    expect(mb.excerpts.length).toBe(1);
  });
});

describe("FileNavigator.getExcerptForFile", () => {
  test("returns null for non-existent file", () => {
    const mb = createMultiBuffer();
    const navigator = createFileNavigator(mb, {
      readFile: createMockFileReader({}),
    });

    expect(navigator.getExcerptForFile("/path/to/file.ts")).toBeNull();
  });

  test("returns excerpt info for opened file", async () => {
    const mb = createMultiBuffer();
    const navigator = createFileNavigator(mb, {
      readFile: createMockFileReader({
        "/path/to/file.ts": generateText(10),
      }),
    });

    await navigator.openFile("/path/to/file.ts");
    const info = navigator.getExcerptForFile("/path/to/file.ts");

    expect(info).not.toBeNull();
    // biome-ignore lint/style/noNonNullAssertion: expect: test assertions after toBeNull check
    expect(info!.excerptId).toBeDefined();
    // biome-ignore lint/style/noNonNullAssertion: expect: test assertions after toBeNull check
    expect(info!.bufferId).toBeDefined();
    // biome-ignore lint/style/noNonNullAssertion: expect: test assertions after toBeNull check
    expect(num(info!.startRow)).toBe(0);
    // biome-ignore lint/style/noNonNullAssertion: expect: test assertions after toBeNull check
    expect(num(info!.endRow)).toBe(10);
  });

  test("returns updated row info after another file is opened", async () => {
    const mb = createMultiBuffer();
    const navigator = createFileNavigator(mb, {
      readFile: createMockFileReader({
        "/file1.ts": generateText(5),
        "/file2.ts": generateText(10),
      }),
    });

    await navigator.openFile("/file1.ts");
    await navigator.openFile("/file2.ts");

    const info1 = navigator.getExcerptForFile("/file1.ts");
    const info2 = navigator.getExcerptForFile("/file2.ts");

    // biome-ignore lint/style/noNonNullAssertion: expect: test assertions after prior null checks
    expect(num(info1!.startRow)).toBe(0);
    // biome-ignore lint/style/noNonNullAssertion: expect: test assertions after prior null checks
    expect(num(info1!.endRow)).toBe(5);
    // biome-ignore lint/style/noNonNullAssertion: expect: test assertions after prior null checks
    expect(num(info2!.startRow)).toBe(5);
    // biome-ignore lint/style/noNonNullAssertion: expect: test assertions after prior null checks
    expect(num(info2!.endRow)).toBe(15);
  });
});

describe("FileNavigator.closeFile", () => {
  test("no-op for non-existent file", () => {
    const mb = createMultiBuffer();
    const navigator = createFileNavigator(mb, {
      readFile: createMockFileReader({}),
    });

    // Should not throw
    navigator.closeFile("/path/to/file.ts");
  });

  test("removes excerpt from multibuffer", async () => {
    const mb = createMultiBuffer();
    const navigator = createFileNavigator(mb, {
      readFile: createMockFileReader({
        "/path/to/file.ts": generateText(10),
      }),
    });

    await navigator.openFile("/path/to/file.ts");
    expect(mb.excerpts.length).toBe(1);

    navigator.closeFile("/path/to/file.ts");
    expect(mb.excerpts.length).toBe(0);
    expect(navigator.hasFile("/path/to/file.ts")).toBe(false);
  });

  test("only removes the specified file", async () => {
    const mb = createMultiBuffer();
    const navigator = createFileNavigator(mb, {
      readFile: createMockFileReader({
        "/file1.ts": generateText(5),
        "/file2.ts": generateText(10),
      }),
    });

    await navigator.openFile("/file1.ts");
    await navigator.openFile("/file2.ts");
    expect(mb.excerpts.length).toBe(2);

    navigator.closeFile("/file1.ts");
    expect(mb.excerpts.length).toBe(1);
    expect(navigator.hasFile("/file1.ts")).toBe(false);
    expect(navigator.hasFile("/file2.ts")).toBe(true);
  });

  test("file can be re-opened after closing", async () => {
    const mb = createMultiBuffer();
    const navigator = createFileNavigator(mb, {
      readFile: createMockFileReader({
        "/path/to/file.ts": generateText(10),
      }),
    });

    await navigator.openFile("/path/to/file.ts");
    navigator.closeFile("/path/to/file.ts");
    expect(navigator.hasFile("/path/to/file.ts")).toBe(false);

    await navigator.openFile("/path/to/file.ts");
    expect(navigator.hasFile("/path/to/file.ts")).toBe(true);
    expect(mb.excerpts.length).toBe(1);
  });
});

describe("FileNavigator.getOpenFiles", () => {
  test("returns empty array initially", () => {
    const mb = createMultiBuffer();
    const navigator = createFileNavigator(mb, {
      readFile: createMockFileReader({}),
    });

    expect(navigator.getOpenFiles()).toEqual([]);
  });

  test("returns all open file paths", async () => {
    const mb = createMultiBuffer();
    const navigator = createFileNavigator(mb, {
      readFile: createMockFileReader({
        "/file1.ts": generateText(5),
        "/file2.ts": generateText(10),
        "/file3.ts": generateText(15),
      }),
    });

    await navigator.openFile("/file1.ts");
    await navigator.openFile("/file2.ts");
    await navigator.openFile("/file3.ts");

    const files = navigator.getOpenFiles();
    expect(files).toHaveLength(3);
    expect(files).toContain("/file1.ts");
    expect(files).toContain("/file2.ts");
    expect(files).toContain("/file3.ts");
  });

  test("reflects closed files", async () => {
    const mb = createMultiBuffer();
    const navigator = createFileNavigator(mb, {
      readFile: createMockFileReader({
        "/file1.ts": generateText(5),
        "/file2.ts": generateText(10),
      }),
    });

    await navigator.openFile("/file1.ts");
    await navigator.openFile("/file2.ts");
    navigator.closeFile("/file1.ts");

    const files = navigator.getOpenFiles();
    expect(files).toHaveLength(1);
    expect(files).toContain("/file2.ts");
    expect(files).not.toContain("/file1.ts");
  });
});

describe("FileNavigator with custom buffer ID generator", () => {
  test("uses provided createBufferId function", async () => {
    const mb = createMultiBuffer();
    let idCounter = 0;
    const navigator = createFileNavigator(mb, {
      readFile: createMockFileReader({
        "/path/to/file.ts": generateText(10),
      }),
      createBufferId: () => {
        // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction in test
        return `custom-buffer-${++idCounter}` as BufferId;
      },
    });

    const result = await navigator.openFile("/path/to/file.ts");

    expect(result.bufferId).toMatch(/^custom-buffer-/);
  });
});

describe("FileNavigator edge cases", () => {
  test("handles empty file", async () => {
    const mb = createMultiBuffer();
    const navigator = createFileNavigator(mb, {
      readFile: createMockFileReader({
        "/empty.ts": "",
      }),
    });

    const result = await navigator.openFile("/empty.ts");
    expect(result.excerptId).toBeDefined();
    expect(num(result.startRow)).toBe(0);
  });

  test("handles file with trailing newline", async () => {
    const mb = createMultiBuffer();
    const navigator = createFileNavigator(mb, {
      readFile: createMockFileReader({
        "/trailing.ts": "line1\nline2\n",
      }),
    });

    const result = await navigator.openFile("/trailing.ts");
    expect(result.excerptId).toBeDefined();
  });

  test("handles unicode content", async () => {
    const mb = createMultiBuffer();
    const navigator = createFileNavigator(mb, {
      readFile: createMockFileReader({
        "/unicode.ts": "Hello\n世界\nПривет\n🎉",
      }),
    });

    const result = await navigator.openFile("/unicode.ts");
    expect(result.excerptId).toBeDefined();
    expect(mb.excerpts.length).toBe(1);
  });

  test("handles concurrent openFile calls for same file", async () => {
    const mb = createMultiBuffer();
    const navigator = createFileNavigator(mb, {
      readFile: async (_path) => {
        // Simulate async delay
        await new Promise((resolve) => setTimeout(resolve, 10));
        return generateText(10);
      },
    });

    // Start both opens concurrently
    const [result1, result2] = await Promise.all([
      navigator.openFile("/path/to/file.ts"),
      navigator.openFile("/path/to/file.ts"),
    ]);

    // Should only create one excerpt
    expect(mb.excerpts.length).toBe(1);
    // Both results should reference the same excerpt
    expect(result1.excerptId.index).toBe(result2.excerptId.index);
    expect(result1.excerptId.generation).toBe(result2.excerptId.generation);
  });
});
