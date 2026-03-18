/**
 * Tests for patch parsing and MultiBuffer creation from unified diff patches.
 *
 * Covers:
 * - Single-file patches
 * - Multi-file patches
 * - Rename detection
 * - Binary file markers
 * - Empty hunks
 * - Edge cases (new files, deleted files, etc.)
 */

import { describe, expect, test } from "bun:test";
import {
  createMultiBufferFromPatch,
  createMultiBuffersFromDiff,
  parsePatch,
} from "../../src/diff/patch.ts";
import { num } from "../helpers.ts";

// ============================================================================
// Test fixtures
// ============================================================================

const SINGLE_FILE_PATCH = `diff --git a/src/app.ts b/src/app.ts
index abc123..def456 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,5 +1,6 @@
 import { foo } from "bar";

-const oldValue = 42;
+const newValue = 100;
+const extraLine = true;

 export function main() {
`;

const MULTI_FILE_PATCH = `diff --git a/file1.ts b/file1.ts
index aaa..bbb 100644
--- a/file1.ts
+++ b/file1.ts
@@ -1,3 +1,3 @@
 line 1
-old line 2
+new line 2
 line 3
diff --git a/file2.ts b/file2.ts
index ccc..ddd 100644
--- a/file2.ts
+++ b/file2.ts
@@ -1,2 +1,3 @@
 first line
+added line
 last line
`;

const NEW_FILE_PATCH = `diff --git a/newfile.ts b/newfile.ts
new file mode 100644
index 0000000..abc1234
--- /dev/null
+++ b/newfile.ts
@@ -0,0 +1,3 @@
+line 1
+line 2
+line 3
`;

const DELETED_FILE_PATCH = `diff --git a/oldfile.ts b/oldfile.ts
deleted file mode 100644
index abc1234..0000000
--- a/oldfile.ts
+++ /dev/null
@@ -1,3 +0,0 @@
-line 1
-line 2
-line 3
`;

const RENAME_PATCH = `diff --git a/old-name.ts b/new-name.ts
similarity index 95%
rename from old-name.ts
rename to new-name.ts
index abc123..def456 100644
--- a/old-name.ts
+++ b/new-name.ts
@@ -1,3 +1,3 @@
 unchanged line
-old content
+new content
 another unchanged
`;

const BINARY_FILE_PATCH = `diff --git a/image.png b/image.png
index abc123..def456 100644
Binary files a/image.png and b/image.png differ
`;

const MULTIPLE_HUNKS_PATCH = `diff --git a/large-file.ts b/large-file.ts
index abc123..def456 100644
--- a/large-file.ts
+++ b/large-file.ts
@@ -1,5 +1,5 @@
 header line
-old first section
+new first section
 middle content
 more middle
 still middle
@@ -10,5 +10,6 @@
 section two start
-old second content
+new second content
+extra line here
 section two end
 footer content
 final line
`;

const CONTEXT_ONLY_PATCH = `diff --git a/unchanged.ts b/unchanged.ts
similarity index 100%
rename from old-unchanged.ts
rename to unchanged.ts
`;

const TRADITIONAL_DIFF = `--- old.txt
+++ new.txt
@@ -1,3 +1,4 @@
 line one
+inserted line
 line two
 line three
`;

const PATCH_WITH_FUNCTION_CONTEXT = `diff --git a/src/utils.ts b/src/utils.ts
index abc123..def456 100644
--- a/src/utils.ts
+++ b/src/utils.ts
@@ -10,6 +10,7 @@ function calculateSum(a: number, b: number) {
   const result = a + b;
-  return result;
+  console.log("Sum:", result);
+  return result;
 }

 export { calculateSum };
`;

// ============================================================================
// parsePatch tests
// ============================================================================

