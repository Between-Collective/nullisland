/* eslint-disable */
import { generate, MAX_FEATURES } from "../src/generate";
import { boundaryContains } from "../src/boundary";
import { FORMATS } from "../src/formats/index";
import { signedArea } from "../src/geo";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { group } from "../src/format";
import { buildContext, contextToText } from "../src/context";
import { buildPackage, MAX_PACKAGE_FILES } from "../src/package";
import { PROBLEMS, appliesTo, getProblem } from "../src/problems";
import {
  DEFAULT_PROFILE,
  FAMILIES,
  getProfile,
  PROFILES,
  profileShape,
  profilesInFamily,
} from "../src/profiles/index";
import { randomSeed } from "../src/rng";
import { SEED_WORDS } from "../src/seed-words";
import { decodeApp, decodeConfig, encodeApp, encodeConfig } from "../src/share";
import { buildCatalogue } from "../src/catalogue";
import type { AppConfig, TermsConfig } from "../src/share";
import { generateTerms, MAX_TERMS } from "../src/search/terms";
import { inspectTerms } from "../src/search/clean";
import { QUIRKS, EXCLUSIVE_QUIRKS } from "../src/search/quirks";
import { PLACES, containers, getPlace } from "../src/search/places";
import { SUBJECTS, DEFAULT_SUBJECT_PROFILE } from "../src/search/phrasing";
import { DEFAULT_ANCHOR } from "../src/search/time";
import { TERM_FORMATS, writeTerms } from "../src/search/write";
import type { TermsOptions } from "../src/search/terms";
import type { FormatId, GenerateOptions } from "../src/types";

let failures = 0;
let checks = 0;

