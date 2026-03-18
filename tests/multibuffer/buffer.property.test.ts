/**
 * Property-based tests for the Buffer module.
 *
 * Verifies Buffer invariants hold across randomised edit sequences.
 * Follows the same dependency-free approach as rope.property.test.ts.
 *
 * Properties verified:
 *   1. Version monotonicity  — version increments by exactly 1 per edit
 *   2. Snapshot immutability — old snapshots are unaffected by subsequent edits
 *   3. editsSince length     — editsSince(v).length === currentVersion - v
 *   4. editsSince accuracy   — each EditEntry offset/length matches the applied op
 */

import { describe, expect, test } from "bun:test";
import { createBuffer } from "../../src/buffer/buffer.ts";
import { createBufferId, num, offset } from "../helpers.ts";

// ── Deterministic PRNG (same as rope.property.test.ts) ────────────────────────

function mulberry32(seed: number): () => number {
  let s = seed;
  return (): number => {
    s = (s + 0x6d2b79f5) | 0;
    let z = Math.imul(s ^ (s >>> 15), 1 | s);
    z ^= z + Math.imul(z ^ (z >>> 7), 61 | z);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Random value generators ───────────────────────────────────────────────────

const CHARSET = "abcde fg\n\n\n";

function randomString(rng: () => number, maxLen: number): string {
  const len = Math.floor(rng() * (maxLen + 1));
  let result = "";
  for (let i = 0; i < len; i++) {
    result += CHARSET[Math.floor(rng() * CHARSET.length)];
  }
  return result;
}

type EditOp =
  | { type: "insert"; at: number; text: string }
  | { type: "delete"; start: number; end: number }
  | { type: "replace"; start: number; end: number; text: string };

function randomOp(rng: () => number, len: number): EditOp {
  const kind = Math.floor(rng() * 3);
  const a = len > 0 ? Math.floor(rng() * (len + 1)) : 0;
  const b = len > 0 ? Math.floor(rng() * (len + 1)) : 0;
  const start = Math.min(a, b);
  const end = Math.max(a, b);
  const text = randomString(rng, 8);

  switch (kind) {
    case 0:
      return { type: "insert", at: start, text };
    case 1:
      return { type: "delete", start, end };
    default:
      return { type: "replace", start, end, text };
  }
}

function applyOpToString(s: string, op: EditOp): string {
  switch (op.type) {
    case "insert":
      return s.slice(0, op.at) + op.text + s.slice(op.at);
    case "delete":
      return s.slice(0, op.start) + s.slice(op.end);
    case "replace":
      return s.slice(0, op.start) + op.text + s.slice(op.end);
  }
}

// ── Property 1: Version monotonicity ─────────────────────────────────────────

describe("Buffer property: version increments by 1 per edit", () => {
  test("insert/delete/replace each increment version by exactly 1", () => {
    const rng = mulberry32(0xdeadbeef);
    const NUM_SEQUENCES = 40;
    const EDITS_PER_SEQ = 20;

    for (let seq = 0; seq < NUM_SEQUENCES; seq++) {
      let str = randomString(rng, 30);
      const buf = createBuffer(createBufferId(), str);
      expect(buf.version).toBe(0);

      for (let i = 0; i < EDITS_PER_SEQ; i++) {
        const versionBefore = buf.version;
        const op = randomOp(rng, str.length);
        str = applyOpToString(str, op);

        switch (op.type) {
          case "insert":
            buf.insert(offset(op.at), op.text);
            break;
          case "delete":
            buf.delete(offset(op.start), offset(op.end));
            break;
          case "replace":
            buf.replace(offset(op.start), offset(op.end), op.text);
            break;
        }

        expect(buf.version).toBe(versionBefore + 1);
      }

      expect(buf.version).toBe(EDITS_PER_SEQ);
    }
  });
});

// ── Property 2: Snapshot immutability ────────────────────────────────────────

describe("Buffer property: snapshots are immutable", () => {
  test("snapshot taken before edits is unaffected by subsequent edits", () => {
    const rng = mulberry32(0xc0ffee42);
    const NUM_SEQUENCES = 40;
    const EDITS_PER_SEQ = 15;

    for (let seq = 0; seq < NUM_SEQUENCES; seq++) {
      let str = randomString(rng, 30);
      const buf = createBuffer(createBufferId(), str);

      // Take snapshot checkpoints at several points during the sequence
      const checkpoints: Array<{ snap: ReturnType<typeof buf.snapshot>; text: string }> = [
        { snap: buf.snapshot(), text: str },
      ];

      for (let i = 0; i < EDITS_PER_SEQ; i++) {
        const op = randomOp(rng, str.length);
        str = applyOpToString(str, op);

        switch (op.type) {
          case "insert":
            buf.insert(offset(op.at), op.text);
            break;
          case "delete":
            buf.delete(offset(op.start), offset(op.end));
            break;
          case "replace":
            buf.replace(offset(op.start), offset(op.end), op.text);
            break;
        }

        // Every 5 edits, record a new checkpoint
        if ((i + 1) % 5 === 0) {
          checkpoints.push({ snap: buf.snapshot(), text: str });
        }
      }

      // All earlier snapshots must still reflect their original text
      for (const { snap, text } of checkpoints) {
        expect(snap.text()).toBe(text);
      }

      // Final current snapshot matches the final string
      expect(buf.snapshot().text()).toBe(str);
    }
  });

  test("snapshot version matches buffer version at time of snapshot", () => {
    const rng = mulberry32(0xfeedface);
    const NUM_SEQUENCES = 30;
    const EDITS_PER_SEQ = 10;

    for (let seq = 0; seq < NUM_SEQUENCES; seq++) {
      let str = randomString(rng, 20);
      const buf = createBuffer(createBufferId(), str);

      const snapshots: Array<{ snap: ReturnType<typeof buf.snapshot>; version: number }> = [];

      for (let i = 0; i < EDITS_PER_SEQ; i++) {
        const op = randomOp(rng, str.length);
        str = applyOpToString(str, op);

        switch (op.type) {
          case "insert":
            buf.insert(offset(op.at), op.text);
            break;
          case "delete":
            buf.delete(offset(op.start), offset(op.end));
            break;
          case "replace":
            buf.replace(offset(op.start), offset(op.end), op.text);
            break;
        }

        snapshots.push({ snap: buf.snapshot(), version: buf.version });
      }

      for (const { snap, version } of snapshots) {
        expect(snap.version).toBe(version);
      }
    }
  });
});

// ── Property 3 & 4: editsSince correctness ───────────────────────────────────

describe("Buffer property: editsSince is consistent with edit history", () => {
  test("editsSince(v).length === currentVersion - v for all v in [0, currentVersion]", () => {
    const rng = mulberry32(0xbadcafe0);
    const NUM_SEQUENCES = 40;
    const EDITS_PER_SEQ = 20;

    for (let seq = 0; seq < NUM_SEQUENCES; seq++) {
      let str = randomString(rng, 30);
      const buf = createBuffer(createBufferId(), str);

      for (let i = 0; i < EDITS_PER_SEQ; i++) {
        const op = randomOp(rng, str.length);
        str = applyOpToString(str, op);

        switch (op.type) {
          case "insert":
            buf.insert(offset(op.at), op.text);
            break;
          case "delete":
            buf.delete(offset(op.start), offset(op.end));
            break;
          case "replace":
            buf.replace(offset(op.start), offset(op.end), op.text);
            break;
        }
      }

      const currentVersion = buf.version;
      // Check at several version points
      for (let v = 0; v <= currentVersion; v++) {
        expect(buf.editsSince(v).length).toBe(currentVersion - v);
      }
      // Version beyond current returns empty
      expect(buf.editsSince(currentVersion + 1).length).toBe(0);
    }
  });

  test("each EditEntry has correct offset, deletedLength, and insertedLength", () => {
    const rng = mulberry32(0xcafebabe);
    const NUM_SEQUENCES = 30;
    const EDITS_PER_SEQ = 15;

    for (let seq = 0; seq < NUM_SEQUENCES; seq++) {
      let str = randomString(rng, 30);
      const buf = createBuffer(createBufferId(), str);

      type ExpectedEdit = { offset: number; deletedLength: number; insertedLength: number };
      const expected: ExpectedEdit[] = [];

      for (let i = 0; i < EDITS_PER_SEQ; i++) {
        const op = randomOp(rng, str.length);
        str = applyOpToString(str, op);

        switch (op.type) {
          case "insert":
            buf.insert(offset(op.at), op.text);
            expected.push({ offset: op.at, deletedLength: 0, insertedLength: op.text.length });
            break;
          case "delete":
            buf.delete(offset(op.start), offset(op.end));
            expected.push({ offset: op.start, deletedLength: op.end - op.start, insertedLength: 0 });
            break;
          case "replace":
            buf.replace(offset(op.start), offset(op.end), op.text);
            expected.push({
              offset: op.start,
              deletedLength: op.end - op.start,
              insertedLength: op.text.length,
            });
            break;
        }
      }

      const log = buf.editsSince(0);
      expect(log.length).toBe(expected.length);

      for (let i = 0; i < log.length; i++) {
        const entry = log[i];
        const exp = expected[i];
        if (!entry || !exp) continue;
        expect(num(entry.offset)).toBe(exp.offset);
        expect(entry.deletedLength).toBe(exp.deletedLength);
        expect(entry.insertedLength).toBe(exp.insertedLength);
      }
    }
  });
});
