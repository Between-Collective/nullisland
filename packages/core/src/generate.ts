import { group } from "./format";
import { buildBase } from "./base";
import {
  boundaryContains,
  buildBoundary,
  coversWorld,
  getBoundaryMeta,
  regionExtent,
  tagFeatures,
  writeBoundaryGeoJSON,
  type Boundary,
} from "./boundary";
import { utf8 } from "./bytes";
import { excelRoundtrip, unquotedCommas } from "./domain";
import { forEachPosition } from "./geo";
import { getRegion } from "./regions";
import { writeCSV } from "./formats/csv";
import { getFormat } from "./formats/index";
import { writeGeoJSON, writeNDJSON, writeTopoJSON } from "./formats/json";
import { writeShapefile } from "./formats/shapefile";
import { writeWKT } from "./formats/wkt";
import { writeGPX, writeKML } from "./formats/xml";
import { applyProblems } from "./mutate";
import { appliesTo, appliesToProfile, getProblem } from "./problems";
import { getProfile } from "./profiles/index";
import { normaliseSeed, Rng } from "./rng";
import { linkPercent } from "./share";
import { addBom, injectNanLiterals, malformJson, mixLineEndings, mojibakeStrings } from "./text";
import type {
  BoundaryOutput,
  Dataset,
  GenerateOptions,
  GeneratedFile,
  MapPreview,
} from "./types";
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
  // Domain text problems: an exporter that forgot to quote, and the spreadsheet
  // somebody opened the result in. Both are CSV facts, so they run on the CSV.
  if (ids.has("broken-csv-quoting") && opts.format === "csv") {
    const result = unquotedCommas(out);
    out = result.text;
    notes.push(...result.notes);
  }
  if (ids.has("excel-roundtrip") && opts.format === "csv") {
    const result = excelRoundtrip(out);
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
  if (bytes.length > end) lines.push(`… ${group(bytes.length - end)} more bytes`);
  return lines.join("\n");
}

const MAP_SAMPLE_LIMIT = 1600;

/**
 * Walks every position once, keeping an evenly-spread sample. Counting invalid
 * and out-of-range positions here (rather than filtering them out) is the
 * point: "412 positions are off-world" is exactly what the user needs to see.
 */