describe("parsePatch - single file", () => {
  test("parses single file patch with additions and deletions", () => {
    const result = parsePatch(SINGLE_FILE_PATCH);
    expect(result.files.length).toBe(1);

    const file = result.files[0];
    expect(file).toBeDefined();
    if (!file) return;

    expect(file.oldPath).toBe("src/app.ts");
    expect(file.newPath).toBe("src/app.ts");
    expect(file.status).toBe("modified");
    expect(file.isBinary).toBe(false);
    expect(file.hunks.length).toBe(1);

    const hunk = file.hunks[0];
    expect(hunk).toBeDefined();
    if (!hunk) return;

    expect(hunk.oldStart).toBe(1);
    expect(hunk.oldCount).toBe(5);
    expect(hunk.newStart).toBe(1);
    expect(hunk.newCount).toBe(6);

    // Check line kinds
    const kinds = hunk.lines.map(l => l.kind);
    expect(kinds).toContain("context");
    expect(kinds).toContain("delete");
    expect(kinds).toContain("add");
  });

  test("parses new file", () => {
    const result = parsePatch(NEW_FILE_PATCH);
    expect(result.files.length).toBe(1);

    const file = result.files[0];
    expect(file).toBeDefined();
    if (!file) return;

    expect(file.newPath).toBe("newfile.ts");
    expect(file.status).toBe("added");
    expect(file.hunks.length).toBe(1);

    const hunk = file.hunks[0];
    expect(hunk).toBeDefined();
    if (!hunk) return;

    // All lines should be additions
    expect(hunk.lines.every(l => l.kind === "add")).toBe(true);
  });

  test("parses deleted file", () => {
    const result = parsePatch(DELETED_FILE_PATCH);
    expect(result.files.length).toBe(1);

    const file = result.files[0];
    expect(file).toBeDefined();
    if (!file) return;

    expect(file.oldPath).toBe("oldfile.ts");
    expect(file.status).toBe("deleted");
    expect(file.hunks.length).toBe(1);

    const hunk = file.hunks[0];
    expect(hunk).toBeDefined();
    if (!hunk) return;

    // All lines should be deletions
    expect(hunk.lines.every(l => l.kind === "delete")).toBe(true);
  });

  test("parses rename with content changes", () => {
    const result = parsePatch(RENAME_PATCH);
    expect(result.files.length).toBe(1);

    const file = result.files[0];
    expect(file).toBeDefined();
    if (!file) return;

    expect(file.oldPath).toBe("old-name.ts");
    expect(file.newPath).toBe("new-name.ts");
    expect(file.status).toBe("renamed");
    expect(file.similarity).toBe(95);
  });

  test("parses binary file marker", () => {
    const result = parsePatch(BINARY_FILE_PATCH);
    expect(result.files.length).toBe(1);

    const file = result.files[0];
    expect(file).toBeDefined();
    if (!file) return;

    expect(file.oldPath).toBe("image.png");
    expect(file.newPath).toBe("image.png");
    expect(file.isBinary).toBe(true);
    expect(file.status).toBe("binary");
    expect(file.hunks.length).toBe(0);
  });

  test("parses multiple hunks in single file", () => {
    const result = parsePatch(MULTIPLE_HUNKS_PATCH);
    expect(result.files.length).toBe(1);

    const file = result.files[0];
    expect(file).toBeDefined();
    if (!file) return;

    expect(file.hunks.length).toBe(2);

    const hunk1 = file.hunks[0];
    const hunk2 = file.hunks[1];
    expect(hunk1?.oldStart).toBe(1);
    expect(hunk2?.oldStart).toBe(10);
  });

  test("parses function context in hunk header", () => {
    const result = parsePatch(PATCH_WITH_FUNCTION_CONTEXT);
    expect(result.files.length).toBe(1);

    const file = result.files[0];
    expect(file).toBeDefined();
    if (!file) return;

    const hunk = file.hunks[0];
    expect(hunk).toBeDefined();
    if (!hunk) return;

    expect(hunk.header).toBe("function calculateSum(a: number, b: number) {");
  });
});

describe("parsePatch - multi file", () => {
  test("parses multiple files in single patch", () => {
    const result = parsePatch(MULTI_FILE_PATCH);
    expect(result.files.length).toBe(2);

    const file1 = result.files[0];
    const file2 = result.files[1];

    expect(file1?.newPath).toBe("file1.ts");
    expect(file2?.newPath).toBe("file2.ts");

    expect(file1?.hunks.length).toBe(1);
    expect(file2?.hunks.length).toBe(1);
  });
});

