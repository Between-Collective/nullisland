/* eslint-disable @typescript-eslint/no-explicit-any */
import { closeRing, firstPosition, forEachPosition, mapPositions, round } from "./geo";
import { clone, note, targets, type Ctx, type Transform } from "./kit";
import type { Feature, Geometry, Position } from "./types";

/**
 * Problems that only exist inside a data type.
 *
 * The general catalogue breaks files. These break *feeds*: an altitude column
 * that is feet on half the rows, a census GEOID that lost its leading zero in
 * a spreadsheet, a scooter fleet whose vehicle ids rotate every trip. None of
 * them can be expressed against a `name`/`category` schema, and every one of
 * them arrives in somebody's inbox on a Tuesday.
 *
 * Each transform is written once and told, per data type, which columns it
 * applies to — so "two units in one column" is one problem that knows feet
 * from Kelvin, rather than eleven near-identical entries in the catalogue.
 */

interface UnitSwap {
  field: string;
  /** Multiply by this to get the other unit. */
  factor: number;
  from: string;
  to: string;
}

interface Padding {
  field: string;
  char: string;
  width: number;
}

interface DomainSpec {
  /** Numeric columns that ship in two units with nothing to say which. */
  units?: UnitSwap[];
  /** Numeric columns where "unknown" is a number. */
  sentinels?: Array<{ field: string; value: number; means: string }>;
  /** Zero-padded string codes that a spreadsheet turns into integers. */
  paddedCodes?: string[];
  /** Fixed-width text fields, and what the slack is filled with. */
  padded?: Padding[];
  /** The id that is really the equipment, and the one that ought to be stable. */
  identity?: { rotating: string; stable?: string };
  /** A key written more than one way across a file. */
  keys?: string[];
  /** Columns holding a code from a code list. */
  codes?: Array<{ field: string; replacement: string[] }>;
  /** Columns that look categorical and are not. */
  labels?: Array<{ field: string; values: string[] }>;
  /** Cached area or length columns, computed somewhere else. */
  areas?: string[];
  /** Datetime columns. */
  times?: string[];
  /** 64-bit ids carried as JSON numbers. */
  bigIds?: string[];
  /** Where a geocoder gives up. */
  fallbackLabel?: string;
}

/**
 * What each data type has that a general problem cannot know about. Every
 * entry here is a column that exists in that profile's schema — a domain
 * problem offered against a type with nothing to break would be a lie.
 */
