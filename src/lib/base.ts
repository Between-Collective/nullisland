/* eslint-disable @typescript-eslint/no-explicit-any */
import { closeRing, round } from "./geo";
import { getRegion, REGIONS, type Region } from "./regions";
import type { Rng } from "./rng";
import type { Dataset, Feature, GenerateOptions, Geometry, Position } from "./types";

const ADJECTIVES = [
  "North", "South", "East", "West", "Upper", "Lower", "Old", "New", "Great",
  "Little", "Inner", "Outer", "Central", "Royal", "Kings", "Queens", "Saint",
];

const NOUNS = [
  "Wharf", "Bridge", "Market", "Common", "Yard", "Green", "Mill", "Quay",
  "Gate", "Hill", "Field", "Park", "Bank", "Cross", "Grove", "Court", "Depot",
];

const SUFFIXES = ["Site", "Depot", "Node", "Unit", "Station", "Point", "Works", "Hub"];

const CATEGORIES = [
  "retail", "logistics", "residential", "industrial", "civic",
  "transport", "utilities", "leisure",
];

const STATUSES = ["active", "inactive", "pending", "decommissioned"];

/** A plausible-looking label so the output reads like a real export. */
function makeName(rng: Rng): string {
  return `${rng.pick(ADJECTIVES)} ${rng.pick(NOUNS)} ${rng.pick(SUFFIXES)}`;
}

/** Anchor for one feature: a fixed region, or a random city when world-wide. */
function anchorFor(rng: Rng, region: Region): [number, number, number] {
  if (region.id === "world") {
    const city = rng.pick(REGIONS.slice(1));
    return [city.lon, city.lat, city.spread * 4];
  }
  return [region.lon, region.lat, region.spread];
}

function scatter(rng: Rng, region: Region): Position {
  const [lon, lat, spread] = anchorFor(rng, region);
  return [
    round(lon + rng.gaussian(0, spread), 6),
    round(clampLat(lat + rng.gaussian(0, spread * 0.7)), 6),
  ];
}

function clampLat(lat: number): number {
  return Math.max(-89.9, Math.min(89.9, lat));
}

function makeLineString(rng: Rng, origin: Position, spread: number): Position[] {
  const vertices = rng.int(3, 12);
  const line: Position[] = [origin];
  let [lon, lat] = origin as [number, number];
  let heading = rng.float(0, Math.PI * 2);
  for (let i = 1; i < vertices; i++) {
    heading += rng.float(-0.6, 0.6);
    const step = spread * rng.float(0.05, 0.25);
    lon = round(lon + Math.cos(heading) * step, 6);
    lat = round(clampLat(lat + Math.sin(heading) * step * 0.7), 6);
    line.push([lon, lat]);
  }
  return line;
}

function makePolygonRing(rng: Rng, origin: Position, spread: number): Position[] {
  const sides = rng.int(4, 9);
  const radius = spread * rng.float(0.06, 0.2);
  const [cx, cy] = origin as [number, number];
  const ring: Position[] = [];
  for (let i = 0; i < sides; i++) {
    // Counter-clockwise, matching the RFC 7946 right-hand rule.
    const angle = (i / sides) * Math.PI * 2;
    const wobble = radius * rng.float(0.65, 1.35);
    ring.push([
      round(cx + Math.cos(angle) * wobble, 6),
      round(clampLat(cy + Math.sin(angle) * wobble * 0.7), 6),
    ]);
  }
  return closeRing(ring);
}

export function buildGeometry(
  rng: Rng,
  kind: "point" | "line" | "polygon",
  origin: Position,
  spread: number,
): Geometry {
  switch (kind) {
    case "line":
      return { type: "LineString", coordinates: makeLineString(rng, origin, spread) };
    case "polygon":
      return { type: "Polygon", coordinates: [makePolygonRing(rng, origin, spread)] };
    default:
      return { type: "Point", coordinates: origin };
  }
}

function buildProperties(rng: Rng, index: number): Record<string, any> {
  const day = rng.int(1, 28);
  const month = rng.int(1, 12);
  const year = rng.int(2019, 2026);
  return {
    id: index + 1,
    name: makeName(rng),
    category: rng.pick(CATEGORIES),
    status: rng.pick(STATUSES),
    value: round(rng.float(0, 25000), 2),
    count: rng.int(0, 480),
    verified: rng.bool(0.65),
    updated_at: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(
      rng.int(0, 23),
    ).padStart(2, "0")}:${String(rng.int(0, 59)).padStart(2, "0")}:00Z`,
  };
}

/**
 * A clean, well-formed dataset. Every problem in the catalogue is a transform
 * applied on top of this — so with nothing selected you get a valid file, which
 * is itself the control case worth testing against.
 */
export function buildBase(opts: GenerateOptions, rng: Rng): Dataset {
  const region = getRegion(opts.region);
  const features: Feature[] = [];
  const kinds: Array<"point" | "line" | "polygon"> =
    opts.shape === "mixed" ? ["point", "line", "polygon"] : [opts.shape];

  for (let i = 0; i < opts.count; i++) {
    const kind = kinds.length === 1 ? kinds[0] : rng.pick(kinds);
    const [, , spread] = anchorFor(rng, region);
    const origin = scatter(rng, region);
    features.push({
      type: "Feature",
      id: i + 1,
      geometry: buildGeometry(rng, kind, origin, spread || 0.2),
      properties: buildProperties(rng, i),
    });
  }

  return { features, extras: {}, notes: [] };
}

export { anchorFor, makeName, makeLineString, makePolygonRing, scatter, CATEGORIES, STATUSES };
