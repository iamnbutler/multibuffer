/**
 * Property-based fuzz tests for the Buffer module using fast-check.
 *
 * Properties verified:
 *   1. Version monotonicity  — version increments by exactly 1 per edit
 *   2. Snapshot immutability — old snapshots are unaffected by subsequent edits
 *   3. editsSince length     — editsSince(v).length === currentVersion - v
 *   4. editsSince accuracy   — each EditEntry offset/length matches the applied op
 *   5. Position conversion   — pointToOffset/offsetToPoint round-trip
 *   6. Text consistency      — snapshot.text() always matches buffer state at snapshot time
 *
 * @see https://github.com/iamnbutler/multibuffer/issues/80
 */

import { describe, test } from "bun:test";
import * as fc from "fast-check";
import { createBuffer } from "../../src/buffer/buffer.ts";
import type { BufferId, BufferOffset } from "../../src/buffer/types.ts";
import {
  applyToString,
  clampEditOp,
  type EditOp,
  editOpArb,
  fcParams,
  unicodeArb,
} from "./arbitraries.ts";

// ── Helpers ───────────────────────────────────────────────────────────────────

let bufferIdCounter = 0;

function createBufferId(): BufferId {
  // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction for test
  return `fuzz-buffer-${++bufferIdCounter}` as BufferId;
}

function offset(n: number): BufferOffset {
  // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction for test
  return n as BufferOffset;
}

function applyToBuffer(
  buffer: ReturnType<typeof createBuffer>,
  op: EditOp,
): void {
  switch (op.type) {
    case "insert":
      buffer.insert(offset(op.offset), op.text);
      break;
    case "delete":
      buffer.delete(offset(op.start), offset(op.end));
      break;
    case "replace":
      buffer.replace(offset(op.start), offset(op.end), op.text);
      break;
  }
}

// ── Property 1: Version monotonicity ─────────────────────────────────────────

describe("Buffer fuzz: version increments by 1 per edit", () => {
  test("each edit increments version by exactly 1", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 50 }),
        fc.array(editOpArb, { maxLength: 50 }),
        (initial, ops) => {
          const buffer = createBuffer(createBufferId(), initial);
          let naive = initial;

          if (buffer.version !== 0) return false;

          for (let i = 0; i < ops.length; i++) {
            const rawOp = ops[i];
            if (!rawOp) continue;
            const op = clampEditOp(rawOp, naive.length);
            const versionBefore: number = buffer.version;

            applyToBuffer(buffer, op);
            naive = applyToString(naive, op);

            if (buffer.version !== versionBefore + 1) return false;
          }

          return buffer.version === ops.length;
        },
      ),
      fcParams,
    );
  });
});

// ── Property 2: Snapshot immutability ────────────────────────────────────────

describe("Buffer fuzz: snapshots are immutable", () => {
  test("snapshot taken before edits is unaffected by subsequent edits", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 50 }),
        fc.array(editOpArb, { maxLength: 30 }),
        (initial, ops) => {
          const buffer = createBuffer(createBufferId(), initial);
          let naive = initial;

          // Take snapshots at various points
          const checkpoints: Array<{
            snap: ReturnType<typeof buffer.snapshot>;
            text: string;
            version: number;
          }> = [{ snap: buffer.snapshot(), text: naive, version: 0 }];

          for (let i = 0; i < ops.length; i++) {
            const rawOp = ops[i];
            if (!rawOp) continue;
            const op = clampEditOp(rawOp, naive.length);

            applyToBuffer(buffer, op);
            naive = applyToString(naive, op);

            // Take checkpoint every 5 edits
            if ((i + 1) % 5 === 0) {
              checkpoints.push({
                snap: buffer.snapshot(),
                text: naive,
                version: buffer.version,
              });
            }
          }

          // Verify all snapshots still reflect their original state
          for (const { snap, text, version } of checkpoints) {
            if (snap.text() !== text) return false;
            if (snap.version !== version) return false;
          }

          // Final snapshot matches final state
          const finalSnap = buffer.snapshot();
          return finalSnap.text() === naive;
        },
      ),
      fcParams,
    );
  });

  test("snapshot lineCount is immutable", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 50 }),
        fc.array(editOpArb, { maxLength: 20 }),
        (initial, ops) => {
          const buffer = createBuffer(createBufferId(), initial);
          let naive = initial;

          const initialSnap = buffer.snapshot();
          const initialLineCount = initial.split("\n").length;

          for (const rawOp of ops) {
            const op = clampEditOp(rawOp, naive.length);
            applyToBuffer(buffer, op);
            naive = applyToString(naive, op);
          }

          // Original snapshot's lineCount must not change
          return initialSnap.lineCount === initialLineCount;
        },
      ),
      fcParams,
    );
  });
});

// ── Property 3 & 4: editsSince correctness ───────────────────────────────────

