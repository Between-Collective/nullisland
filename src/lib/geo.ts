/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Feature, Geometry, Position } from "./types";

/**
 * A "position" is any array with no array children. Checking it structurally
 * rather than by length keeps the walkers working after a problem has replaced
 * a number with null, a string, or a third and fourth ordinate.
 */
export function isPosition(value: any): boolean {
  return Array.isArray(value) && !value.some((v) => Array.isArray(v));
}

/** Depth-first visit of every position in a geometry, in place. */
export function forEachPosition(
  geometry: Geometry | null | undefined,
  fn: (pos: Position) => void,
): void {
  if (!geometry) return;
  if (geometry.geometries) {
    for (const g of geometry.geometries) forEachPosition(g, fn);
    return;
  }
  walk(geometry.coordinates);

  function walk(node: any): void {
    if (!Array.isArray(node)) return;
    if (isPosition(node)) {
      fn(node);
      return;
    }
    for (const child of node) walk(child);
  }
}

/** Depth-first replace of every position, returning a new coordinates tree. */
export function mapPositions(
  geometry: Geometry | null | undefined,
  fn: (pos: Position) => Position,
): void {
  if (!geometry) return;
  if (geometry.geometries) {
    for (const g of geometry.geometries) mapPositions(g, fn);
    return;
  }
  geometry.coordinates = walk(geometry.coordinates);

  function walk(node: any): any {
    if (!Array.isArray(node)) return node;
    if (isPosition(node)) return fn(node);
    return node.map(walk);
  }
}

/** The first position found, used as a feature's anchor. */
export function firstPosition(geometry: Geometry | null | undefined): Position | null {
  let found: Position | null = null;
  forEachPosition(geometry, (pos) => {
    if (!found) found = pos;
  });
  return found;
}

export function countPositions(geometry: Geometry | null | undefined): number {
  let n = 0;
  forEachPosition(geometry, () => n++);
  return n;
}

export function geometryTypes(features: Feature[]): string[] {
  const seen = new Set<string>();
  for (const f of features) {
    if (f.geometry?.type) seen.add(f.geometry.type);
  }
  return [...seen];
}

/** Closes a ring by repeating the first position. Mutates nothing. */
export function closeRing(ring: Position[]): Position[] {
  if (ring.length === 0) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) return ring;
  return [...ring, [...first]];
}

/** Positive for counter-clockwise rings (the RFC 7946 exterior direction). */
export function signedArea(ring: Position[]): number {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    if (typeof x1 !== "number" || typeof y1 !== "number") continue;
    if (typeof x2 !== "number" || typeof y2 !== "number") continue;
    sum += (x2 - x1) * (y2 + y1);
  }
  return -sum / 2;
}

/** Bounding box over whatever numbers are actually present. */
export function bbox(features: Feature[]): [number, number, number, number] | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const f of features) {
    forEachPosition(f.geometry, (pos) => {
      const x = Number(pos[0]);
      const y = Number(pos[1]);
      if (Number.isFinite(x)) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
      }
      if (Number.isFinite(y)) {
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    });
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
  return [minX, minY, maxX, maxY];
}

/** WGS84 degrees to EPSG:3857 metres. */
export function toWebMercator(lon: number, lat: number): [number, number] {
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const x = (lon * 20037508.34) / 180;
  const y =
    (Math.log(Math.tan(((90 + clamped) * Math.PI) / 360)) / (Math.PI / 180)) *
    (20037508.34 / 180);
  return [round(x, 3), round(y, 3)];
}

export function round(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Every property key present anywhere in the dataset, in first-seen order. */
export function propertyKeys(features: Feature[]): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const f of features) {
    if (!f.properties) continue;
    for (const key of Object.keys(f.properties)) {
      if (!seen.has(key)) {
        seen.add(key);
        keys.push(key);
      }
    }
  }
  return keys;
}
