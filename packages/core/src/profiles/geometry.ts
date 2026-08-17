import { closeRing, round, wrapLon } from "../geo";
import type { Rng } from "../rng";
import type { Geometry, Position, ShapeId } from "../types";

/**
 * Geometry shaped like the domain it came from.
 *
 * A flight track is not a random polyline and a parcel is not a wobbly blob:
 * the shape of the geometry is half of what makes a fixture recognisable, and
 * half of what makes it break things. Tracks are long and smooth, so a
 * simplifier has something to ruin; parcels tile, so neighbours share edges and
 * a sliver is visible; scene footprints are big axis-aligned rectangles, so
 * they cross the antimeridian the way real ones do.
 *
 * A mode only claims the geometry kind it is natural in. Ask for polygons from
 * a flight-track profile and it hands back nothing, and the generic builder
 * takes over — the honest answer to a combination that does not exist.
 */
export type GeometryMode =
  | "scatter"
  | "track"
  | "route"
  | "network"
  | "footprint"
  | "parcel"
  | "zone"
  | "tile";

/** The kind each mode is natural in. Anything else falls back to the generic builder. */
const NATURAL: Record<GeometryMode, ShapeId> = {
  scatter: "point",
  track: "line",
  route: "line",
  network: "line",
  footprint: "polygon",
  parcel: "polygon",
  zone: "polygon",
  tile: "polygon",
};

export function naturalShape(mode: GeometryMode): ShapeId {
  return NATURAL[mode];
}

function clampLat(lat: number): number {
  return Math.max(-89.9, Math.min(89.9, lat));
}

function point(lon: number, lat: number): Position {
  return [round(wrapLon(lon), 6), round(clampLat(lat), 6)];
}

/**
 * A long, smooth path: aircraft, vessels, vehicles. Densely sampled and barely
 * turning, because that is what a position feed produces and what a naive
 * simplifier or a distance calculation gets wrong.
 */
function track(rng: Rng, origin: Position, spread: number): Position[] {
  const vertices = rng.int(24, 90);
  const step = (spread * rng.float(0.6, 1.8)) / vertices;
  let heading = rng.float(0, Math.PI * 2);
  let [lon, lat] = origin as [number, number];
  const path: Position[] = [point(lon, lat)];
  for (let i = 1; i < vertices; i++) {
    heading += rng.gaussian(0, 0.06);
    lon += Math.cos(heading) * step;
    lat += Math.sin(heading) * step * 0.7;
    path.push(point(lon, lat));
  }
  return path;
}

/** A transit or freight route: fewer vertices, real corners, doubling back. */
function route(rng: Rng, origin: Position, spread: number): Position[] {
  const legs = rng.int(4, 10);
  let [lon, lat] = origin as [number, number];
  let heading = rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]);
  const path: Position[] = [point(lon, lat)];
  for (let i = 0; i < legs; i++) {
    const length = spread * rng.float(0.08, 0.3);
    const steps = rng.int(2, 5);
    for (let s = 0; s < steps; s++) {
      lon += (Math.cos(heading) * length) / steps;
      lat += (Math.sin(heading) * length * 0.7) / steps;
      path.push(point(lon, lat));
    }
    heading += rng.pick([Math.PI / 2, -Math.PI / 2, 0]);
  }
  return path;
}

/** Utilities and grids: axis-aligned runs, right-angled corners, no curves. */
function network(rng: Rng, origin: Position, spread: number): Position[] {
  const segments = rng.int(3, 7);
  let [lon, lat] = origin as [number, number];
  const path: Position[] = [point(lon, lat)];
  let horizontal = rng.bool();
  for (let i = 0; i < segments; i++) {
    const length = spread * rng.float(0.05, 0.25) * (rng.bool() ? 1 : -1);
    if (horizontal) lon += length;
    else lat += length * 0.7;
    path.push(point(lon, lat));
    horizontal = !horizontal;
  }
  return path;
}

