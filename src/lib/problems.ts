import type { FormatId, Problem, ProblemCategory } from "./types";

/**
 * The catalogue. Every entry is something that has actually broken a real map
 * viewer, not a hypothetical. Order within a category is roughly "how often
 * you'll meet it in the wild".
 */
export const PROBLEMS: Problem[] = [
  // ── Coordinates ──────────────────────────────────────────────────────────
  {
    id: "coincident",
    label: "Everything on one point",
    blurb: "Every feature shares an identical lat/lon. Clusterers collapse, auto-zoom goes to max.",
    category: "coordinates",
    phase: "data",
  },
  {
    id: "swapped-latlng",
    label: "Swapped lat/lon",
    blurb: "Some rows have the pair reversed. London ends up in the Indian Ocean.",
    category: "coordinates",
    phase: "data",
  },
  {
    id: "null-island",
    label: "Null Island",
    blurb: "Missing coordinates silently became 0,0. A pile of pins off West Africa.",
    category: "coordinates",
    phase: "data",
  },
  {
    id: "precision-drift",
    label: "Precision drift",
    blurb: "Decimal places vary from 0 to 15 per row. Rounded rows snap onto a coarse grid.",
    category: "coordinates",
    phase: "data",
  },
  {
    id: "out-of-range",
    label: "Out-of-range values",
    blurb: "Latitudes past ±90 and longitudes past ±180. Projection maths returns NaN or Infinity.",
    category: "coordinates",
    phase: "data",
  },
  {
    id: "string-numbers",
    label: "Numbers as strings",
    blurb: '"51.5072" instead of 51.5072. Strict parsers reject; loose ones concatenate.',
    category: "coordinates",
    phase: "data",
  },
  {
    id: "antimeridian",
    label: "Antimeridian crossing",
    blurb: "Geometry spanning ±180°. Naive renderers draw a stripe right across the map.",
    category: "coordinates",
    phase: "data",
  },
  {
    id: "poles",
    label: "Polar coordinates",
    blurb: "Features at ±90° latitude. Web Mercator projects those to infinity.",
    category: "coordinates",
    phase: "data",
  },
  {
    id: "web-mercator",
    label: "Projected metres (EPSG:3857)",
    blurb: "Coordinates left in Web Mercator metres but labelled WGS84. Values in the millions.",
    category: "coordinates",
    phase: "data",
  },
  {
    id: "zm-coords",
    label: "Z and M values",
    blurb: "3- and 4-element positions mixed with 2-element ones. Elevation read as latitude.",
    category: "coordinates",
    phase: "data",
  },
  {
    id: "nan-coords",
    label: "null / NaN inside coordinates",
    blurb: "A null or NaN in the middle of a position array. Usually an uncaught TypeError.",
    category: "coordinates",
    phase: "data",
  },

  // ── Geometry ─────────────────────────────────────────────────────────────
  {
    id: "mixed-geometry",
    label: "Mixed geometry types",
    blurb: "Points, lines and polygons in one collection. Single-layer renderers pick one and drop the rest.",
    category: "geometry",
    phase: "data",
  },
  {
    id: "null-geometry",
    label: "Null geometry",
    blurb: "Valid features with geometry: null. Legal GeoJSON, and a crash in most viewers.",
    category: "geometry",
    phase: "data",
  },
  {
    id: "empty-geometry",
    label: "Empty coordinate arrays",
    blurb: "coordinates: []. Not null, not valid, and bbox maths returns Infinity.",
    category: "geometry",
    phase: "data",
  },
  {
    id: "unclosed-rings",
    label: "Unclosed polygon rings",
    blurb: "First position ≠ last. Some libraries close it for you, some render a line.",
    category: "geometry",
    phase: "data",
  },
  {
    id: "wrong-winding",
    label: "Wrong winding order",
    blurb: "Exterior rings clockwise, against RFC 7946. Fills invert or vanish entirely.",
    category: "geometry",
    phase: "data",
  },
  {
    id: "self-intersecting",
    label: "Self-intersecting polygons",
    blurb: "Bow-tie shapes. Tessellation produces holes, spikes, or nothing at all.",
    category: "geometry",
    phase: "data",
  },
  {
    id: "degenerate",
    label: "Degenerate shapes",
    blurb: "Zero-length lines, zero-area polygons, rings of two points. Area and centroid divide by zero.",
    category: "geometry",
    phase: "data",
  },
  {
    id: "holes",
    label: "Interior rings",
    blurb: "Polygons with holes, including one hole placed outside its shell.",
    category: "geometry",
    phase: "data",
  },
  {
    id: "vertex-bomb",
    label: "Vertex bomb",
    blurb: "One geometry with ~50k vertices. Fine on paper, a frozen main thread in practice.",
    category: "geometry",
    phase: "data",
  },
  {
    id: "nested-collections",
    label: "Nested GeometryCollections",
    blurb: "A GeometryCollection inside a GeometryCollection. Non-recursive walkers stop at depth 1.",
    category: "geometry",
    phase: "data",
    appliesTo: ["geojson", "ndjson", "kml", "wkt", "topojson"],
  },

  // ── Attributes ───────────────────────────────────────────────────────────
  {
    id: "mixed-schema",
    label: "Inconsistent schema",
    blurb: "Every feature carries a different set of keys. Table views end up mostly empty.",
    category: "attributes",
    phase: "data",
  },
  {
    id: "unstable-types",
    label: "Unstable property types",
    blurb: "One key holding numbers, strings, booleans and nulls. Sorting and filtering go sideways.",
    category: "attributes",
    phase: "data",
  },
  {
    id: "null-empties",
    label: "Nulls and fake nulls",
    blurb: 'null, "", "  ", "NULL", "N/A", "-", "None". Seven ways to say nothing.',
    category: "attributes",
    phase: "data",
  },
  {
    id: "unicode-chaos",
    label: "Unicode chaos",
    blurb: "Emoji, CJK, right-to-left text, combining marks and zero-width joiners in labels.",
    category: "attributes",
    phase: "data",
  },
  {
    id: "injection-strings",
    label: "Injection-shaped strings",
    blurb: "Values like <script>, ={{7*7}} and =1+1. Checks that popups escape and CSV exports quote.",
    category: "attributes",
    phase: "data",
  },
  {
    id: "huge-properties",
    label: "Oversized properties",
    blurb: "~100 KB of text and deeply nested objects on a handful of features. Popups explode.",
    category: "attributes",
    phase: "data",
  },
  {
    id: "date-chaos",
    label: "Six date formats",
    blurb: "ISO, US, UK, epoch seconds, epoch millis and Excel serials in one column.",
    category: "attributes",
    phase: "data",
  },
  {
    id: "awkward-keys",
    label: "Awkward property keys",
    blurb: "Keys with dots, spaces, leading digits, __proto__, and names over 10 chars for shapefiles.",
    category: "attributes",
    phase: "data",
  },
  {
    id: "id-chaos",
    label: "Broken feature ids",
    blurb: "Duplicate ids, missing ids, and ids that are numbers on one row and strings on the next.",
    category: "attributes",
    phase: "data",
  },

  // ── Structure ────────────────────────────────────────────────────────────
  {
    id: "duplicates",
    label: "Exact duplicates",
    blurb: "The same feature repeated. Counts double, and overlapping fills darken.",
    category: "structure",
    phase: "data",
  },
  {
    id: "dense-cluster",
    label: "Overplotted cluster",
    blurb: "A third of the features packed into a ~10 m box. Everything at low zoom is one dot.",
    category: "structure",
    phase: "data",
  },
  {
    id: "sparse-global",
    label: "Global outliers",
    blurb: "A few features scattered worldwide. Fit-to-bounds zooms all the way out.",
    category: "structure",
    phase: "data",
  },
  {
    id: "crs-member",
    label: "Legacy crs member",
    blurb: "The GeoJSON 2008 crs block naming a non-WGS84 EPSG code. Removed from the spec, still shipped.",
    category: "structure",
    phase: "data",
    appliesTo: ["geojson"],
  },
  {
    id: "wrong-bbox",
    label: "Lying bbox",
    blurb: "A bbox member that disagrees with the geometry it describes.",
    category: "structure",
    phase: "data",
    appliesTo: ["geojson", "ndjson", "topojson"],
  },
  {
    id: "foreign-members",
    label: "Foreign members",
    blurb: "Extra top-level and feature-level keys the spec says to ignore. Strict validators refuse.",
    category: "structure",
    phase: "data",
    appliesTo: ["geojson", "ndjson", "topojson"],
  },
  {
    id: "empty-dataset",
    label: "Empty result",
    blurb: "Zero features. The single most common thing an integration forgets to handle.",
    category: "structure",
    phase: "data",
  },

  // ── Encoding / bytes ─────────────────────────────────────────────────────
  {
    id: "bom",
    label: "UTF-8 BOM",
    blurb: "A byte order mark before the first character. JSON.parse throws on position 0.",
    category: "encoding",
    phase: "text",
    appliesTo: ["geojson", "ndjson", "csv", "kml", "gpx", "wkt", "topojson"],
  },
  {
    id: "crlf",
    label: "Mixed line endings",
    blurb: "CRLF and LF in the same file. Line-oriented parsers keep a trailing \\r on every value.",
    category: "encoding",
    phase: "text",
    appliesTo: ["ndjson", "csv", "wkt"],
  },
  {
    id: "malformed-json",
    label: "Malformed JSON",
    blurb: "Trailing commas, unquoted keys, single quotes. Reads fine to a human, fatal to a parser.",
    category: "encoding",
    phase: "text",
    appliesTo: ["geojson", "ndjson", "topojson"],
  },
  {
    id: "nan-literal",
    label: "Bare NaN / Infinity",
    blurb: "Python's json.dump output. Not valid JSON, and accepted by almost nothing else.",
    category: "encoding",
    phase: "text",
    appliesTo: ["geojson", "ndjson", "topojson"],
  },
  {
    id: "mojibake",
    label: "Mojibake",
    blurb: "UTF-8 bytes decoded as Latin-1. Café becomes CafÃ©, all the way down.",
    category: "encoding",
    phase: "text",
    appliesTo: ["geojson", "ndjson", "csv", "kml", "gpx", "wkt", "topojson"],
  },
];

export const CATEGORY_LABELS: Record<ProblemCategory, string> = {
  coordinates: "Coordinates",
  geometry: "Geometry",
  attributes: "Attributes",
  structure: "Structure",
  encoding: "Bytes & encoding",
};

export const CATEGORY_ORDER: ProblemCategory[] = [
  "coordinates",
  "geometry",
  "attributes",
  "structure",
  "encoding",
];

const BY_ID = new Map(PROBLEMS.map((p) => [p.id, p]));

export function getProblem(id: string): Problem | undefined {
  return BY_ID.get(id);
}

export function appliesTo(problem: Problem, format: FormatId): boolean {
  return !problem.appliesTo || problem.appliesTo.includes(format);
}

/** The subset of selected problems that the chosen format can actually express. */
export function applicableProblems(ids: string[], format: FormatId): Problem[] {
  return ids
    .map((id) => BY_ID.get(id))
    .filter((p): p is Problem => !!p && appliesTo(p, format));
}

export function problemsForFormat(format: FormatId): Problem[] {
  return PROBLEMS.filter((p) => appliesTo(p, format));
}