const DOMAIN: Record<string, DomainSpec> = {
  "flight-adsb": {
    units: [
      { field: "baro_altitude", factor: 3.28084, from: "metres", to: "feet" },
      { field: "geo_altitude", factor: 3.28084, from: "metres", to: "feet" },
      { field: "velocity", factor: 1.94384, from: "metres per second", to: "knots" },
      { field: "vertical_rate", factor: 196.85, from: "metres per second", to: "feet per minute" },
    ],
    sentinels: [{ field: "baro_altitude", value: 0, means: "on the ground" }],
    padded: [{ field: "callsign", char: " ", width: 8 }],
    times: [],
  },
  "maritime-ais": {
    padded: [
      { field: "vessel_name", char: "@", width: 20 },
      { field: "call_sign", char: "@", width: 7 },
    ],
    identity: { rotating: "mmsi", stable: "imo" },
    units: [{ field: "draught", factor: 10, from: "metres", to: "decimetres" }],
  },
  "fleet-telematics": {
    units: [
      { field: "speed", factor: 0.621371, from: "km/h", to: "mph" },
      { field: "odometer_km", factor: 0.621371, from: "kilometres", to: "miles" },
    ],
    sentinels: [{ field: "hdop", value: 99.9, means: "no usable fix" }],
    identity: { rotating: "device_serial", stable: "vin" },
    times: ["gps_fix_time"],
  },
  "transit-gtfs": {
    units: [{ field: "shape_dist_traveled", factor: 0.000621371, from: "metres", to: "miles" }],
    keys: ["stop_id", "stop_code"],
    labels: [
      { field: "route_color", values: ["FF6600", "#ff6600", "red", "", "0,102,204"] },
      { field: "wheelchair_boarding", values: ["1", "yes", "Y", "", "unknown"] },
    ],
    times: ["arrival_time"],
  },
  "micromobility-mds": {
    units: [{ field: "battery_pct", factor: 0.01, from: "percent", to: "a fraction" }],
    identity: { rotating: "vehicle_id", stable: "device_id" },
    labels: [{ field: "vehicle_state", values: ["available", "AVAILABLE", "on_trip", "removed", "unknown"] }],
  },
  "mobile-location-pings": {
    units: [{ field: "speed", factor: 3.6, from: "metres per second", to: "km/h" }],
    sentinels: [{ field: "horizontal_accuracy", value: -1, means: "no accuracy reported" }],
    bigIds: ["publisher_id"],
    fallbackLabel: "the exchange's default centroid",
    times: [],
  },
  "poi-venues": {
    paddedCodes: ["postal_code", "naics_code"],
    keys: ["placekey", "parent_placekey"],
    codes: [{ field: "top_category", replacement: ["QSR - Drive Thru", "Retail — Grocery", "722513", "unknown"] }],
    labels: [{ field: "opening_hours", values: ["Mo-Fr 09:00-17:00", "9am-5pm", "24/7", "Call for hours", ""] }],
    fallbackLabel: "the geocoder's postcode centroid",
  },
  "geosocial-checkins": {
    bigIds: ["post_id", "place_id"],
    fallbackLabel: "the place's own centroid",
    times: ["created_at"],
  },
  "trade-area-catchment": {
    paddedCodes: ["visitor_home_cbg"],
    units: [{ field: "median_dwell", factor: 60, from: "minutes", to: "seconds" }],
    areas: ["distance_from_home"],
    keys: ["placekey"],
    labels: [{ field: "drive_time_minutes", values: ["5", "10 min", "0:15", "", "fifteen"] }],
  },
  "psychographics-spending": {
    paddedCodes: ["zcta5ce20", "zip_code"],
    sentinels: [
      { field: "median_hh_income", value: -666_666_666, means: "suppressed" },
      { field: "avg_monthly_spend", value: 0, means: "suppressed" },
    ],
    units: [{ field: "penetration_pct", factor: 0.01, from: "percent", to: "a fraction" }],
    keys: ["zcta5ce20"],
    times: ["data_vintage"],
  },
  "cadastral-parcels": {
    units: [{ field: "LOT_SIZE", factor: 43_560, from: "acres", to: "square feet" }],
    sentinels: [{ field: "LS_PRICE", value: 0, means: "not an arm's-length sale" }],
    padded: [{ field: "OWNER1", char: " ", width: 24 }],
    paddedCodes: ["APN", "USE_CODE"],
    keys: ["APN"],
    areas: ["SHAPE_Area"],
  },
  "building-footprints": {
    units: [{ field: "HEIGHTROOF", factor: 3.28084, from: "metres", to: "feet" }],
    sentinels: [{ field: "GROUNDELEV", value: -9999, means: "not surveyed" }],
    paddedCodes: ["BBL", "MPLUTO_BBL"],
    keys: ["BBL"],
    areas: ["Shape__Area"],
  },
  "zoning-land-use": {
    labels: [
      { field: "ZONEDIST1", values: ["M1-2/R8A", "R8A ", "r8a", "SPLIT", ""] },
      { field: "SPLITZONE", values: ["Y", "N", "y", "", "TRUE"] },
    ],
    areas: ["SHAPE_STArea__"],
    units: [{ field: "MAX_HEIGHT", factor: 3.28084, from: "metres", to: "feet" }],
    keys: ["ORDINANCE_NUM"],
    times: ["EFFECTIVE_DATE"],
  },
  "indoor-bim": {
    labels: [
      { field: "short_name", values: ["G", "0", "01", "1", "LG", "M"] },
      { field: "restriction", values: ["employeesonly", "Employees Only", "", "restricted"] },
    ],
    units: [{ field: "Elevation", factor: 3.28084, from: "metres", to: "feet" }],
    areas: ["Area"],
    keys: ["UNIT_ID"],
  },
  "utility-networks": {
    sentinels: [
      { field: "UPSTREAM_INVERT", value: -9999, means: "never surveyed" },
      { field: "WATTAGE", value: 0, means: "unknown" },
    ],
    units: [{ field: "DIAMETER", factor: 0.0393701, from: "millimetres", to: "inches" }],
    areas: ["MEASUREDLENGTH", "Shape_Length"],
    keys: ["FACILITYID"],
    times: ["INSTALLDATE"],
  },
  "satellite-scene-footprints": {
    units: [{ field: "cloud_cover", factor: 0.01, from: "percent", to: "a fraction" }],
    sentinels: [{ field: "cloud_cover", value: -1, means: "the cloud mask never ran" }],
    codes: [{ field: "processing_level", replacement: ["L2A", "Level-2A", "2A", "l2a"] }],
  },
  "elevation-contours": {
    units: [{ field: "elevation", factor: 3.28084, from: "metres", to: "feet" }],
    sentinels: [{ field: "elevation", value: -32_768, means: "nodata" }],
    labels: [{ field: "depression", values: ["Y", "N", "1", "", "true"] }],
    times: ["collect_date"],
  },
  "weather-observations": {
    units: [
      { field: "air_temp", factor: 1.8, from: "Celsius", to: "Fahrenheit" },
      { field: "wind_speed", factor: 0.539957, from: "km/h", to: "knots" },
    ],
    sentinels: [
      { field: "visibility", value: -9999, means: "not reported" },
      { field: "reflectivity_dbz", value: -999, means: "below the radar floor" },
    ],
    times: ["obs_time", "valid_time"],
  },
  "land-cover-ndvi": {
    units: [{ field: "ndvi_mean", factor: 10_000, from: "a -1 to 1 ratio", to: "scaled integers" }],
    sentinels: [{ field: "ndvi_mean", value: -3000, means: "fill" }],
    codes: [{ field: "class_code", replacement: ["211", "2.1.1", "21", "arable"] }],
    areas: ["area_ha"],
    keys: ["class_code"],
  },
  "natural-hazard-zones": {
    labels: [
      { field: "fld_zone", values: ["A99", "AR/AE", "ae ", "X", ""] },
      { field: "sfha_tf", values: ["T", "TRUE", "Y", "", "F"] },
    ],
    areas: ["gis_acres"],
    codes: [{ field: "fld_zone", replacement: ["A99", "AE", "ZONE AE", "ae"] }],
    times: ["perimeter_datetime"],
  },
  "census-boundary": {
    paddedCodes: ["GEOID", "STATEFP", "COUNTYFP", "TRACTCE", "AFFGEOID"],
    sentinels: [
      { field: "B19013_001E", value: -666_666_666, means: "suppressed" },
      { field: "B01003_001E", value: -999_999, means: "suppressed" },
    ],
    units: [{ field: "S1701_C03_001E", factor: 0.01, from: "percent", to: "a fraction" }],
    keys: ["GEOID"],
    areas: ["ALAND", "AWATER"],
  },
  "health-epidemiology": {
    paddedCodes: ["fips_code", "ccn"],
    sentinels: [
      { field: "inpatient_beds_used_7_day_avg", value: -999_999, means: "redacted, between one and three" },
      { field: "crude_rate", value: -1, means: "suppressed" },
    ],
    codes: [{ field: "icd10_code", replacement: ["U07.1", "B97.29", "COVID19", "U071"] }],
    times: ["onset_dt", "cdc_report_dt", "collection_week"],
    fallbackLabel: "the reporting facility",
  },
  "crime-incident": {
    paddedCodes: ["beat", "district", "iucr", "fbi_code"],
    codes: [{ field: "iucr", replacement: ["0486", "13A", "486", "ASSAULT-SIMPLE"] }],
    times: ["date", "updated_on"],
    fallbackLabel: "the hundred-block midpoint",
  },
};

