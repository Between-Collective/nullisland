import type { FormatId } from "../types";

export interface FormatMeta {
  id: FormatId;
  label: string;
  ext: string;
  mime: string;
  binary: boolean;
  /** What this container is good at breaking, in one line. */
  blurb: string;
}

export const FORMATS: FormatMeta[] = [
  {
    id: "geojson",
    label: "GeoJSON",
    ext: "geojson",
    mime: "application/geo+json",
    binary: false,
    blurb: "RFC 7946. The default everywhere, and the loosest in practice.",
  },
  {
    id: "ndjson",
    label: "GeoJSONL",
    ext: "geojsonl",
    mime: "application/geo+json-seq",
    binary: false,
    blurb: "Newline-delimited features. Streams well, breaks on line endings.",
  },
  {
    id: "csv",
    label: "CSV",
    ext: "csv",
    mime: "text/csv",
    binary: false,
    blurb: "Lat/lon columns plus WKT. Quoting and formula injection live here.",
  },
  {
    id: "kml",
    label: "KML",
    ext: "kml",
    mime: "application/vnd.google-earth.kml+xml",
    binary: false,
    blurb: "Google Earth XML. Coordinates are lon,lat,alt — easy to mis-read.",
  },
  {
    id: "kmz",
    label: "KMZ",
    ext: "kmz",
    mime: "application/vnd.google-earth.kmz",
    binary: true,
    blurb: "A zipped KML. Tests that your loader unzips before it parses.",
  },
  {
    id: "gpx",
    label: "GPX",
    ext: "gpx",
    mime: "application/gpx+xml",
    binary: false,
    blurb: "GPS tracks. No polygons, no real attributes — deeply lossy.",
  },
  {
    id: "wkt",
    label: "WKT",
    ext: "wkt",
    mime: "text/plain",
    binary: false,
    blurb: "Bare geometry, one per line. Every attribute is dropped.",
  },
  {
    id: "topojson",
    label: "TopoJSON",
    ext: "topojson",
    mime: "application/json",
    binary: false,
    blurb: "Arc-indexed topology. Most viewers need a conversion step first.",
  },
  {
    id: "shapefile",
    label: "Shapefile",
    ext: "zip",
    mime: "application/zip",
    binary: true,
    blurb: "shp/shx/dbf/prj/cpg in a zip. 10-char fields, one geometry type.",
  },
];

const BY_ID = new Map(FORMATS.map((f) => [f.id, f]));

export function getFormat(id: FormatId): FormatMeta {
  return BY_ID.get(id) ?? FORMATS[0];
}