function buildMapPreview(ds: Dataset, boundary: Boundary | null): MapPreview {
  const all: Array<[number, number]> = [];
  const allInside: number[] = [];
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
      allInside.push(boundary ? (boundaryContains(boundary.geometry, lon, lat) ? 1 : 0) : -1);
    });
  }

  // Even stride rather than head-truncation, so a vertex bomb or a trailing
  // cluster still shows up in the plot.
  let points = all;
  let inside = allInside;
  if (all.length > MAP_SAMPLE_LIMIT) {
    const stride = all.length / MAP_SAMPLE_LIMIT;
    points = [];
    inside = [];
    for (let i = 0; i < MAP_SAMPLE_LIMIT; i++) {
      const at = Math.floor(i * stride);
      points.push(all[at]);
      inside.push(allInside[at]);
    }
  }

  return {
    points,
    inside,
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

/**
 * The boundary file and the counts that make it a test rather than a picture.
 * Counts come from `tagFeatures`, which reads the finished geometry — so they
 * stay true even when a problem has thrown features across the world.
 */
function buildBoundaryOutput(
  boundary: Boundary,
  ds: Dataset,
  opts: GenerateOptions,
  base: string,
): BoundaryOutput {
  const region = getRegion(opts.region);
  const counts = tagFeatures(ds.features, boundary);
  const text = writeBoundaryGeoJSON(boundary, region, opts.seed, opts.pretty);
  const meta = getBoundaryMeta(boundary.shape);
  const matched = counts.inside + counts.crossing;

  ds.notes.push(
    `Boundary: ${meta.label.toLowerCase()} over ${region.label}, written to a separate GeoJSON.`,
    `Of ${group(ds.features.length)} features, ${group(counts.inside)} are ` +
      `fully inside it, ${group(counts.crossing)} cross its edge and ` +
      `${group(counts.outside)} are outside. A contains filter should return ` +
      `${group(counts.inside)}; an intersects filter should return ` +
      `${group(matched)}.`,
    "Every feature carries inside and intersects properties holding the expected answer.",
  );

  if (counts.untagged) {
    ds.notes.push(
      `${group(counts.untagged)} features have no properties object to tag, ` +
        "so they are counted but not labelled.",
    );
  }

  return {
    filename: `${base}-boundary.geojson`,
    mime: "application/geo+json",
    data: text,
    bytes: utf8(text).length,
    shape: boundary.shape,
    rings: boundary.rings,
    bbox: boundary.extent,
    inside: counts.inside,
    crossing: counts.crossing,
    outside: counts.outside,
    preview: truncate(text).preview,
  };
}

export function generate(options: GenerateOptions): GeneratedFile {
  const opts: GenerateOptions = {
    ...options,
    count: Math.max(0, Math.min(MAX_FEATURES, Math.floor(options.count))),
    // Normalised once, here, so the RNG, the filename, the members of a
    // generated ZIP and the boundary's seed property cannot disagree — and so
    // no downstream caller has to remember that this string came from a URL.
    seed: normaliseSeed(options.seed),
    // Same reasoning for the fractions: a share link carries whole percent, so
    // an intensity of 0.437 would produce a file its own link cannot rebuild.
    // Quantising here means every caller — the sliders, the dice, the CLI, a
    // package — lands on a value that survives the round trip.
    intensity: linkPercent(options.intensity),
    coverage: linkPercent(options.coverage),
  };
  const rng = new Rng(opts.seed);
  const format = getFormat(opts.format);

  // Split the selection three ways: what this format can express, what it
  // can't, and what belongs to a data type that isn't loaded.
  const usable: string[] = [];
  const skipped: string[] = [];
  const foreign: string[] = [];
  for (const id of opts.problems) {
    const problem = getProblem(id);
    if (!problem) continue;
    if (!appliesToProfile(problem, opts.profile)) foreign.push(id);
    else if (appliesTo(problem, opts.format)) usable.push(id);
    else skipped.push(id);
  }

  const dataIds = usable.filter((id) => getProblem(id)?.phase === "data");
  const textIds = new Set(usable.filter((id) => getProblem(id)?.phase === "text"));

  // A whole-world boundary has no outside, so nothing can be placed there.
  // Saying so beats spinning through a rejection loop that can never succeed.
  const extent = regionExtent(getRegion(opts.region));
  const worldWide = opts.boundary !== "none" && coversWorld(extent);
  const effective: GenerateOptions = worldWide ? { ...opts, coverage: 1 } : opts;
  const boundary = buildBoundary(rng, extent, effective.boundary);

  const ds = buildBase(effective, rng, boundary);
  applyProblems(ds, dataIds, effective, rng);

  const base = `nullisland-${ds.features.length}-${opts.seed}`;

  // Tagging runs after the problems, so the counts describe the file as it will
  // be written rather than as it was planned.
  const boundaryOutput = boundary ? buildBoundaryOutput(boundary, ds, effective, base) : null;

  if (worldWide) {
    ds.notes.push(
      "A whole-world boundary contains everything, so nothing can sit outside it. " +
        "Pick a city to get an inside/outside split.",
    );
  }

  // Sampled before serialisation, so it reflects the mutated geometry itself
  // rather than whatever a lossy format was able to keep.
  const map = buildMapPreview(ds, boundary);

  if (skipped.length) {
    ds.notes.push(
      `${format.label} can't express: ${skipped
        .map((id) => getProblem(id)?.label ?? id)
        .join(", ")}. Skipped.`,
    );
  }

  if (foreign.length) {
    ds.notes.push(
      `${getProfile(opts.profile).label} data doesn't have: ${foreign
        .map((id) => getProblem(id)?.label ?? id)
        .join(", ")}. Skipped.`,
    );
  }

  const filename = `${base}.${format.ext}`;

  let data: string | Uint8Array;
  let preview: string;
  let previewTruncated = false;

  if (opts.format === "shapefile") {
    const { entries, notes } = writeShapefile(ds, opts, base);
    ds.notes.push(...notes);
    data = makeZip(entries);
    const listing = entries
      .map((e) => `  ${e.name.padEnd(30, " ")} ${group(e.data.length).padStart(12)} bytes`)
      .join("\n");
    preview = [
      `ZIP archive · ${entries.length} entries · ${group(data.length)} bytes`,
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
      `ZIP archive · doc.kml · ${group(utf8(kml).length)} bytes uncompressed`,
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
    boundary: boundaryOutput,
    stats: { features: ds.features.length, problems: usable, profile: opts.profile },
  };
}