function ok(name: string, condition: boolean, detail = "") {
  checks++;
  if (!condition) {
    failures++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function opts(over: Partial<GenerateOptions> = {}): GenerateOptions {
  return {
    format: "geojson",
    count: 60,
    shape: "mixed",
    region: "london",
    profile: "generic",
    problems: [],
    intensity: 0.4,
    seed: "testseed",
    pretty: false,
    boundary: "none",
    coverage: 0.6,
    ...over,
  };
}

/* ── a tiny XML well-formedness checker (no DOMParser in node) ───────────── */
function xmlWellFormed(text: string): string | null {
  const body = text.replace(/^﻿/, "").replace(/<\?xml[^>]*\?>/g, "").replace(/<!--[\s\S]*?-->/g, "");
  const stack: string[] = [];
  const tag = /<(\/?)([A-Za-z_][\w.:-]*)((?:\s+[\w.:-]+\s*=\s*"[^"]*")*)\s*(\/?)>/g;
  let cursor = 0;
  let m: RegExpExecArray | null;
  while ((m = tag.exec(body))) {
    const between = body.slice(cursor, m.index);
    if (between.includes("<") || between.includes(">")) {
      return `unescaped angle bracket in text near offset ${m.index}`;
    }
    cursor = m.index + m[0].length;
    const [, closing, name, , selfClose] = m;
    if (selfClose) continue;
    if (closing) {
      if (stack.pop() !== name) return `mismatched </${name}>`;
    } else {
      stack.push(name);
    }
  }
  const tail = body.slice(cursor);
  if (tail.includes("<") || tail.includes(">")) return "unescaped angle bracket in trailing text";
  if (stack.length) return `unclosed <${stack[stack.length - 1]}>`;
  return null;
}

/* ── zip reader ──────────────────────────────────────────────────────────── */
function crc32(data: Uint8Array): number {
  let table = (crc32 as any)._t;
  if (!table) {
    table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[i] = c >>> 0;
    }
    (crc32 as any)._t = table;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function readZip(bytes: Uint8Array): { name: string; data: Uint8Array }[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("no EOCD");
  const total = view.getUint16(eocd + 10, true);
  let ptr = view.getUint32(eocd + 16, true);
  const out: { name: string; data: Uint8Array }[] = [];
  for (let i = 0; i < total; i++) {
    if (view.getUint32(ptr, true) !== 0x02014b50) throw new Error("bad central signature");
    const crc = view.getUint32(ptr + 16, true);
    const size = view.getUint32(ptr + 24, true);
    const nameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    const localOffset = view.getUint32(ptr + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(ptr + 46, ptr + 46 + nameLen));
    if (view.getUint32(localOffset, true) !== 0x04034b50) throw new Error("bad local signature");
    const localNameLen = view.getUint16(localOffset + 26, true);
    const localExtraLen = view.getUint16(localOffset + 28, true);
    const start = localOffset + 30 + localNameLen + localExtraLen;
    const data = bytes.subarray(start, start + size);
    if (crc32(data) !== crc) throw new Error(`crc mismatch for ${name}`);
    out.push({ name, data });
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

function checkShapefile(zip: Uint8Array): string | null {
  const entries = readZip(zip);
  const shp = entries.find((e) => e.name.endsWith(".shp"))?.data;
  const shx = entries.find((e) => e.name.endsWith(".shx"))?.data;
  const dbf = entries.find((e) => e.name.endsWith(".dbf"))?.data;
  if (!shp || !shx || !dbf) return "missing sidecar";

  const sv = new DataView(shp.buffer, shp.byteOffset, shp.byteLength);
  if (sv.getInt32(0, false) !== 9994) return "bad shp file code";
  if (sv.getInt32(24, false) * 2 !== shp.length) {
    return `shp header length ${sv.getInt32(24, false) * 2} != actual ${shp.length}`;
  }
  if (sv.getInt32(28, true) !== 1000) return "bad shp version";

  // Walk records and confirm they tile the file exactly.
  let offset = 100;
  let records = 0;
  while (offset < shp.length) {
    const num = sv.getInt32(offset, false);
    const words = sv.getInt32(offset + 4, false);
    if (num !== records + 1) return `record number ${num} out of sequence at ${offset}`;
    if (words <= 0) return `non-positive content length at record ${num}`;
    offset += 8 + words * 2;
    records++;
  }
  if (offset !== shp.length) return "records overrun the shp file";

  const xv = new DataView(shx.buffer, shx.byteOffset, shx.byteLength);
  if (xv.getInt32(24, false) * 2 !== shx.length) return "shx header length mismatch";
  if ((shx.length - 100) / 8 !== records) return "shx record count mismatch";

  const dv = new DataView(dbf.buffer, dbf.byteOffset, dbf.byteLength);
  const dbfRecords = dv.getUint32(4, true);
  const headerLen = dv.getUint16(8, true);
  const recordLen = dv.getUint16(10, true);
  if (dbfRecords !== records) return `dbf has ${dbfRecords} rows, shp has ${records}`;
  if (headerLen + dbfRecords * recordLen + 1 !== dbf.length) {
    return `dbf size ${dbf.length} != header ${headerLen} + ${dbfRecords}*${recordLen} + 1`;
  }
  const fieldCount = (headerLen - 33) / 32;
  if (!Number.isInteger(fieldCount)) return "dbf header length is not a whole number of fields";
  let width = 1;
  for (let i = 0; i < fieldCount; i++) width += dbf[32 + i * 32 + 16];
  if (width !== recordLen) return `dbf field widths sum to ${width}, record length says ${recordLen}`;
  return null;
}

/* ── 1. clean output in every format is valid ────────────────────────────── */
console.log("\n1. clean output parses in every format");
for (const format of FORMATS) {
  const file = generate(opts({ format: format.id }));
  const label = format.id.padEnd(10);
  if (format.id === "shapefile") {
    const err = checkShapefile(file.data as Uint8Array);
    ok(`${label} shapefile structure`, !err, err ?? "");
  } else if (format.id === "kmz") {
    const entries = readZip(file.data as Uint8Array);
    ok(`${label} kmz has doc.kml`, entries.length === 1 && entries[0].name === "doc.kml");
    const err = xmlWellFormed(new TextDecoder().decode(entries[0].data));
    ok(`${label} inner kml well-formed`, !err, err ?? "");
  } else {
    const text = file.data as string;
    if (format.id === "geojson" || format.id === "topojson") {
      try { JSON.parse(text); ok(`${label} parses as JSON`, true); }
      catch (e: any) { ok(`${label} parses as JSON`, false, e.message); }
    } else if (format.id === "ndjson") {
      const lines = text.split("\n").filter(Boolean);
      let bad = 0;
      for (const line of lines) { try { JSON.parse(line); } catch { bad++; } }
      ok(`${label} every line parses`, bad === 0, `${bad} bad lines`);
      ok(`${label} line count matches`, lines.length === file.stats.features);
    } else if (format.id === "csv") {
      const rows = text.trimEnd().split("\n");
      const cols = rows[0].split(",").length;
      const ragged = rows.filter((r) => splitCsv(r).length !== cols).length;
      ok(`${label} rectangular`, ragged === 0, `${ragged} ragged rows of ${rows.length}`);
    } else if (format.id === "kml" || format.id === "gpx") {
      const err = xmlWellFormed(text);
      ok(`${label} well-formed XML`, !err, err ?? "");
    }
  }
  console.log(`  ${label} ${String(file.bytes).padStart(9)} bytes  ${file.filename}`);
}

function splitCsv(row: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < row.length; i++) {
    const c = row[i];
    if (quoted) {
      if (c === '"') { if (row[i + 1] === '"') { cur += '"'; i++; } else quoted = false; }
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

/* ── 2. every problem × every applicable format survives ─────────────────── */
console.log("\n2. every problem in every applicable format");
let combos = 0;
for (const problem of PROBLEMS) {
  for (const format of FORMATS) {
    if (!appliesTo(problem, format.id)) continue;
    combos++;
    try {
      const file = generate(opts({ format: format.id, problems: [problem.id], count: 40 }));
      ok(`${problem.id} / ${format.id} produced bytes`, file.bytes > 0 || problem.id === "empty-dataset");
      if (format.id === "shapefile") {
        const err = checkShapefile(file.data as Uint8Array);
        ok(`${problem.id} / shapefile structure`, !err, err ?? "");
      }
      if ((format.id === "kml" || format.id === "gpx") && problem.phase === "data") {
        const err = xmlWellFormed(file.data as string);
        ok(`${problem.id} / ${format.id} still well-formed XML`, !err, err ?? "");
      }
      if ((format.id === "geojson" || format.id === "topojson") && problem.phase === "data") {
        try { JSON.parse(file.data as string); }
        catch (e: any) { ok(`${problem.id} / ${format.id} still valid JSON`, false, e.message); }
      }
    } catch (e: any) {
      ok(`${problem.id} / ${format.id} did not throw`, false, e.stack?.split("\n").slice(0, 3).join(" | "));
    }
  }
}
console.log(`  ${combos} problem/format combinations exercised`);

/* ── 3. all problems at once, every format ───────────────────────────────── */
console.log("\n3. every problem at once");
const allIds = PROBLEMS.map((p) => p.id).filter((id) => id !== "empty-dataset");
for (const format of FORMATS) {
  try {
    const file = generate(opts({ format: format.id, problems: allIds, count: 200, intensity: 0.5 }));
    ok(`${format.id} chaos produced bytes`, file.bytes > 0);
    console.log(`  ${format.id.padEnd(10)} ${String(file.bytes).padStart(10)} bytes  ${file.stats.features} features  ${file.notes.length} notes`);
    if (format.id === "shapefile") {
      const err = checkShapefile(file.data as Uint8Array);
      ok(`${format.id} chaos shapefile structure`, !err, err ?? "");
    }
  } catch (e: any) {
    ok(`${format.id} chaos did not throw`, false, e.stack?.split("\n").slice(0, 4).join(" | "));
  }
}

/* ── 4. determinism ──────────────────────────────────────────────────────── */
console.log("\n4. determinism");
for (const format of ["geojson", "csv", "kml", "shapefile", "kmz"] as FormatId[]) {
  const config = opts({ format, problems: allIds, count: 50, seed: "repeatme" });
  const a = generate(config);
  const b = generate(config);
  const same =
    typeof a.data === "string"
      ? a.data === b.data
      : Buffer.compare(Buffer.from(a.data), Buffer.from(b.data as Uint8Array)) === 0;
  ok(`${format} same seed produces identical bytes`, same);
  const c = generate({ ...config, seed: "different" });
  const differs =
    typeof a.data === "string"
      ? a.data !== c.data
      : Buffer.compare(Buffer.from(a.data), Buffer.from(c.data as Uint8Array)) !== 0;
  ok(`${format} different seed produces different bytes`, differs);
}

/* ── 5. targeted behaviour checks ────────────────────────────────────────── */
console.log("\n5. targeted behaviour");

{
  const file = generate(opts({ format: "geojson", shape: "point", problems: ["coincident"], count: 100, intensity: 1 }));
  const fc = JSON.parse(file.data as string);
  const keys = new Set(fc.features.map((f: any) => JSON.stringify(f.geometry.coordinates)));
  ok("coincident collapses positions", keys.size === 1, `${keys.size} distinct positions`);
}
{
  const file = generate(opts({ format: "geojson", shape: "point", problems: ["null-geometry"], count: 100, intensity: 0.3 }));
  const fc = JSON.parse(file.data as string);
  ok("null-geometry emits nulls", fc.features.some((f: any) => f.geometry === null));
}
{
  const file = generate(opts({ format: "geojson", problems: ["awkward-keys"], count: 40, intensity: 1 }));
  ok("awkward-keys writes __proto__ as a real key", (file.data as string).includes('"__proto__"'));
}
{
  const file = generate(opts({ format: "geojson", problems: ["malformed-json"], count: 40 }));
  let threw = false;
  try { JSON.parse(file.data as string); } catch { threw = true; }
  ok("malformed-json actually breaks JSON.parse", threw);
}
{
  const file = generate(opts({ format: "geojson", problems: ["nan-literal"], count: 40 }));
  // Bare token in any JSON value position — coordinate arrays included.
  ok("nan-literal emits bare NaN/Infinity", /[[,:]\s*-?(NaN|Infinity)\s*[,\]}]/.test(file.data as string));
  ok("nan-literal breaks JSON.parse", (() => { try { JSON.parse(file.data as string); return false; } catch { return true; } })());
}
{
  const file = generate(opts({ format: "csv", problems: ["bom"], count: 5 }));
  ok("bom prefixes the file", (file.data as string).charCodeAt(0) === 0xfeff);
}
{
  const file = generate(opts({ format: "csv", problems: ["injection-strings"], count: 60, intensity: 1 }));
  const text = file.data as string;
  ok("injection payload survives into csv", text.includes("script") || text.includes("DROP TABLE"));
  const rows = text.trimEnd().split("\n");
  const cols = rows[0].split(",").length;
  ok("csv stays rectangular with injection payloads", rows.every((r) => splitCsv(r).length === cols));
}
{
  const file = generate(opts({ format: "kml", problems: ["injection-strings", "unicode-chaos"], count: 60, intensity: 1 }));
  const err = xmlWellFormed(file.data as string);
  ok("kml escapes injection payloads", !err, err ?? "");
}
{
  const file = generate(opts({ format: "geojson", problems: ["empty-dataset"], count: 100 }));
  const fc = JSON.parse(file.data as string);
  ok("empty-dataset yields zero features", fc.features.length === 0);
}
{
  const file = generate(opts({ format: "shapefile", problems: ["empty-dataset"], count: 100 }));
  const err = checkShapefile(file.data as Uint8Array);
  ok("empty shapefile is still structurally valid", !err, err ?? "");
}
{
  const file = generate(opts({ format: "geojson", shape: "polygon", problems: ["unclosed-rings"], count: 40, intensity: 1 }));
  const fc = JSON.parse(file.data as string);
  const open = fc.features.filter((f: any) => {
    const r = f.geometry?.coordinates?.[0];
    return r && JSON.stringify(r[0]) !== JSON.stringify(r[r.length - 1]);
  });
  ok("unclosed-rings leaves rings open", open.length > 0);
}
{
  const file = generate(opts({ format: "geojson", shape: "point", problems: ["duplicates"], count: 50, intensity: 0.4 }));
  ok("duplicates increases the feature count", file.stats.features > 50, `${file.stats.features}`);
}
{
  const file = generate(opts({ format: "wkt", shape: "polygon", problems: ["zm-coords"], count: 20, intensity: 1 }));
  ok("wkt tags Z dimension", /POLYGON Z/.test(file.data as string));
}
{
  const file = generate(opts({ format: "geojson", problems: ["crs-member"], count: 10 }));
  ok("crs member present in geojson", (file.data as string).includes("urn:ogc:def:crs:EPSG"));
  const skipped = generate(opts({ format: "csv", problems: ["crs-member"], count: 10 }));
  ok("crs member reported as skipped for csv", skipped.notes.some((n) => n.includes("can't express")));
}
{
  const file = generate(opts({ format: "shapefile", shape: "mixed", problems: ["mixed-geometry"], count: 60, intensity: 1 }));
  ok("shapefile notes the single-geometry-type limit", file.notes.some((n) => n.includes("one geometry type")));
  const err = checkShapefile(file.data as Uint8Array);
  ok("mixed shapefile still structurally valid", !err, err ?? "");
}
{
  const file = generate(opts({ format: "shapefile", problems: ["awkward-keys"], count: 40, intensity: 1 }));
  ok("shapefile notes dbf name truncation", file.notes.some((n) => n.includes("10-character")));
}
{
  const file = generate(opts({ format: "gpx", shape: "polygon", count: 20 }));
  ok("gpx notes polygon flattening", file.notes.some((n) => n.includes("no polygon type")));
}

/* ── 5b. the clean control case must be valid WGS84 everywhere ───────────── */
console.log("\n5b. clean output stays inside the WGS84 domain");
for (const region of ["world", "fiji", "svalbard", "reykjavik", "london", "auckland"]) {
  for (const shape of ["point", "line", "polygon", "mixed"] as const) {
    const file = generate(opts({ format: "geojson", region, shape, count: 400, problems: [], seed: "wgs84" }));
    const bad = file.map.outOfRange + file.map.invalid;
    ok(`clean ${region}/${shape} in range`, bad === 0, `${bad} of ${file.map.total} off-world`);
  }
}

/* ── 5b2. a clean file passes its own clean check ─────────────────────────── */
// The claim "nothing is wrong with this file" is the one claim a fixture tool
// cannot make on trust: a control case you believe is good, and isn't, sends
// you hunting a bug in your reader that lives in your test data.
console.log("\n5b2. clean output passes its own check");
{
  let reports = 0;
  for (const format of FORMATS) {
    for (const profile of PROFILES) {
      const shape = profileShape(getProfile(profile.id)) as any;
      const file = generate(opts({
        format: format.id,
        profile: profile.id,
        shape: ["point", "line", "polygon", "mixed"].includes(shape) ? shape : "mixed",
        problems: [],
        count: 40,
        seed: `clean-${format.id}-${profile.id}`,
      }));
      reports++;
      ok(`${format.id.padEnd(10)} ${profile.id.padEnd(22)} is marked clean`, file.stats.clean);
      ok(`${format.id.padEnd(10)} ${profile.id.padEnd(22)} has a report`, file.clean !== null);
      ok(
        `${format.id.padEnd(10)} ${profile.id.padEnd(22)} passes it`,
        file.clean?.passed === true,
        file.clean?.checks.filter((c) => !c.ok).map((c) => `${c.label}: ${c.detail}`).join("; "),
      );
    }
  }
  console.log(`  ${reports} format/data-type combinations checked clean`);

  // The inverse: a file with problems in it must not claim to be a control
  // case, or the flag is decoration.
  const broken = generate(opts({ problems: ["coincident", "precision-drift"], count: 40 }));
  ok("a file with problems is not marked clean", broken.stats.clean === false);
  ok("a file with problems carries no clean report", broken.clean === null);

  // Asking only for problems the format cannot express leaves a clean file, and
  // it has to say so rather than let the file pass for the broken one you
  // wanted. CSV has no crs member, no bbox and no foreign members, so all three
  // are skipped and nothing is left to apply.
  const skipped = generate(opts({
    format: "csv",
    problems: ["crs-member", "wrong-bbox", "foreign-members"],
    count: 20,
  }));
  ok("a fully-skipped selection applies nothing", skipped.stats.problems.length === 0,
    skipped.stats.problems.join(","));
  ok("a fully-skipped selection is reported as clean", skipped.stats.clean === true);
  ok("and is checked like any other clean file", skipped.clean?.passed === true);
  ok(
    "and says the file is not the broken one that was asked for",
    skipped.notes.some((n) => n.includes("Nothing was left to apply")),
    skipped.notes.join(" | ").slice(0, 160),
  );

  // A clean package is clean all the way through, or it is worse than useless.
  const pack = buildPackage({ seed: "clean-pack", size: 9, clean: true });
  ok("a clean package is flagged clean", pack.clean === true);
  ok(
    "every file in a clean package has no problems",
    pack.entries.every((e) => e.file.stats.clean && e.file.stats.problems.length === 0),
  );
  ok(
    "every file in a clean package passes its check",
    pack.entries.every((e) => e.file.clean?.passed === true),
    pack.entries.filter((e) => !e.file.clean?.passed).map((e) => e.path).join(","),
  );
  ok(
    "a clean package names itself apart from a broken one",
    pack.filename.includes("clean-pack"),
    pack.filename,
  );
  ok(
    "a clean package README does not call its files broken",
    !pack.readme.includes("deliberately broken"),
  );
  // Same words, different package: the two modes must not be the same roll with
  // the damage switched off.
  const dirty = buildPackage({ seed: "clean-pack", size: 9 });
  ok("a clean package is not a broken one with the problems removed",
    dirty.entries.some((e, i) => e.options.seed !== pack.entries[i].options.seed ||
      e.options.format !== pack.entries[i].options.format ||
      e.options.count !== pack.entries[i].options.count) ||
    dirty.entries.some((e) => e.file.stats.problems.length > 0));

  // The written context has to change with the file, or the block that travels
  // to an issue or an agent describes a control case as a broken fixture.
  const cleanFile = generate(opts({ problems: [], count: 20 }));
  const cleanText = contextToText(buildContext(cleanFile, "GeoJSON"));
  ok("a clean file is not described as deliberately broken",
    !cleanText.includes("deliberately broken"), cleanText.slice(0, 90));
  ok("a clean file's context lists what was checked",
    cleanText.includes("Checked on this file"), cleanText.slice(0, 200));
  const brokenText = contextToText(buildContext(broken, "GeoJSON"));
  ok("a broken file still is", brokenText.includes("deliberately broken"));
  ok("a broken file's context has no clean checks", !brokenText.includes("Checked on this file"));
}

/* ── 5c. the map preview reflects what the problems actually did ─────────── */
console.log("\n5c. map preview");
{
  const file = generate(opts({ format: "geojson", shape: "point", count: 500, intensity: 1, problems: ["coincident"], seed: "mp" }));
  const key = (p: [number, number]) => p.join(",");
  const freq = new Map<string, number>();
  for (const p of file.map.points) freq.set(key(p), (freq.get(key(p)) ?? 0) + 1);
  ok("coincident collapses the plotted points", Math.max(...freq.values()) === file.map.points.length);
}
{
  const file = generate(opts({ format: "geojson", shape: "point", count: 300, intensity: 0.5, problems: ["out-of-range"], seed: "mp" }));
  ok("out-of-range counted as off-world", file.map.outOfRange > 0);
}
{
  const file = generate(opts({ format: "geojson", shape: "point", count: 300, intensity: 0.5, problems: ["nan-coords"], seed: "mp" }));
  ok("nan coords counted as invalid", file.map.invalid > 0);
}
{
  const file = generate(opts({ format: "geojson", shape: "line", count: 40000, problems: ["vertex-bomb"], seed: "mp" }));
  ok("map preview is subsampled", file.map.points.length <= 1600, `${file.map.points.length}`);
  ok("map preview still counts every position", file.map.total > 100000, `${file.map.total}`);
}

/* ── 5d. three-word seeds ────────────────────────────────────────────────── */
console.log("\n5d. seeds");
{
  const pool = new Set(SEED_WORDS);
  const seen = new Set<string>();
  let malformed = 0;
  let repeated = 0;
  let unknown = 0;
  for (let i = 0; i < 400; i++) {
    const seed = randomSeed();
    const words = seed.split("-");
    if (words.length !== 3) malformed++;
    if (new Set(words).size !== words.length) repeated++;
    if (words.some((w) => !pool.has(w))) unknown++;
    seen.add(seed);
  }
  ok("seeds are three words", malformed === 0, `${malformed} malformed`);
  ok("seeds never repeat a word", repeated === 0, `${repeated} with repeats`);
  ok("seeds only use the pool", unknown === 0, `${unknown} off-pool`);
  ok("seeds are well spread", seen.size >= 395, `${seen.size}/400 unique`);
  ok("seed words are url-safe", SEED_WORDS.every((w) => /^[a-z]{2,9}$/.test(w)));
  ok("pool is large enough to matter", SEED_WORDS.length >= 150, `${SEED_WORDS.length} words`);
  ok("pool has no duplicates", pool.size === SEED_WORDS.length);
}
{
  // A hyphenated seed has to survive the share link and reach the file intact.
  const config = opts({ seed: "harbor-lantern-drift", format: "geojson", count: 40 });
  const round = decodeConfig("#" + encodeConfig(config));
  ok("word seed round-trips through the url", round.seed === "harbor-lantern-drift", String(round.seed));
  const a = generate(config);
  const b = generate({ ...config, ...round } as GenerateOptions);
  ok("word seed reproduces identical bytes", a.data === b.data);
  ok("word seed reaches the filename", a.filename.includes("harbor-lantern-drift"), a.filename);
}

/* ── 5e. boundaries and the ground truth they establish ──────────────────── */
console.log("\n5e. boundaries");
{
  const SHAPES = ["bbox", "polygon", "hole", "multipart"] as const;

  for (const shape of SHAPES) {
    const file = generate(opts({ boundary: shape, count: 400, shape: "point", coverage: 0.6, pretty: false }));
    const b = file.boundary!;
    ok(`${shape}: a boundary file comes out`, !!b && typeof b.data === "string");
    ok(`${shape}: it is named as a boundary`, b.filename.endsWith("-boundary.geojson"), b.filename);

    const parsed = JSON.parse(b.data as string);
    ok(`${shape}: parses as a FeatureCollection`, parsed.type === "FeatureCollection");
    ok(`${shape}: holds exactly one feature`, parsed.features.length === 1);
    ok(`${shape}: carries a bbox member`, Array.isArray(parsed.bbox) && parsed.bbox.length === 4);

    const geom = parsed.features[0].geometry;
    const expectMulti = shape === "multipart";
    ok(`${shape}: geometry type`, geom.type === (expectMulti ? "MultiPolygon" : "Polygon"), geom.type);
    ok(`${shape}: hole has an interior ring`, shape !== "hole" || geom.coordinates.length === 2);
    ok(`${shape}: multipart has two parts`, !expectMulti || geom.coordinates.length === 2);

    // Every ring closed, in range, and wound the way RFC 7946 asks.
    const polygons: any[][] = expectMulti ? geom.coordinates : [geom.coordinates];
    for (const rings of polygons) {
      rings.forEach((ring: any[], i: number) => {
        const first = ring[0];
        const last = ring[ring.length - 1];
        ok(`${shape}: ring ${i} is closed`, first[0] === last[0] && first[1] === last[1]);
        ok(`${shape}: ring ${i} stays in range`,
          ring.every((p: any[]) => Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90));
        const area = signedArea(ring);
        // Exterior counter-clockwise, interior clockwise.
        ok(`${shape}: ring ${i} winds correctly`, i === 0 ? area > 0 : area < 0, String(area));
      });
    }

    // The counts must describe the file, not the intent.
    const features = JSON.parse(file.data as string).features;
    const tagged = features.filter((f: any) => f.properties?.inside === true).length;
    const touching = features.filter((f: any) => f.properties?.intersects === true).length;
    ok(`${shape}: reported inside matches the tags`, tagged === b.inside, `${tagged} vs ${b.inside}`);
    ok(`${shape}: reported intersects matches the tags`, touching === b.inside + b.crossing);
    ok(`${shape}: every feature is accounted for`,
      b.inside + b.crossing + b.outside === file.stats.features);

    // And the tags must agree with an independent point-in-polygon pass.
    let recomputed = 0;
    for (const f of features) {
      const [lon, lat] = f.geometry.coordinates;
      if (boundaryContains(geom, lon, lat)) recomputed++;
    }
    ok(`${shape}: tags agree with a fresh containment test`, recomputed === b.inside,
      `${recomputed} vs ${b.inside}`);

    // Points are the simple case: nothing can straddle a single position.
    ok(`${shape}: points never cross the edge`, b.crossing === 0, `${b.crossing}`);
  }

  // Coverage steers the split.
  for (const [coverage, low, high] of [[0, 0, 0], [0.5, 0.4, 0.6], [1, 0.98, 1]] as const) {
    const file = generate(opts({ boundary: "polygon", count: 500, shape: "point", coverage }));
    const ratio = file.boundary!.inside / file.stats.features;
    ok(`coverage ${coverage} lands in range`, ratio >= low && ratio <= high, ratio.toFixed(3));
  }

  // Inside features must not be clumped at the head of the file, or a filter
  // that simply returns the first N would pass by accident.
  {
    const file = generate(opts({ boundary: "polygon", count: 600, shape: "point", coverage: 0.5 }));
    const features = JSON.parse(file.data as string).features;
    const firstHalf = features.slice(0, 300).filter((f: any) => f.properties.inside).length;
    ok("inside features are spread through the file", Math.abs(firstHalf - file.boundary!.inside / 2) < 45,
      `${firstHalf} of ${file.boundary!.inside} in the first half`);
  }

  // Lines and polygons genuinely straddle, so the two filter semantics differ.
  {
    const file = generate(opts({ boundary: "polygon", count: 400, shape: "line", coverage: 0.6 }));
    ok("lines cross the boundary edge", file.boundary!.crossing > 0, `${file.boundary!.crossing}`);
  }

  // A whole-world boundary has no outside and says so.
  {
    const file = generate(opts({ boundary: "bbox", region: "world", count: 200, shape: "point" , coverage: 0.3 }));
    ok("world boundary contains everything", file.boundary!.outside === 0, `${file.boundary!.outside}`);
    ok("world boundary is explained", file.notes.some((n) => n.includes("whole-world")));
  }

  // Determinism and the share link have to cover boundaries too.
  {
    const config = opts({ boundary: "hole", count: 120, coverage: 0.45, seed: "boundary-check-two" });
    const a = generate(config);
    const b = generate(config);
    ok("boundary output is deterministic", a.boundary!.data === b.boundary!.data);
    ok("boundary data file is deterministic", a.data === b.data);

    const round = decodeConfig("#" + encodeConfig(config));
    ok("boundary round-trips through the url", round.boundary === "hole", String(round.boundary));
    ok("coverage round-trips through the url", Math.abs((round.coverage ?? 0) - 0.45) < 0.006,
      String(round.coverage));
    const c = generate({ ...config, ...round } as GenerateOptions);
    ok("shared link reproduces the boundary", c.boundary!.data === a.boundary!.data);
  }

  // Off by default, and a link written before boundaries existed still decodes.
  {
    ok("boundaries are off by default", generate(opts()).boundary === null);
    const legacy = decodeConfig("#f=geojson&n=40&g=point&r=london&i=40&s=testseed");
    ok("a pre-boundary link leaves it alone", legacy.boundary === undefined);
  }

  // The tags have to survive every format that carries attributes at all.
  for (const format of ["csv", "ndjson", "kml"] as const) {
    const file = generate(opts({ format, boundary: "bbox", count: 80, shape: "point" }));
    const text = file.data as string;
    ok(`${format} carries the inside tag`, text.includes("inside"), format);
    ok(`${format} still gets a boundary file`, !!file.boundary);
  }

  // Counts describe the final file: a problem that moves features moves them out.
  {
    const clean = generate(opts({ boundary: "bbox", count: 300, shape: "point", coverage: 1 }));
    const moved = generate(opts({ boundary: "bbox", count: 300, shape: "point", coverage: 1,
      problems: ["null-island"], intensity: 1 }));
    ok("a clean run puts everything inside", clean.boundary!.inside === 300, `${clean.boundary!.inside}`);
    ok("Null Island drags features out of the boundary", moved.boundary!.inside < 300,
      `${moved.boundary!.inside}`);
  }
}

/* ── 5f. the seed is untrusted input on its way to a path ────────────────── */
console.log("\n5f. hostile seeds");
{
  // A seed arrives from the URL hash and reaches both the download filename and
  // the entry names inside a generated ZIP. Left raw, `../` there is a zip-slip.
  const HOSTILE: Array<[string, string]> = [
    ["posix traversal", "../../../../tmp/pwned"],
    ["windows traversal", "..\\..\\windows\\evil"],
    ["absolute path", "/etc/passwd"],
    ["bidi override", "photo‮gpj.exe"],
    ["null byte", "evil .exe"],
    ["crlf", "a\r\nContent-Type: text/html"],
    ["ansi escape", "a[31mred"],
    ["script tag", "<script>alert(1)</script>"],
    ["quote break", '" onmouseover="alert(1)'],
    ["dot only", "..."],
    ["leading dash", "-rf"],
    ["empty", ""],
    ["all stripped", "   "],
    ["very long", "z".repeat(500)],
  ];

  const SAFE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

  for (const [label, seed] of HOSTILE) {
    const file = generate(opts({ seed, count: 3, shape: "point", boundary: "bbox" }));

    ok(`${label}: filename has no separators`, !/[\/\\]/.test(file.filename), file.filename);
    ok(`${label}: filename has no control chars`, !/[ -]/.test(file.filename));
    ok(`${label}: filename has no bidi overrides`,
      !/[‪-‮⁦-⁩]/.test(file.filename));
    ok(`${label}: filename ends in the real extension`, file.filename.endsWith(".geojson"));
    ok(`${label}: no traversal anywhere in the name`, !file.filename.includes(".."), file.filename);

    // The normalised seed is what everything downstream sees.
    const used = file.filename.replace(/^nullisland-\d+-/, "").replace(/\.geojson$/, "");
    ok(`${label}: normalised seed is path-safe`, SAFE.test(used), JSON.stringify(used));
    ok(`${label}: normalised seed is bounded`, used.length > 0 && used.length <= 40, `${used.length}`);

    // And it reaches the boundary file as the same clean value.
    const props = JSON.parse(file.boundary!.data as string).features[0].properties;
    ok(`${label}: boundary seed matches the filename`, props.seed === used, String(props.seed));
    ok(`${label}: boundary carries no raw markup`, !String(props.seed).includes("<"));
  }

  // Zip-slip proper: every member of a generated archive must stay put.
  for (const seed of ["../../../../tmp/pwned", "..\\..\\windows\\evil", "/etc/passwd"]) {
    for (const format of ["shapefile", "kmz"] as const) {
      const file = generate(opts({ format, seed, count: 3, shape: "point" }));
      const names = readZip(file.data as Uint8Array).map((e) => e.name);
      ok(`${format}: no traversing members (${seed.slice(0, 12)})`,
        names.every((n) => !n.includes("..") && !n.startsWith("/") && !/[\\]/.test(n)),
        names.join(" "));
      ok(`${format}: members are still present`, names.length > 0);
    }
  }

  // Determinism must survive normalisation: two seeds that clean to the same
  // thing are the same fixture, and a clean seed is untouched.
  {
    const a = generate(opts({ seed: "harbor-lantern-drift", count: 40 }));
    const b = generate(opts({ seed: "harbor-lantern-drift", count: 40 }));
    ok("a normal seed is left alone", a.filename.includes("harbor-lantern-drift"), a.filename);
    ok("normalisation stays deterministic", a.data === b.data);

    const c = generate(opts({ seed: "a/b", count: 40 }));
    const d = generate(opts({ seed: "a-b", count: 40 }));
    ok("seeds that normalise alike produce the same file", c.data === d.data);
  }

  // A hostile seed must survive the share link and still come out clean.
  {
    const config = opts({ seed: "../../etc/passwd", count: 20 });
    const round = decodeConfig("#" + encodeConfig(config));
    const file = generate({ ...config, ...round } as GenerateOptions);
    ok("a hostile seed is clean after a round-trip", !file.filename.includes(".."), file.filename);
  }
}

/* ── 6. scale ────────────────────────────────────────────────────────────── */
console.log("\n6. scale");
for (const [format, count] of [["geojson", 100000], ["shapefile", 50000], ["csv", 100000]] as const) {
  const started = process.hrtime.bigint();
  const file = generate(opts({ format, count, shape: "point", problems: ["precision-drift", "mixed-schema", "unicode-chaos"] }));
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  ok(`${format} @ ${count} under 8s`, ms < 8000, `${ms.toFixed(0)}ms`);
  console.log(`  ${format.padEnd(10)} ${count.toLocaleString().padStart(8)} features  ${(file.bytes / 1e6).toFixed(1)} MB  ${ms.toFixed(0)}ms`);
}
ok("MAX_FEATURES clamps", generate(opts({ count: MAX_FEATURES * 3, shape: "point" })).stats.features <= MAX_FEATURES);

/* ── 7. packages ─────────────────────────────────────────────────────────── */
console.log("\n7. packages");
{
  const started = process.hrtime.bigint();
  const pack = buildPackage({ seed: "pack-harbor-drift", size: 9 });
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  console.log(`  9 files  ${pack.features.toLocaleString().padStart(7)} features  ${(pack.bytes / 1e6).toFixed(2)} MB  ${ms.toFixed(0)}ms  ${pack.filename}`);

  const again = buildPackage({ seed: "pack-harbor-drift", size: 9 });
  ok("a package seed is reproducible",
    Buffer.from(pack.data as Uint8Array).equals(Buffer.from(again.data as Uint8Array)));
  ok("a package is built on time", ms < 8000, `${ms.toFixed(0)}ms`);

  const members = readZip(pack.data as Uint8Array);
  const names = members.map((m) => m.name);
  ok("context leads the archive", names[0] === "README.md" && names[1] === "manifest.json", names.slice(0, 2).join(" "));
  ok("every fixture is filed", names.slice(2).every((n) => n.startsWith("files/")), names.slice(2).join(" "));
  ok("no traversing members", names.every((n) => !n.includes("..") && !n.startsWith("/") && !/\\/.test(n)));

  const expected = 2 + pack.entries.length + pack.entries.filter((e) => e.boundaryPath).length;
  ok("one member per file and boundary", names.length === expected, `${names.length} of ${expected}`);
  for (const entry of pack.entries) {
    ok(`${entry.options.format}: fixture is in the archive`, names.includes(entry.path), entry.path);
    if (entry.boundaryPath) {
      ok(`${entry.options.format}: boundary is in the archive`, names.includes(entry.boundaryPath));
    }
  }

  // The sweep is the promise a package makes: every container, once.
  const swept = new Set(pack.entries.map((e) => e.options.format));
  ok("nine files cover every format", swept.size === FORMATS.length, [...swept].join(","));

  // And the lead categories are what make five files worth having.
  const leads = new Set(pack.entries.map((e) => e.lead));
  ok("every problem category leads a file", leads.size === 5, [...leads].join(","));

  // A package is breadth: nine files should be nine data types, spread across
  // the taxonomy rather than nine neighbours in the catalogue.
  const types = new Set(pack.entries.map((e) => e.options.profile));
  ok("nine files are nine data types", types.size === 9, [...types].join(","));
  const families = new Set(pack.entries.map((e) => getProfile(e.options.profile).family));
  ok("they span the families", families.size >= 4, [...families].join(","));
  ok("no generic exports in a package",
    !pack.entries.some((e) => e.options.profile === DEFAULT_PROFILE));
  ok("each file has the geometry its data type comes in",
    pack.entries.every((e) => e.options.shape === profileShape(getProfile(e.options.profile))));
  ok("the readme names the data types",
    pack.entries.every((e) => pack.readme.includes(e.profileLabel)));

  // A package of nine schemas that break in nine generic ways would waste the
  // schemas, so every file carries at least one problem of its own kind.
  const withDomain = pack.entries.filter((e) =>
    e.file.stats.problems.some((id) => getProblem(id)?.profiles));
  ok("every file breaks in a way particular to its data type",
    withDomain.length === pack.entries.length,
    `${withDomain.length} of ${pack.entries.length}`);

  const manifest = JSON.parse(pack.manifest);
  ok("manifest lists every file", manifest.files.length === pack.entries.length);
  ok("manifest paths match the archive",
    manifest.files.every((f: any) => names.includes(f.path)));
  ok("manifest boundary counts are the ground truth",
    manifest.files.every((f: any) =>
      !f.boundary || f.boundary.intersects >= f.boundary.contains));

  ok("the readme names every file",
    pack.entries.every((e) => pack.readme.includes(e.file.filename)));
  ok("the readme carries the notes",
    pack.entries.every((e) => e.file.notes.every((note) => pack.readme.includes(note))));

  // The link printed under each entry has to rebuild that exact file, or the
  // reproduction instructions in the README are a lie.
  for (const entry of pack.entries) {
    const round = decodeConfig("#" + entry.hash);
    const rebuilt = generate({ ...entry.options, ...round } as GenerateOptions);
    const same = typeof rebuilt.data === "string"
      ? rebuilt.data === entry.file.data
      : Buffer.from(rebuilt.data).equals(Buffer.from(entry.file.data as Uint8Array));
    ok(`${entry.options.format}: the reproduce link rebuilds the file`, same, entry.file.filename);
  }

  // Sizes, and the seed on its way to a path.
  ok("size is clamped", buildPackage({ seed: "x", size: 999 }).entries.length <= MAX_PACKAGE_FILES);
  ok("a single-file package works", buildPackage({ seed: "x", size: 1 }).entries.length === 1);
  const hostile = buildPackage({ seed: "../../../../tmp/pwned", size: 3 });
  ok("a hostile package seed is neutralised", !hostile.filename.includes(".."), hostile.filename);
  ok("its members stay put",
    readZip(hostile.data as Uint8Array).every((m) => !m.name.includes("..")),
    hostile.filename);
}

/* ── 8. data types ───────────────────────────────────────────────────────── */
console.log("\n8. data types");
{
  const ids = new Set<string>();
  const RESERVED = ["type", "geometry", "properties", "coordinates", "bbox"];

  for (const profile of PROFILES) {
    const label = profile.id.padEnd(22);
    ok(`${label} id is unique`, !ids.has(profile.id), profile.id);
    ids.add(profile.id);

    // The generic profile is a hand-written function, not a field list.
    if (profile.id !== DEFAULT_PROFILE) {
      const names = profile.fields.map((f) => f.name);
      ok(`${label} has a real schema`, names.length >= 8 && names.length <= 14, `${names.length} fields`);
      ok(`${label} field names are unique`, new Set(names).size === names.length);
      ok(`${label} avoids GeoJSON member names`,
        !names.some((n) => RESERVED.includes(n)),
        names.filter((n) => RESERVED.includes(n)).join(","));
      // Not per profile: a cadastral export really does use ten-character
      // names, because it has been round-tripping through DBF since 1994.
    }
    ok(`${label} apt problems exist`,
      profile.apt.every((id) => PROBLEMS.some((p) => p.id === id)),
      profile.apt.filter((id) => !PROBLEMS.some((p) => p.id === id)).join(","));

    // Every data type has to survive the writers that introspect properties.
    const shape = profileShape(profile);
    const geo = generate(opts({ profile: profile.id, shape, count: 40 }));
    try { JSON.parse(geo.data as string); ok(`${label} geojson parses`, true); }
    catch (e: any) { ok(`${label} geojson parses`, false, e.message); }
    ok(`${label} keeps its natural shape`,
      !geo.notes.some((n) => n.includes("does not come as")),
      geo.notes.find((n) => n.includes("does not come as")) ?? "");

    const csv = generate(opts({ profile: profile.id, shape, count: 40, format: "csv" }));
    const rows = (csv.data as string).trimEnd().split("\n");
    const cols = rows[0].split(",").length;
    ok(`${label} csv is rectangular`,
      rows.every((r) => splitCsv(r).length === cols),
      `${cols} columns`);

    const shp = generate(opts({ profile: profile.id, shape, count: 40, format: "shapefile" }));
    const err = checkShapefile(shp.data as Uint8Array);
    ok(`${label} shapefile structure`, !err, err ?? "");

    ok(`${label} is deterministic`,
      generate(opts({ profile: profile.id, shape, count: 40 })).data === geo.data);
  }

  // Long field names are what makes the DBF 10-character limit a real test, so
  // the catalogue as a whole has to carry plenty of them.
  const longNames = PROFILES.flatMap((p) => p.fields.map((f) => f.name)).filter((n) => n.length > 10);
  ok("the catalogue exercises DBF truncation", longNames.length >= 40, `${longNames.length} long names`);

  console.log(`  ${PROFILES.length} data types built in geojson, csv and shapefile`);

  // Domain problems: they must apply where they claim to, and nowhere else.
  const domain = PROBLEMS.filter((p) => p.profiles);
  ok("there are domain problems at all", domain.length > 0, `${domain.length}`);
  for (const problem of domain) {
    ok(`${problem.id}: names real data types`,
      problem.profiles!.every((id) => PROFILES.some((p) => p.id === id)),
      problem.profiles!.filter((id) => !PROFILES.some((p) => p.id === id)).join(","));

    const host = getProfile(problem.profiles![0]);
    const format = problem.appliesTo?.[0] ?? "geojson";
    const file = generate(opts({
      profile: host.id,
      shape: profileShape(host),
      format: format as FormatId,
      problems: [problem.id],
      count: 60,
      intensity: 0.5,
    }));
    ok(`${problem.id}: applies to ${host.id}`,
      file.stats.problems.includes(problem.id),
      file.stats.problems.join(","));
    ok(`${problem.id}: says what it did`, file.notes.length > 0);

    // And the same problem asked for under a data type that has no such thing
    // is refused rather than quietly invented.
    if (!problem.profiles!.includes(DEFAULT_PROFILE)) {
      const wrong = generate(opts({ problems: [problem.id], count: 20 }));
      ok(`${problem.id}: skipped on a generic export`,
        !wrong.stats.problems.includes(problem.id),
        wrong.stats.problems.join(","));
      ok(`${problem.id}: and says so`,
        wrong.notes.some((n) => n.includes("doesn't have")),
        wrong.notes.join(" | ").slice(0, 80));
    }
  }
  console.log(`  ${domain.length} domain problems checked against their data types`);

  // The data type has to survive the share link, or a fixture is not shareable.
  for (const profile of PROFILES) {
    const config = opts({ profile: profile.id, count: 10 });
    const round = decodeConfig("#" + encodeConfig(config));
    ok(`${profile.id.padEnd(22)} survives a share link`, (round.profile ?? DEFAULT_PROFILE) === profile.id, String(round.profile));
  }

  // Every family is represented, and every data type is reachable from the UI.
  for (const family of FAMILIES) {
    ok(`family ${family.id} has data types`, profilesInFamily(family.id).length > 0);
  }
}

/* ── 9. the reproducibility promise ──────────────────────────────────────── */
console.log("\n9. the reproducibility promise");
{
  // A link is the narrower channel, so anything the app can hold has to survive
  // a round trip through it. Fractional values are the case that used to fail:
  // the dice rolled an intensity of 0.437, the link carried 44, and the file
  // the link rebuilt was not the file on screen.
  let diverged = 0;
  for (let k = 0; k < 120; k++) {
    const config = opts({
      count: 400,
      shape: "polygon",
      problems: ["precision-drift", "mixed-schema", "duplicates"],
      intensity: 0.2 + (k / 120) * 0.6,
      coverage: 0.25 + (k / 120) * 0.5,
      boundary: "polygon",
      seed: `roll-${k}`,
    });
    const direct = generate(config);
    const viaLink = generate({ ...config, ...decodeConfig("#" + encodeConfig(config)) });
    if (direct.data !== viaLink.data) diverged++;
    if (direct.boundary!.data !== viaLink.boundary!.data) diverged++;
  }
  ok("any settings rebuild from their own share link", diverged === 0, `${diverged} divergences`);

  // An absent key is "not specified", not zero. Number(null) is 0, which once
  // made a link without an n decode as an empty file.
  ok("an empty hash decodes to nothing", Object.keys(decodeConfig("")).length === 0,
    JSON.stringify(decodeConfig("")));
  ok("a partial hash leaves the rest alone",
    !("count" in decodeConfig("#f=csv&s=x")) && !("intensity" in decodeConfig("#f=csv&s=x")),
    JSON.stringify(decodeConfig("#f=csv&s=x")));
  ok("a hash that does carry a count keeps it", decodeConfig("#n=42").count === 42);
  ok("a zero count is still respected", decodeConfig("#n=0").count === 0);

  // A seed over the limit has to reach the link in the form the filename uses.
  {
    const long = "x".repeat(60);
    const config = opts({ seed: long, count: 20 });
    const round = decodeConfig("#" + encodeConfig(config));
    const a = generate(config);
    const b = generate({ ...config, ...round });
    ok("an over-long seed round-trips through its link", a.data === b.data);
    ok("the link carries the canonical seed", a.filename.includes(String(round.seed)));
  }

  /* ── the search half travels in the same link ─────────────────────────── */
  {
    const termsOf = (over: Partial<TermsConfig> = {}): TermsConfig => ({
      count: 43,
      profiles: [],
      shuffle: false,
      quirks: [],
      intensity: 0.15,
      near: "anywhere",
      clean: false,
      format: "jsonl",
      ...over,
    });
    const appOf = (over: Partial<AppConfig> = {}): AppConfig => ({
      mode: "files",
      file: opts(),
      terms: termsOf(),
      ...over,
    });

    let diverged = 0;
    const cases: AppConfig[] = [
      appOf(),
      appOf({ mode: "terms" }),
      appOf({ terms: termsOf({ clean: true }) }),
      appOf({ mode: "terms", terms: termsOf({ count: 120, near: "tokyo", format: "md" }) }),
      appOf({ mode: "terms", terms: termsOf({ quirks: ["misspelled-place", "ambiguous-place"] }) }),
      appOf({ terms: termsOf({ count: 0, intensity: 1, near: "nz", format: "csv" }) }),
      appOf({ mode: "terms", file: opts({ format: "shapefile", profile: "maritime-ais" }) }),
      appOf({ mode: "terms", terms: termsOf({ profiles: ["mobile-location-pings", "flight-adsb", "maritime-ais"] }) }),
      appOf({ mode: "terms", terms: termsOf({ shuffle: true }) }),
      appOf({ mode: "terms", terms: termsOf({ shuffle: true, clean: true, count: 200 }) }),
    ];
    for (const config of cases) {
      const round = decodeApp("#" + encodeApp(config));
      const rebuilt: AppConfig = {
        mode: round.mode ?? "files",
        file: { ...config.file, ...round.file },
        terms: { ...termsOf(), ...round.terms },
      };
      if (JSON.stringify(rebuilt) !== JSON.stringify(config)) {
        diverged++;
        console.log(`  detail: ${JSON.stringify(config)} -> ${JSON.stringify(rebuilt)}`);
      }
    }
    ok("both halves of the app rebuild from one link", diverged === 0, `${diverged} of ${cases.length}`);

    // A link made before the search half existed has to keep meaning what it
    // meant: the file settings it carries, and the file half of the app.
    const legacy = "#f=csv&n=250&g=polygon&r=lisbon&i=40&s=old-link-seed&p=coincident";
    const old = decodeApp(legacy);
    ok("a link from before search terms still decodes", old.file.format === "csv" && old.file.count === 250,
      JSON.stringify(old.file));
    ok("such a link carries no mode, so the app keeps its own", old.mode === undefined);
    ok("such a link carries no term settings", old.terms === undefined);
    ok("the file half of a link is untouched by the search half",
      encodeApp(appOf()).startsWith(encodeConfig(opts())),
      encodeApp(appOf()).slice(0, 80));

    // Fractions are quantised for the file half already; the term intensity
    // travels the same narrow channel and has to survive it too.
    let fractions = 0;
    for (let k = 0; k <= 100; k++) {
      const config = appOf({ terms: termsOf({ intensity: k / 100 }) });
      const round = decodeApp("#" + encodeApp(config));
      if (Math.abs((round.terms?.intensity ?? -1) - k / 100) > 1e-9) fractions++;
    }
    ok("every term intensity survives the link", fractions === 0, `${fractions} of 101`);

    // Unknown ids are dropped rather than carried through to the generator,
    // exactly as they are for problems.
    const junk = decodeApp("#tq=misspelled-place.not-a-quirk&tr=atlantis&tf=nonsense");
    ok("a link drops quirk ids that are not in the catalogue",
      JSON.stringify(junk.terms?.quirks) === JSON.stringify(["misspelled-place"]),
      JSON.stringify(junk.terms?.quirks));
    ok("a link drops a place that is not in the gazetteer", junk.terms?.near === undefined);
    ok("a link drops a term format that does not exist", junk.terms?.format === undefined);
    const kinds = decodeApp("#tp=flight-adsb.not-a-data-type.maritime-ais");
    ok("a link drops data types that do not exist",
      JSON.stringify(kinds.terms?.profiles) === JSON.stringify(["flight-adsb", "maritime-ais"]),
      JSON.stringify(kinds.terms?.profiles));
  }

  // Numbers reach file content — a package README, the written context — so the
  // grouping cannot come from the machine's locale.
  ok("grouping is locale-free", group(1234567) === "1,234,567" && group(-2025) === "-2,025" && group(12.5) === "12.5",
    `${group(1234567)} ${group(-2025)} ${group(12.5)}`);
  {
    const sources = readdirSync(join(__dirname, "..", "src"), { recursive: true, encoding: "utf8" })
      .filter((f) => typeof f === "string" && f.endsWith(".ts") && !f.endsWith("format.ts"));
    const offenders = sources.filter((f) =>
      readFileSync(join(__dirname, "..", "src", f), "utf8").includes("toLocaleString"));
    ok("no locale-dependent formatting in the generator", offenders.length === 0, offenders.join(","));
  }
}

console.log("\n10. search terms");
{
  const termOpts = (over: Partial<TermsOptions> = {}): TermsOptions => ({
    seed: "testseed",
    count: QUIRKS.length,
    profile: DEFAULT_SUBJECT_PROFILE,
    quirks: [],
    intensity: 0.2,
    near: "anywhere",
    anchor: DEFAULT_ANCHOR,
    ...over,
  });

  /* ── the gazetteer is the ground truth, so it has to be true ──────────── */
  {
    const ids = new Set<string>();
    let duplicates = 0;
    let offWorld = 0;
    let badBox = 0;
    let boxMissesCentre = 0;
    let danglingWithin = 0;
    let asymmetric = 0;
    let emptyAlias = 0;

    for (const place of PLACES) {
      if (ids.has(place.id)) duplicates++;
      ids.add(place.id);
      if (Math.abs(place.lon) > 180 || Math.abs(place.lat) > 90) offWorld++;
      const [minX, minY, maxX, maxY] = place.bbox;
      if (minX > maxX || minY > maxY) badBox++;
      // A centroid outside its own box means one of the two numbers is wrong,
      // and both of them are handed to somebody as the answer.
      if (place.lon < minX || place.lon > maxX || place.lat < minY || place.lat > maxY) {
        boxMissesCentre++;
      }
      if (place.within && !getPlace(place.within)) danglingWithin++;
      for (const other of place.ambiguousWith ?? []) {
        // Ambiguity is a property of the name, so it cannot point one way: if
        // Cambridge means two places, both of them have to say so, or the
        // expectation depends on which one the generator happened to draw.
        if (!getPlace(other)?.ambiguousWith?.includes(place.id)) asymmetric++;
      }
      for (const alias of place.aliases ?? []) if (!alias.name.trim()) emptyAlias++;
    }

    ok("every place has a unique id", duplicates === 0, `${duplicates} repeated`);
    ok("every place is inside the WGS84 domain", offWorld === 0, `${offWorld} off-world`);
    ok("every bounding box has min <= max", badBox === 0, `${badBox} inverted`);
    ok("every centroid is inside its own box", boxMissesCentre === 0, `${boxMissesCentre} outside`);
    ok("every `within` resolves", danglingWithin === 0, `${danglingWithin} dangling`);
    ok("ambiguity is symmetric", asymmetric === 0, `${asymmetric} one-way`);
    ok("no empty aliases", emptyAlias === 0, `${emptyAlias} blank`);

    // A cycle would hang the generator rather than produce a wrong term, and
    // `containers` is bounded precisely because that would be worse.
    const deepest = Math.max(...PLACES.map((p) => containers(p).length));
    ok("the containment chain terminates", deepest < 4, `deepest is ${deepest}`);
  }

  /* ── the catalogue and the implementation cannot drift apart ──────────── */
  {
    // A quirk in the catalogue with no transform behind it is the worst kind of
    // bug this tool can have: it would be offered, selected, reported as
    // applied, and do nothing at all.
    const reachable = new Set<string>();
    for (let s = 0; s < 12; s++) {
      const set = generateTerms(termOpts({ seed: `reach-${s}`, count: QUIRKS.length * 2 }));
      for (const term of set.terms) for (const id of term.quirks) reachable.add(id);
    }
    const unreachable = QUIRKS.filter((q) => !reachable.has(q.id)).map((q) => q.id);
    ok("every quirk in the catalogue really applies", unreachable.length === 0, unreachable.join(","));
  }

  /* ── a set describes itself, whatever is in it ────────────────────────── */
  {
    let failed = 0;
    let sets = 0;
    for (const seed of ["alpha", "beta", "gamma", "delta"]) {
      for (const clean of [true, false]) {
        for (const near of ["anywhere", "tokyo", "lisbon", "nz"]) {
          for (const intensity of [0, 0.5, 1]) {
            sets++;
            const set = generateTerms(termOpts({ seed, clean, near, intensity }));
            if (!inspectTerms(set).passed) failed++;
          }
        }
      }
    }
    ok("every term set passes its own checks", failed === 0, `${failed} of ${sets} failed`);
  }

  /* ── the control set is the control set ───────────────────────────────── */
  {
    const set = generateTerms(termOpts({ clean: true, count: 60 }));
    ok("a clean set applies nothing", set.terms.every((t) => t.quirks.length === 0));
    ok("a clean set says it is clean", set.stats.clean && set.stats.quirks.length === 0);
    ok("no clean term is ambiguous", set.terms.every((t) => !t.expect.ambiguous));
    ok("no clean term is unanswerable", set.terms.every((t) => !t.expect.empty));
    ok("every clean term has a place that resolves", set.terms.every((t) => t.expect.resolvable));
    ok("every clean term has text", set.terms.every((t) => t.text.trim().length > 0));
    // Asking for quirks and getting a clean set would be the one way to hold a
    // control case while believing it is an awkward one.
    const quirked = generateTerms(termOpts({ count: 60 }));
    ok("a quirked set is not clean", !quirked.stats.clean && quirked.stats.quirks.length > 0);
  }

  /* ── determinism, which is the whole promise ──────────────────────────── */
  {
    const a = generateTerms(termOpts({ seed: "same-seed-twice", count: 80, intensity: 0.6 }));
    const b = generateTerms(termOpts({ seed: "same-seed-twice", count: 80, intensity: 0.6 }));
    ok(
      "the same seed gives the same terms",
      JSON.stringify(a.terms) === JSON.stringify(b.terms),
    );
    const c = generateTerms(termOpts({ seed: "a-different-seed", count: 80, intensity: 0.6 }));
    ok(
      "a different seed gives different terms",
      JSON.stringify(a.terms) !== JSON.stringify(c.terms),
    );
    // The anchor is what keeps yesterday's expected answer true today. Moving it
    // moves every window with it — including the dates written into the query
    // text, which is why "on 14 March" is not a fixed string — while the shape
    // of the set, and which quirk each term carries, stay exactly as they were.
    const later = generateTerms(termOpts({ seed: "same-seed-twice", count: 20, anchor: "2030-01-01T00:00:00.000Z" }));
    const now = generateTerms(termOpts({ seed: "same-seed-twice", count: 20 }));
    ok("the anchor is honoured", later.stats.anchor === "2030-01-01T00:00:00.000Z");
    ok(
      "the anchor does not change which quirk a term carries",
      later.terms.map((t) => t.quirks.join("+")).join("|") ===
        now.terms.map((t) => t.quirks.join("+")).join("|"),
    );
    const moved = later.terms.filter((t, i) => {
      const before = now.terms[i].expect.time;
      return t.expect.time.kind === "relative" && before.startsAt !== t.expect.time.startsAt;
    });
    ok("the anchor moves the relative windows",
      moved.length === later.terms.filter((t) => t.expect.time.kind === "relative").length,
      `${moved.length} moved`);
  }

  /* ── the expectation is the product ───────────────────────────────────── */
  {
    const set = generateTerms(termOpts({ count: 200, intensity: 0.5 }));

    // An ambiguous name has no single answer, so naming one would contradict
    // the note printed beside it.
    const named = set.terms.flatMap((t) => t.expect.places).filter((p) => p.candidates.length > 1);
    ok(
      "an ambiguous place names no single answer",
      named.every((p) => p.id === null),
      `${named.filter((p) => p.id !== null).length} of ${named.length} settled anyway`,
    );
    ok("ambiguous candidates are ordered biggest first", named.every((p) =>
      p.candidates.every((c, i) => i === 0 || (p.candidates[i - 1].population ?? 0) >= (c.population ?? 0))));

    // A resolved one does, and it has to be a real entry rather than a name.
    const resolved = set.terms.flatMap((t) => t.expect.places).filter((p) => p.id);
    ok("every resolved place is in the gazetteer", resolved.every((p) => !!getPlace(p.id as string)));
    ok("every resolved place carries coordinates",
      resolved.every((p) => Number.isFinite(p.lon) && Number.isFinite(p.lat) && !!p.bbox));

    // Zero rows is a correct answer, and the reason is the rest of it.
    const unanswerable = set.terms.filter((t) => t.expect.empty);
    ok("an unanswerable query says why", unanswerable.every((t) => t.notes.length > 0),
      `${unanswerable.length} unanswerable`);

    // A window either bounds both ends or neither: half a range is a bug that
    // reads as an open interval somebody meant.
    ok("every window bounds both ends or neither", set.terms.every((t) =>
      (t.expect.time.startsAt === null) === (t.expect.time.endsAt === null)));
    ok("no window is inverted unless it says it is", set.terms.every((t) => {
      const { startsAt, endsAt, empty } = t.expect.time;
      return !startsAt || !endsAt || empty || Date.parse(endsAt) >= Date.parse(startsAt);
    }));

    // The control form is the thing you diff against, so it has to be one.
    ok("every term carries a control form", set.terms.every((t) => typeof t.clean === "string"));

    // Nothing may be reported as applied twice, or the coverage count lies.
    ok("no term reports the same quirk twice",
      set.terms.every((t) => new Set(t.quirks).size === t.quirks.length));
    // And nothing may be reported as both applied and skipped.
    ok("nothing is both applied and skipped",
      set.terms.every((t) => t.skipped.every((s) => !t.quirks.includes(s.id))));
  }

  /* ── a quirk that empties the query stands alone ──────────────────────── */
  {
    const set = generateTerms(termOpts({ count: 300, intensity: 1 }));
    const exclusive = set.terms.filter((t) => t.quirks.some((q) => EXCLUSIVE_QUIRKS.includes(q)));
    ok(
      "a term that empties the query reports nothing else",
      exclusive.every((t) => t.quirks.length === 1),
      `${exclusive.filter((t) => t.quirks.length > 1).length} carry extras`,
    );
    ok("some term did empty the query", exclusive.length > 0);
  }

  /* ── asking for one thing gets that thing ─────────────────────────────── */
  {
    for (const quirk of QUIRKS) {
      const set = generateTerms(termOpts({ count: 6, quirks: [quirk.id], intensity: 0 }));
      const applied = set.terms.filter((t) => t.quirks.includes(quirk.id)).length;
      ok(`--quirks ${quirk.id} applies it`, applied > 0,
        `0 of ${set.terms.length}; skips: ${set.terms.flatMap((t) => t.skipped.map((s) => s.why))[0] ?? "none"}`);
      ok(`--quirks ${quirk.id} applies nothing else`,
        set.terms.every((t) => t.quirks.every((id) => id === quirk.id)));
    }

    // An id that is not in the catalogue is reported rather than swallowed.
    const bogus = generateTerms(termOpts({ count: 4, quirks: ["not-a-quirk"] }));
    ok("an unknown quirk id is reported", bogus.notes.some((n) => n.includes("not-a-quirk")));
    ok("an unknown quirk id applies nothing", bogus.terms.every((t) => t.quirks.length === 0));
  }

  /* ── near narrows the gazetteer ───────────────────────────────────────── */
  {
    const set = generateTerms(termOpts({ near: "tokyo", count: 40, quirks: [], clean: true }));
    const allowed = new Set([
      "tokyo",
      ...PLACES.filter((p) => containers(p).some((c) => c.id === "tokyo")).map((p) => p.id),
      ...containers(getPlace("tokyo")!).map((p) => p.id),
    ]);
    const outside = set.terms
      .flatMap((t) => t.expect.places)
      .filter((p) => p.id && !allowed.has(p.id));
    ok("a clean set honours --near", outside.length === 0,
      outside.map((p) => p.id).join(","));
  }

  /* ── the containers ───────────────────────────────────────────────────── */
  {
    const set = generateTerms(termOpts({ count: 30, intensity: 0.4 }));

    for (const format of TERM_FORMATS) {
      const file = writeTerms(set, format.id, "testseed");
      const text = file.data as string;
      ok(`${format.id} is non-empty`, text.length > 0);
      ok(`${format.id} names itself`, file.filename.endsWith(`.${format.ext}`), file.filename);
      ok(`${format.id} counts its own bytes`, file.bytes === Buffer.byteLength(text, "utf8"));
    }

    const jsonl = writeTerms(set, "jsonl", "testseed").data as string;
    const lines = jsonl.trim().split("\n");
    ok("jsonl has one line per term", lines.length === set.terms.length, `${lines.length}`);
    let unparsed = 0;
    for (const line of lines) {
      try {
        const row = JSON.parse(line);
        if (!row.id || typeof row.query !== "string" || !row.expect) unparsed++;
      } catch {
        unparsed++;
      }
    }
    ok("every jsonl line parses on its own", unparsed === 0, `${unparsed} bad`);
    // A newline inside a query would split one term across two lines and every
    // reader would see a corrupt file rather than a hard query.
    ok("no jsonl line contains a raw newline", lines.every((l) => !l.includes("\r")));

    const whole = JSON.parse(writeTerms(set, "json", "testseed").data as string);
    ok("json holds every term", whole.terms.length === set.terms.length);
    ok("json carries the anchor", whole.anchor === set.stats.anchor);

    // A query is user input on its way into a spreadsheet, so the quoting has
    // to hold even when the query contains commas, quotes and newlines.
    const csv = writeTerms(set, "csv", "testseed").data as string;
    const rows: string[][] = [];
    let field = "";
    let row: string[] = [];
    let quoted = false;
    for (let i = 0; i < csv.length; i++) {
      const ch = csv[i];
      if (quoted) {
        if (ch === '"' && csv[i + 1] === '"') { field += '"'; i++; }
        else if (ch === '"') quoted = false;
        else field += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ",") { row.push(field); field = ""; }
      else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (ch !== "\r") field += ch;
    }
    if (field || row.length) { row.push(field); rows.push(row); }
    const widths = new Set(rows.map((r) => r.length));
    ok("every csv row has the same number of columns", widths.size === 1,
      [...widths].join(","));
    ok("csv has a row per term plus a header", rows.length === set.terms.length + 1, `${rows.length}`);
    // The query has to survive the round trip byte for byte, or the fixture in
    // the spreadsheet is not the fixture that was generated.
    const queries = rows.slice(1).map((r) => r[1]);
    ok("csv preserves every query verbatim",
      queries.every((q, i) => q === set.terms[i].text),
      `${queries.filter((q, i) => q !== set.terms[i].text).length} mangled`);
  }

  /* ── the edges ────────────────────────────────────────────────────────── */
  {
    ok("zero terms is an empty set", generateTerms(termOpts({ count: 0 })).terms.length === 0);
    ok("the term count is clamped", generateTerms(termOpts({ count: MAX_TERMS + 500, intensity: 0 })).terms.length === MAX_TERMS);
    // A seed is untrusted input on its way to a filename, exactly as it is on
    // the file side.
    const hostile = writeTerms(generateTerms(termOpts({ count: 2, seed: "../../etc/passwd" })), "jsonl", "../../etc/passwd");
    ok("a hostile seed cannot escape the filename", !hostile.filename.includes("/"), hostile.filename);
    // An anchor that is not a date falls back rather than producing Invalid Date
    // strings throughout the expectation.
    const bad = generateTerms(termOpts({ count: 4, anchor: "not-a-date" }));
    ok("a bad anchor falls back to the default", bad.stats.anchor === DEFAULT_ANCHOR, bad.stats.anchor);
  }

  /* ── queries that name more than one kind of thing, or none ───────────── */
  {
    const set = generateTerms(termOpts({ count: 300, intensity: 0.5 }));

    // The expectation is a list because a query can ask for several kinds. It
    // has to stay a list even when there is one, or a caller has to special-case
    // the common shape.
    ok("every term carries its kinds as a list",
      set.terms.every((t) => Array.isArray(t.expect.subjects)));
    ok("a term naming no kind says so rather than guessing one",
      set.terms.every((t) => !t.expect.anySubject || t.expect.subjects.length === 0));
    ok("a term naming a kind is not also marked as naming none",
      set.terms.every((t) => t.expect.subjects.length === 0 || !t.expect.anySubject));

    // Every kind resolves to a real data type, and to the noun that data type
    // actually uses — a synonym changes what was typed, never what it means.
    const kinds = set.terms.flatMap((t) => t.expect.subjects);
    ok("every kind names a real data type",
      kinds.every((s) => PROFILES.some((p) => p.id === s.dataType)), 
      kinds.filter((s) => !PROFILES.some((p) => p.id === s.dataType)).map((s) => s.dataType).join(","));
    ok("every kind keeps the schema's own word alongside the typed one",
      kinds.every((s) => SUBJECTS[s.dataType]?.plural === s.canonical),
      kinds.filter((s) => SUBJECTS[s.dataType]?.plural !== s.canonical).map((s) => `${s.dataType}:${s.canonical}`)[0] ?? "");
    ok("no term names the same kind twice",
      set.terms.every((t) => new Set(t.expect.subjects.map((s) => s.dataType)).size === t.expect.subjects.length));

    const multi = set.terms.filter((t) => t.expect.subjects.length > 1);
    ok("some term asks for more than one kind", multi.length > 0, `${multi.length} of ${set.terms.length}`);
    // A union across kinds is the answer, so a query asking for two of them has
    // to actually write both nouns down.
    ok("a multi-kind query writes every noun it claims",
      multi.every((t) => t.expect.subjects.every((s) => t.text.includes(s.typed))));

    const synonyms = set.terms.filter((t) => t.expect.subjects.some((s) => s.typed !== s.canonical));
    ok("some term uses the user's word rather than the schema's", synonyms.length > 0);

    // Naming the kinds you ship means combining those and nothing else — the
    // point of the option is that you decide, not the catalogue.
    {
      const asked = ["mobile-location-pings", "flight-adsb", "maritime-ais"];
      const chosen = generateTerms(
        termOpts({ count: 40, profiles: asked, quirks: ["many-subjects"], intensity: 0 }),
      );
      const named = chosen.terms.flatMap((t) => t.expect.subjects.map((s) => s.dataType));
      ok("every kind in the query is one that was asked for",
        named.every((id) => asked.includes(id)),
        [...new Set(named.filter((id) => !asked.includes(id)))].join(","));
      ok("asking for several kinds combines them",
        chosen.terms.every((t) => t.expect.subjects.length > 1),
        `${chosen.terms.filter((t) => t.expect.subjects.length < 2).length} name only one`);
      ok("every kind asked for turns up somewhere", asked.every((id) => named.includes(id)));

      // Spread across the kinds even without the quirk, so a set about three
      // feeds is about all three rather than about the first one.
      const spread = generateTerms(termOpts({ count: 60, profiles: asked, clean: true }));
      const seen = new Set(spread.terms.flatMap((t) => t.expect.subjects.map((s) => s.dataType)));
      ok("a clean set spreads across every kind asked for", seen.size === asked.length,
        [...seen].join(","));

      // And naming one kind has to leave the stream exactly as it was, or every
      // seed shared before this option existed reproduces something else.
      const before = generateTerms(termOpts({ count: 46, seed: "stream-check" }));
      const after = generateTerms(termOpts({ count: 46, seed: "stream-check", profiles: ["mobile-location-pings"] }));
      ok("naming the one kind you already had changes nothing",
        JSON.stringify(before.terms) === JSON.stringify(after.terms));
    }

    // A template and a subject phrase can each supply the same quantifier, and
    // "list all all devices" reads as a generator bug because it is one. The
    // expectation check cannot see it — the noun really is in the text — so it
    // is worth its own pass over everything the templates can produce.
    {
      let doubled = 0;
      let example = "";
      for (let s = 0; s < 25; s++) {
        for (const clean of [true, false]) {
          for (const t of generateTerms(termOpts({ seed: `words-${s}`, count: 60, clean, intensity: 0.4 })).terms) {
            // Only on the plain sentence: a quirk that repeats a word on purpose
            // — the overlong one — is doing exactly what it says.
            if (t.quirks.length && !t.quirks.every((q) => q === "many-subjects" || q === "subject-synonym")) continue;
            const match = /\b(\w+) \1\b/i.exec(t.text);
            if (match) {
              doubled++;
              example ||= `${t.text} (${t.quirks.join(",") || "clean"})`;
            }
          }
        }
      }
      ok("no term repeats a word by accident", doubled === 0, `${doubled}, e.g. ${example}`);
    }

    // Shuffling is the mode a corpus is generated in: broad, varied, and
    // different again on the next seed. All three of those are testable.
    {
      const rounds = ["one", "two", "three"].map((seed) =>
        generateTerms(termOpts({ seed: `shuffle-${seed}`, count: 60, shuffle: true, intensity: 0.15 })),
      );
      const kindsOf = (s: (typeof rounds)[number]) =>
        new Set(s.terms.flatMap((t) => t.expect.subjects.map((sub) => sub.dataType)));

      ok("a shuffled set spans most of the catalogue",
        rounds.every((r) => kindsOf(r).size >= 15),
        rounds.map((r) => kindsOf(r).size).join(","));
      ok("a shuffled set carries a real share of multi-kind queries",
        rounds.every((r) => r.terms.filter((t) => t.expect.subjects.length > 1).length >= 4),
        rounds.map((r) => r.terms.filter((t) => t.expect.subjects.length > 1).length).join(","));
      // The point of reshuffling is that the next round is genuinely different.
      ok("two seeds give two different corpora",
        rounds[0].terms.map((t) => t.text).join("|") !== rounds[1].terms.map((t) => t.text).join("|"));
      ok("a shuffled set is still reproducible from its seed",
        JSON.stringify(generateTerms(termOpts({ seed: "shuffle-one", count: 60, shuffle: true, intensity: 0.15 })).terms) ===
          JSON.stringify(rounds[0].terms));

      // Across a few rounds, everything in the catalogue turns up — which is
      // the claim the whole mode is for.
      const overRounds = new Set(rounds.flatMap((r) => [...kindsOf(r)]));
      ok("three rounds cover every kind there is",
        overRounds.size === PROFILES.filter((p) => p.id !== "generic").length,
        `${overRounds.size} kinds`);
      const quirksOver = new Set(rounds.flatMap((r) => r.stats.quirks));
      ok("three rounds cover every quirk there is", quirksOver.size === QUIRKS.length, `${quirksOver.size}`);

      // Spreading across kinds is not something wrong with a query. Naming two
      // is, so a control set still names exactly one however it was shuffled.
      const control = generateTerms(termOpts({ count: 120, shuffle: true, clean: true }));
      ok("a shuffled control set still names one kind per term",
        control.terms.every((t) => t.expect.subjects.length === 1));
      ok("a shuffled control set still passes its own checks", inspectTerms(control).passed,
        inspectTerms(control).checks.filter((c) => !c.ok).map((c) => c.detail).join("; "));
      ok("a shuffled control set still spreads across kinds",
        new Set(control.terms.map((t) => t.expect.subjects[0].dataType)).size >= 15);

      // And not shuffling has to leave the stream exactly where it was.
      const plain = generateTerms(termOpts({ seed: "no-shuffle", count: 46 }));
      const off = generateTerms(termOpts({ seed: "no-shuffle", count: 46, shuffle: false }));
      ok("leaving shuffle off changes nothing",
        JSON.stringify(plain.terms) === JSON.stringify(off.terms));
    }

    // "Cases and mobile devices near here" is contact tracing, not a category
    // error, and the affinity groups alone would never produce it.
    {
      let crossed = 0;
      const domain = new Map<string, number>();
      [
        ["flight-adsb", "maritime-ais", "fleet-telematics", "transit-gtfs", "micromobility-mds", "mobile-location-pings"],
        ["cadastral-parcels", "building-footprints", "zoning-land-use", "indoor-bim", "utility-networks"],
        ["satellite-scene-footprints", "elevation-contours", "weather-observations", "land-cover-ndvi", "natural-hazard-zones"],
        ["census-boundary", "health-epidemiology", "crime-incident", "geosocial-checkins", "poi-venues", "trade-area-catchment", "psychographics-spending"],
      ].forEach((group, i) => group.forEach((id) => domain.set(id, i)));

      for (let s = 0; s < 12; s++) {
        for (const t of generateTerms(termOpts({ seed: `cross-${s}`, count: 60, shuffle: true, intensity: 0.3 })).terms) {
          if (t.expect.subjects.length < 2) continue;
          if (new Set(t.expect.subjects.map((sub) => domain.get(sub.dataType))).size > 1) crossed++;
        }
      }
      ok("kinds combine across domains as well as within them", crossed > 0, `${crossed} found`);
    }

    // "Near here" is a third state: neither resolved nor nonexistent. There is
    // no answer without the caller's position, and saying so is the answer.
    {
      const here = generateTerms(termOpts({ count: 20, quirks: ["here"], intensity: 0 }));
      ok("--quirks here needs the caller's location", here.terms.every((t) => t.expect.needsLocation));
      ok("a deictic place resolves to nowhere on its own",
        here.terms.every((t) => t.expect.places.some((p) => p.id === null && p.candidates.length === 0)));
      // Not the same as a place that does not exist: that one can never match,
      // this one matches fine once you know where the caller is.
      ok("a deictic place is not an unanswerable query",
        here.terms.every((t) => !t.expect.empty));
      ok("a deictic query says what a correct search does", here.terms.every((t) => t.notes.length > 0));
      ok("a deictic phrase carries its own preposition",
        here.terms.every((t) => !/\bin (near|around|close|nearby)\b/.test(t.text)),
        here.terms.find((t) => /\bin (near|around|close|nearby)\b/.test(t.text))?.text ?? "");
      // A query naming a place that does not exist alongside one that does is
      // answerable in half — so the claim is about the ones where nothing
      // resolves at all.
      const elsewhere = generateTerms(termOpts({ count: 40, quirks: ["unknown-place"], intensity: 0 }));
      const nowhereAtAll = elsewhere.terms.filter((t) =>
        t.expect.places.length > 0 && t.expect.places.every((p) => p.candidates.length === 0));
      ok("a place that does not exist is unanswerable, not merely un-located",
        nowhereAtAll.length > 0 && nowhereAtAll.every((t) => t.expect.empty && !t.expect.needsLocation),
        `${nowhereAtAll.filter((t) => !t.expect.empty).length} of ${nowhereAtAll.length}`);
    }

    const any = set.terms.filter((t) => t.expect.anySubject);
    ok("some term names no kind at all", any.length > 0);
    ok("a term naming no kind still says what a correct search does",
      any.every((t) => t.notes.length > 0));
  }

  /* ── the catalogue, which is what a classifier reads ──────────────────── */
  {
    const cat = buildCatalogue();
    ok("the catalogue holds every data type", cat.dataTypes.length === PROFILES.length);
    ok("the catalogue holds every quirk", cat.quirks.length === QUIRKS.length);
    ok("the catalogue holds every problem", cat.problems.length === PROBLEMS.length);
    ok("the catalogue holds every place", cat.places.length === PLACES.length);

    // The whole point of it: the words a user types, mapped to the id they mean.
    ok("every data type carries the words people use for it",
      cat.dataTypes.every((d) => d.aliases.length > 0),
      cat.dataTypes.filter((d) => !d.aliases.length).map((d) => d.id).join(","));
    ok("every data type carries both forms of its own noun",
      cat.dataTypes.every((d) => !!d.singular && !!d.plural));
    // An alias pointing at two data types would make the mapping ambiguous in
    // the one direction it exists to serve.
    {
      const owner = new Map<string, string>();
      const clashes: string[] = [];
      for (const type of cat.dataTypes) {
        for (const word of [type.plural, ...type.aliases]) {
          const key = word.toLowerCase();
          if (owner.has(key) && owner.get(key) !== type.id) clashes.push(`${word}: ${owner.get(key)} / ${type.id}`);
          owner.set(key, type.id);
        }
      }
      ok("no word points at two data types", clashes.length === 0, clashes.join("; "));
    }
    ok("the catalogue says what each section is for",
      Object.keys(cat.about).length >= 4);
    ok("the catalogue is valid JSON",
      typeof JSON.parse(JSON.stringify(cat)) === "object");
    // Spelled out rather than omitted, so nothing has to know the convention.
    ok("the catalogue spells out where each problem applies",
      cat.problems.every((p) => Array.isArray(p.formats) && p.formats.length > 0));
  }

  /* ── every data type has a noun, so a term can be about it ────────────── */
  {
    const missing = PROFILES.filter((p) => !SUBJECTS[p.id]).map((p) => p.id);
    ok("every data type has a search subject", missing.length === 0, missing.join(","));
    const empty = Object.entries(SUBJECTS).filter(([, s]) => !s.singular || !s.plural);
    ok("every subject has both forms", empty.length === 0, empty.map(([id]) => id).join(","));
    // And the noun really reaches the query, or the data type is decorative.
    const set = generateTerms(termOpts({ profile: "maritime-ais", count: 12, clean: true }));
    ok("the data type decides the noun",
      set.terms.some((t) => t.expect.subjects.some((s) => s.canonical === "vessels")) &&
        set.stats.profile === "maritime-ais");
    // Nobody types the schema's word. Every data type needs the words people do
    // type, or `subject-synonym` has nothing to reach for.
    const withoutAliases = PROFILES.filter((p) => !(SUBJECTS[p.id]?.aliases?.length));
    ok("every data type has the words people really use", withoutAliases.length === 0,
      withoutAliases.map((p) => p.id).join(","));
  }
}

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) { console.log(`${failures} FAILURES`); process.exit(1); }
