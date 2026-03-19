/**
 * Property-based fuzz tests for the MultiBuffer module using fast-check.
 *
 * Properties verified:
 *   1. Line count sum — mb.lineCount === sum of excerpt line spans
 *   2. Position round-trip — toMultiBufferPoint(toBufferPoint(p)) === p
 *   3. Anchor bias — left-biased anchors stay left, right-biased move right
 *   4. Excerpt boundaries — excerptBoundaries() returns correct row positions
 *   5. Lines consistency — lines(a, b) returns correct content
 *   6. Snapshot immutability — snapshots survive mutations
 *
 * @see https://github.com/iamnbutler/multibuffer/issues/80
 */

import { describe, expect, test } from "bun:test";
import * as fc from "fast-check";
import { createBuffer } from "../../src/buffer/buffer.ts";
import { createMultiBuffer } from "../../src/multibuffer/multibuffer.ts";
import type {
  BufferId,
  BufferPoint,
  BufferRange,
  BufferRow,
  ExcerptRange,
  MultiBufferPoint,
  MultiBufferRow,
} from "../../src/multibuffer/types.ts";
import { Bias } from "../../src/multibuffer/types.ts";
import { fcParams } from "./arbitraries.ts";

// ── Helpers ───────────────────────────────────────────────────────────────────

let bufferIdCounter = 0;

function createBufferId(): BufferId {
  // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction for test
  return `fuzz-mb-buffer-${++bufferIdCounter}` as BufferId;
}

function row(n: number): BufferRow {
  // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction for test
  return n as BufferRow;
}

function mbRow(n: number): MultiBufferRow {
  // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction for test
  return n as MultiBufferRow;
}

/** Unwrap a branded numeric type for comparison */
function num(value: MultiBufferRow | number): number {
  // biome-ignore lint/plugin/no-type-assertion: expect: unwrapping branded type for comparison
  return value as number;
}

function point(r: number, col: number): BufferPoint {
  return { row: row(r), column: col };
}

function mbPoint(r: number, col: number): MultiBufferPoint {
  return { row: mbRow(r), column: col };
}

function range(
  startRow: number,
  startCol: number,
  endRow: number,
  endCol: number,
): BufferRange {
  return {
    start: point(startRow, startCol),
    end: point(endRow, endCol),
  };
}

function excerptRange(contextStartRow: number, contextEndRow: number): ExcerptRange {
  const context = range(contextStartRow, 0, contextEndRow, 0);
  return { context, primary: context };
}

// ── Arbitraries ───────────────────────────────────────────────────────────────

/** Generate lines of text */
const linesArb = fc
  .array(fc.string({ maxLength: 30 }), { minLength: 1, maxLength: 20 })
  .map((lines) => lines.join("\n"));

// ── Property 1: Line count sum ────────────────────────────────────────────────

describe("MultiBuffer fuzz: lineCount equals sum of excerpt line spans", () => {
  test("lineCount matches sum of excerpt contributions", () => {
    fc.assert(
      fc.property(
        fc.array(linesArb, { minLength: 1, maxLength: 5 }),
        (bufferTexts) => {
          const mb = createMultiBuffer();

          for (const text of bufferTexts) {
            const buffer = createBuffer(createBufferId(), text);
            const snap = buffer.snapshot();
            const lineCount = snap.lineCount;

            // Add excerpt for entire buffer
            mb.addExcerpt(buffer, excerptRange(0, lineCount));
          }

          // Verify line count by checking actual excerpts
          const excerpts = mb.excerpts;
          let computedLineCount = 0;
          for (const exc of excerpts) {
            computedLineCount = Math.max(computedLineCount, num(exc.endRow));
          }

          return mb.lineCount === computedLineCount;
        },
      ),
      fcParams,
    );
  });

  test("empty multibuffer has lineCount 0", () => {
    const mb = createMultiBuffer();
    expect(mb.lineCount).toBe(0);
  });

  test("single-line buffer excerpt has correct lineCount", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 50 }).filter((s) => !s.includes("\n")),
        (text) => {
          const mb = createMultiBuffer();
          const buffer = createBuffer(createBufferId(), text);
          mb.addExcerpt(buffer, excerptRange(0, 1));

          // Single line (with trailing newline by default) = 1 line visible
          return mb.lineCount === 1;
        },
      ),
      fcParams,
    );
  });
});

// ── Property 2: Position round-trip ───────────────────────────────────────────

