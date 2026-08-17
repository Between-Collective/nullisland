import { group } from "./format";
import { boundarySpread, samplePosition, type Boundary } from "./boundary";
import { closeRing, round, wrapLon } from "./geo";
import { datasetClock } from "./profiles/fields";
import { profileGeometry } from "./profiles/geometry";
import { buildProfileProperties, getProfile, profileNote, profileShape } from "./profiles/index";
import { getRegion, REGIONS, type Region } from "./regions";
import type { Rng } from "./rng";
import type { Dataset, Feature, GenerateOptions, Geometry, Position } from "./types";

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
  // Both ordinates are brought back into the WGS84 domain. With no problems
  // selected the output has to be a valid file — that is the control case.
  return [
    round(wrapLon(lon + rng.gaussian(0, spread)), 6),
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
    lon = round(wrapLon(lon + Math.cos(heading) * step), 6);
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
      round(wrapLon(cx + Math.cos(angle) * wobble), 6),
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

/**
 * Which features are aimed inside the boundary. Shuffled rather than taken in
 * order: a run of inside features followed by a run of outside ones would let a
 * filter that simply returns the first N pass the test by accident.
 */
function coveragePlan(rng: Rng, count: number, coverage: number): boolean[] {
  const wanted = Math.round(count * Math.max(0, Math.min(1, coverage)));
  const plan = Array.from({ length: count }, (_, i) => i < wanted);
  return rng.shuffle(plan);
}

/**
 * A clean, well-formed dataset. Every problem in the catalogue is a transform
 * applied on top of this — so with nothing selected you get a valid file, which
 * is itself the control case worth testing against.
 *
 * With a boundary, features are placed against it rather than scattered around
 * the region anchor, so the inside/outside split is something you asked for
 * instead of something you got.
 */
export function buildBase(
  opts: GenerateOptions,
  rng: Rng,
  boundary: Boundary | null = null,
): Dataset {
  const region = getRegion(opts.region);
  const profile = getProfile(opts.profile);
  const features: Feature[] = [];
  const notes: string[] = [];
  const kinds: Array<"point" | "line" | "polygon"> =
    opts.shape === "mixed" ? ["point", "line", "polygon"] : [opts.shape];

  const plan = boundary ? coveragePlan(rng, opts.count, opts.coverage) : null;
  const fixedSpread = boundary ? boundarySpread(boundary) : 0;

  // Drawn only for field-driven profiles: the generic schema predates all of
  // this, and an extra draw here would change every fixture it ever produced.
  const clock = profile.build ? { start: 0, span: 0 } : datasetClock(rng);
  let generically = 0;

  for (let i = 0; i < opts.count; i++) {
    const kind = kinds.length === 1 ? kinds[0] : rng.pick(kinds);
    let origin: Position;
    let spread: number;

    if (boundary && plan) {
      origin = samplePosition(rng, boundary, plan[i]);
      spread = fixedSpread;
    } else {
      spread = anchorFor(rng, region)[2];
      origin = scatter(rng, region);
    }

    const size = spread || 0.2;
    // A data type only claims the geometry it really comes in. Asked for
    // polygons from a profile that ships tracks, it says so and steps aside.
    let geometry = profileGeometry(profile.geometry, rng, kind, origin, size);
    if (!geometry) {
      geometry = buildGeometry(rng, kind, origin, size);
      generically++;
    }

    features.push({
      type: "Feature",
      id: i + 1,
      geometry,
      properties: buildProfileProperties(profile, rng, {
        rng,
        index: i,
        count: opts.count,
        position: origin,
        clock,
      }),
    });
  }

  if (!profile.build) {
    notes.push(profileNote(profile));
    const empties = features.filter((f) =>
      Object.values(f.properties ?? {}).some((v) => v === null),
    ).length;
    if (empties) {
      notes.push(
        `${group(empties)} feature(s) leave at least one attribute empty, ` +
          "which is what the real feed does rather than a problem that was selected.",
      );
    }
    if (generically) {
      notes.push(
        `${profile.label} data does not come as ${opts.shape === "mixed" ? "mixed geometry" : `${opts.shape}s`}. ` +
          `${group(generically)} feature(s) use the generic ${opts.shape} builder instead — ` +
          `the shape this data really has is ${profileShape(profile)}.`,
      );
    }
  }

  return { features, extras: {}, notes };
}

export { anchorFor, makeLineString, makePolygonRing, scatter };
