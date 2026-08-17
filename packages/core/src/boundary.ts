import { forEachPosition, round } from "./geo";
import type { Region } from "./regions";
import type { Rng } from "./rng";
import type { BoundaryId, Feature, Geometry, Position } from "./types";

/**
 * Boundaries: the polygon you upload to a map to filter by, plus the arithmetic
 * that says which features should survive that filter.
 *
 * The point of generating the two together is the ground truth. A boundary on
 * its own tells you nothing — you can look at the result and it will look
 * plausible either way. A boundary plus "312 of these 500 are inside" is a test
 * you can actually fail.
 *
 * Everything here works on the *final* geometry, after any problems have been
 * applied, so the counts describe the file as shipped rather than the file as
 * intended.
 */

export interface BoundaryMeta {
  id: BoundaryId;
  label: string;
  /** One line: what this shape catches that a simpler one doesn't. */
  blurb: string;
}

export const BOUNDARIES: BoundaryMeta[] = [
  {
    id: "none",
    label: "None",
    blurb: "No boundary. Just the scattered dataset, as before.",
  },
  {
    id: "bbox",
    label: "Box",
    blurb: "Axis-aligned rectangle. The plain min/max case, and a bbox member to match.",
  },
  {
    id: "polygon",
    label: "Irregular",
    blurb: "A wobbly outline. Forces a real point-in-polygon test, not a min/max comparison.",
  },
  {
    id: "hole",
    label: "Hole",
    blurb: "A donut. Points in the hole are outside — plenty of filters say otherwise.",
  },
  {
    id: "multipart",
    label: "Two parts",
    blurb: "MultiPolygon of two disjoint areas. Naive readers only ever see the first.",
  },
];

export const BOUNDARY_IDS: BoundaryId[] = BOUNDARIES.map((b) => b.id);

export function getBoundaryMeta(id: BoundaryId): BoundaryMeta {
  return BOUNDARIES.find((b) => b.id === id) ?? BOUNDARIES[0];
}

/** [west, south, east, north] — the GeoJSON bbox order. */
export type Extent = [number, number, number, number];

const WORLD_EXTENT: Extent = [-180, -90, 180, 90];
const TAU = Math.PI * 2;

/** Enough vertices to read as an outline rather than a polygon with a number. */
const RING_VERTICES = 48;

function clampLon(lon: number): number {
  return Math.max(-180, Math.min(180, lon));
}

function clampLat(lat: number): number {
  return Math.max(-90, Math.min(90, lat));
}

/**
 * A region's area, derived from the same anchor and spread the scatter uses —
 * so a boundary sits where that region's data has always landed. The 0.7 on
 * latitude matches the anisotropy in `scatter`, keeping boxes roughly square
 * on screen rather than stretched.
 */
export function regionExtent(region: Region): Extent {
  if (region.spread <= 0) return [...WORLD_EXTENT] as Extent;
  return [
    clampLon(region.lon - region.spread),
    clampLat(region.lat - region.spread * 0.7),
    clampLon(region.lon + region.spread),
    clampLat(region.lat + region.spread * 0.7),
  ];
}

/** A boundary covering the whole domain has no outside to place anything in. */
export function coversWorld(extent: Extent): boolean {
  return extent[0] <= -180 && extent[1] <= -90 && extent[2] >= 180 && extent[3] >= 90;
}

/* ── Point in polygon ─────────────────────────────────────────────────────── */

/**
 * Even-odd ray casting. Non-finite ordinates are skipped rather than coerced:
 * a position a problem has turned into null or a string is not somewhere, so it
 * cannot be inside anything.
 */
