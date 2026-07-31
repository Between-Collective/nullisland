import { buildBase } from "./base";
import { utf8 } from "./bytes";
import { forEachPosition } from "./geo";
import { writeCSV } from "./formats/csv";
import { getFormat } from "./formats/index";
import { writeGeoJSON, writeNDJSON, writeTopoJSON } from "./formats/json";
import { writeShapefile } from "./formats/shapefile";
import { writeWKT } from "./formats/wkt";
import { writeGPX, writeKML } from "./formats/xml";
import { applyProblems } from "./mutate";
import { appliesTo, getProblem } from "./problems";
import { Rng } from "./rng";
import { addBom, injectNanLiterals, malformJson, mixLineEndings, mojibakeStrings } from "./text";
import type { Dataset, GenerateOptions, GeneratedFile, MapPreview } from "./types";
import { makeZip, type ZipEntry } from "./zip";

const PREVIEW_LINES = 400;
const PREVIEW_CHARS = 24000;

export const MAX_FEATURES = 100000;

function serialize(ds: Dataset, opts: GenerateOptions): string {
  switch (opts.format) {
    case "ndjson":
      return writeNDJSON(ds, opts);
    case "csv":
      return writeCSV(ds);
    case "kml":
    case "kmz":
      return writeKML(ds);
    case "gpx":
      return writeGPX(ds);
    case "wkt":
      return writeWKT(ds);
    case "topojson":
      return writeTopoJSON(ds, opts);
    default:
      return writeGeoJSON(ds, opts);
  }
}

function applyTextProblems(
  text: string,
  ids: Set<string>,
  opts: GenerateOptions,
  rng: Rng,
  notes: string[],
): string {
  let out = text;
  const isJson = opts.format === "geojson" || opts.format === "ndjson" || opts.format === "topojson";

  if (ids.has("malformed-json") && isJson) {
    const result = malformJson(out, rng);
    out = result.text;
    notes.push(...result.notes);
  }
  if (ids.has("nan-literal") && isJson) {
    const result = injectNanLiterals(out, rng);
    out = result.text;
    notes.push(...result.notes);
  }
  if (ids.has("mojibake")) {
    const result = mojibakeStrings(out);
    out = result.text;
    notes.push(...result.notes);
  }
  if (ids.has("crlf")) {
    out = mixLineEndings(out, rng);
    notes.push("Line endings are a mix of LF and CRLF.");
  }
  // Always last: a BOM belongs at byte zero.
  if (ids.has("bom")) {
    out = addBom(out);
    notes.push("File starts with a UTF-8 BOM.");
  }
  return out;
}

function hexdump(bytes: Uint8Array, limit = 256): string {
  const lines: string[] = [];
  const end = Math.min(bytes.length, limit);
  for (let offset = 0; offset < end; offset += 16) {
    const slice = bytes.subarray(offset, Math.min(offset + 16, end));
    const hex = [...slice].map((b) => b.toString(16).padStart(2, "0")).join(" ").padEnd(47, " ");
    const ascii = [...slice].map((b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : ".")).join("");
    lines.push(`${offset.toString(16).padStart(8, "0")}  ${hex}  |${ascii}|`);
  }
  if (bytes.length > end) lines.push(`… ${(bytes.length - end).toLocaleString()} more bytes`);
  return lines.join("\n");
}

const MAP_SAMPLE_LIMIT = 1600;

/**
 * Walks every position once, keeping an evenly-spread sample. Counting invalid
 * and out-of-range positions here (rather than filtering them out) is the
 * point: "412 positions are off-world" is exactly what the user needs to see.
 */
function buildMapPreview(ds: Dataset): MapPreview {
  const all: Array<[number, number]> = [];
  let total = 0;
  let invalid = 0;
  let outOfRange = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const feature of ds.features) {
    forEachPosition(feature.geometry, (pos) => {
      total++;
      const lon = Number(pos[0]);
      const lat = Number(pos[1]);
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
        invalid++;
        return;
      }
      if (Math.abs(lon) > 180 || Math.abs(lat) > 90) {
        outOfRange++;
        return;
      }
      minX = Math.min(minX, lon);
      maxX = Math.max(maxX, lon);
      minY = Math.min(minY, lat);
      maxY = Math.max(maxY, lat);
      all.push([lon, lat]);
    });
  }

  // Even stride rather than head-truncation, so a vertex bomb or a trailing
  // cluster still shows up in the plot.
  let points = all;
  if (all.length > MAP_SAMPLE_LIMIT) {
    const stride = all.length / MAP_SAMPLE_LIMIT;
    points = [];
    for (let i = 0; i < MAP_SAMPLE_LIMIT; i++) points.push(all[Math.floor(i * stride)]);
  }

  return {
    points,
    total,
    invalid,
    outOfRange,
    bbox: Number.isFinite(minX) ? [minX, minY, maxX, maxY] : null,
  };
}

