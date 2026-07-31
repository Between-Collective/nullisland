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
  /** Positions examined before sampling. */
  total: number;
  /** Positions that were not finite numbers at all. */
  invalid: number;
  /** Finite positions outside the WGS84 domain. */
  outOfRange: number;
  /** Bounds of the in-range points, or null when there are none. */
  bbox: [number, number, number, number] | null;
}

export interface GeneratedFile {
  filename: string;
  mime: string;
  /** Text for text formats, bytes for kmz/shapefile. */
  data: string | Uint8Array;
  bytes: number;
  /** Truncated text (or a hex dump for binaries) for the on-screen preview. */
  preview: string;
  previewTruncated: boolean;
  /** What the generator did, and what the chosen format silently dropped. */
  notes: string[];
  map: MapPreview;
  stats: {
    features: number;
    problems: string[];
  };
}