/* ── helpers ─────────────────────────────────────────────────────────────── */

function spec(ctx: Ctx): DomainSpec {
  return DOMAIN[ctx.opts.profile] ?? {};
}

function props(ctx: Ctx, index: number): Record<string, any> | null {
  const p = ctx.ds.features[index]?.properties;
  return p && typeof p === "object" ? p : null;
}

/** Features that still have a usable properties object. */
function withProps(ctx: Ctx, share?: number): Array<Record<string, any>> {
  const out: Array<Record<string, any>> = [];
  for (const i of targets(ctx, share)) {
    const p = props(ctx, i);
    if (p) out.push(p);
  }
  return out;
}

function ringsOfFeature(feature: Feature): Position[][] {
  const geometry = feature.geometry;
  if (!geometry) return [];
  if (geometry.type === "Polygon") return (geometry.coordinates as Position[][]) ?? [];
  if (geometry.type === "MultiPolygon") return ((geometry.coordinates as Position[][][]) ?? []).flat();
  return [];
}

function lineOf(feature: Feature): Position[] | null {
  const geometry = feature.geometry;
  if (geometry?.type === "LineString" && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates as Position[];
  }
  return null;
}

function centroidOf(ring: Position[]): [number, number] {
  let x = 0;
  let y = 0;
  let n = 0;
  for (const position of ring) {
    const lon = Number(position[0]);
    const lat = Number(position[1]);
    if (Number.isFinite(lon) && Number.isFinite(lat)) {
      x += lon;
      y += lat;
      n++;
    }
  }
  return n ? [x / n, y / n] : [0, 0];
}

function scaleRing(ring: Position[], factor: number): Position[] {
  const [cx, cy] = centroidOf(ring);
  return ring.map((position) => [
    round(cx + (Number(position[0]) - cx) * factor, 7),
    round(cy + (Number(position[1]) - cy) * factor, 7),
    ...position.slice(2),
  ]);
}

/** A number, whatever the column has been through so far. */
function numeric(value: any): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/* ── coordinates ─────────────────────────────────────────────────────────── */

/**
 * AIS says "I don't know" with numbers that are inside the valid range: a
 * position of 91/181, a speed of 102.3 knots, a heading of 511. Nothing about
 * the row marks them, and a fleet average quietly includes them.
 */
const aisSentinels: Transform = (ctx) => {
  let moved = 0;
  for (const i of targets(ctx)) {
    const feature = ctx.ds.features[i];
    if (ctx.rng.bool(0.45)) {
      mapPositions(feature.geometry, () => [181, 91]);
      moved++;
    }
    const p = feature.properties;
    if (p && typeof p === "object") {
      if ("sog" in p) p.sog = 102.3;
      if ("cog" in p) p.cog = 360;
      if ("true_heading" in p) p.true_heading = 511;
      if ("timestamp" in p) p.timestamp = 60;
      if ("rot" in p) p.rot = -128;
    }
  }
  note(
    ctx,
    `AIS not-available sentinels are in band: ${moved.toLocaleString()} positions are 91/181, ` +
      "speeds are 102.3, headings 511 and rate-of-turn -128. Each is a valid-looking number.",
  );
};

/**
 * Rows a geocoder could not place land on its default answer — a postcode
 * centroid, the reporting facility, the middle of the country. It is a
 * plausible coordinate in a plausible place, which is why nobody notices.
 */
const centroidFallback: Transform = (ctx) => {
  const anchor = firstPosition(ctx.ds.features[0]?.geometry);
  if (!anchor) return;
  // Two decimal places out from a real point: the shape of a centroid, and
  // nowhere near 0,0 where anyone would look for it.
  const point: Position = [round(Number(anchor[0]) + 0.02, 2), round(Number(anchor[1]) - 0.01, 2)];
  const where = spec(ctx).fallbackLabel ?? "the geocoder's default point";
  let count = 0;
  for (const i of targets(ctx)) {
    mapPositions(ctx.ds.features[i].geometry, () => [...point]);
    count++;
  }
  note(
    ctx,
    `${count.toLocaleString()} feature(s) that could not be placed sit on ${where} — ` +
      `${point[0]}, ${point[1]} — rather than on a coordinate of their own.`,
  );
};

