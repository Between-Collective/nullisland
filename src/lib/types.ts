/**
 * Loose, deliberately permissive geo types.
 *
 * These intentionally do NOT match RFC 7946. The whole job of this library is to
 * emit structures a strict type would forbid — strings where numbers belong,
 * null geometries, 4-element positions, unclosed rings. Everything downstream
 * treats these as untrusted.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

/** [lon, lat] plus optional Z/M — or whatever a problem has turned it into. */
export type Position = any[];

export type GeometryType =
  | "Point"
  | "MultiPoint"
  | "LineString"
  | "MultiLineString"
  | "Polygon"
  | "MultiPolygon"
  | "GeometryCollection";

export interface Geometry {
  type: GeometryType | string;
  coordinates?: any;
  geometries?: Geometry[];
}

export interface Feature {
  type?: string;
  id?: any;
  geometry: Geometry | null;
  properties: Record<string, any> | null;
  [key: string]: any;
}

export interface Dataset {
  features: Feature[];
  /** Extra top-level members the serializers may honour (crs, bbox, junk). */
  extras: Record<string, any>;
  /** Human-readable notes about what was done and what a format had to drop. */
  notes: string[];
}

export type FormatId =
  | "geojson"
  | "ndjson"
  | "csv"
  | "kml"
  | "kmz"
  | "gpx"
  | "wkt"
  | "topojson"
  | "shapefile";

export type ShapeId = "point" | "line" | "polygon" | "mixed";

/** The area you upload to a map to filter by. "none" leaves the old behaviour. */
export type BoundaryId = "none" | "bbox" | "polygon" | "hole" | "multipart";

export type ProblemCategory =
  | "coordinates"
  | "geometry"
  | "attributes"
  | "structure"
  | "encoding";

export type ProblemPhase = "data" | "text";

export interface Problem {
  id: string;
  label: string;
  /** One line: what actually breaks in a viewer when this is present. */
  blurb: string;
  category: ProblemCategory;
  phase: ProblemPhase;
  /** Formats that can express this problem. Omitted means "all of them". */
  appliesTo?: FormatId[];
}

export interface GenerateOptions {
  format: FormatId;
  count: number;
  shape: ShapeId;
  region: string;
  problems: string[];
  /** 0–1. How much of the dataset each selected problem is allowed to touch. */
  intensity: number;
  seed: string;
  /** Pretty-print JSON output. */
  pretty: boolean;
  /** Emit a boundary polygon alongside the data, and place features against it. */
  boundary: BoundaryId;
  /** 0–1. The share of features aimed inside the boundary. */
  coverage: number;
}

/**
 * A sampled view of where the generated geometry actually landed, so the UI can
 * plot it. This is the fastest way to *see* what a problem did — coincident
 * points collapse to one dot, swapped lat/lon mirrors the cloud, and projected
 * metres throw everything off-world.
 */
export interface MapPreview {
  /** [lon, lat] pairs, subsampled for large datasets. */
  points: Array<[number, number]>;
  /**
   * Parallel to `points`: 1 inside the boundary, 0 outside, -1 when no boundary
   * is in play. Kept alongside rather than as a third ordinate so a position
   * stays a position.
   */
  inside: number[];
  /** Positions examined before sampling. */
  total: number;
  /** Positions that were not finite numbers at all. */
  invalid: number;
  /** Finite positions outside the WGS84 domain. */
  outOfRange: number;
  /** Bounds of the in-range points, or null when there are none. */
  bbox: [number, number, number, number] | null;
}

/** Anything downloadable. The boundary is a file too, just a much smaller one. */
export interface FilePayload {
  filename: string;
  mime: string;
  /** Text for text formats, bytes for kmz/shapefile. */
  data: string | Uint8Array;
  bytes: number;
}

/**
 * The boundary that came with a dataset, and the ground truth it establishes.
 * Counts are measured from the finished geometry, not from what was aimed for —
 * a problem that moves features moves them out of the boundary too.
 */
export interface BoundaryOutput extends FilePayload {
  shape: BoundaryId;
  /** Every ring, exterior and interior, as [lon, lat] for plotting. */
  rings: Array<Array<[number, number]>>;
  bbox: [number, number, number, number];
  /** Every position within the boundary — a `contains` filter returns these. */
  inside: number;
  /** Some positions within — an `intersects` filter returns these too. */
  crossing: number;
  outside: number;
  preview: string;
}

export interface GeneratedFile extends FilePayload {
  /** Truncated text (or a hex dump for binaries) for the on-screen preview. */
  preview: string;
  previewTruncated: boolean;
  /** What the generator did, and what the chosen format silently dropped. */
  notes: string[];
  map: MapPreview;
  boundary: BoundaryOutput | null;
  stats: {
    features: number;
    problems: string[];
  };
}