describe("parsePatch - traditional unified diff", () => {
  test("parses traditional diff without git prefix", () => {
    const result = parsePatch(TRADITIONAL_DIFF);
    expect(result.files.length).toBe(1);

    const file = result.files[0];
    expect(file).toBeDefined();
    if (!file) return;

    expect(file.oldPath).toBe("old.txt");
    expect(file.newPath).toBe("new.txt");
    expect(file.hunks.length).toBe(1);
  });
});

describe("parsePatch - edge cases", () => {
  test("handles empty patch string", () => {
    const result = parsePatch("");
    expect(result.files.length).toBe(0);
  });

  test("handles patch with only whitespace", () => {
    const result = parsePatch("   \n\n   \n");
    expect(result.files.length).toBe(0);
  });

  test("handles rename with no content changes", () => {
    const result = parsePatch(CONTEXT_ONLY_PATCH);
    expect(result.files.length).toBe(1);

    const file = result.files[0];
    expect(file).toBeDefined();
    if (!file) return;

    expect(file.status).toBe("renamed");
    expect(file.hunks.length).toBe(0);
  });
});

// ============================================================================
// createMultiBufferFromPatch tests
// ============================================================================

describe("createMultiBufferFromPatch - basic", () => {
  test("creates MultiBuffer from single file patch", () => {
    const result = createMultiBufferFromPatch(SINGLE_FILE_PATCH);

    expect(result.filename).toBe("src/app.ts");
    expect(result.status).toBe("modified");
    expect(result.isBinary).toBe(false);
    expect(result.multiBuffer.lineCount).toBeGreaterThan(0);
    expect(result.decorations.length).toBeGreaterThan(0);
  });

  test("filename option overrides parsed filename", () => {
    const result = createMultiBufferFromPatch(SINGLE_FILE_PATCH, {
      filename: "custom.ts",
    });

    expect(result.filename).toBe("custom.ts");
  });

  test("handles empty patch", () => {
    const result = createMultiBufferFromPatch("");

    expect(result.filename).toBe("unknown");
    expect(result.multiBuffer.lineCount).toBe(0);
    expect(result.decorations.length).toBe(0);
  });
});

describe("createMultiBufferFromPatch - decorations", () => {
  test("deletions have delete decoration style", () => {
    const result = createMultiBufferFromPatch(SINGLE_FILE_PATCH);

    const deleteDecorations = result.decorations.filter(
      d => d.style?.gutterSign === "\u2212"
    );
    expect(deleteDecorations.length).toBeGreaterThan(0);
  });

  test("additions have insert decoration style", () => {
    const result = createMultiBufferFromPatch(SINGLE_FILE_PATCH);

    const insertDecorations = result.decorations.filter(
      d => d.style?.gutterSign === "+"
    );
    expect(insertDecorations.length).toBeGreaterThan(0);
  });

  test("context lines have no decorations", () => {
    const result = createMultiBufferFromPatch(SINGLE_FILE_PATCH);

    // Total lines should be more than decorated lines (context has no decoration)
    const decoratedRows = new Set<number>();
    for (const dec of result.decorations) {
      for (let r = num(dec.range.start.row); r <= num(dec.range.end.row); r++) {
        decoratedRows.add(r);
      }
    }

    expect(decoratedRows.size).toBeLessThan(result.multiBuffer.lineCount);
  });
});

describe("createMultiBufferFromPatch - file status", () => {
  test("new file has 'added' status", () => {
    const result = createMultiBufferFromPatch(NEW_FILE_PATCH);
    expect(result.status).toBe("added");
    expect(result.filename).toBe("newfile.ts");
  });

  test("deleted file has 'deleted' status", () => {
    const result = createMultiBufferFromPatch(DELETED_FILE_PATCH);
    expect(result.status).toBe("deleted");
    expect(result.filename).toBe("oldfile.ts");
  });

  test("renamed file has 'renamed' status and oldFilename", () => {
    const result = createMultiBufferFromPatch(RENAME_PATCH);
    expect(result.status).toBe("renamed");
    expect(result.filename).toBe("new-name.ts");
    expect(result.oldFilename).toBe("old-name.ts");
  });

  test("binary file has 'binary' status and isBinary true", () => {
    const result = createMultiBufferFromPatch(BINARY_FILE_PATCH);
    expect(result.status).toBe("binary");
    expect(result.isBinary).toBe(true);
    expect(result.multiBuffer.lineCount).toBe(0);
  });
});

