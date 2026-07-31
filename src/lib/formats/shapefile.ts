/* eslint-disable @typescript-eslint/no-explicit-any */
import { ByteWriter, utf8 } from "../bytes";
import { closeRing, propertyKeys, signedArea } from "../geo";
import type { Dataset, Feature, GenerateOptions, Position } from "../types";
import type { ZipEntry } from "../zip";

const NULL_SHAPE = 0;
const POINT = 1;
const POLYLINE = 3;
const POLYGON = 5;
const MULTIPOINT = 8;

const WGS84_PRJ =
  'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],' +
  'PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';

const GEOMETRY_TO_SHAPE: Record<string, number> = {
  Point: POINT,
  MultiPoint: MULTIPOINT,
  LineString: POLYLINE,
  MultiLineString: POLYLINE,
  Polygon: POLYGON,
  MultiPolygon: POLYGON,
};

/** The rings/lines that make up a multi-part record. */
function partsOf(feature: Feature): Position[][] {
  const geometry = feature.geometry;
  const c = geometry?.coordinates;
  if (!Array.isArray(c)) return [];
  switch (geometry?.type) {
    case "LineString":
      return [c as Position[]];
    case "MultiLineString":
    case "Polygon":
      return (c as Position[][]).filter(Array.isArray);
    case "MultiPolygon":
      return (c as Position[][][]).filter(Array.isArray).flat().filter(Array.isArray);
    default:
      return [];
  }
}

function pointsOf(feature: Feature): Position[] {
  const c = feature.geometry?.coordinates;
  if (!Array.isArray(c)) return [];
  return feature.geometry?.type === "MultiPoint" ? (c as Position[]).filter(Array.isArray) : [];
}

function boxOf(positions: Position[]): [number, number, number, number] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const pos of positions) {
    const x = Number(pos?.[0]);
    const y = Number(pos?.[1]);
    if (Number.isFinite(x)) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
    }
    if (Number.isFinite(y)) {
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  if (!Number.isFinite(minX)) return [0, 0, 0, 0];
  return [minX, minY, maxX, maxY];
}

/**
 * Shapefiles wind exterior rings clockwise — the opposite of GeoJSON. Fixed on
 * the way out unless the caller asked for broken winding, in which case
 * whatever the mutation produced is passed straight through.
 */
function orientRings(feature: Feature, rings: Position[][], fixWinding: boolean, close: boolean): Position[][] {
  if (feature.geometry?.type !== "Polygon" && feature.geometry?.type !== "MultiPolygon") return rings;
  return rings.map((ring, index) => {
    let out = close ? closeRing(ring) : ring;
    if (fixWinding) {
      const area = signedArea(out);
      const wantsClockwise = index === 0;
      if (wantsClockwise ? area > 0 : area < 0) out = out.slice().reverse();
    }
    return out;
  });
}

/* ── DBF ─────────────────────────────────────────────────────────────────── */

interface DbfField {
  source: string;
  name: string;
  type: "C" | "N" | "L";
  length: number;
  decimals: number;
}

function sanitizeName(
  key: string,
  used: Set<string>,
): { name: string; truncated: boolean; collided: boolean } {
  let base = key.normalize("NFKD").replace(/[^A-Za-z0-9_]/g, "_");
  if (!base) base = "FIELD";
  if (/^[0-9]/.test(base)) base = `F${base}`;
  const truncated = base.length > 10;
  base = base.slice(0, 10);

  const collided = used.has(base);
  let name = base;
  let n = 1;
  while (used.has(name)) {
    const suffix = String(++n);
    name = base.slice(0, 10 - suffix.length) + suffix;
  }
  used.add(name);
  return { name, truncated, collided };
}