/** A building: a small rotated rectangle, occasionally with a clipped corner. */
function footprint(rng: Rng, origin: Position, spread: number): Position[] {
  const [cx, cy] = origin as [number, number];
  const width = spread * rng.float(0.004, 0.02);
  const depth = width * rng.float(0.5, 2);
  const angle = rng.float(0, Math.PI / 2);
  const corners: Array<[number, number]> = [
    [-width, -depth],
    [width, -depth],
    [width, depth],
    [-width, depth],
  ];
  // Counter-clockwise, matching the RFC 7946 right-hand rule.
  const ring: Position[] = corners.map(([dx, dy]) =>
    point(cx + dx * Math.cos(angle) - dy * Math.sin(angle), cy + (dx * Math.sin(angle) + dy * Math.cos(angle)) * 0.7),
  );
  return closeRing(ring);
}

/**
 * A parcel: a cell of a lot grid, so neighbours share an edge.
 *
 * Snapping to the grid rather than scattering is the point — adjacency is what
 * makes a sliver, an overlap or a gap visible at all.
 */
function parcel(rng: Rng, origin: Position, spread: number): Position[] {
  const cell = Math.max(0.00025, spread * 0.02);
  const [ox, oy] = origin as [number, number];
  const west = Math.floor(ox / cell) * cell;
  const south = Math.floor(oy / (cell * 0.7)) * cell * 0.7;
  // Lots vary in depth along the street, not in frontage.
  const depth = cell * 0.7 * rng.float(0.6, 1);
  const ring: Position[] = [
    point(west, south),
    point(west + cell, south),
    point(west + cell, south + depth),
    point(west, south + depth),
  ];
  return closeRing(ring);
}

/** An administrative or hazard area: large, irregular, unmistakably drawn. */
function zone(rng: Rng, origin: Position, spread: number): Position[] {
  const sides = rng.int(7, 16);
  const radius = spread * rng.float(0.15, 0.5);
  const [cx, cy] = origin as [number, number];
  const ring: Position[] = [];
  for (let i = 0; i < sides; i++) {
    const angle = (i / sides) * Math.PI * 2;
    const wobble = radius * rng.float(0.55, 1.45);
    ring.push(point(cx + Math.cos(angle) * wobble, cy + Math.sin(angle) * wobble * 0.7));
  }
  return closeRing(ring);
}

/** A scene or tile footprint: big, axis-aligned, and happy to cross a meridian. */
function tile(rng: Rng, origin: Position, spread: number): Position[] {
  const [cx, cy] = origin as [number, number];
  const halfWidth = Math.max(0.05, spread * rng.float(1.5, 4));
  const halfHeight = halfWidth * rng.float(0.7, 1.1);
  const ring: Position[] = [
    point(cx - halfWidth, cy - halfHeight),
    point(cx + halfWidth, cy - halfHeight),
    point(cx + halfWidth, cy + halfHeight),
    point(cx - halfWidth, cy + halfHeight),
  ];
  return closeRing(ring);
}

/**
 * The geometry for one feature, or null when the requested kind is not one this
 * data type comes in.
 */
export function profileGeometry(
  mode: GeometryMode,
  rng: Rng,
  kind: ShapeId,
  origin: Position,
  spread: number,
): Geometry | null {
  if (kind !== NATURAL[mode]) return null;
  const size = spread || 0.2;
  switch (mode) {
    case "track":
      return { type: "LineString", coordinates: track(rng, origin, size) };
    case "route":
      return { type: "LineString", coordinates: route(rng, origin, size) };
    case "network":
      return { type: "LineString", coordinates: network(rng, origin, size) };
    case "footprint":
      return { type: "Polygon", coordinates: [footprint(rng, origin, size)] };
    case "parcel":
      return { type: "Polygon", coordinates: [parcel(rng, origin, size)] };
    case "zone":
      return { type: "Polygon", coordinates: [zone(rng, origin, size)] };
    case "tile":
      return { type: "Polygon", coordinates: [tile(rng, origin, size)] };
    default:
      return { type: "Point", coordinates: origin };
  }
}
