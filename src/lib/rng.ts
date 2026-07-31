import { SEED_WORDS } from "./seed-words";

/**
 * Deterministic seeded RNG. Same seed in, byte-identical file out — which is the
 * whole point of a fixture generator: a failing test can be reproduced from the
 * seed string alone.
 */

function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  private nextFloat: () => number;

  constructor(seed: string) {
    const hash = xmur3(seed);
    this.nextFloat = mulberry32(hash());
  }

  /** [0, 1) */
  next(): number {
    return this.nextFloat();
  }

  /** [min, max) */
  float(min: number, max: number): number {
    return min + this.nextFloat() * (max - min);
  }

  /** [min, max] inclusive */
  int(min: number, max: number): number {
    return Math.floor(this.float(min, max + 1));
  }

  bool(probability = 0.5): boolean {
    return this.nextFloat() < probability;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.nextFloat() * items.length)];
  }

  /** Fisher–Yates on a copy. */
  shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.nextFloat() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  /** A random subset of size n (or fewer if the pool is smaller). */
  sample<T>(items: readonly T[], n: number): T[] {
    return this.shuffle(items).slice(0, Math.max(0, Math.min(n, items.length)));
  }

  /** Roughly-normal distribution via the sum of three uniforms. */
  gaussian(mean = 0, stdDev = 1): number {
    const u = this.nextFloat() + this.nextFloat() + this.nextFloat() - 1.5;
    return mean + u * 1.4142 * stdDev;
  }
}

/**
 * Three hyphenated words, so a seed survives being read down a phone or typed
 * from a screenshot into a test case. Any string works as a seed — this only
 * decides what the generated ones look like.
 *
 * ~186 words, three distinct ones: about 6.4 million combinations.
 */
export function randomSeed(): string {
  const draws = new Uint32Array(3);
  crypto.getRandomValues(draws);

  const used = new Set<number>();
  const words: string[] = [];
  for (const draw of draws) {
    let index = draw % SEED_WORDS.length;
    // Walk forward on a collision, so no seed repeats a word.
    while (used.has(index)) index = (index + 1) % SEED_WORDS.length;
    used.add(index);
    words.push(SEED_WORDS[index]);
  }
  return words.join("-");
}