function ringContains(ring: Position[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = Number(ring[i]?.[0]);
    const yi = Number(ring[i]?.[1]);
    const xj = Number(ring[j]?.[0]);
    const yj = Number(ring[j]?.[1]);
    if (!Number.isFinite(xi) || !Number.isFinite(yi)) continue;
    if (!Number.isFinite(xj) || !Number.isFinite(yj)) continue;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** First ring is the exterior; the rest are holes and subtract from it. */
function polygonContains(rings: Position[][], x: number, y: number): boolean {
  if (!rings?.length || !ringContains(rings[0], x, y)) return false;
  for (let i = 1; i < rings.length; i++) {
    if (ringContains(rings[i], x, y)) return false;
  }
  return true;
}

export function boundaryContains(geometry: Geometry, x: number, y: number): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  if (geometry.type === "MultiPolygon") {
    return (geometry.coordinates as Position[][][]).some((rings) =>
      polygonContains(rings, x, y),
    );
  }
  return polygonContains(geometry.coordinates as Position[][], x, y);
}

/* ── Shapes ───────────────────────────────────────────────────────────────── */

/** Counter-clockwise, per the RFC 7946 right-hand rule for exterior rings. */
function boxRing(extent: Extent): Position[] {
  const [w, s, e, n] = extent;
  return [
    [w, s],
    [e, s],
    [e, n],
    [w, n],
    [w, s],
  ];
}

/**
 * An organic outline: a radius that varies smoothly with angle, built from three
 * harmonics so it wobbles like a catchment area rather than a polygon someone
 * drew with a ruler. Radii are normalised so the widest vertex touches the
 * extent exactly — the boundary fills its region without escaping it.
 */
function irregularRing(
  rng: Rng,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  clockwise = false,
): Position[] {
  const harmonics = [
    { k: 2, amp: rng.float(0.08, 0.2), phase: rng.float(0, TAU) },
    { k: 3, amp: rng.float(0.05, 0.14), phase: rng.float(0, TAU) },
    { k: 5, amp: rng.float(0.02, 0.08), phase: rng.float(0, TAU) },
  ];

  const radii: number[] = [];
  let widest = 0;
  for (let i = 0; i < RING_VERTICES; i++) {
    const angle = (i / RING_VERTICES) * TAU;
    let r = 1;
    for (const h of harmonics) r += h.amp * Math.sin(h.k * angle + h.phase);
    radii.push(r);
    if (r > widest) widest = r;
  }

  const ring: Position[] = [];
  for (let i = 0; i < RING_VERTICES; i++) {
    const angle = (i / RING_VERTICES) * TAU;
    const r = radii[i] / widest;
    ring.push([
      round(clampLon(cx + Math.cos(angle) * rx * r), 6),
      round(clampLat(cy + Math.sin(angle) * ry * r), 6),
    ]);
  }

  // Interior rings wind the other way, so reverse before closing.
  if (clockwise) ring.reverse();
  ring.push([...ring[0]]);
  return ring;
}

/**
 * An interior ring that is genuinely inside the exterior. The outline is
 * concave, so an offset hole can poke through a narrow lobe — shrink and retry
 * until every vertex is contained.
 */
function holeRing(
  rng: Rng,
  outer: Position[],
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): Position[] {
  const ox = cx + rx * rng.float(-0.18, 0.18);
  const oy = cy + ry * rng.float(-0.18, 0.18);
  let scale = rng.float(0.28, 0.38);

  for (let attempt = 0; attempt < 6; attempt++) {
    const ring = irregularRing(rng, ox, oy, rx * scale, ry * scale, true);
    const contained = ring.every((p) => ringContains(outer, Number(p[0]), Number(p[1])));
    if (contained) return ring;
    scale *= 0.75;
  }
  return irregularRing(rng, ox, oy, rx * 0.1, ry * 0.1, true);
}

export interface Boundary {
  shape: BoundaryId;
  geometry: Geometry;
  /** The region extent the shape was fitted into, and the file's bbox member. */
  extent: Extent;
  /** Every ring, exterior and interior, flattened for plotting. */
  rings: Array<Array<[number, number]>>;
  /** Known-good fallbacks for when rejection sampling gives up. */
  insideAnchors: Array<[number, number]>;
  outsideAnchors: Array<[number, number]>;
}

function ringsOf(geometry: Geometry): Array<Array<[number, number]>> {
  const polygons: Position[][][] =
    geometry.type === "MultiPolygon"
      ? (geometry.coordinates as Position[][][])
      : [geometry.coordinates as Position[][]];
  const out: Array<Array<[number, number]>> = [];
  for (const rings of polygons) {
    for (const ring of rings) {
      out.push(ring.map((p) => [Number(p[0]), Number(p[1])] as [number, number]));
    }
  }
  return out;
}

/**
 * A coarse grid of positions known to be inside and outside. Rejection sampling
 * handles every realistic case; this is the guarantee that a pathological shape
 * still terminates with a correct answer rather than a plausible one.
 */
function findAnchors(geometry: Geometry, extent: Extent, halo: Extent) {
  const insideAnchors: Array<[number, number]> = [];
  const outsideAnchors: Array<[number, number]> = [];
  const STEPS = 16;

  for (let i = 0; i < STEPS; i++) {
    for (let j = 0; j < STEPS; j++) {
      const t = (i + 0.5) / STEPS;
      const u = (j + 0.5) / STEPS;
      const inX = round(extent[0] + (extent[2] - extent[0]) * t, 6);
      const inY = round(extent[1] + (extent[3] - extent[1]) * u, 6);
      if (boundaryContains(geometry, inX, inY)) insideAnchors.push([inX, inY]);

      const outX = round(halo[0] + (halo[2] - halo[0]) * t, 6);
      const outY = round(halo[1] + (halo[3] - halo[1]) * u, 6);
      if (!boundaryContains(geometry, outX, outY)) outsideAnchors.push([outX, outY]);
    }
  }
  return { insideAnchors, outsideAnchors };
}

/** The extent grown outwards, clipped to the valid domain, where outside features go. */
export function haloExtent(extent: Extent): Extent {
  const cx = (extent[0] + extent[2]) / 2;
  const cy = (extent[1] + extent[3]) / 2;
  const hw = ((extent[2] - extent[0]) / 2) * 1.7;
  const hh = ((extent[3] - extent[1]) / 2) * 1.7;
  return [clampLon(cx - hw), clampLat(cy - hh), clampLon(cx + hw), clampLat(cy + hh)];
}

export function buildBoundary(rng: Rng, extent: Extent, shape: BoundaryId): Boundary | null {
  if (shape === "none") return null;

  const [w, s, e, n] = extent;
  const cx = (w + e) / 2;
  const cy = (s + n) / 2;
  const rx = (e - w) / 2;
  const ry = (n - s) / 2;

  let geometry: Geometry;
  switch (shape) {
    case "bbox":
      geometry = { type: "Polygon", coordinates: [boxRing(extent)] };
      break;

    case "hole": {
      const outer = irregularRing(rng, cx, cy, rx, ry);
      geometry = {
        type: "Polygon",
        coordinates: [outer, holeRing(rng, outer, cx, cy, rx, ry)],
      };
      break;
    }

    case "multipart": {
      // Each part fills half the extent, with a gutter between them, so the two
      // are unambiguously disjoint rather than merely nearly so.
      const gutter = rx * 0.18;
      const halfW = (rx - gutter) / 2;
      geometry = {
        type: "MultiPolygon",
        coordinates: [
          [irregularRing(rng, cx - gutter - halfW, cy + ry * 0.12, halfW, ry * 0.7)],
          [irregularRing(rng, cx + gutter + halfW, cy - ry * 0.14, halfW, ry * 0.62)],
        ],
      };
      break;
    }

    default:
      geometry = { type: "Polygon", coordinates: [irregularRing(rng, cx, cy, rx, ry)] };
  }

  const halo = haloExtent(extent);
  const { insideAnchors, outsideAnchors } = findAnchors(geometry, extent, halo);

  return { shape, geometry, extent, rings: ringsOf(geometry), insideAnchors, outsideAnchors };
}

/* ── Placing features ─────────────────────────────────────────────────────── */

const MAX_REJECTIONS = 80;

/**
 * Rejection sampling within the extent (inside) or the halo (outside).
 * Coordinates are rounded *before* the containment test, so the position that
 * gets written is the position that was checked — rounding can never nudge a
 * feature across the edge after the fact.
 */
export function samplePosition(rng: Rng, boundary: Boundary, wantInside: boolean): Position {
  const box = wantInside ? boundary.extent : haloExtent(boundary.extent);

  for (let i = 0; i < MAX_REJECTIONS; i++) {
    const lon = round(rng.float(box[0], box[2]), 6);
    const lat = round(rng.float(box[1], box[3]), 6);
    if (boundaryContains(boundary.geometry, lon, lat) === wantInside) return [lon, lat];
  }

  const anchors = wantInside ? boundary.insideAnchors : boundary.outsideAnchors;
  if (anchors.length) return [...rng.pick(anchors)];

  // Nothing satisfies the request. Land on the centre and let classification
  // report the truth rather than pretending.
  return [
    round((boundary.extent[0] + boundary.extent[2]) / 2, 6),
    round((boundary.extent[1] + boundary.extent[3]) / 2, 6),
  ];
}

/** Feature geometry sized against the boundary, so a shape is a detail within it. */
export function boundarySpread(boundary: Boundary): number {
  const width = boundary.extent[2] - boundary.extent[0];
  const height = boundary.extent[3] - boundary.extent[1];
  return Math.max(0.0005, Math.min(width, height) * 0.18);
}

/* ── Ground truth ─────────────────────────────────────────────────────────── */

export interface BoundaryCounts {
  /** Every position inside — what a `contains` filter should return. */
  inside: number;
  /** Some but not all positions inside. */
  crossing: number;
  /** No position inside. */
  outside: number;
  /** Features whose properties could not carry the tags. */
  untagged: number;
}

/**
 * Tags each feature and counts the three cases. Called after problems have run,
 * so it measures the file that is about to be written — if a swapped lat/lon
 * threw a feature into the Indian Ocean, it is outside, and says so.
 */
export function tagFeatures(features: Feature[], boundary: Boundary): BoundaryCounts {
  const counts: BoundaryCounts = { inside: 0, crossing: 0, outside: 0, untagged: 0 };

  for (const feature of features) {
    let total = 0;
    let hits = 0;
    forEachPosition(feature.geometry, (pos) => {
      total++;
      if (boundaryContains(boundary.geometry, Number(pos[0]), Number(pos[1]))) hits++;
    });

    const inside = total > 0 && hits === total;
    const intersects = hits > 0;

    if (inside) counts.inside++;
    else if (intersects) counts.crossing++;
    else counts.outside++;

    // A problem may have nulled the properties out entirely. Counting it still
    // works; tagging it does not, and inventing an object to hold the tag would
    // quietly undo the problem the user asked for.
    if (feature.properties && typeof feature.properties === "object") {
      feature.properties.inside = inside;
      feature.properties.intersects = intersects;
    } else {
      counts.untagged++;
    }
  }

  return counts;
}

/**
 * The boundary file itself. Always GeoJSON: it is the format every map viewer
 * accepts as a filter, and the one the rest of the catalogue is measured
 * against. The data file still honours whichever format is selected.
 */
export function writeBoundaryGeoJSON(
  boundary: Boundary,
  region: Region,
  seed: string,
  pretty: boolean,
): string {
  const meta = getBoundaryMeta(boundary.shape);
  const collection = {
    type: "FeatureCollection",
    bbox: boundary.extent,
    features: [
      {
        type: "Feature",
        id: "boundary",
        properties: {
          name: `${region.label} — ${meta.label.toLowerCase()}`,
          region: region.id,
          shape: boundary.shape,
          seed,
        },
        geometry: boundary.geometry,
      },
    ],
  };
  return JSON.stringify(collection, null, pretty ? 2 : undefined);
}