/**
 * The exchange truncates the coordinate for privacy and ships the accuracy
 * column untouched, so every ping claims eight metres and lands on a lattice
 * a kilometre across.
 */
const bidstreamRounding: Transform = (ctx) => {
  let count = 0;
  for (const i of targets(ctx)) {
    mapPositions(ctx.ds.features[i].geometry, (position) => [
      round(Number(position[0]), 2),
      round(Number(position[1]), 2),
      ...position.slice(2),
    ]);
    const p = props(ctx, i);
    if (p && "horizontal_accuracy" in p) p.horizontal_accuracy = 8;
    count++;
  }
  note(
    ctx,
    `${count.toLocaleString()} position(s) truncated to two decimal places by the exchange, ` +
      "while horizontal_accuracy still claims 8 m. The pings sit on a lattice about 1.1 km across.",
  );
};

/** Global model grids run 0–360, and half a dataset ends up off the map. */
const lon0to360: Transform = (ctx) => {
  let count = 0;
  for (const i of targets(ctx)) {
    mapPositions(ctx.ds.features[i].geometry, (position) => {
      const lon = Number(position[0]);
      if (!Number.isFinite(lon) || lon >= 0) return position;
      count++;
      return [round(lon + 360, 6), position[1], ...position.slice(2)];
    });
  }
  note(
    ctx,
    `${count.toLocaleString()} longitude(s) rewritten into the 0–360 domain that global grids use. ` +
      "Anything west of Greenwich is now east of 180.",
  );
};

/**
 * A CAD or BIM export that never left the building's own grid: metres from a
 * project base point, rotated to grid north. The numbers are small, so the
 * plan lands next to Null Island, at an angle.
 */
const localCadOrigin: Transform = (ctx) => {
  const anchor = firstPosition(ctx.ds.features[0]?.geometry) ?? [0, 0];
  const [lon0, lat0] = anchor as [number, number];
  const rotation = ctx.rng.float(0.1, 0.6);
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  for (const i of targets(ctx)) {
    mapPositions(ctx.ds.features[i].geometry, (position) => {
      const east = (Number(position[0]) - lon0) * 111_320 * Math.cos((lat0 * Math.PI) / 180);
      const north = (Number(position[1]) - lat0) * 110_540;
      return [round(east * cos - north * sin, 3), round(east * sin + north * cos, 3), ...position.slice(2)];
    });
  }
  note(
    ctx,
    "Coordinates are metres from the project base point, rotated to grid north, with no CRS to say so. " +
      "Read as degrees they land in the Gulf of Guinea.",
  );
};

/**
 * Footprints traced from oblique imagery lean away from the camera by roughly
 * their own height, so the taller the building the further it sits from its
 * own parcel.
 */
const roofParallax: Transform = (ctx) => {
  let worst = 0;
  for (const i of targets(ctx)) {
    const feature = ctx.ds.features[i];
    const height = numeric(feature.properties?.HEIGHTROOF) ?? 20;
    // A quarter of the height, thrown north-east, in degrees.
    const shift = (height * 0.25) / 111_320;
    worst = Math.max(worst, height * 0.25);
    mapPositions(feature.geometry, (position) => [
      round(Number(position[0]) + shift, 7),
      round(Number(position[1]) + shift * 0.7, 7),
      ...position.slice(2),
    ]);
  }
  note(
    ctx,
    `Footprints are roof outlines, not ground outlines: leaning away from the camera by up to ` +
      `${worst.toFixed(1)} m. Tall buildings sit off their own parcel.`,
  );
};

/** A parked vehicle whose receiver keeps reporting: fifteen metres a fix, all night. */
const stationaryDrift: Transform = (ctx) => {
  let count = 0;
  for (const i of targets(ctx)) {
    const feature = ctx.ds.features[i];
    const p = feature.properties;
    if (p && typeof p === "object") {
      if ("ignition_state" in p) p.ignition_state = false;
      if ("speed" in p) p.speed = 0;
      if ("rpm" in p) p.rpm = 0;
      if ("vehicle_state" in p) p.vehicle_state = "available";
    }
    mapPositions(feature.geometry, (position) => [
      round(Number(position[0]) + ctx.rng.gaussian(0, 0.00014), 7),
      round(Number(position[1]) + ctx.rng.gaussian(0, 0.0001), 7),
      ...position.slice(2),
    ]);
    count++;
  }
  note(
    ctx,
    `${count.toLocaleString()} stationary feature(s) wander about 15 m a fix with the engine off. ` +
      "Trip detection invents micro-trips all night.",
  );
};

/* ── geometry ────────────────────────────────────────────────────────────── */

/** Neighbours that should share an edge, missing it by twenty centimetres. */
const sliverGaps: Transform = (ctx) => {
  let count = 0;
  for (const i of targets(ctx)) {
    const feature = ctx.ds.features[i];
    const rings = ringsOfFeature(feature);
    if (!rings.length) continue;
    // Shrunk about its own centroid, so every shared edge pulls away from its
    // neighbour and the gap runs the length of the boundary.
    const factor = 1 - ctx.rng.float(0.0004, 0.0025);
    if (feature.geometry?.type === "Polygon") {
      feature.geometry.coordinates = (feature.geometry.coordinates as Position[][]).map((ring) =>
        closeRing(scaleRing(ring, factor)),
      );
    } else if (feature.geometry?.type === "MultiPolygon") {
      feature.geometry.coordinates = (feature.geometry.coordinates as Position[][][]).map((polygon) =>
        polygon.map((ring) => closeRing(scaleRing(ring, factor))),
      );
    }
    count++;
  }
  note(
    ctx,
    `${count.toLocaleString()} polygon(s) pulled back from their shared edges by a few centimetres. ` +
      "A dissolve leaves hairline slivers and a point on the boundary matches nothing.",
  );
};

