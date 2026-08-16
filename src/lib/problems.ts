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
  // ── Domain: mobility ─────────────────────────────────────────────────────
  {
    id: "ais-sentinels",
    label: "AIS not-available sentinels",
    blurb: "Position 91/181, speed 102.3, heading 511 — the in-band \"unknown\" codes. Fit-to-bounds zooms past the pole.",
    category: "coordinates",
    phase: "data",
    profiles: ["maritime-ais"],
  },
  {
    id: "track-breaks",
    label: "Receiver gap and out-of-order fixes",
    blurb: "A run of fixes missing, or vertices in arrival order. The track teleports and the speed between them is impossible.",
    category: "geometry",
    phase: "data",
    profiles: ["flight-adsb", "fleet-telematics", "elevation-contours", "utility-networks"],
  },
  {
    id: "stationary-drift",
    label: "Movement with the engine off",
    blurb: "Parked vehicles wander 15 m a fix all night. Trip detection invents micro-trips until morning.",
    category: "coordinates",
    phase: "data",
    profiles: ["fleet-telematics", "micromobility-mds", "maritime-ais"],
  },
  {
    id: "past-midnight-times",
    label: "Times past 24:00:00",
    blurb: "An arrival_time of 25:40:00, exactly as GTFS requires. Every date parser returns Invalid Date and the night service vanishes.",
    category: "attributes",
    phase: "data",
    profiles: ["transit-gtfs"],
  },
  {
    id: "unstable-identity",
    label: "The id is the equipment, not the thing",
    blurb: "MMSIs shared between hulls, vehicle ids that rotate every trip. A fleet of 400 counts as 6,000, or as one that teleports.",
    category: "attributes",
    phase: "data",
    profiles: ["maritime-ais", "fleet-telematics", "micromobility-mds"],
  },
  {
    id: "padded-values",
    label: "Fixed-width padding",
    blurb: "Callsigns padded with spaces, vessel names with @, owner names to 24 characters. A group-by sees two of everything.",
    category: "attributes",
    phase: "data",
    profiles: ["flight-adsb", "maritime-ais", "cadastral-parcels"],
  },

  // ── Domain: adtech, retail and consumer ──────────────────────────────────
  {
    id: "bidstream-rounding",
    label: "Rounded for privacy, sold as precise",
    blurb: "Coordinates truncated to 2 dp while horizontal_accuracy still claims 8 m. A city's pings sit on a 1.1 km lattice.",
    category: "coordinates",
    phase: "data",
    profiles: ["mobile-location-pings", "geosocial-checkins"],
  },
  {
    id: "centroid-fallback",
    label: "Geocoder centroid pile-up",
    blurb: "Rows that never got a fix sit on a default centroid — a postcode middle, a hospital carpark. Hundreds on one plausible point, nowhere near 0,0.",
    category: "coordinates",
    phase: "data",
    profiles: ["mobile-location-pings", "poi-venues", "geosocial-checkins", "health-epidemiology", "crime-incident"],
  },
  {
    id: "snowflake-precision",
    label: "64-bit ids through a double",
    blurb: "Post ids parsed as JSON numbers, so 1789234567890123456 comes back ending in 500. Distinct rows collide and dedupe deletes real ones.",
    category: "attributes",
    phase: "data",
    profiles: ["mobile-location-pings", "geosocial-checkins"],
  },
  {
    id: "envelope-footprints",
    label: "Outline squared off to its envelope",
    blurb: "A rotated footprint replaced by its bounding box, claiming ground at each corner nothing ever saw.",
    category: "geometry",
    phase: "data",
    profiles: ["poi-venues", "geosocial-checkins", "satellite-scene-footprints", "trade-area-catchment", "building-footprints"],
  },
  {
    id: "overlapping-areas",
    label: "Areas that overlap by design",
    blurb: "Nested drive-time rings, an overlay on the district it modifies, two catchments over one street. Every share sums past 100%.",
    category: "geometry",
    phase: "data",
    profiles: ["trade-area-catchment", "zoning-land-use", "natural-hazard-zones", "health-epidemiology", "psychographics-spending"],
  },
  {
    id: "taxonomy-drift",
    label: "Code list changes mid-file",
    blurb: "NAICS for the first half and internal strings for the rest, or NIBRS from July. A legend keyed on it ends up with two of everything.",
    category: "attributes",
    phase: "data",
    profiles: ["poi-venues", "satellite-scene-footprints", "land-cover-ndvi", "natural-hazard-zones", "health-epidemiology", "crime-incident"],
  },
  {
    id: "unusable-labels",
    label: "A code column that isn't one",
    blurb: "Opening hours as free text, a route colour with no hash, a floor that is G, 0 and 01. Nothing in the column is a legend key.",
    category: "attributes",
    phase: "data",
    profiles: ["transit-gtfs", "micromobility-mds", "poi-venues", "trade-area-catchment", "zoning-land-use", "indoor-bim", "elevation-contours", "natural-hazard-zones"],
  },

  // ── Domain: real estate and planning ─────────────────────────────────────
  {
    id: "sliver-gaps",
    label: "Slivers and gaps at shared edges",
    blurb: "Polygons that should share an edge miss by 20 cm. Area double-counts in the overlaps and a click lands in the gap.",
    category: "geometry",
    phase: "data",
    profiles: ["cadastral-parcels", "building-footprints", "zoning-land-use", "land-cover-ndvi", "natural-hazard-zones", "census-boundary", "micromobility-mds", "trade-area-catchment"],
  },
  {
    id: "roof-parallax",
    label: "Roof outlines, not ground outlines",
    blurb: "Footprints traced from oblique imagery lean away from the camera by their own height. Tall buildings sit off their own parcel.",
    category: "coordinates",
    phase: "data",
    profiles: ["building-footprints"],
  },
  {
    id: "local-cad-origin",
    label: "Still in the building's own grid",
    blurb: "Coordinates are metres from a project base point, rotated to grid north. Read as degrees, the plan lands in the Gulf of Guinea.",
    category: "coordinates",
    phase: "data",
    profiles: ["indoor-bim", "building-footprints", "utility-networks", "cadastral-parcels"],
  },
  {
    id: "dangling-nodes",
    label: "Endpoints that nearly meet",
    blurb: "Consecutive mains miss the junction by centimetres, or overshoot it. A network trace stops at the first one.",
    category: "geometry",
    phase: "data",
    profiles: ["utility-networks", "indoor-bim", "elevation-contours", "flight-adsb", "fleet-telematics"],
  },
  {
    id: "stacked-records",
    label: "Many records, one outline",
    blurb: "Sixty flats on one footprint, or every tenant carrying the whole centre's polygon. Anything area-weighted counts it sixty times.",
    category: "structure",
    phase: "data",
    profiles: ["cadastral-parcels", "building-footprints", "indoor-bim", "poi-venues"],
  },
  {
    id: "superseded-records",
    label: "Retired records beside their replacements",
    blurb: "The parent parcel still there next to the two it was split into, flagged retired in a column nobody filters on. Totals come out a third high.",
    category: "structure",
    phase: "data",
    profiles: ["cadastral-parcels", "building-footprints", "zoning-land-use", "utility-networks", "natural-hazard-zones", "satellite-scene-footprints"],
  },
  {
    id: "key-format-drift",
    label: "One key, written several ways",
    blurb: "The same parcel as 007-0123-045, 0070123045 and 7-123-45. The join matches the rows that happen to agree.",
    category: "attributes",
    phase: "data",
    profiles: ["cadastral-parcels", "building-footprints", "transit-gtfs", "poi-venues", "zoning-land-use", "indoor-bim", "utility-networks", "land-cover-ndvi", "census-boundary", "trade-area-catchment", "psychographics-spending"],
  },
  {
    id: "cached-area",
    label: "Area cached from another projection",
    blurb: "The area column is square feet from a state plane and the geometry is degrees. Two numbers for one shape, orders of magnitude apart.",
    category: "attributes",
    phase: "data",
    profiles: ["cadastral-parcels", "building-footprints", "zoning-land-use", "indoor-bim", "utility-networks", "land-cover-ndvi", "natural-hazard-zones", "census-boundary", "trade-area-catchment"],
  },

  // ── Domain: earth observation ────────────────────────────────────────────
  {
    id: "lon-0-360",
    label: "Longitudes in the 0–360 domain",
    blurb: "Negative longitudes rewritten as 180–360, the convention every global model grid uses. Half the data is off the map.",
    category: "coordinates",
    phase: "data",
    profiles: ["satellite-scene-footprints", "weather-observations", "elevation-contours", "land-cover-ndvi", "natural-hazard-zones"],
  },
  {
    id: "unit-mixture",
    label: "Two units, one column",
    blurb: "Feet and metres, mph and km/h, Celsius and Fahrenheit, 0–1 and 0–100 — in one column, with no unit column beside it.",
    category: "attributes",
    phase: "data",
    profiles: ["flight-adsb", "maritime-ais", "fleet-telematics", "transit-gtfs", "micromobility-mds", "mobile-location-pings", "trade-area-catchment", "psychographics-spending", "cadastral-parcels", "building-footprints", "zoning-land-use", "indoor-bim", "utility-networks", "satellite-scene-footprints", "elevation-contours", "weather-observations", "land-cover-ndvi", "census-boundary"],
  },
  {
    id: "sentinel-values",
    label: "Unknown as a number",
    blurb: "-9999, -666666666, 99.9 and 0 sitting in numeric columns as measurements. Every null check passes and every average is wrong.",
    category: "attributes",
    phase: "data",
    profiles: ["flight-adsb", "fleet-telematics", "mobile-location-pings", "psychographics-spending", "cadastral-parcels", "building-footprints", "utility-networks", "satellite-scene-footprints", "elevation-contours", "weather-observations", "land-cover-ndvi", "census-boundary", "health-epidemiology"],
  },

  // ── Domain: demographics and public administration ───────────────────────
  {
    id: "leading-zeros",
    label: "Leading zeros eaten",
    blurb: "GEOIDs, FIPS and postcodes back from a spreadsheet as numbers: 06075 is now 6075 and the join returns nothing.",
    category: "attributes",
    phase: "data",
    profiles: ["census-boundary", "health-epidemiology", "crime-incident", "poi-venues", "trade-area-catchment", "psychographics-spending", "cadastral-parcels", "building-footprints"],
  },
  {
    id: "vintage-mismatch",
    label: "Two vintages, one key column",
    blurb: "Half the rows keyed to 2010 geographies and half to 2020, with nothing to tell them apart. The join drops 8% and reports success.",
    category: "structure",
    phase: "data",
    profiles: ["census-boundary", "trade-area-catchment", "psychographics-spending", "land-cover-ndvi", "zoning-land-use"],
  },
  {
    id: "water-only-tract",
    label: "Population on the water",
    blurb: "ALAND is 0 on a polygon still reporting residents, so people per square kilometre comes back Infinity.",
    category: "attributes",
    phase: "data",
    profiles: ["census-boundary"],
  },
  {
    id: "default-datetimes",
    label: "Unknown times defaulted",
    blurb: "Times nobody knew default to midnight on the 1st, so a twentieth of the year lands in one bar and report-minus-offence goes negative.",
    category: "attributes",
    phase: "data",
    profiles: ["crime-incident", "health-epidemiology", "fleet-telematics", "transit-gtfs", "geosocial-checkins", "psychographics-spending", "zoning-land-use", "utility-networks", "elevation-contours", "weather-observations", "natural-hazard-zones"],
  },

  // ── Domain: the spreadsheet in the middle ────────────────────────────────
  {
    id: "excel-roundtrip",
    label: "Round-tripped through Excel",
    blurb: "A sep=, line on top, parcel numbers as 1.00016E+09 and the leading zeros gone. It opened correctly for whoever saved it.",
    category: "encoding",
    phase: "text",
    appliesTo: ["csv"],
    profiles: ["cadastral-parcels", "building-footprints", "zoning-land-use", "utility-networks", "poi-venues", "psychographics-spending", "census-boundary", "health-epidemiology", "crime-incident", "trade-area-catchment"],
  },
  {
    id: "broken-csv-quoting",
    label: "Unquoted commas in CSV",
    blurb: "Addresses and place names contain commas the exporter never quoted, so every column after them shifts right and the row still parses.",
    category: "encoding",
    phase: "text",
    appliesTo: ["csv"],
    profiles: ["poi-venues", "geosocial-checkins", "cadastral-parcels", "trade-area-catchment", "crime-incident"],
  },
];


/**
 * Wiping the dataset hides every other problem in the file, so the bulk
 * selectors and the package builder leave it out. Picking it on purpose still
 * works.
 */
export const EXCLUSIVE_PROBLEM = "empty-dataset";

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

/**
 * Whether this problem exists in the world of a given data type.
 *
 * A general problem applies everywhere. A domain problem applies to the data
 * types that really ship it — offering "AIS sentinel position" against a parcel
 * export would be inventing a bug rather than reproducing one.
 */
export function appliesToProfile(problem: Problem, profile: string): boolean {
  return !problem.profiles || problem.profiles.includes(profile);
}

/** Everything selectable for a format and data type together. */
export function availableProblems(format: FormatId, profile: string): Problem[] {
  return PROBLEMS.filter((p) => appliesTo(p, format) && appliesToProfile(p, profile));
}

/** The domain-specific problems a data type brings with it. */
export function domainProblems(profile: string): Problem[] {
  return PROBLEMS.filter((p) => p.profiles?.includes(profile));
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