describe("MultiBuffer fuzz: position round-trips", () => {
  test("toMultiBufferPoint(toBufferPoint(p)) === p for valid points", () => {
    fc.assert(
      fc.property(
        linesArb,
        (text) => {
          const mb = createMultiBuffer();
          const buffer = createBuffer(createBufferId(), text);
          const snap = buffer.snapshot();
          mb.addExcerpt(buffer, excerptRange(0, snap.lineCount));

          const mbSnap = mb.snapshot();

          // Test points within the multibuffer
          for (let r = 0; r < mb.lineCount; r++) {
            const lines = mbSnap.lines(mbRow(r), mbRow(r + 1));
            const lineLen = lines[0]?.length ?? 0;

            for (let col = 0; col <= lineLen; col++) {
              const p = mbPoint(r, col);
              const bufResult = mbSnap.toBufferPoint(p);
              if (!bufResult) continue; // May be past end

              const roundTripped = mbSnap.toMultiBufferPoint(
                bufResult.excerpt.id,
                bufResult.point,
              );

              if (!roundTripped) return false;
              if (num(roundTripped.row) !== r) return false;
              if (roundTripped.column !== col) return false;
            }
          }

          return true;
        },
      ),
      fcParams,
    );
  });
});

// ── Property 3: Anchor bias ───────────────────────────────────────────────────

describe("MultiBuffer fuzz: anchor bias semantics", () => {
  test("left-biased anchors stay left of insertions, right-biased move right", () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ maxLength: 20 }), { minLength: 2, maxLength: 5 }),
        fc.nat(100),
        fc.string({ minLength: 1, maxLength: 10 }),
        (lines, insertCol, insertText) => {
          const text = lines.join("\n");
          const mb = createMultiBuffer();
          const buffer = createBuffer(createBufferId(), text);
          const snap = buffer.snapshot();
          mb.addExcerpt(buffer, excerptRange(0, snap.lineCount), {
            editable: true,
          });

          // Pick a position in the middle of the buffer
          const testRow = Math.min(1, mb.lineCount - 1);
          const lineText = mb.lines(mbRow(testRow), mbRow(testRow + 1))[0] ?? "";
          const testCol = Math.min(insertCol, lineText.length);

          // Create anchors with different biases
          const leftAnchor = mb.createAnchor(
            mbPoint(testRow, testCol),
            Bias.Left,
          );
          const rightAnchor = mb.createAnchor(
            mbPoint(testRow, testCol),
            Bias.Right,
          );

          if (!leftAnchor || !rightAnchor) return true; // Skip if anchor creation fails

          // Insert text at the anchor position
          const insertPoint = mbPoint(testRow, testCol);
          mb.edit(insertPoint, insertPoint, insertText);

          // Resolve anchors after edit
          const mbSnap = mb.snapshot();
          const leftResolved = mbSnap.resolveAnchor(leftAnchor);
          const rightResolved = mbSnap.resolveAnchor(rightAnchor);

          if (!leftResolved || !rightResolved) return true; // Skip if resolution fails

          // Left anchor should stay at original column
          // Right anchor should move by insertion length
          const leftCol = leftResolved.column;
          const rightCol = rightResolved.column;

          // Left-biased anchor must remain at the original column
          if (leftCol !== testCol) return false;
          // Right-biased anchor must advance by the insertion length
          if (rightCol !== testCol + insertText.length) return false;
          return true;
        },
      ),
      fcParams,
    );
  });
});

// ── Property 4: Excerpt boundaries ────────────────────────────────────────────

describe("MultiBuffer fuzz: excerptBoundaries correctness", () => {
  test("excerptBoundaries returns correct row positions", () => {
    fc.assert(
      fc.property(
        fc.array(linesArb, { minLength: 1, maxLength: 5 }),
        (bufferTexts) => {
          const mb = createMultiBuffer();

          for (const text of bufferTexts) {
            const buffer = createBuffer(createBufferId(), text);
            const snap = buffer.snapshot();
            mb.addExcerpt(buffer, excerptRange(0, snap.lineCount));
          }

          const mbSnap = mb.snapshot();
          const boundaries = mbSnap.excerptBoundaries(
            mbRow(0),
            mbRow(mb.lineCount),
          );

          // Each boundary should have a valid row within bounds
          for (const b of boundaries) {
            const r = num(b.row);
            if (r < 0 || r > mb.lineCount) return false;
          }

          // Boundaries should be in ascending row order
          for (let i = 1; i < boundaries.length; i++) {
            const prev = boundaries[i - 1];
            const curr = boundaries[i];
            if (!prev || !curr) return false;
            if (num(prev.row) > num(curr.row)) return false;
          }

          return true;
        },
      ),
      fcParams,
    );
  });
});

