/* eslint-disable */
import { generate, MAX_FEATURES } from "../src/lib/generate";
import { FORMATS } from "../src/lib/formats/index";
import { PROBLEMS, appliesTo } from "../src/lib/problems";
import type { FormatId, GenerateOptions } from "../src/lib/types";

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
    problems: [],
    intensity: 0.4,
    seed: "testseed",
    pretty: false,
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

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) { console.log(`${failures} FAILURES`); process.exit(1); }