describe("Buffer fuzz: editsSince is consistent with edit history", () => {
  test("editsSince(v).length === currentVersion - v for all v", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 50 }),
        fc.array(editOpArb, { maxLength: 30 }),
        (initial, ops) => {
          const buffer = createBuffer(createBufferId(), initial);
          let naive = initial;

          for (const rawOp of ops) {
            const op = clampEditOp(rawOp, naive.length);
            applyToBuffer(buffer, op);
            naive = applyToString(naive, op);
          }

          const currentVersion = buffer.version;

          // Check at several version points
          for (let v = 0; v <= currentVersion; v++) {
            if (buffer.editsSince(v).length !== currentVersion - v) return false;
          }

          // Version beyond current returns empty
          if (buffer.editsSince(currentVersion + 1).length !== 0) return false;

          return true;
        },
      ),
      fcParams,
    );
  });

  test("each EditEntry has correct offset and lengths", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 50 }),
        fc.array(editOpArb, { maxLength: 20 }),
        (initial, ops) => {
          const buffer = createBuffer(createBufferId(), initial);
          let naive = initial;

          type ExpectedEdit = {
            offset: number;
            deletedLength: number;
            insertedLength: number;
          };
          const expected: ExpectedEdit[] = [];

          for (const rawOp of ops) {
            const op = clampEditOp(rawOp, naive.length);

            switch (op.type) {
              case "insert":
                expected.push({
                  offset: op.offset,
                  deletedLength: 0,
                  insertedLength: op.text.length,
                });
                break;
              case "delete":
                expected.push({
                  offset: op.start,
                  deletedLength: op.end - op.start,
                  insertedLength: 0,
                });
                break;
              case "replace":
                expected.push({
                  offset: op.start,
                  deletedLength: op.end - op.start,
                  insertedLength: op.text.length,
                });
                break;
            }

            applyToBuffer(buffer, op);
            naive = applyToString(naive, op);
          }

          const log = buffer.editsSince(0);
          if (log.length !== expected.length) return false;

          for (let i = 0; i < log.length; i++) {
            const entry = log[i];
            const exp = expected[i];
            if (!entry || !exp) return false;
            // biome-ignore lint/plugin/no-type-assertion: expect: unwrapping branded type for comparison
            if ((entry.offset as number) !== exp.offset) return false;
            if (entry.deletedLength !== exp.deletedLength) return false;
            if (entry.insertedLength !== exp.insertedLength) return false;
          }

          return true;
        },
      ),
      fcParams,
    );
  });
});

// ── Property 5: Position conversion ──────────────────────────────────────────

describe("Buffer fuzz: position conversion round-trips", () => {
  test("pointToOffset/offsetToPoint round-trip", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 50 }),
        (text) => {
          const buffer = createBuffer(createBufferId(), text);
          const snap = buffer.snapshot();

          // Test all valid offsets
          for (let off = 0; off <= text.length; off++) {
            const point = snap.offsetToPoint(offset(off));
            const roundTripped = snap.pointToOffset(point);
            // biome-ignore lint/plugin/no-type-assertion: expect: unwrapping branded type for comparison
            if ((roundTripped as number) !== off) return false;
          }

          return true;
        },
      ),
      fcParams,
    );
  });
});

// ── Property 6: Text consistency with Unicode ────────────────────────────────

describe("Buffer fuzz: Unicode text consistency", () => {
  test("buffer handles unicode strings correctly", () => {
    fc.assert(
      fc.property(
        unicodeArb,
        fc.array(editOpArb, { maxLength: 20 }),
        (initial, ops) => {
          const buffer = createBuffer(createBufferId(), initial);
          let naive = initial;

          for (const rawOp of ops) {
            const op = clampEditOp(rawOp, naive.length);
            applyToBuffer(buffer, op);
            naive = applyToString(naive, op);
          }

          return buffer.snapshot().text() === naive;
        },
      ),
      fcParams,
    );
  });
});

// ── Snapshot text summary ────────────────────────────────────────────────────

describe("Buffer fuzz: textSummary properties", () => {
  test("textSummary.lines matches actual line count", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 100 }),
        (text) => {
          const buffer = createBuffer(createBufferId(), text);
          const snap = buffer.snapshot();
          const expectedLines = text.split("\n").length;
          return snap.textSummary.lines === expectedLines;
        },
      ),
      fcParams,
    );
  });

  test("textSummary.chars matches string length", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 100 }),
        (text) => {
          const buffer = createBuffer(createBufferId(), text);
          const snap = buffer.snapshot();
          return snap.textSummary.chars === text.length;
        },
      ),
      fcParams,
    );
  });

  test("textSummary.lastLineLength is correct", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 100 }),
        (text) => {
          const buffer = createBuffer(createBufferId(), text);
          const snap = buffer.snapshot();
          const lines = text.split("\n");
          const lastLine = lines[lines.length - 1] ?? "";
          return snap.textSummary.lastLineLength === lastLine.length;
        },
      ),
      fcParams,
    );
  });
});