/**
 * Areas that overlap by design and are then counted as if they didn't: drive
 * time rings nested inside each other, an overlay on the district it modifies,
 * two catchments over one street.
 */
const overlappingAreas: Transform = (ctx) => {
  const extras: Feature[] = [];
  for (const i of targets(ctx, Math.min(ctx.share, 0.5))) {
    const feature = ctx.ds.features[i];
    if (!ringsOfFeature(feature).length) continue;
    for (const factor of [1.45, 2.05]) {
      const copy = clone(feature);
      if (copy.geometry?.type === "Polygon") {
        copy.geometry.coordinates = (copy.geometry.coordinates as Position[][]).map((ring) =>
          closeRing(scaleRing(ring, factor)),
        );
      }
      if (copy.properties && typeof copy.properties === "object") {
        copy.properties.ring_minutes = factor > 2 ? 15 : 10;
      }
      copy.id = `${feature.id}-${factor > 2 ? "15" : "10"}`;
      extras.push(copy);
    }
  }
  ctx.ds.features.push(...extras);
  note(
    ctx,
    `${extras.length.toLocaleString()} overlapping area(s) added: each one nests the smaller one ` +
      "inside it, so a point falls in three polygons and every share sums past 100%.",
  );
};

/**
 * A track with a hole in it, or with its vertices in arrival order rather than
 * time order. Either way the object teleports and the speed between two fixes
 * is impossible.
 */
const trackBreaks: Transform = (ctx) => {
  let gapped = 0;
  let shuffled = 0;
  for (const i of targets(ctx)) {
    const feature = ctx.ds.features[i];
    const line = lineOf(feature);
    if (!line || line.length < 8) continue;
    if (ctx.rng.bool(0.6)) {
      // Coverage ends mid-flight: a run of fixes simply is not there.
      const start = ctx.rng.int(2, Math.max(2, line.length - 5));
      const length = ctx.rng.int(2, Math.max(2, Math.floor(line.length / 3)));
      line.splice(start, length);
      gapped++;
    } else {
      const at = ctx.rng.int(1, line.length - 3);
      const [a, b] = [line[at], line[at + 2]];
      line[at] = b;
      line[at + 2] = a;
      shuffled++;
    }
  }
  if (gapped) {
    note(
      ctx,
      `${gapped.toLocaleString()} track(s) have a receiver gap: a run of fixes is missing and the ` +
        "segment across it implies a speed nothing can do.",
    );
  }
  if (shuffled) {
    note(
      ctx,
      `${shuffled.toLocaleString()} track(s) have vertices in arrival order rather than time order, ` +
        "so the path doubles back on itself.",
    );
  }
};

/** A rotated footprint replaced by its own bounding box, corners and all. */
const envelopeFootprints: Transform = (ctx) => {
  let count = 0;
  for (const i of targets(ctx)) {
    const feature = ctx.ds.features[i];
    const rings = ringsOfFeature(feature);
    if (!rings.length || !feature.geometry) continue;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    forEachPosition(feature.geometry, (position) => {
      const lon = Number(position[0]);
      const lat = Number(position[1]);
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
      minX = Math.min(minX, lon);
      maxX = Math.max(maxX, lon);
      minY = Math.min(minY, lat);
      maxY = Math.max(maxY, lat);
    });
    if (!Number.isFinite(minX)) continue;
    feature.geometry = {
      type: "Polygon",
      coordinates: [
        closeRing([
          [minX, minY],
          [maxX, minY],
          [maxX, maxY],
          [minX, maxY],
        ]),
      ],
    };
    count++;
  }
  note(
    ctx,
    `${count.toLocaleString()} outline(s) replaced by their axis-aligned envelope, claiming ground ` +
      "at each corner that the real shape never covered.",
  );
};

/** Mains and corridors that miss the junction by a few centimetres, or overshoot it. */
const danglingNodes: Transform = (ctx) => {
  let count = 0;
  for (const i of targets(ctx)) {
    const line = lineOf(ctx.ds.features[i]);
    if (!line || line.length < 2) continue;
    const end = line[line.length - 1];
    const before = line[line.length - 2];
    // A few centimetres short, or the same distance past — both stop a trace.
    const slip = ctx.rng.bool() ? -0.0000045 : 0.0000045;
    line[line.length - 1] = [
      round(Number(end[0]) + (Number(end[0]) - Number(before[0])) * slip * 1000, 7),
      round(Number(end[1]) + (Number(end[1]) - Number(before[1])) * slip * 1000, 7),
      ...end.slice(2),
    ];
    count++;
  }
  note(
    ctx,
    `${count.toLocaleString()} line(s) undershoot or overshoot the junction they should meet. ` +
      "A network trace stops at the first one.",
  );
};

/* ── attributes ──────────────────────────────────────────────────────────── */

/**
 * Two suppliers, one schema, and a column that is feet on some rows and metres
 * on the rest. The family trait of every measurement in this catalogue.
 */
