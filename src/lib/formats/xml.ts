/* eslint-disable @typescript-eslint/no-explicit-any */
import { isPosition } from "../geo";
import type { Dataset, Feature, Geometry } from "../types";

export function esc(value: any): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** KML tuples are lon,lat[,alt] separated by whitespace. */
function kmlCoords(node: any): string {
  if (!Array.isArray(node)) return "";
  if (isPosition(node)) return node.map((v) => (v === null || v === undefined ? "" : v)).join(",");
  return node.map(kmlCoords).join(" ");
}

function widest(node: any, seen = { max: 2 }): number {
  if (Array.isArray(node)) {
    if (isPosition(node)) seen.max = Math.max(seen.max, node.length);
    else for (const child of node) widest(child, seen);
  }
  return seen.max;
}

function kmlGeometry(geometry: Geometry | null | undefined, indent: string): string {
  if (!geometry) return "";
  const pad = indent + "  ";
  const c = geometry.coordinates;

  switch (geometry.type) {
    case "Point":
      return `${indent}<Point><coordinates>${kmlCoords(c)}</coordinates></Point>`;
    case "LineString":
      return `${indent}<LineString><coordinates>${kmlCoords(c)}</coordinates></LineString>`;
    case "MultiPoint":
      return [
        `${indent}<MultiGeometry>`,
        ...(c ?? []).map((p: any) => `${pad}<Point><coordinates>${kmlCoords(p)}</coordinates></Point>`),
        `${indent}</MultiGeometry>`,
      ].join("\n");
    case "MultiLineString":
      return [
        `${indent}<MultiGeometry>`,
        ...(c ?? []).map(
          (l: any) => `${pad}<LineString><coordinates>${kmlCoords(l)}</coordinates></LineString>`,
        ),
        `${indent}</MultiGeometry>`,
      ].join("\n");
    case "Polygon":
      return kmlPolygon(c, indent);
    case "MultiPolygon":
      return [
        `${indent}<MultiGeometry>`,
        ...(c ?? []).map((p: any) => kmlPolygon(p, pad)),
        `${indent}</MultiGeometry>`,
      ].join("\n");
    case "GeometryCollection":
      return [
        `${indent}<MultiGeometry>`,
        ...(geometry.geometries ?? []).map((g) => kmlGeometry(g, pad)),
        `${indent}</MultiGeometry>`,
      ].join("\n");
    default:
      return `${indent}<!-- unsupported geometry: ${esc(geometry.type)} -->`;
  }
}

function kmlPolygon(rings: any, indent: string): string {
  const pad = indent + "  ";
  const list: any[] = Array.isArray(rings) ? rings : [];
  const out = [`${indent}<Polygon>`];
  list.forEach((ring, index) => {
    const boundary = index === 0 ? "outerBoundaryIs" : "innerBoundaryIs";
    out.push(
      `${pad}<${boundary}><LinearRing><coordinates>${kmlCoords(ring)}</coordinates></LinearRing></${boundary}>`,
    );
  });
  if (!list.length) out.push(`${pad}<outerBoundaryIs><LinearRing><coordinates/></LinearRing></outerBoundaryIs>`);
  out.push(`${indent}</Polygon>`);
  return out.join("\n");
}

export function writeKML(ds: Dataset): string {
  const out: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<kml xmlns="http://www.opengis.net/kml/2.2">',
    "  <Document>",
    "    <name>Null Island fixture</name>",
  ];

  let overWide = false;
  let geometryless = 0;

  for (const feature of ds.features) {
    const props = feature.properties ?? {};
    const hasId = feature.id !== undefined && feature.id !== null;
    out.push(hasId ? `    <Placemark id="${esc(feature.id)}">` : "    <Placemark>");
    if (props.name !== undefined) out.push(`      <name>${esc(props.name)}</name>`);
    if (props.description !== undefined) {
      out.push(`      <description>${esc(props.description)}</description>`);
    }

    const dataKeys = Object.keys(props).filter((k) => k !== "name" && k !== "description");
    if (dataKeys.length) {
      out.push("      <ExtendedData>");
      for (const key of dataKeys) {
        out.push(`        <Data name="${esc(key)}"><value>${esc(props[key])}</value></Data>`);
      }
      out.push("      </ExtendedData>");
    }

    if (feature.geometry) {
      if (widest(feature.geometry.coordinates) > 3) overWide = true;
      out.push(kmlGeometry(feature.geometry, "      "));
    } else {
      geometryless++;
    }
    out.push("    </Placemark>");
  }

  out.push("  </Document>", "</kml>", "");

  if (overWide) {
    ds.notes.push("KML tuples carry more than lon,lat,alt — four-part coordinates are out of spec.");
  }
  if (geometryless) {
    ds.notes.push(`${geometryless} Placemark(s) written with no geometry at all.`);
  }
  return out.join("\n");
}

