/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Rng } from "./rng";
import type { Dataset, Geometry, Position } from "./types";

/**
 * The shared workbench every problem transform is written against.
 *
 * It lives apart from `mutate.ts` so that the domain-specific problems in
 * `domain.ts` can be written the same way without the two files importing each
 * other in a circle.
 */

export interface Ctx {
  rng: Rng;
  opts: import("./types").GenerateOptions;
  ds: Dataset;
  /** Fraction of features a problem should touch, from the intensity slider. */
  share: number;
}

export type Transform = (ctx: Ctx) => void;

/** Indices of the features a transform should touch, always at least one. */
export function targets(ctx: Ctx, shareOverride?: number, cap = Infinity): number[] {
  const n = ctx.ds.features.length;
  if (n === 0) return [];
  const share = Math.max(0.01, Math.min(1, shareOverride ?? ctx.share));
  const wanted = Math.min(cap, Math.max(1, Math.round(n * share)));
  const indices = Array.from({ length: n }, (_, i) => i);
  return ctx.rng.sample(indices, wanted).sort((a, b) => a - b);
}

export function note(ctx: Ctx, text: string): void {
  if (!ctx.ds.notes.includes(text)) ctx.ds.notes.push(text);
}

export function ringsOf(geometry: Geometry | null): Position[][] {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return (geometry.coordinates as Position[][]) ?? [];
  if (geometry.type === "MultiPolygon") {
    return ((geometry.coordinates as Position[][][]) ?? []).flat();
  }
  return [];
}

/** Assigns a key that a plain literal would treat as the prototype setter. */
export function setOwn(target: Record<string, any>, key: string, value: any): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

export function clone<T>(value: T): T {
  return structuredClone(value);
}