const unitMixture: Transform = (ctx) => {
  const swaps = spec(ctx).units;
  if (!swaps?.length) return;
  const swap = ctx.rng.pick(swaps);
  let count = 0;
  for (const p of withProps(ctx)) {
    const value = numeric(p[swap.field]);
    if (value === null) continue;
    p[swap.field] = round(value * swap.factor, 3);
    count++;
  }
  note(
    ctx,
    `${count.toLocaleString()} row(s) report ${swap.field} in ${swap.to} while the rest are in ` +
      `${swap.from}. There is no unit column, and both are plausible numbers.`,
  );
};

/** Unknown as a number: -9999, -666666666, 0, 99.9. Every average is wrong. */
const sentinelValues: Transform = (ctx) => {
  const sentinels = spec(ctx).sentinels;
  if (!sentinels?.length) return;
  const chosen = ctx.rng.pick(sentinels);
  let count = 0;
  for (const p of withProps(ctx)) {
    if (!(chosen.field in p)) continue;
    p[chosen.field] = chosen.value;
    count++;
  }
  note(
    ctx,
    `${count.toLocaleString()} row(s) carry ${chosen.value} in ${chosen.field}, meaning ` +
      `"${chosen.means}" rather than a measurement. It is a number, so every null check passes.`,
  );
};

/** A zero-padded code that went through a spreadsheet as a number. */
const leadingZeros: Transform = (ctx) => {
  const codes = spec(ctx).paddedCodes;
  if (!codes?.length) return;
  const touched = new Set<string>();
  let count = 0;
  for (const p of withProps(ctx)) {
    for (const field of codes) {
      const value = p[field];
      if (typeof value !== "string" || !/^0\d+$/.test(value)) continue;
      p[field] = Number(value);
      touched.add(field);
      count++;
    }
  }
  if (!count) return;
  note(
    ctx,
    `${count.toLocaleString()} zero-padded code(s) in ${[...touched].join(", ")} came back as numbers, ` +
      "so 06075 is now 6075 and the join to the boundary file returns nothing.",
  );
};

/** Fixed-width fields, padded out with spaces or with @ as AIS does. */
const paddedValues: Transform = (ctx) => {
  const fields = spec(ctx).padded;
  if (!fields?.length) return;
  let count = 0;
  const names = new Set<string>();
  for (const p of withProps(ctx)) {
    for (const field of fields) {
      const value = p[field.field];
      if (typeof value !== "string" || value.length >= field.width) continue;
      p[field.field] = value + field.char.repeat(field.width - value.length);
      names.add(field.field);
      count++;
    }
  }
  if (!count) return;
  note(
    ctx,
    `${count.toLocaleString()} value(s) in ${[...names].join(", ")} are padded out to the wire width. ` +
      "A group-by sees the padded and unpadded forms as two different things.",
  );
};

/**
 * The identifier belongs to the equipment, not the thing: a transponder that
 * moves between hulls, a vehicle id that rotates every trip for privacy, a
 * telematics box swapped on Tuesday.
 */
const unstableIdentity: Transform = (ctx) => {
  const identity = spec(ctx).identity;
  if (!identity) return;
  const chosen = targets(ctx);
  let rotated = 0;
  let shared = 0;
  const donor = props(ctx, chosen[0] ?? 0)?.[identity.rotating];
  for (const index of chosen) {
    const p = props(ctx, index);
    if (!p || !(identity.rotating in p)) continue;
    if (ctx.rng.bool(0.5) && donor !== undefined) {
      // One identifier on two objects in two places at once.
      p[identity.rotating] = donor;
      shared++;
    } else {
      const value = p[identity.rotating];
      p[identity.rotating] = typeof value === "number" ? value + ctx.rng.int(1, 9) : `${value}-${ctx.rng.int(2, 99)}`;
      rotated++;
    }
  }
  note(
    ctx,
    `${identity.rotating} is the equipment, not the thing it is bolted to: ` +
      `${rotated.toLocaleString()} row(s) carry a fresh one and ${shared.toLocaleString()} share a single ` +
      `value between objects in different places` +
      (identity.stable ? `. ${identity.stable} is the one that stays put.` : "."),
  );
};

/** One key, written three ways, so half the joins miss. */
const keyFormatDrift: Transform = (ctx) => {
  const keys = spec(ctx).keys;
  if (!keys?.length) return;
  const field = keys[0];
  let count = 0;
  for (const p of withProps(ctx)) {
    const value = p[field];
    if (typeof value !== "string") continue;
    const bare = value.replace(/[^A-Za-z0-9]/g, "");
    p[field] = ctx.rng.pick([
      bare,
      bare.replace(/^0+/, ""),
      bare.replace(/(.{3})(.{3})/, "$1 $2"),
      value.toLowerCase(),
    ]);
    count++;
  }
  if (!count) return;
  note(
    ctx,
    `${field} is written ${4} different ways across ${count.toLocaleString()} row(s) — separators ` +
      "dropped, zeros stripped, case changed. The join matches the rows that happen to agree.",
  );
};

/** The code list changes halfway through the file. */
const taxonomyDrift: Transform = (ctx) => {
  const codes = spec(ctx).codes;
  if (!codes?.length) return;
  const chosen = ctx.rng.pick(codes);
  const half = Math.floor(ctx.ds.features.length / 2);
  let count = 0;
  for (let i = half; i < ctx.ds.features.length; i++) {
    const p = props(ctx, i);
    if (!p || !(chosen.field in p)) continue;
    p[chosen.field] = ctx.rng.pick(chosen.replacement);
    count++;
  }
  if (!count) return;
  note(
    ctx,
    `${chosen.field} switches code list halfway through the file: ${count.toLocaleString()} row(s) use ` +
      "a different vocabulary. A legend keyed on it ends up with two of everything.",
  );
};

