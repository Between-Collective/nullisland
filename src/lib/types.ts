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
  stats: {
    features: number;
    problems: string[];
  };
}