function truncate(text: string): { preview: string; truncated: boolean } {
  const lines = text.split("\n");
  let clipped = false;
  let out = text;
  if (lines.length > PREVIEW_LINES) {
    out = lines.slice(0, PREVIEW_LINES).join("\n");
    clipped = true;
  }
  if (out.length > PREVIEW_CHARS) {
    out = out.slice(0, PREVIEW_CHARS);
    clipped = true;
  }
  return { preview: out, truncated: clipped };
}

export function generate(options: GenerateOptions): GeneratedFile {
  const opts: GenerateOptions = {
    ...options,
    count: Math.max(0, Math.min(MAX_FEATURES, Math.floor(options.count))),
  };
  const rng = new Rng(opts.seed);
  const format = getFormat(opts.format);

  // Split the selection: what this format can express, and what it can't.
  const usable: string[] = [];
  const skipped: string[] = [];
  for (const id of opts.problems) {
    const problem = getProblem(id);
    if (!problem) continue;
    (appliesTo(problem, opts.format) ? usable : skipped).push(id);
  }

  const dataIds = usable.filter((id) => getProblem(id)?.phase === "data");
  const textIds = new Set(usable.filter((id) => getProblem(id)?.phase === "text"));

  const ds = buildBase(opts, rng);
  applyProblems(ds, dataIds, opts, rng);

  // Sampled before serialisation, so it reflects the mutated geometry itself
  // rather than whatever a lossy format was able to keep.
  const map = buildMapPreview(ds);

  if (skipped.length) {
    ds.notes.push(
      `${format.label} can't express: ${skipped
        .map((id) => getProblem(id)?.label ?? id)
        .join(", ")}. Skipped.`,
    );
  }

  const base = `nullisland-${ds.features.length}-${opts.seed}`;
  const filename = `${base}.${format.ext}`;

  let data: string | Uint8Array;
  let preview: string;
  let previewTruncated = false;

  if (opts.format === "shapefile") {
    const { entries, notes } = writeShapefile(ds, opts, base);
    ds.notes.push(...notes);
    data = makeZip(entries);
    const listing = entries
      .map((e) => `  ${e.name.padEnd(30, " ")} ${e.data.length.toLocaleString().padStart(12)} bytes`)
      .join("\n");
    preview = [
      `ZIP archive · ${entries.length} entries · ${data.length.toLocaleString()} bytes`,
      listing,
      "",
      `── ${entries[0].name} (first 256 bytes) ──`,
      hexdump(entries[0].data),
    ].join("\n");
    previewTruncated = true;
  } else if (opts.format === "kmz") {
    const kml = applyTextProblems(serialize(ds, opts), textIds, opts, rng, ds.notes);
    const entries: ZipEntry[] = [{ name: "doc.kml", data: utf8(kml) }];
    data = makeZip(entries);
    const inner = truncate(kml);
    previewTruncated = inner.truncated;
    preview = [
      `ZIP archive · doc.kml · ${utf8(kml).length.toLocaleString()} bytes uncompressed`,
      "",
      inner.preview,
    ].join("\n");
  } else {
    const text = applyTextProblems(serialize(ds, opts), textIds, opts, rng, ds.notes);
    data = text;
    const clipped = truncate(text);
    preview = clipped.preview;
    previewTruncated = clipped.truncated;
  }

  const bytes = typeof data === "string" ? utf8(data).length : data.length;

  return {
    filename,
    mime: format.mime,
    data,
    bytes,
    preview,
    previewTruncated,
    notes: ds.notes,
    map,
    stats: { features: ds.features.length, problems: usable },
  };
}
