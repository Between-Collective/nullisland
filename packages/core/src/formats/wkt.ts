/* eslint-disable @typescript-eslint/no-explicit-any */
import { isPosition } from "../geo";
import type { Dataset, Geometry } from "../types";

const WKT_NAMES: Record<string, string> = {
  Point: "POINT",
  MultiPoint: "MULTIPOINT",
  LineString: "LINESTRING",
  MultiLineString: "MULTILINESTRING",
  Polygon: "POLYGON",
  MultiPolygon: "MULTIPOLYGON",
  GeometryCollection: "GEOMETRYCOLLECTION",
};

function ordinate(value: any): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : String(value);
  return String(value);
}

/** Widest position in the geometry, so the Z/ZM tag matches the actual data. */
function dimensionOf(coordinates: any): number {
  let width = 2;
  const walk = (node: any): void => {
    if (!Array.isArray(node)) return;
    if (isPosition(node)) {
      width = Math.max(width, node.length);
      return;
    }
    for (const child of node) walk(child);
  };
  walk(coordinates);
  return width;
}

function positions(node: any): string {
  if (!Array.isArray(node)) return "";
  if (isPosition(node)) return node.map(ordinate).join(" ");
  return node.map(positions).join(", ");
}

function wrap(node: any, depth: number): string {
  if (depth === 0) return positions(node);
  return `(${(node ?? []).map((child: any) => wrap(child, depth - 1)).join(", ")})`;
}

const DEPTH: Record<string, number> = {
  Point: 0,
  MultiPoint: 1,
  LineString: 1,
  MultiLineString: 2,
  Polygon: 2,
  MultiPolygon: 3,
};

export function geometryToWKT(geometry: Geometry | null | undefined): string {
  if (!geometry) return "";
  const name = WKT_NAMES[geometry.type] ?? geometry.type.toUpperCase();

  if (geometry.type === "GeometryCollection") {
    const parts = (geometry.geometries ?? []).map(geometryToWKT).filter(Boolean);
    return parts.length ? `${name} (${parts.join(", ")})` : `${name} EMPTY`;
  }

  const coordinates = geometry.coordinates;
  const empty =
    coordinates === undefined ||
    coordinates === null ||
    (Array.isArray(coordinates) && coordinates.length === 0);
  if (empty) return `${name} EMPTY`;

  const width = dimensionOf(coordinates);
  const tag = width >= 4 ? " ZM" : width === 3 ? " Z" : "";
  const depth = DEPTH[geometry.type] ?? 1;

  if (geometry.type === "Point") return `${name}${tag} (${positions(coordinates)})`;
  return `${name}${tag} ${wrap(coordinates, depth)}`;
}

export function writeWKT(ds: Dataset): string {
  if (ds.features.some((f) => f.properties && Object.keys(f.properties).length)) {
    ds.notes.push("Plain .wkt carries geometry only — every attribute was dropped.");
  }
  return ds.features.map((f) => geometryToWKT(f.geometry)).join("\n") + (ds.features.length ? "\n" : "");
}
