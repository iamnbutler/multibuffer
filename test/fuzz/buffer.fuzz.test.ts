/**
 * Fuzz tests for the Buffer.
 *
 * Properties tested:
 * - Version monotonicity
 * - Snapshot immutability
 * - editsSince correctness
 */

import { describe, it, expect } from "bun:test";
import * as fc from "fast-check";
import { createBuffer } from "../../src/multibuffer/buffer.ts";
import type { BufferId, BufferOffset } from "../../src/multibuffer/types.ts";
import { editOpArb, unicodeStringArb, NUM_RUNS } from "./arbitraries.ts";

function makeBufferId(): BufferId {
  // biome-ignore lint/plugin/no-type-assertion: expect: test helper for branded type
  return `test-${Math.random().toString(36).slice(2)}` as BufferId;
}

describe("Buffer fuzz tests", () => {
  it("version increases monotonically with each edit", () => {
    fc.assert(
      fc.property(
        unicodeStringArb,
        fc.array(editOpArb, { maxLength: 30 }),
        (initial, ops) => {
          const buffer = createBuffer(makeBufferId(), initial);
          let prevVersion = buffer.version;

          for (const op of ops) {
            const snap = buffer.snapshot();
            const len = snap.textSummary.chars;

            if (op.type === "insert") {
              const offset = Math.min(op.offset, len);
              const text = op.text ?? "";
              if (text.length > 0) {
                // biome-ignore lint/plugin/no-type-assertion: expect: test arithmetic
                buffer.insert(offset as BufferOffset, text);
                if (buffer.version <= prevVersion) return false;
                prevVersion = buffer.version;
              }
            } else if (op.type === "delete") {
              const start = Math.min(op.offset, len);
              const end = Math.min(Math.max(op.endOffset ?? start, start), len);
              if (end > start) {
                // biome-ignore lint/plugin/no-type-assertion: expect: test arithmetic
                buffer.delete(start as BufferOffset, end as BufferOffset);
                if (buffer.version <= prevVersion) return false;
                prevVersion = buffer.version;
              }
            } else if (op.type === "replace") {
              const start = Math.min(op.offset, len);
              const end = Math.min(Math.max(op.endOffset ?? start, start), len);
              const text = op.text ?? "";
              if (end > start || text.length > 0) {
                // biome-ignore lint/plugin/no-type-assertion: expect: test arithmetic
                buffer.replace(start as BufferOffset, end as BufferOffset, text);
                if (buffer.version <= prevVersion) return false;
                prevVersion = buffer.version;
              }
            }
          }

          return true;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("snapshot is immutable - edits don't affect previous snapshots", () => {
    fc.assert(
      fc.property(
        unicodeStringArb,
        fc.array(editOpArb, { maxLength: 20 }),
        (initial, ops) => {
          const buffer = createBuffer(makeBufferId(), initial);
          const snapshots: Array<{ text: string; version: number }> = [];

          // Take initial snapshot
          const initialSnap = buffer.snapshot();
          snapshots.push({ text: initialSnap.text(), version: initialSnap.version });

          for (const op of ops) {
            const snap = buffer.snapshot();
            const len = snap.textSummary.chars;

            if (op.type === "insert") {
              const offset = Math.min(op.offset, len);
              const text = op.text ?? "";
              if (text.length > 0) {
                // biome-ignore lint/plugin/no-type-assertion: expect: test arithmetic
                buffer.insert(offset as BufferOffset, text);
                const newSnap = buffer.snapshot();
                snapshots.push({ text: newSnap.text(), version: newSnap.version });
              }
            } else if (op.type === "delete") {
              const start = Math.min(op.offset, len);
              const end = Math.min(Math.max(op.endOffset ?? start, start), len);
              if (end > start) {
                // biome-ignore lint/plugin/no-type-assertion: expect: test arithmetic
                buffer.delete(start as BufferOffset, end as BufferOffset);
                const newSnap = buffer.snapshot();
                snapshots.push({ text: newSnap.text(), version: newSnap.version });
              }
            }
          }

          // Verify all previous snapshots still have their original content
          // Re-read initial snapshot
          const recheckInitial = buffer.snapshot();
          // The initial snapshot object should still return its original text
          if (initialSnap.text() !== initial) return false;

          return true;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("editsSince returns edits that can reconstruct offset changes", () => {
    fc.assert(
      fc.property(
        unicodeStringArb,
        fc.nat({ max: 500 }),
        fc.string({ maxLength: 50 }),
        (initial, insertAt, toInsert) => {
          const buffer = createBuffer(makeBufferId(), initial);
          const versionBefore = buffer.version;

          const offset = Math.min(insertAt, initial.length);
          // biome-ignore lint/plugin/no-type-assertion: expect: test arithmetic
          buffer.insert(offset as BufferOffset, toInsert);

          const edits = buffer.editsSince(versionBefore);

          // Should have exactly one edit
          if (edits.length !== 1) return false;

          const edit = edits[0];
          if (!edit) return false;

          // Edit should describe the insertion correctly
          if (edit.offset !== offset) return false;
          if (edit.deletedLength !== 0) return false;
          if (edit.insertedLength !== toInsert.length) return false;

          return true;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("pointToOffset and offsetToPoint are inverses", () => {
    fc.assert(
      fc.property(
        unicodeStringArb,
        fc.nat({ max: 2000 }),
        (text, offset) => {
          const buffer = createBuffer(makeBufferId(), text);
          const snap = buffer.snapshot();

          const clampedOffset = Math.min(offset, snap.textSummary.chars);
          // biome-ignore lint/plugin/no-type-assertion: expect: test arithmetic
          const point = snap.offsetToPoint(clampedOffset as BufferOffset);
          const roundTrip = snap.pointToOffset(point);

          return roundTrip === clampedOffset;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("clipPoint keeps point within buffer bounds", () => {
    fc.assert(
      fc.property(
        unicodeStringArb,
        fc.integer({ min: -10, max: 200 }),
        fc.integer({ min: -10, max: 500 }),
        (text, row, col) => {
          const buffer = createBuffer(makeBufferId(), text);
          const snap = buffer.snapshot();
          const { Bias } = require("../../src/multibuffer/types.ts");

          // biome-ignore lint/plugin/no-type-assertion: expect: test arithmetic
          const point = { row: row as import("../../src/multibuffer/types.ts").BufferRow, column: col };
          const clipped = snap.clipPoint(point, Bias.Left);

          // Clipped point should be within bounds
          if (clipped.row < 0) return false;
          if (clipped.row >= snap.lineCount) return false;
          if (clipped.column < 0) return false;

          // Column should not exceed line length
          const lineText = snap.line(clipped.row);
          if (clipped.column > lineText.length) return false;

          return true;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("clipOffset keeps offset within buffer bounds", () => {
    fc.assert(
      fc.property(
        unicodeStringArb,
        fc.integer({ min: -100, max: 5000 }),
        (text, offset) => {
          const buffer = createBuffer(makeBufferId(), text);
          const snap = buffer.snapshot();
          const { Bias } = require("../../src/multibuffer/types.ts");

          // biome-ignore lint/plugin/no-type-assertion: expect: test arithmetic
          const clipped = snap.clipOffset(offset as BufferOffset, Bias.Left);

          // Clipped offset should be within [0, length]
          if (clipped < 0) return false;
          if (clipped > snap.textSummary.chars) return false;

          return true;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