describe("createMultiBufferFromPatch - line content", () => {
  test("MultiBuffer contains correct line content", () => {
    const result = createMultiBufferFromPatch(SINGLE_FILE_PATCH);
    const snapshot = result.multiBuffer.snapshot();

    // biome-ignore lint/plugin/no-type-assertion: expect: branded type conversion for test
    const lines = snapshot.lines(0 as import("../../src/multibuffer/types.ts").MultiBufferRow, result.multiBuffer.lineCount as import("../../src/multibuffer/types.ts").MultiBufferRow);

    // Should contain the import line (context)
    expect(lines.some(l => l.includes('import { foo }'))).toBe(true);

    // Should contain the old value (deletion) or new value (addition)
    const hasOldOrNew = lines.some(l =>
      l.includes('oldValue') || l.includes('newValue')
    );
    expect(hasOldOrNew).toBe(true);
  });

  test("all lines from new file patch are additions", () => {
    const result = createMultiBufferFromPatch(NEW_FILE_PATCH);

    // All decorations should be inserts
    expect(result.decorations.every(d => d.style?.gutterSign === "+")).toBe(true);
    expect(result.decorations.length).toBe(3); // 3 lines added
  });

  test("all lines from deleted file patch are deletions", () => {
    const result = createMultiBufferFromPatch(DELETED_FILE_PATCH);

    // All decorations should be deletes
    expect(result.decorations.every(d => d.style?.gutterSign === "\u2212")).toBe(true);
    expect(result.decorations.length).toBe(3); // 3 lines deleted
  });
});

describe("createMultiBufferFromPatch - excerpts are read-only", () => {
  test("all excerpts are non-editable", () => {
    const result = createMultiBufferFromPatch(SINGLE_FILE_PATCH);
    const excerpts = result.multiBuffer.snapshot().excerpts;

    expect(excerpts.every(e => e.editable === false)).toBe(true);
  });
});

// ============================================================================
// createMultiBuffersFromDiff tests
// ============================================================================

describe("createMultiBuffersFromDiff - multi file", () => {
  test("creates one result per file", () => {
    const results = createMultiBuffersFromDiff(MULTI_FILE_PATCH);

    expect(results.length).toBe(2);
    expect(results[0]?.filename).toBe("file1.ts");
    expect(results[1]?.filename).toBe("file2.ts");
  });

  test("each file has independent MultiBuffer", () => {
    const results = createMultiBuffersFromDiff(MULTI_FILE_PATCH);

    const mb1 = results[0]?.multiBuffer;
    const mb2 = results[1]?.multiBuffer;

    expect(mb1).toBeDefined();
    expect(mb2).toBeDefined();
    expect(mb1).not.toBe(mb2);
  });

  test("handles mixed file types in single diff", () => {
    const mixedPatch = `${SINGLE_FILE_PATCH}\n${BINARY_FILE_PATCH}`;
    const results = createMultiBuffersFromDiff(mixedPatch);

    expect(results.length).toBe(2);

    const textFile = results.find(r => r.filename === "src/app.ts");
    const binaryFile = results.find(r => r.filename === "image.png");

    expect(textFile?.isBinary).toBe(false);
    expect(binaryFile?.isBinary).toBe(true);
  });
});

describe("createMultiBuffersFromDiff - empty and edge cases", () => {
  test("empty patch returns empty array", () => {
    const results = createMultiBuffersFromDiff("");
    expect(results.length).toBe(0);
  });

  test("single file patch returns single result", () => {
    const results = createMultiBuffersFromDiff(SINGLE_FILE_PATCH);
    expect(results.length).toBe(1);
  });
});

// ============================================================================
// Line number tracking tests
// ============================================================================