function buildFields(ds: Dataset): { fields: DbfField[]; notes: string[] } {
  const notes: string[] = [];
  const used = new Set<string>();
  const fields: DbfField[] = [];
  let collisions = 0;
  let truncations = 0;

  for (const key of propertyKeys(ds.features)) {
    if (fields.length >= 255) {
      notes.push(`DBF allows 255 fields — extra attribute columns were dropped.`);
      break;
    }
    const values = ds.features
      .map((f) => f.properties?.[key])
      .filter((v) => v !== null && v !== undefined);

    const allBool = values.length > 0 && values.every((v) => typeof v === "boolean");
    const allNumber = values.length > 0 && values.every((v) => typeof v === "number");
    const allInteger = allNumber && values.every((v) => Number.isInteger(v));

    let field: DbfField;
    if (allBool) {
      field = { source: key, name: "", type: "L", length: 1, decimals: 0 };
    } else if (allNumber) {
      field = { source: key, name: "", type: "N", length: 18, decimals: allInteger ? 0 : 6 };
    } else {
      const width = values.reduce<number>(
        (max, v) => Math.max(max, utf8(typeof v === "object" ? JSON.stringify(v) : String(v)).length),
        1,
      );
      field = { source: key, name: "", type: "C", length: Math.min(254, width), decimals: 0 };
    }

    const { name, truncated, collided } = sanitizeName(key, used);
    if (truncated) truncations++;
    if (collided) collisions++;
    field.name = name;
    fields.push(field);
  }

  if (truncations) {
    notes.push(`${truncations} attribute name(s) truncated to the DBF 10-character limit.`);
  }
  if (collisions) {
    notes.push(`${collisions} field name(s) were renamed after truncation collided.`);
  }
  return { fields, notes };
}

function dbfValue(field: DbfField, raw: any): Uint8Array {
  const out = new Uint8Array(field.length).fill(0x20);
  if (raw === null || raw === undefined) return out;

  if (field.type === "L") {
    out[0] = raw ? 0x54 : 0x46; // T / F
    return out;
  }

  if (field.type === "N") {
    if (typeof raw !== "number" || !Number.isFinite(raw)) return out;
    let text = field.decimals > 0 ? raw.toFixed(field.decimals) : String(Math.trunc(raw));
    // dBase marks numeric overflow with asterisks rather than truncating.
    if (text.length > field.length) text = "*".repeat(field.length);
    const bytes = utf8(text);
    out.set(bytes, field.length - bytes.length);
    return out;
  }

  const text = typeof raw === "object" ? JSON.stringify(raw) : String(raw);
  let bytes = utf8(text);
  if (bytes.length > field.length) {
    // Trim whole code points so truncation never invents invalid UTF-8. Take at
    // most `length` code points up front — every one is a byte or more, so the
    // loop that follows runs a handful of times rather than once per character
    // of a 100 KB value.
    const cut = [...text].slice(0, field.length);
    while (cut.length && utf8(cut.join("")).length > field.length) cut.pop();
    bytes = utf8(cut.join(""));
  }
  out.set(bytes, 0);
  return out;
}

function writeDbf(features: Feature[], fields: DbfField[]): Uint8Array {
  const out = new ByteWriter(64 * 1024);
  const recordLength = 1 + fields.reduce((sum, f) => sum + f.length, 0);
  const headerLength = 32 + 32 * fields.length + 1;

  out.u8(0x03);
  out.u8(124); // 2024, stored as year - 1900
  out.u8(1);
  out.u8(1);
  out.u32le(features.length);
  out.u16le(headerLength);
  out.u16le(recordLength);
  for (let i = 0; i < 20; i++) out.u8(0);

  for (const field of fields) {
    out.fixed(utf8(field.name), 11);
    out.bytes(utf8(field.type));
    out.u32le(0); // field data address, unused
    out.u8(field.length);
    out.u8(field.decimals);
    for (let i = 0; i < 14; i++) out.u8(0);
  }
  out.u8(0x0d);

  for (const feature of features) {
    out.u8(0x20); // not deleted
    for (const field of fields) out.bytes(dbfValue(field, feature.properties?.[field.source]));
  }
  out.u8(0x1a);

  return out.toUint8Array();
}

/* ── SHP / SHX ───────────────────────────────────────────────────────────── */

function writeShpHeader(out: ByteWriter, fileWords: number, shapeType: number, box: number[]): void {
  out.i32be(9994);
  for (let i = 0; i < 5; i++) out.i32be(0);
  out.i32be(fileWords);
  out.i32le(1000);
  out.i32le(shapeType);
  out.f64le(box[0]);
  out.f64le(box[1]);
  out.f64le(box[2]);
  out.f64le(box[3]);
  for (let i = 0; i < 4; i++) out.f64le(0); // Z and M ranges
}

