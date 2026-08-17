/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Dataset, GenerateOptions } from "../types";

function stringify(value: any, pretty: boolean): string {
  return JSON.stringify(value, null, pretty ? 2 : 0);
}

export function writeGeoJSON(ds: Dataset, opts: GenerateOptions): string {
  const { crs, bbox, ...rest } = ds.extras;
  const collection: Record<string, any> = { type: "FeatureCollection" };
  // crs and bbox come before features so they read the way real exports do.
  if (crs) collection.crs = crs;
  if (bbox) collection.bbox = bbox;
  Object.assign(collection, rest);
  collection.features = ds.features;
  return stringify(collection, opts.pretty);
}

export function writeNDJSON(ds: Dataset, opts: GenerateOptions): string {
  void opts; // Newline-delimited output is always one compact object per line.
  return ds.features.map((f) => JSON.stringify(f)).join("\n") + (ds.features.length ? "\n" : "");
}

/**
 * TopoJSON without quantisation or a transform, which the spec permits. Each
 * ring and line becomes a standalone arc — no shared-boundary detection, since
 * the point here is coverage of the container format, not topology quality.
 */
export function writeTopoJSON(ds: Dataset, opts: GenerateOptions): string {
  const arcs: any[] = [];

  const addArc = (positions: any): number => {
    arcs.push(Array.isArray(positions) ? positions : []);
    return arcs.length - 1;
  };

  const convert = (geometry: any): any => {
    if (!geometry) return { type: null };
    switch (geometry.type) {
      case "Point":
      case "MultiPoint":
        return { type: geometry.type, coordinates: geometry.coordinates };
      case "LineString":
        return { type: "LineString", arcs: [addArc(geometry.coordinates)] };
      case "MultiLineString":
        return {
          type: "MultiLineString",
          arcs: (geometry.coordinates ?? []).map((line: any) => [addArc(line)]),
        };
      case "Polygon":
        return {
          type: "Polygon",
          arcs: (geometry.coordinates ?? []).map((ring: any) => [addArc(ring)]),
        };
      case "MultiPolygon":
        return {
          type: "MultiPolygon",
          arcs: (geometry.coordinates ?? []).map((polygon: any) =>
            (polygon ?? []).map((ring: any) => [addArc(ring)]),
          ),
        };
      case "GeometryCollection":
        return {
          type: "GeometryCollection",
          geometries: (geometry.geometries ?? []).map(convert),
        };
      default:
        return { type: geometry.type, coordinates: geometry.coordinates };
    }
  };

  const geometries = ds.features.map((f) => {
    const geometry = convert(f.geometry);
    if (f.id !== undefined) geometry.id = f.id;
    if (f.properties) geometry.properties = f.properties;
    return geometry;
  });

  const topology: Record<string, any> = { type: "Topology" };
  if (ds.extras.bbox) topology.bbox = ds.extras.bbox;
  const { crs, bbox, ...rest } = ds.extras;
  void crs;
  void bbox;
  Object.assign(topology, rest);
  topology.objects = { data: { type: "GeometryCollection", geometries } };
  topology.arcs = arcs;
  return stringify(topology, opts.pretty);
}