describe("patch line numbers", () => {
  test("context lines have both old and new line numbers", () => {
    const result = parsePatch(SINGLE_FILE_PATCH);
    const hunk = result.files[0]?.hunks[0];
    expect(hunk).toBeDefined();
    if (!hunk) return;

    const contextLines = hunk.lines.filter(l => l.kind === "context");
    for (const line of contextLines) {
      expect(line.oldLineNumber).toBeDefined();
      expect(line.newLineNumber).toBeDefined();
    }
  });

  test("deletions have only old line numbers", () => {
    const result = parsePatch(SINGLE_FILE_PATCH);
    const hunk = result.files[0]?.hunks[0];
    expect(hunk).toBeDefined();
    if (!hunk) return;

    const deleteLines = hunk.lines.filter(l => l.kind === "delete");
    for (const line of deleteLines) {
      expect(line.oldLineNumber).toBeDefined();
      expect(line.newLineNumber).toBeUndefined();
    }
  });

  test("additions have only new line numbers", () => {
    const result = parsePatch(SINGLE_FILE_PATCH);
    const hunk = result.files[0]?.hunks[0];
    expect(hunk).toBeDefined();
    if (!hunk) return;

    const addLines = hunk.lines.filter(l => l.kind === "add");
    for (const line of addLines) {
      expect(line.oldLineNumber).toBeUndefined();
      expect(line.newLineNumber).toBeDefined();
    }
  });

  test("line numbers are sequential within hunk", () => {
    const result = parsePatch(SINGLE_FILE_PATCH);
    const hunk = result.files[0]?.hunks[0];
    expect(hunk).toBeDefined();
    if (!hunk) return;

    let expectedOld = hunk.oldStart;
    let expectedNew = hunk.newStart;

    for (const line of hunk.lines) {
      if (line.kind === "context" || line.kind === "delete") {
        expect(line.oldLineNumber).toBe(expectedOld);
        expectedOld++;
      }
      if (line.kind === "context" || line.kind === "add") {
        expect(line.newLineNumber).toBe(expectedNew);
        expectedNew++;
      }
    }
  });
});

// ============================================================================
// Real-world git diff format tests
// ============================================================================

describe("real-world git diff formats", () => {
  test("handles no newline at end of file marker", () => {
    const patchWithNoNewline = `diff --git a/file.txt b/file.txt
index abc..def 100644
--- a/file.txt
+++ b/file.txt
@@ -1,2 +1,2 @@
 line one
-old last line
\\ No newline at end of file
+new last line
\\ No newline at end of file
`;

    const result = parsePatch(patchWithNoNewline);
    expect(result.files.length).toBe(1);

    const file = result.files[0];
    expect(file).toBeDefined();
    if (!file) return;

    // The "\ No newline" markers should be skipped, not treated as content
    const hunk = file.hunks[0];
    expect(hunk).toBeDefined();
    if (!hunk) return;

    const lines = hunk.lines;
    expect(lines.some(l => l.content.includes("No newline"))).toBe(false);
  });

  test("handles copy detection", () => {
    const copyPatch = `diff --git a/src/original.ts b/src/copied.ts
similarity index 85%
copy from src/original.ts
copy to src/copied.ts
index abc..def 100644
--- a/src/original.ts
+++ b/src/copied.ts
@@ -1,3 +1,3 @@
 shared content
-original line
+copied line
 more shared
`;

    const result = parsePatch(copyPatch);
    expect(result.files.length).toBe(1);

    const file = result.files[0];
    expect(file).toBeDefined();
    if (!file) return;

    expect(file.status).toBe("copied");
    expect(file.oldPath).toBe("src/original.ts");
    expect(file.newPath).toBe("src/copied.ts");
    expect(file.similarity).toBe(85);
  });

  test("handles mode change lines", () => {
    const modeChangePatch = `diff --git a/script.sh b/script.sh
old mode 100644
new mode 100755
index abc..def
--- a/script.sh
+++ b/script.sh
@@ -1 +1 @@
-echo "old"
+echo "new"
`;

    const result = parsePatch(modeChangePatch);
    expect(result.files.length).toBe(1);
    expect(result.files[0]?.hunks.length).toBe(1);
  });
});
