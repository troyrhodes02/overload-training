import { createHash } from "node:crypto";

/**
 * Determinism helpers for scenario seeding: stable IDs and a seeded PRNG, so
 * the same scenario + anchor date always produces the same logical dataset
 * (and the same row IDs, so URLs such as /plan/<id> survive a reseed).
 */

/** A name-based UUID (v5 layout) from a scenario-scoped key. */
export function stableId(...parts: string[]): string {
  const h = createHash("sha1").update(parts.join("|")).digest();
  h[6] = (h[6] & 0x0f) | 0x50; // version 5
  h[8] = (h[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = h.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/** mulberry32 seeded from a string: deterministic values in [0, 1). */
export function seededRandom(seed: string): () => number {
  let a = createHash("sha1").update(seed).digest().readUInt32LE(0);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