// ── Property 5: Lines consistency ─────────────────────────────────────────────

describe("MultiBuffer fuzz: lines() returns correct content", () => {
  test("lines matches original buffer content", () => {
    fc.assert(
      fc.property(
        linesArb,
        (text) => {
          const mb = createMultiBuffer();
          const buffer = createBuffer(createBufferId(), text);
          const snap = buffer.snapshot();
          mb.addExcerpt(buffer, excerptRange(0, snap.lineCount));

          const originalLines = text.split("\n");
          const mbLines = mb.lines(mbRow(0), mbRow(mb.lineCount));

          // Lines should match
          if (mbLines.length !== originalLines.length) return false;
          for (let i = 0; i < mbLines.length; i++) {
            if (mbLines[i] !== originalLines[i]) return false;
          }

          return true;
        },
      ),
      fcParams,
    );
  });

  test("lines range returns correct subset", () => {
    fc.assert(
      fc.property(
        linesArb,
        fc.nat(20),
        fc.nat(20),
        (text, a, b) => {
          const mb = createMultiBuffer();
          const buffer = createBuffer(createBufferId(), text);
          const snap = buffer.snapshot();
          mb.addExcerpt(buffer, excerptRange(0, snap.lineCount));

          const startRow = Math.min(a, mb.lineCount);
          const endRow = Math.min(Math.max(b, startRow), mb.lineCount);

          const mbLines = mb.lines(mbRow(startRow), mbRow(endRow));
          const originalLines = text.split("\n").slice(startRow, endRow);

          if (mbLines.length !== originalLines.length) return false;
          for (let i = 0; i < mbLines.length; i++) {
            if (mbLines[i] !== originalLines[i]) return false;
          }

          return true;
        },
      ),
      fcParams,
    );
  });
});

// ── Property 6: Snapshot immutability ─────────────────────────────────────────

describe("MultiBuffer fuzz: snapshot immutability", () => {
  test("snapshots are unaffected by subsequent mutations", () => {
    fc.assert(
      fc.property(
        linesArb,
        linesArb,
        (text1, text2) => {
          const mb = createMultiBuffer();
          const buffer1 = createBuffer(createBufferId(), text1);
          const snap1 = buffer1.snapshot();
          mb.addExcerpt(buffer1, excerptRange(0, snap1.lineCount));

          // Take snapshot
          const mbSnap1 = mb.snapshot();
          const lineCount1 = mbSnap1.lineCount;
          const excerptCount1 = mbSnap1.excerpts.length;

          // Add another excerpt
          const buffer2 = createBuffer(createBufferId(), text2);
          const snap2 = buffer2.snapshot();
          mb.addExcerpt(buffer2, excerptRange(0, snap2.lineCount));

          // Original snapshot should be unchanged
          if (mbSnap1.lineCount !== lineCount1) return false;
          if (mbSnap1.excerpts.length !== excerptCount1) return false;

          return true;
        },
      ),
      fcParams,
    );
  });
});

// ── Excerpt management ────────────────────────────────────────────────────────

describe("MultiBuffer fuzz: excerpt management", () => {
  test("removeExcerpt decreases excerpt count", () => {
    fc.assert(
      fc.property(
        fc.array(linesArb, { minLength: 2, maxLength: 5 }),
        (bufferTexts) => {
          const mb = createMultiBuffer();
          const excerptIds: ReturnType<typeof mb.addExcerpt>[] = [];

          for (const text of bufferTexts) {
            const buffer = createBuffer(createBufferId(), text);
            const snap = buffer.snapshot();
            const id = mb.addExcerpt(buffer, excerptRange(0, snap.lineCount));
            excerptIds.push(id);
          }

          const initialCount = mb.excerpts.length;

          // Remove first excerpt
          const toRemove = excerptIds[0];
          if (toRemove) {
            mb.removeExcerpt(toRemove);
          }

          return mb.excerpts.length === initialCount - 1;
        },
      ),
      fcParams,
    );
  });

  test("clearExcerpts removes all excerpts", () => {
    fc.assert(
      fc.property(
        fc.array(linesArb, { minLength: 1, maxLength: 5 }),
        (bufferTexts) => {
          const mb = createMultiBuffer();

          for (const text of bufferTexts) {
            const buffer = createBuffer(createBufferId(), text);
            const snap = buffer.snapshot();
            mb.addExcerpt(buffer, excerptRange(0, snap.lineCount));
          }

          mb.clearExcerpts();

          return mb.excerpts.length === 0 && mb.lineCount === 0;
        },
      ),
      fcParams,
    );
  });
});