/** Returns the five sidecar files; the caller bundles them into the .zip. */
export function writeShapefile(
  ds: Dataset,
  opts: GenerateOptions,
  baseName: string,
): { entries: ZipEntry[]; notes: string[] } {
  const notes: string[] = [];

  // A shapefile holds exactly one geometry type; the majority wins.
  const tally = new Map<number, number>();
  for (const feature of ds.features) {
    const shape = GEOMETRY_TO_SHAPE[feature.geometry?.type ?? ""];
    if (shape) tally.set(shape, (tally.get(shape) ?? 0) + 1);
  }
  const shapeType = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? POINT;

  const fixWinding = !opts.problems.includes("wrong-winding");
  const closeRings = !opts.problems.includes("unclosed-rings");

  const shp = new ByteWriter(256 * 1024);
  const index: Array<{ offset: number; words: number }> = [];
  const allPositions: Position[] = [];
  let coerced = 0;

  writeShpHeader(shp, 0, shapeType, [0, 0, 0, 0]); // patched once sizes are known

  ds.features.forEach((feature, i) => {
    const offsetWords = shp.length / 2;
    const geometryShape = GEOMETRY_TO_SHAPE[feature.geometry?.type ?? ""];
    const usable = geometryShape === shapeType;
    if (!usable && feature.geometry) coerced++;

    const body = new ByteWriter(256);

    if (!usable) {
      body.i32le(NULL_SHAPE);
    } else if (shapeType === POINT) {
      const pos = (feature.geometry!.coordinates ?? []) as Position;
      body.i32le(POINT).f64le(pos[0]).f64le(pos[1]);
      allPositions.push(pos);
    } else if (shapeType === MULTIPOINT) {
      const points = pointsOf(feature);
      const box = boxOf(points);
      body.i32le(MULTIPOINT);
      for (const v of box) body.f64le(v);
      body.i32le(points.length);
      for (const pos of points) body.f64le(pos?.[0]).f64le(pos?.[1]);
      allPositions.push(...points);
    } else {
      const parts = orientRings(feature, partsOf(feature), fixWinding, closeRings);
      const flat = parts.flat();
      const box = boxOf(flat);
      body.i32le(shapeType);
      for (const v of box) body.f64le(v);
      body.i32le(parts.length);
      body.i32le(flat.length);
      let running = 0;
      for (const part of parts) {
        body.i32le(running);
        running += part.length;
      }
      for (const pos of flat) body.f64le(pos?.[0]).f64le(pos?.[1]);
      allPositions.push(...flat);
    }

    const content = body.toUint8Array();
    shp.i32be(i + 1).i32be(content.length / 2);
    shp.bytes(content);
    index.push({ offset: offsetWords, words: content.length / 2 });
  });

  const box = boxOf(allPositions);
  const shpBytes = shp.toUint8Array();
  patchHeader(shpBytes, shpBytes.length / 2, shapeType, box);

  const shx = new ByteWriter(1024 + index.length * 8);
  writeShpHeader(shx, (100 + index.length * 8) / 2, shapeType, box);
  for (const entry of index) shx.i32be(entry.offset).i32be(entry.words);

  const { fields, notes: dbfNotes } = buildFields(ds);
  notes.push(...dbfNotes);

  if (coerced) {
    notes.push(
      `A shapefile holds one geometry type — ${coerced} feature(s) of another type became null shapes (attributes kept, geometry lost).`,
    );
  }
  const nulls = ds.features.filter((f) => !f.geometry).length;
  if (nulls) notes.push(`${nulls} feature(s) with no geometry were written as null shapes.`);
  notes.push("Text is UTF-8 with a .cpg declaring it — readers that ignore .cpg will show mojibake.");

  const entries: ZipEntry[] = [
    { name: `${baseName}.shp`, data: shpBytes },
    { name: `${baseName}.shx`, data: shx.toUint8Array() },
    { name: `${baseName}.dbf`, data: writeDbf(ds.features, fields) },
    { name: `${baseName}.prj`, data: utf8(WGS84_PRJ) },
    { name: `${baseName}.cpg`, data: utf8("UTF-8") },
  ];

  return { entries, notes };
}

/** Rewrites the file length and bounding box now that both are known. */
function patchHeader(bytes: Uint8Array, fileWords: number, shapeType: number, box: number[]): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  view.setInt32(24, fileWords, false);
  view.setInt32(32, shapeType, true);
  view.setFloat64(36, box[0], true);
  view.setFloat64(44, box[1], true);
  view.setFloat64(52, box[2], true);
  view.setFloat64(60, box[3], true);
}