/* ── GPX ─────────────────────────────────────────────────────────────────── */

const ISO_LIKE = /^\d{4}-\d{2}-\d{2}[T ]/;

function gpxExtensions(props: Record<string, any>, skip: Set<string>): string[] {
  const keys = Object.keys(props).filter((k) => !skip.has(k));
  if (!keys.length) return [];
  return [
    "      <extensions>",
    ...keys.map((k) => `        <md:field name="${esc(k)}">${esc(props[k])}</md:field>`),
    "      </extensions>",
  ];
}

function gpxPointBody(props: Record<string, any>, ele: any): string[] {
  const out: string[] = [];
  const skip = new Set(["name", "description", "updated_at"]);
  if (ele !== undefined && ele !== null) out.push(`      <ele>${esc(ele)}</ele>`);
  if (typeof props.updated_at === "string" && ISO_LIKE.test(props.updated_at)) {
    out.push(`      <time>${esc(props.updated_at)}</time>`);
  }
  if (props.name !== undefined) out.push(`      <name>${esc(props.name)}</name>`);
  if (props.description !== undefined) out.push(`      <desc>${esc(props.description)}</desc>`);
  out.push(...gpxExtensions(props, skip));
  return out;
}

function trkpt(pos: any[], indent: string): string {
  const attrs = `lat="${esc(pos?.[1])}" lon="${esc(pos?.[0])}"`;
  const ele = pos?.[2];
  if (ele === undefined || ele === null) return `${indent}<trkpt ${attrs}/>`;
  return `${indent}<trkpt ${attrs}><ele>${esc(ele)}</ele></trkpt>`;
}

export function writeGPX(ds: Dataset): string {
  const out: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="Null Island" xmlns="http://www.topografix.com/GPX/1/1" xmlns:md="https://nullisland.app/gpx/1">',
  ];

  const waypoints: string[] = [];
  const tracks: string[] = [];
  let skipped = 0;
  let polygonsFlattened = 0;

  const addTrack = (segments: any[][], feature: Feature): void => {
    const props = feature.properties ?? {};
    tracks.push("  <trk>");
    if (props.name !== undefined) tracks.push(`    <name>${esc(props.name)}</name>`);
    tracks.push(...gpxExtensions(props, new Set(["name"])).map((l) => l.slice(2)));
    for (const segment of segments) {
      tracks.push("    <trkseg>");
      for (const pos of segment ?? []) tracks.push(trkpt(pos, "      "));
      tracks.push("    </trkseg>");
    }
    tracks.push("  </trk>");
  };

  const collect = (geometry: Geometry | null | undefined, feature: Feature): void => {
    if (!geometry) {
      skipped++;
      return;
    }
    const c = geometry.coordinates;
    switch (geometry.type) {
      case "Point": {
        const pos = (c ?? []) as any[];
        waypoints.push(`  <wpt lat="${esc(pos[1])}" lon="${esc(pos[0])}">`);
        waypoints.push(...gpxPointBody(feature.properties ?? {}, pos[2]));
        waypoints.push("  </wpt>");
        break;
      }
      case "MultiPoint":
        for (const pos of (c ?? []) as any[]) {
          waypoints.push(`  <wpt lat="${esc(pos?.[1])}" lon="${esc(pos?.[0])}">`);
          waypoints.push(...gpxPointBody(feature.properties ?? {}, pos?.[2]));
          waypoints.push("  </wpt>");
        }
        break;
      case "LineString":
        addTrack([c ?? []], feature);
        break;
      case "MultiLineString":
        addTrack((c ?? []) as any[][], feature);
        break;
      case "Polygon":
        polygonsFlattened++;
        addTrack([(c ?? [])[0] ?? []], feature);
        break;
      case "MultiPolygon":
        polygonsFlattened++;
        addTrack(((c ?? []) as any[]).map((p: any) => p?.[0] ?? []), feature);
        break;
      case "GeometryCollection":
        for (const g of geometry.geometries ?? []) collect(g, feature);
        break;
      default:
        skipped++;
    }
  };

  for (const feature of ds.features) collect(feature.geometry, feature);

  out.push(...waypoints, ...tracks, "</gpx>", "");

  if (polygonsFlattened) {
    ds.notes.push(
      `GPX has no polygon type — ${polygonsFlattened} polygon(s) were flattened to tracks and their holes dropped.`,
    );
  }
  if (skipped) {
    ds.notes.push(`${skipped} feature(s) had no usable geometry for GPX and were dropped entirely.`);
  }
  if (ds.features.some((f) => f.properties && Object.keys(f.properties).length > 3)) {
    ds.notes.push("Attributes beyond name/desc/time live in a non-standard <extensions> block.");
  }
  return out.join("\n");
}