/** A column that looks like a code list and is whatever somebody typed. */
const unusableLabels: Transform = (ctx) => {
  const labels = spec(ctx).labels;
  if (!labels?.length) return;
  const chosen = ctx.rng.pick(labels);
  let count = 0;
  for (const p of withProps(ctx)) {
    if (!(chosen.field in p)) continue;
    p[chosen.field] = ctx.rng.pick(chosen.values);
    count++;
  }
  if (!count) return;
  note(
    ctx,
    `${chosen.field} is not a code list: ${count.toLocaleString()} row(s) hold values like ` +
      `${chosen.values.filter(Boolean).slice(0, 3).map((v) => `"${v}"`).join(", ")} — different spellings, ` +
      "different conventions, and one of them blank.",
  );
};

/** The area column was computed somewhere else, in something else's units. */
const cachedArea: Transform = (ctx) => {
  const areas = spec(ctx).areas;
  if (!areas?.length) return;
  const field = areas[0];
  let count = 0;
  for (const p of withProps(ctx)) {
    const value = numeric(p[field]);
    if (value === null) continue;
    // Square feet from a state plane against geometry in degrees: the two
    // numbers are the same ground, seven orders of magnitude apart.
    p[field] = round(value * 10.7639 * ctx.rng.float(0.82, 1.19), 2);
    count++;
  }
  if (!count) return;
  note(
    ctx,
    `${field} was cached from a projected copy of this data and never recomputed: ` +
      `${count.toLocaleString()} row(s) disagree with the geometry beside them.`,
  );
};

/** A 64-bit id parsed as a double loses its last three digits. */
const snowflakePrecision: Transform = (ctx) => {
  const ids = spec(ctx).bigIds;
  let count = 0;
  for (const p of withProps(ctx)) {
    const field = ids?.find((name) => name in p);
    const target = field ?? null;
    const value = target ? p[target] : null;
    const digits = String(value ?? "").replace(/\D/g, "").slice(0, 12) || String(ctx.rng.int(100_000, 999_999));
    // Past 2^53 a double cannot hold the value, so it comes back rounded.
    const big = Number(`17${digits}${ctx.rng.int(100, 999)}`);
    if (target) p[target] = big;
    else p.post_id = big;
    count++;
  }
  note(
    ctx,
    `${count.toLocaleString()} 64-bit id(s) were parsed as JSON numbers, so the last few digits are ` +
      "gone. Distinct records now collide, and a dedupe deletes real rows.",
  );
};

/** A GTFS trip past midnight, exactly as the spec requires. */
const pastMidnightTimes: Transform = (ctx) => {
  let count = 0;
  for (const p of withProps(ctx)) {
    if (!("arrival_time" in p)) continue;
    const hour = ctx.rng.int(24, 27);
    p.arrival_time = `${hour}:${String(ctx.rng.int(0, 59)).padStart(2, "0")}:00`;
    count++;
  }
  if (!count) return;
  note(
    ctx,
    `${count.toLocaleString()} arrival time(s) are past 24:00:00 — the GTFS way of saying "after ` +
      'midnight, still yesterday\'s service". Every date parser returns Invalid Date.',
  );
};

/** Unknown times default to midnight on the first, and a year piles into one bar. */
const defaultDatetimes: Transform = (ctx) => {
  const times = spec(ctx).times;
  if (!times?.length) return;
  const field = times[0];
  let count = 0;
  for (const p of withProps(ctx)) {
    const value = p[field];
    if (typeof value !== "string") continue;
    p[field] = `${value.slice(0, 4)}-01-01T00:00:00Z`;
    count++;
  }
  if (!count) return;
  note(
    ctx,
    `${count.toLocaleString()} unknown ${field} value(s) default to midnight on the 1st of January. ` +
      "A histogram puts a twentieth of the year in one bar.",
  );
};

/** A tract that is all water, still reporting residents. */
const waterOnlyTract: Transform = (ctx) => {
  let count = 0;
  for (const p of withProps(ctx)) {
    if (!("ALAND" in p)) continue;
    p.ALAND = 0;
    count++;
  }
  if (!count) return;
  note(
    ctx,
    `${count.toLocaleString()} polygon(s) report an ALAND of 0 while still carrying a population. ` +
      "People per square kilometre comes back Infinity and takes the colour ramp with it.",
  );
};

/* ── structure ───────────────────────────────────────────────────────────── */

/** The record it replaced, left in the file beside it. */
const supersededRecords: Transform = (ctx) => {
  const extras: Feature[] = [];
  for (const i of targets(ctx, Math.min(ctx.share, 0.4))) {
    const copy = clone(ctx.ds.features[i]);
    if (copy.properties && typeof copy.properties === "object") {
      copy.properties.status = "RETIRED";
      copy.properties.retired_flag = "Y";
    }
    copy.id = `${copy.id}-prior`;
    // Slightly different geometry, because it was surveyed again rather than
    // copied — which is why deduping on geometry does not find it.
    mapPositions(copy.geometry, (position) => [
      round(Number(position[0]) + 0.000009, 7),
      round(Number(position[1]) + 0.000007, 7),
      ...position.slice(2),
    ]);
    extras.push(copy);
  }
  ctx.ds.features.push(...extras);
  note(
    ctx,
    `${extras.length.toLocaleString()} superseded record(s) are still in the file beside the ones that ` +
      "replaced them, flagged retired in a column nobody filters on. Totals come out high.",
  );
};

