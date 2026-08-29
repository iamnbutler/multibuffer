/**
 * Tests for the filesystem adapters.
 *
 * Every other test in `tests/project/` runs on `createMemoryFsAdapter`, so the
 * real-filesystem adapter — the one `createProjectTree` picks by default — has
 * no coverage of its own, and neither does the branch of `getErrorCode` that
 * reads a Node `code` property rather than an `"ECODE: "` message prefix.
 *
 * These tests exercise `createFsAdapter` against a temporary directory, and
 * then re-describe that same directory to `createMemoryFsAdapter` and assert
 * the two agree. The memory adapter is the fixture the rest of the project
 * suite is built on; pinning it to observed real-filesystem behaviour is what
 * keeps those tests meaningful.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createFsAdapter,
  createMemoryFsAdapter,
  createProjectTree,
  type FsAdapter,
  type FsDirEntry,
  getDefaultFsAdapter,
  type MemoryFsEntry,
  type ProjectEntry,
} from "../../src/project/index.ts";

/** File contents of the fixture tree, keyed by path relative to the root. */
const FIXTURE_FILES: Record<string, string> = {
  "README.md": "# fixture\n",
  "src/index.ts": "export const answer = 42;\n",
  "src/nested/deep.ts": "export {};\n",
};

/** Directories of the fixture tree, relative to the root. `empty` has no children. */
const FIXTURE_DIRS = ["src", "src/nested", "empty"];

const byteLength = (text: string): number =>
  new TextEncoder().encode(text).length;

/** Root of the temporary directory, assigned in `beforeAll`. */
let root = "";

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "multibuffer-adapter-"));
  for (const dir of FIXTURE_DIRS) {
    await mkdir(join(root, dir), { recursive: true });
  }
  for (const [path, content] of Object.entries(FIXTURE_FILES)) {
    await writeFile(join(root, path), content);
  }
});

afterAll(async () => {
  if (root !== "") {
    await rm(root, { recursive: true, force: true });
  }
});

/** Describe the fixture tree to the memory adapter using the same absolute paths. */
function memoryFixture(): FsAdapter {
  const files: Record<string, MemoryFsEntry> = {};
  for (const dir of FIXTURE_DIRS) {
    files[`${root}/${dir}`] = { type: "directory" };
  }
  for (const [path, content] of Object.entries(FIXTURE_FILES)) {
    files[`${root}/${path}`] = {
      type: "file",
      content,
      size: byteLength(content),
    };
  }
  return createMemoryFsAdapter(files);
}

/**
 * Sort directory entries into a stable order for comparison.
 *
 * Compares by code unit rather than `localeCompare` so the expected order does
 * not depend on the collation rules of whatever ICU build the runner ships.
 */
