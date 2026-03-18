/**
 * Shared utilities for property-based tests.
 *
 * Provides a deterministic PRNG and random edit-sequence generators used
 * across all property test files. This avoids duplicating the same PRNG
 * setup in every file and ensures consistent test generation parameters.
 *
 * @see tests/multibuffer/rope.property.test.ts
 * @see tests/multibuffer/buffer.property.test.ts
 * @see https://github.com/iamnbutler/multibuffer/issues/80 (fast-check upgrade path)
 */

// ── Deterministic PRNG ────────────────────────────────────────────────────────

/**
 * Mulberry32 PRNG: deterministic, fast, reasonable statistical properties.
 * Returns values in [0, 1).
 *
 * Seed the PRNG with a fixed constant (e.g. `0xdeadbeef`) in each test so
 * failures are fully reproducible.
 */
export function mulberry32(seed: number): () => number {
  let s = seed;
  return (): number => {
    s = (s + 0x6d2b79f5) | 0;
    let z = Math.imul(s ^ (s >>> 15), 1 | s);
    z ^= z + Math.imul(z ^ (z >>> 7), 61 | z);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Random value generators ───────────────────────────────────────────────────

/** ASCII printable chars plus newline (heavy on newlines to exercise multi-line paths). */
export const CHARSET = "abcde fg\n\n\n";

/** Generate a random string of up to `maxLen` characters from CHARSET. */
export function randomString(rng: () => number, maxLen: number): string {
  const len = Math.floor(rng() * (maxLen + 1));
  let result = "";
  for (let i = 0; i < len; i++) {
    result += CHARSET[Math.floor(rng() * CHARSET.length)];
  }
  return result;
}

// ── Edit operations ───────────────────────────────────────────────────────────

export type EditOp =
  | { type: "insert"; offset: number; text: string }
  | { type: "delete"; start: number; end: number }
  | { type: "replace"; start: number; end: number; text: string };

/** Generate a random insert/delete/replace operation valid for a string of `len` chars. */
export function randomOp(rng: () => number, len: number): EditOp {
  const kind = Math.floor(rng() * 3);
  // Clamp to valid range (len may be 0)
  const a = len > 0 ? Math.floor(rng() * (len + 1)) : 0;
  const b = len > 0 ? Math.floor(rng() * (len + 1)) : 0;
  const start = Math.min(a, b);
  const end = Math.max(a, b);
  const text = randomString(rng, 8);

  switch (kind) {
    case 0:
      return { type: "insert", offset: start, text };
    case 1:
      return { type: "delete", start, end };
    default:
      return { type: "replace", start, end, text };
  }
}

/** Apply an EditOp to a plain JavaScript string (the naive reference implementation). */
export function applyToString(s: string, op: EditOp): string {
  switch (op.type) {
    case "insert":
      return s.slice(0, op.offset) + op.text + s.slice(op.offset);
    case "delete":
      return s.slice(0, op.start) + s.slice(op.end);
    case "replace":
      return s.slice(0, op.start) + op.text + s.slice(op.end);
  }
}