/** Sixty flats, one outline: the condo stack, and the shopping centre. */
const stackedRecords: Transform = (ctx) => {
  const extras: Feature[] = [];
  for (const i of targets(ctx, Math.min(ctx.share, 0.3))) {
    const feature = ctx.ds.features[i];
    const units = ctx.rng.int(3, 12);
    for (let unit = 2; unit <= units; unit++) {
      const copy = clone(feature);
      const p = copy.properties;
      if (p && typeof p === "object") {
        if ("OWNER1" in p) p.OWNER1 = `UNIT ${unit} OWNER`;
        if ("APN" in p) p.APN = `${p.APN}-${String(unit).padStart(3, "0")}`;
        p.unit_number = unit;
      }
      copy.id = `${feature.id}-${unit}`;
      extras.push(copy);
    }
  }
  ctx.ds.features.push(...extras);
  note(
    ctx,
    `${extras.length.toLocaleString()} record(s) share an outline with another feature — the condo ` +
      "stack, or every tenant carrying the whole centre's polygon. Anything area-weighted counts it twice.",
  );
};

/** Two vintages of the same geography, keyed the same way, in one file. */
const vintageMismatch: Transform = (ctx) => {
  const keys = spec(ctx).keys ?? spec(ctx).paddedCodes;
  if (!keys?.length) return;
  const field = keys[0];
  let count = 0;
  for (const p of withProps(ctx)) {
    const value = p[field];
    if (typeof value !== "string" || value.length < 4) continue;
    // The last two digits move: a 2010 tract renumbered in 2020, with nothing
    // in the row to say which vintage it belongs to.
    p[field] = value.slice(0, -2) + String(ctx.rng.int(10, 99));
    p.vintage = ctx.rng.pick(["2010", "2020"]);
    count++;
  }
  if (!count) return;
  note(
    ctx,
    `${count.toLocaleString()} row(s) are keyed to a different boundary vintage, in the same column, ` +
      "with nothing to tell them apart. The join drops them and reports success.",
  );
};

/* ── text phase ──────────────────────────────────────────────────────────── */

/** Somebody opened the CSV in Excel and saved it. */
export function excelRoundtrip(text: string): { text: string; notes: string[] } {
  let out = text;
  // Long numeric codes go to scientific notation, and leading zeros vanish.
  out = out.replace(/(^|,)(\d{10,})(?=,|$)/gm, (_match, before, digits: string) => {
    const value = Number(digits);
    return `${before}${value.toExponential(5).replace("e+", "E+")}`;
  });
  out = out.replace(/(^|,)0+(\d+)(?=,|$)/gm, "$1$2");
  return {
    text: `sep=,\n${out}`,
    notes: [
      'The file has been round-tripped through Excel: a "sep=," line on top, long codes in scientific ' +
        "notation, and leading zeros gone. It opened correctly for whoever saved it.",
    ],
  };
}

/** The exporter never quoted the fields that contain commas. */
export function unquotedCommas(text: string): { text: string; notes: string[] } {
  let count = 0;
  const out = text
    .split("\n")
    .map((line) => {
      if (!line.includes('"')) return line;
      return line.replace(/"([^"]*,[^"]*)"/g, (_match, inner: string) => {
        count++;
        return inner;
      });
    })
    .join("\n");
  return {
    text: out,
    notes: count
      ? [
          `${count.toLocaleString()} field(s) containing commas were written unquoted, so every column ` +
            "after them shifts one to the right and the row still parses — into the wrong columns.",
        ]
      : [],
  };
}

/* ── order ───────────────────────────────────────────────────────────────── */

/**
 * Domain problems run before the general catalogue, so a general problem
 * corrupts the domain-shaped data rather than the other way round.
 */
export const DOMAIN_ORDER: Array<[string, Transform]> = [
  ["overlapping-areas", overlappingAreas],
  ["stacked-records", stackedRecords],
  ["superseded-records", supersededRecords],
  ["envelope-footprints", envelopeFootprints],
  ["sliver-gaps", sliverGaps],
  ["dangling-nodes", danglingNodes],
  ["track-breaks", trackBreaks],
  ["roof-parallax", roofParallax],
  ["stationary-drift", stationaryDrift],
  ["local-cad-origin", localCadOrigin],
  ["lon-0-360", lon0to360],
  ["bidstream-rounding", bidstreamRounding],
  ["centroid-fallback", centroidFallback],
  ["ais-sentinels", aisSentinels],
  ["unit-mixture", unitMixture],
  ["sentinel-values", sentinelValues],
  ["cached-area", cachedArea],
  ["water-only-tract", waterOnlyTract],
  ["past-midnight-times", pastMidnightTimes],
  ["default-datetimes", defaultDatetimes],
  ["taxonomy-drift", taxonomyDrift],
  ["unusable-labels", unusableLabels],
  ["key-format-drift", keyFormatDrift],
  ["vintage-mismatch", vintageMismatch],
  ["unstable-identity", unstableIdentity],
  ["padded-values", paddedValues],
  ["leading-zeros", leadingZeros],
  ["snowflake-precision", snowflakePrecision],
];

export type { Geometry };