function sorted(entries: readonly FsDirEntry[]): FsDirEntry[] {
  return entries
    .map((entry) => ({ name: entry.name, isDirectory: entry.isDirectory }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** Sentinel returned when a call that was expected to reject resolved instead. */
const DID_NOT_REJECT = "<resolved>";

/**
 * Run `fn` and report the errno-style code of whatever it threw.
 *
 * Mirrors the lookup in `src/project/tree.ts`: a real Node error carries a
 * string `code` property, while the memory adapter encodes the code as an
 * `"ECODE: "` message prefix.
 */
async function rejectionCode(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (error) {
    if (!(error instanceof Error)) return "<not-an-error>";
    if ("code" in error && typeof error.code === "string") return error.code;
    return error.message.match(/^([A-Z]+):/)?.[1] ?? "<no-code>";
  }
  return DID_NOT_REJECT;
}

/** Collect the relative paths yielded by a project tree iterator. */
async function collectPaths(
  iterable: AsyncIterable<ProjectEntry>,
): Promise<string[]> {
  const paths: string[] = [];
  for await (const entry of iterable) {
    paths.push(entry.relativePath);
  }
  return paths;
}

describe("createFsAdapter", () => {
  test("readdir lists direct children and flags directories", async () => {
    const adapter = createFsAdapter();

    expect(sorted(await adapter.readdir(root))).toEqual([
      { name: "README.md", isDirectory: false },
      { name: "empty", isDirectory: true },
      { name: "src", isDirectory: true },
    ]);
    expect(sorted(await adapter.readdir(join(root, "src")))).toEqual([
      { name: "index.ts", isDirectory: false },
      { name: "nested", isDirectory: true },
    ]);
  });

  test("readdir returns an empty list for an empty directory", async () => {
    const adapter = createFsAdapter();

    expect(await adapter.readdir(join(root, "empty"))).toEqual([]);
  });

  test("readdir rejects with ENOENT for a missing path", async () => {
    const adapter = createFsAdapter();

    expect(
      await rejectionCode(() => adapter.readdir(join(root, "absent"))),
    ).toBe("ENOENT");
  });

  test("readdir rejects with ENOTDIR for a file", async () => {
    const adapter = createFsAdapter();

    // `createProjectTree.get()` distinguishes files from directories purely by
    // this code, so it is load-bearing rather than incidental.
    expect(
      await rejectionCode(() => adapter.readdir(join(root, "README.md"))),
    ).toBe("ENOTDIR");
  });

  test("stat reports the byte size and a real mtime", async () => {
    const adapter = createFsAdapter();
    expect(adapter.stat).toBeDefined();
    if (!adapter.stat) throw new Error("stat should be defined");

    const stat = await adapter.stat(join(root, "src/index.ts"));

    expect(stat.size).toBe(byteLength("export const answer = 42;\n"));
    expect(Number.isFinite(stat.mtime)).toBe(true);
    expect(stat.mtime).toBeGreaterThan(0);
  });

  test("stat succeeds on a directory", async () => {
    const adapter = createFsAdapter();
    if (!adapter.stat) throw new Error("stat should be defined");

    const stat = await adapter.stat(join(root, "src"));

    expect(stat.size).toBeGreaterThanOrEqual(0);
  });

  test("stat rejects with ENOENT for a missing path", async () => {
    const adapter = createFsAdapter();
    if (!adapter.stat) throw new Error("stat should be defined");
    const { stat } = adapter;

    expect(await rejectionCode(() => stat(join(root, "absent")))).toBe("ENOENT");
  });
});

describe("getDefaultFsAdapter", () => {
  test("returns an adapter backed by the real filesystem", async () => {
    const adapter = getDefaultFsAdapter();

    expect(adapter.stat).toBeDefined();
    expect(sorted(await adapter.readdir(join(root, "src")))).toEqual([
      { name: "index.ts", isDirectory: false },
      { name: "nested", isDirectory: true },
    ]);
  });
});

describe("createProjectTree without an explicit adapter", () => {
  test("enumerates a real directory tree", async () => {
    const tree = createProjectTree(root);

    expect((await collectPaths(tree.entries())).sort()).toEqual([
      "README.md",
      "empty",
      "src",
      "src/index.ts",
      "src/nested",
      "src/nested/deep.ts",
    ]);
  });

  test("applies include patterns to a real directory tree", async () => {
    const tree = createProjectTree(root, { include: ["**/*.ts"] });

    const files = (await collectPaths(tree.entries())).filter((path) =>
      path.endsWith(".ts"),
    );

    expect(files.sort()).toEqual(["src/index.ts", "src/nested/deep.ts"]);
  });

  test("get resolves a real file through the ENOTDIR path", async () => {
    const tree = createProjectTree(root);

    const entry = await tree.get("src/index.ts");

    expect(entry?.type).toBe("file");
    expect(entry?.name).toBe("index.ts");
  });

  test("get resolves a real directory", async () => {
    const tree = createProjectTree(root);

    const entry = await tree.get("src");

    expect(entry?.type).toBe("directory");
    expect(entry?.name).toBe("src");
  });

  test("get returns undefined for a missing path", async () => {
    const tree = createProjectTree(root);

    // Reaches `getErrorCode` with a real Node error, whose code lives on a
    // `code` property and not in the message.
    expect(await tree.get("absent.ts")).toBeUndefined();
    expect(await tree.has("absent.ts")).toBe(false);
  });

  test("includeMetadata reports real file sizes", async () => {
    const tree = createProjectTree(root, {
      include: ["**/*.md"],
      includeMetadata: true,
    });

    const entries: ProjectEntry[] = [];
    for await (const entry of tree.entries()) {
      if (entry.type === "file") entries.push(entry);
    }

    expect(entries).toHaveLength(1);
    const readme = entries[0];
    expect(readme?.type === "file" ? readme.size : undefined).toBe(
      byteLength("# fixture\n"),
    );
  });
});

describe("createMemoryFsAdapter matches the real filesystem", () => {
  const paths = () => [
    root,
    join(root, "src"),
    join(root, "src/nested"),
    join(root, "empty"),
  ];

  test("readdir agrees on every directory of the fixture", async () => {
    const real = createFsAdapter();
    const memory = memoryFixture();

    for (const path of paths()) {
      expect(sorted(await memory.readdir(path))).toEqual(
        sorted(await real.readdir(path)),
      );
    }
  });

  test("readdir agrees when a trailing slash is present", async () => {
    const real = createFsAdapter();
    const memory = memoryFixture();

    expect(sorted(await memory.readdir(`${root}/src/`))).toEqual(
      sorted(await real.readdir(`${root}/src/`)),
    );
  });

  test("readdir agrees on the rejection code for missing paths and files", async () => {
    const real = createFsAdapter();
    const memory = memoryFixture();

    for (const path of [join(root, "absent"), join(root, "README.md")]) {
      expect(await rejectionCode(() => memory.readdir(path))).toBe(
        await rejectionCode(() => real.readdir(path)),
      );
    }
  });

  test("stat agrees on file sizes", async () => {
    const real = createFsAdapter();
    const memory = memoryFixture();
    if (!real.stat || !memory.stat) throw new Error("stat should be defined");
    const realStat = real.stat;
    const memoryStat = memory.stat;

    for (const path of Object.keys(FIXTURE_FILES)) {
      const absolute = join(root, path);
      expect((await memoryStat(absolute)).size).toBe(
        (await realStat(absolute)).size,
      );
    }
  });

  test("stat agrees on the rejection code for a missing path", async () => {
    const real = createFsAdapter();
    const memory = memoryFixture();
    if (!real.stat || !memory.stat) throw new Error("stat should be defined");
    const realStat = real.stat;
    const memoryStat = memory.stat;
    const absent = join(root, "absent");

    expect(await rejectionCode(() => memoryStat(absent))).toBe(
      await rejectionCode(() => realStat(absent)),
    );
  });

  test("createProjectTree yields the same entries on both adapters", async () => {
    const realPaths = await collectPaths(createProjectTree(root).entries());
    const memoryPaths = await collectPaths(
      createProjectTree(root, { adapter: memoryFixture() }).entries(),
    );

    expect(memoryPaths).toEqual(realPaths);
  });
});
