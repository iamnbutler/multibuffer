/**
 * ExcerptMetadata tests - written BEFORE implementation (TDD).
 *
 * Tests for the excerpt metadata API that allows consumers to attach
 * filePath, language, isModified, and custom fields to excerpts.
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { createBuffer } from "../../src/buffer/buffer.ts";
import { createMultiBuffer } from "../../src/multibuffer/multibuffer.ts";
import type { ExcerptMetadata } from "../../src/multibuffer/types.ts";
import {
  createBufferId,
  excerptRange,
  generateText,
  resetCounters,
} from "../helpers.ts";

beforeEach(() => {
  resetCounters();
});


describe("ExcerptMetadata - addExcerpt", () => {
  test("metadata passed through addExcerpt is visible in ExcerptInfo", () => {
    const mb = createMultiBuffer();
    const buffer = createBuffer(createBufferId(), generateText(10));
    const metadata: ExcerptMetadata = {
      filePath: "/src/foo.ts",
      language: "typescript",
      isModified: false,
    };

    mb.addExcerpt(buffer, excerptRange(0, 10), { metadata });

    const info = mb.excerpts[0];
    expect(info?.metadata).toEqual(metadata);
  });

  test("metadata is undefined when not provided", () => {
    const mb = createMultiBuffer();
    const buffer = createBuffer(createBufferId(), generateText(10));

    mb.addExcerpt(buffer, excerptRange(0, 10));

    const info = mb.excerpts[0];
    expect(info?.metadata).toBeUndefined();
  });

  test("metadata supports custom properties via index signature", () => {
    const mb = createMultiBuffer();
    const buffer = createBuffer(createBufferId(), generateText(10));
    const metadata: ExcerptMetadata = {
      filePath: "/src/bar.ts",
      customField: "custom value",
      nestedObject: { key: "value" },
    };

    mb.addExcerpt(buffer, excerptRange(0, 10), { metadata });

    const info = mb.excerpts[0];
    expect(info?.metadata?.filePath).toBe("/src/bar.ts");
    expect(info?.metadata?.customField).toBe("custom value");
    expect(info?.metadata?.nestedObject).toEqual({ key: "value" });
  });
});


describe("ExcerptMetadata - addExcerpts (batch)", () => {
  test("metadata passed through addExcerpts is visible in ExcerptInfo", () => {
    const mb = createMultiBuffer();
    const buffer = createBuffer(createBufferId(), generateText(20));
    const metadata1: ExcerptMetadata = { filePath: "/a.ts", language: "ts" };
    const metadata2: ExcerptMetadata = { filePath: "/b.ts", language: "js" };

    mb.addExcerpts([
      { buffer, range: excerptRange(0, 10), options: { metadata: metadata1 } },
      { buffer, range: excerptRange(10, 20), options: { metadata: metadata2 } },
    ]);

    expect(mb.excerpts[0]?.metadata).toEqual(metadata1);
    expect(mb.excerpts[1]?.metadata).toEqual(metadata2);
  });

  test("mixed batch with some excerpts having metadata", () => {
    const mb = createMultiBuffer();
    const buffer = createBuffer(createBufferId(), generateText(30));
    const metadata: ExcerptMetadata = { filePath: "/only-this-one.ts" };

    mb.addExcerpts([
      { buffer, range: excerptRange(0, 10), options: { metadata } },
      { buffer, range: excerptRange(10, 20) },
      { buffer, range: excerptRange(20, 30), options: {} },
    ]);

    expect(mb.excerpts[0]?.metadata).toEqual(metadata);
    expect(mb.excerpts[1]?.metadata).toBeUndefined();
    expect(mb.excerpts[2]?.metadata).toBeUndefined();
  });
});


describe("ExcerptMetadata - setExcerpts", () => {
  test("metadata passed through setExcerpts is visible in ExcerptInfo", () => {
    const mb = createMultiBuffer();
    const buffer = createBuffer(createBufferId(), generateText(10));

    // First add without metadata
    mb.addExcerpt(buffer, excerptRange(0, 5));

    // Replace with setExcerpts including metadata
    const metadata: ExcerptMetadata = { filePath: "/replaced.ts", isModified: true };
    mb.setExcerpts([{ buffer, range: excerptRange(0, 10), options: { metadata } }]);

    expect(mb.excerpts.length).toBe(1);
    expect(mb.excerpts[0]?.metadata).toEqual(metadata);
  });
});


describe("ExcerptMetadata - updateExcerptMetadata", () => {
  test("partial merge via updateExcerptMetadata", () => {
    const mb = createMultiBuffer();
    const buffer = createBuffer(createBufferId(), generateText(10));
    const initialMetadata: ExcerptMetadata = {
      filePath: "/src/foo.ts",
      language: "typescript",
      isModified: false,
    };

    const id = mb.addExcerpt(buffer, excerptRange(0, 10), { metadata: initialMetadata });

    // Update only isModified
    mb.updateExcerptMetadata(id, { isModified: true });

    const info = mb.excerpts[0];
    expect(info?.metadata?.filePath).toBe("/src/foo.ts");
    expect(info?.metadata?.language).toBe("typescript");
    expect(info?.metadata?.isModified).toBe(true);
  });

  test("updateExcerptMetadata adds metadata to excerpt without metadata", () => {
    const mb = createMultiBuffer();
    const buffer = createBuffer(createBufferId(), generateText(10));

    const id = mb.addExcerpt(buffer, excerptRange(0, 10));
    expect(mb.excerpts[0]?.metadata).toBeUndefined();

    mb.updateExcerptMetadata(id, { filePath: "/new-path.ts" });

    expect(mb.excerpts[0]?.metadata?.filePath).toBe("/new-path.ts");
  });

  test("updateExcerptMetadata is no-op for non-existent excerpt", () => {
    const mb = createMultiBuffer();
    const buffer = createBuffer(createBufferId(), generateText(10));
    const id = mb.addExcerpt(buffer, excerptRange(0, 10));

    // Remove the excerpt
    mb.removeExcerpt(id);

    // Should not throw
    expect(() => mb.updateExcerptMetadata(id, { filePath: "/foo.ts" })).not.toThrow();
  });

  test("updateExcerptMetadata can add custom properties", () => {
    const mb = createMultiBuffer();
    const buffer = createBuffer(createBufferId(), generateText(10));

    const id = mb.addExcerpt(buffer, excerptRange(0, 10), {
      metadata: { filePath: "/foo.ts" },
    });

    mb.updateExcerptMetadata(id, { customTag: "important", priority: 1 });

    const info = mb.excerpts[0];
    expect(info?.metadata?.filePath).toBe("/foo.ts");
    expect(info?.metadata?.customTag).toBe("important");
    expect(info?.metadata?.priority).toBe(1);
  });
});


describe("ExcerptMetadata - preservation through operations", () => {
  test("metadata preserved through expandExcerpt", () => {
    const mb = createMultiBuffer();
    const buffer = createBuffer(createBufferId(), generateText(20));
    const metadata: ExcerptMetadata = {
      filePath: "/expand-test.ts",
      language: "typescript",
    };

    const id = mb.addExcerpt(buffer, excerptRange(5, 15), { metadata });

    // Expand the excerpt
    mb.expandExcerpt(id, 3, 3);

    const info = mb.excerpts[0];
    // Metadata should be preserved
    expect(info?.metadata).toEqual(metadata);
    // Range should be expanded
    expect(info?.range.context.start.row).toBe(2);
    expect(info?.range.context.end.row).toBe(18);
  });

  test("metadata preserved through buffer edits (_refreshExcerptsForBuffer)", () => {
    const mb = createMultiBuffer();
    const buffer = createBuffer(createBufferId(), generateText(10));
    const metadata: ExcerptMetadata = {
      filePath: "/edit-test.ts",
      isModified: false,
    };

    mb.addExcerpt(buffer, excerptRange(0, 10), { metadata });

    // Edit the buffer through the multibuffer
    mb.edit({ row: 0, column: 0 } as import("../../src/multibuffer/types.ts").MultiBufferPoint, { row: 0, column: 0 } as import("../../src/multibuffer/types.ts").MultiBufferPoint, "new text");

    const info = mb.excerpts[0];
    expect(info?.metadata).toEqual(metadata);
  });
});


describe("ExcerptMetadata - snapshot", () => {
  test("metadata visible in snapshot excerpts", () => {
    const mb = createMultiBuffer();
    const buffer = createBuffer(createBufferId(), generateText(10));
    const metadata: ExcerptMetadata = { filePath: "/snapshot.ts" };

    mb.addExcerpt(buffer, excerptRange(0, 10), { metadata });

    const snapshot = mb.snapshot();
    expect(snapshot.excerpts[0]?.metadata).toEqual(metadata);
  });

  test("snapshot reflects metadata updates", () => {
    const mb = createMultiBuffer();
    const buffer = createBuffer(createBufferId(), generateText(10));

    const id = mb.addExcerpt(buffer, excerptRange(0, 10), {
      metadata: { filePath: "/old.ts" },
    });

    const snap1 = mb.snapshot();
    expect(snap1.excerpts[0]?.metadata?.filePath).toBe("/old.ts");

    mb.updateExcerptMetadata(id, { filePath: "/new.ts" });

    const snap2 = mb.snapshot();
    expect(snap2.excerpts[0]?.metadata?.filePath).toBe("/new.ts");

    // Original snapshot should still have old value (immutability)
    expect(snap1.excerpts[0]?.metadata?.filePath).toBe("/old.ts");
  });
});


describe("ExcerptMetadata - version tracking", () => {
  test("updateExcerptMetadata increments version", () => {
    const mb = createMultiBuffer();
    const buffer = createBuffer(createBufferId(), generateText(10));
    const id = mb.addExcerpt(buffer, excerptRange(0, 10));

    const snap1 = mb.snapshot();
    const v1 = snap1.version;

    mb.updateExcerptMetadata(id, { filePath: "/foo.ts" });

    const snap2 = mb.snapshot();
    expect(snap2.version).toBeGreaterThan(v1);
  });
});
