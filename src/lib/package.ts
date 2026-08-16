import { BOUNDARY_IDS, getBoundaryMeta } from "./boundary";
import { utf8 } from "./bytes";
import { buildContext } from "./context";
import { formatBytes } from "./download";
import { getFormat } from "./formats/index";
import { generate } from "./generate";
import {
  appliesTo,
  appliesToProfile,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  EXCLUSIVE_PROBLEM,
  PROBLEMS,
} from "./problems";
import { DEFAULT_PROFILE, getProfile, PROFILES, profileShape } from "./profiles/index";
import { getRegion, REGIONS } from "./regions";
import { normaliseSeed, Rng } from "./rng";
import { encodeConfig } from "./share";
import { SITE_URL } from "./site";
import type {
  FilePayload,
  FormatId,
  GeneratedFile,
  GenerateOptions,
  ProblemCategory,
} from "./types";
import { makeZip, type ZipEntry } from "./zip";

/**
 * Packages: a spread of fixtures in one download, with the notes to read them.
 *
 * One file at a time answers "does my map survive this problem". A package
 * answers the question you actually have — "does my map survive a morning of
 * real uploads" — by handing over every container type at once, each broken
 * differently, alongside a README that says what each one is. Drop the folder
 * on an agent and it has the ground truth without opening a single file.
 *
 * The whole package is derived from one seed, so a package that finds a bug is
 * reproducible from a single word triple, and so is any one file inside it.
 */

/**
 * The order formats are handed out in — not the declaration order.
 *
 * A five-file package should still cover containers that fail in genuinely
 * different ways: text JSON, a spreadsheet export, a real binary bundle, XML.
 * Cousins of something already included (GeoJSONL after GeoJSON, KMZ after KML)
 * wait their turn.
 */
const SWEEP: FormatId[] = [
  "geojson",
  "csv",
  "shapefile",
  "kml",
  "ndjson",
  "gpx",
  "kmz",
  "topojson",
  "wkt",
];

/** Offered in the UI: a taste, one of everything, or everything twice over. */
export const PACKAGE_SIZES = [5, 9, 18];

export const MAX_PACKAGE_FILES = 27;

/**
 * Deliberately modest. A package multiplies the count by its size, and it is
 * built on the main thread — the point of a package is breadth, and breadth at
 * 500 features finds the same bugs as breadth at 50,000.
 */
const COUNT_POOL = [25, 50, 100, 250, 500, 1000];

/**
 * The data types a package cycles through. Generic is left out: a package is
 * for breadth, and "no domain at all" is one setting away in the sidebar.
 */
const DATA_TYPES = PROFILES.filter((p) => p.id !== DEFAULT_PROFILE);

/** Roughly one family, so successive files come from different ones. */
const FAMILY_STRIDE = 5;

/** Anywhere but the whole world: a boundary needs somewhere to have an outside. */
const PLACES = REGIONS.filter((r) => r.id !== "world");

export interface PackageOptions {
  seed: string;
  /** How many fixtures to build. Formats are swept in order, then cycled. */
  size: number;
}

export interface PackageEntry {
  options: GenerateOptions;
  /** The data type this file imitates. */
  profileLabel: string;
  file: GeneratedFile;
  /** Where the fixture sits inside the archive. */
  path: string;
  boundaryPath: string | null;
  /** The category this file was built to exercise, before the extra noise. */
  lead: ProblemCategory;
  /** Hash that reloads these exact settings in the app. */
  hash: string;
  url: string;
}

export interface GeneratedPackage extends FilePayload {
  seed: string;
  entries: PackageEntry[];
  /** The AI context for every file, as it is written into the archive. */
  readme: string;
  manifest: string;
  features: number;
}

/** Rounded to what a share link can hold, so a round-trip changes nothing. */
function percent(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * One file's settings. The lead category rotates, so a package of five has
 * already touched coordinates, geometry, attributes, structure and encoding
 * before anything repeats — the rest of each selection is noise on top.
 */
function planFile(
  rng: Rng,
  seed: string,
  index: number,
  offset: number,
): { options: GenerateOptions; lead: ProblemCategory } {
  const format = SWEEP[index % SWEEP.length];
  const lead = CATEGORY_ORDER[index % CATEGORY_ORDER.length];
  // Data types cycle on a seeded offset, striding by a family's worth each
  // time: consecutive files then come from different corners of the taxonomy
  // rather than walking the catalogue in order. The catalogue length is prime,
  // so the stride still visits every one of them before repeating.
  const profile = DATA_TYPES[(offset + index * FAMILY_STRIDE) % DATA_TYPES.length];

  const pool = PROBLEMS.filter(
    (p) => appliesTo(p, format) && appliesToProfile(p, profile.id) && p.id !== EXCLUSIVE_PROBLEM,
  );
  const chosen = new Set<string>();
  const leadPool = pool.filter((p) => p.category === lead);
  // Not every format can express every category — WKT has no attributes to
  // break — so a missing lead is a fact about the format, not a failure.
  if (leadPool.length) chosen.add(rng.pick(leadPool).id);
  // One thing this data type is actually known for, so the file reads as a bad
  // export of its kind rather than a random one wearing its column names.
  const aptPool = pool.filter((p) => profile.apt.includes(p.id));
  if (aptPool.length) chosen.add(rng.pick(aptPool).id);
  for (const problem of rng.sample(pool, rng.int(2, 6))) chosen.add(problem.id);

  const region = rng.bool(0.12) ? "world" : rng.pick(PLACES).id;

  return {
    options: {
      format,
      count: rng.pick(COUNT_POOL),
      // The data type decides the geometry: flight tracks are lines, parcels
      // are polygons, and a package should not invent combinations.
      shape: profileShape(profile),
      region,
      profile: profile.id,
      problems: [...chosen],
      // Whole percent, because that is all a share link carries: a package
      // promises that the link under each entry rebuilds that file byte for
      // byte, and a value the link cannot hold would quietly break that.
      intensity: percent(0.2 + rng.next() * 0.6),
      // Derived from the package seed, so one file out of a package is still
      // reproducible on its own from the seed printed beside it.
      seed: `${seed}-${index + 1}`,
      pretty: true,
      boundary: region !== "world" && rng.bool(0.4) ? rng.pick(BOUNDARY_IDS.slice(1)) : "none",
      coverage: percent(0.25 + rng.next() * 0.5),
    },
    lead,
  };
}

function boundaryLine(entry: PackageEntry): string | null {
  const boundary = entry.file.boundary;
  if (!boundary) return null;
  return (
    `${getBoundaryMeta(boundary.shape).label.toLowerCase()} boundary in \`${entry.boundaryPath}\` — ` +
    `a contains filter should return ${boundary.inside.toLocaleString()}, ` +
    `an intersects filter ${(boundary.inside + boundary.crossing).toLocaleString()}, ` +
    `and ${boundary.outside.toLocaleString()} features are outside it`
  );
}

function writeReadme(seed: string, entries: PackageEntry[]): string {
  const features = entries.reduce((sum, e) => sum + e.file.stats.features, 0);
  const bytes = entries.reduce((sum, e) => sum + e.file.bytes, 0);

  const lines: string[] = [
    "# Null Island fixture package",
    "",
    `Seed \`${seed}\` · ${entries.length} files · ${features.toLocaleString()} features · ${formatBytes(bytes)}`,
    "",
    `Every file in \`files/\` is a deliberately broken geospatial fixture, generated by Null Island (${SITE_URL}).`,
    "None of it is real data. Nothing was uploaded anywhere — the whole package was built in the browser",
    "from the seed above, and that seed rebuilds it byte for byte.",
    "",
    "## How to use this",
    "",
    "Load each file the way a user would, and compare what your map does against the entry for it below.",
    "Each entry lists what the file contains, what is wrong with it, and what a correct reader is expected",
    "to do. Where a format could not express a requested problem, the entry says so rather than pretending.",
    "",
    "Where a file has a boundary sidecar, its counts are ground truth rather than an observation: a",
    "`contains` filter that returns a different number is wrong, not merely different.",
    "",
    "When something breaks, the reproduction is the file's own seed plus the link at the end of its entry.",
    "",
    "## Contents",
    "",
  ];

  entries.forEach((entry, i) => {
    const format = getFormat(entry.options.format).label;
    lines.push(
      `${i + 1}. \`${entry.path}\` — ${entry.profileLabel} as ${format}, ` +
        `${entry.file.stats.features.toLocaleString()} features, ` +
        `leaning on ${CATEGORY_LABELS[entry.lead].toLowerCase()}`,
    );
  });

  entries.forEach((entry, i) => {
    const block = buildContext(entry.file, getFormat(entry.options.format).label);
    lines.push("", `## ${i + 1}. ${entry.file.filename}`, "");
    lines.push(`Path: \`${entry.path}\``);
    for (const [label, value] of block.fields) {
      if (label === "File") continue;
      lines.push(`${label}: ${value}`);
    }
    lines.push(`Place: ${getRegion(entry.options.region).label}`);
    lines.push(`Seed: \`${normaliseSeed(entry.options.seed)}\``);

    const boundary = boundaryLine(entry);
    if (boundary) lines.push("", `Boundary: ${boundary}.`);

    lines.push("", block.heading);
    for (const problem of block.problems) lines.push(`- ${problem}`);
    lines.push("", `Reproduce: ${entry.url}`);
  });

  lines.push("");
  return lines.join("\n");
}

function writeManifest(seed: string, entries: PackageEntry[]): string {
  return JSON.stringify(
    {
      generator: "Null Island",
      url: SITE_URL,
      seed,
      files: entries.map((entry) => {
        const { file } = entry;
        return {
          path: entry.path,
          format: entry.options.format,
          dataType: entry.options.profile,
          bytes: file.bytes,
          features: file.stats.features,
          positions: file.map.total,
          bbox: file.map.bbox,
          offWorld: { outOfRange: file.map.outOfRange, invalid: file.map.invalid },
          lead: entry.lead,
          problems: file.stats.problems,
          notes: file.notes,
          boundary: file.boundary
            ? {
                path: entry.boundaryPath,
                shape: file.boundary.shape,
                contains: file.boundary.inside,
                intersects: file.boundary.inside + file.boundary.crossing,
                outside: file.boundary.outside,
              }
            : null,
          options: entry.options,
          url: entry.url,
        };
      }),
    },
    null,
    2,
  );
}

function toBytes(data: string | Uint8Array): Uint8Array {
  return typeof data === "string" ? utf8(data) : data;
}

/**
 * Builds the whole package: the fixtures, their boundaries, the README an agent
 * can read, and a manifest for anything that would rather not read prose.
 */
export function buildPackage(options: PackageOptions): GeneratedPackage {
  const seed = normaliseSeed(options.seed);
  const size = Math.max(1, Math.min(MAX_PACKAGE_FILES, Math.floor(options.size)));
  // Namespaced so a package seed and a single-file seed of the same words are
  // not quietly the same roll.
  const rng = new Rng(`package:${seed}`);
  // Where the data-type cycle starts. Drawn once, so the types inside a package
  // are spread rather than repeated, and two seeds start in different places.
  const offset = rng.int(0, DATA_TYPES.length - 1);

  const entries: PackageEntry[] = [];
  const archive: ZipEntry[] = [];

  for (let i = 0; i < size; i++) {
    const { options: opts, lead } = planFile(rng, seed, i, offset);
    const file = generate(opts);
    const path = `files/${file.filename}`;
    archive.push({ name: path, data: toBytes(file.data) });

    let boundaryPath: string | null = null;
    if (file.boundary) {
      boundaryPath = `files/${file.boundary.filename}`;
      archive.push({ name: boundaryPath, data: toBytes(file.boundary.data) });
    }

    const hash = encodeConfig(opts);
    entries.push({
      options: opts,
      profileLabel: getProfile(opts.profile).label,
      file,
      path,
      boundaryPath,
      lead,
      hash,
      url: `${SITE_URL}/#${hash}`,
    });
  }

  const readme = writeReadme(seed, entries);
  const manifest = writeManifest(seed, entries);
  // First in the archive, so the context is the first thing an unzip lists.
  archive.unshift(
    { name: "README.md", data: utf8(readme) },
    { name: "manifest.json", data: utf8(manifest) },
  );

  const data = makeZip(archive);

  return {
    filename: `nullisland-pack-${entries.length}-${seed}.zip`,
    mime: "application/zip",
    data,
    bytes: data.length,
    seed,
    entries,
    readme,
    manifest,
    features: entries.reduce((sum, e) => sum + e.file.stats.features, 0),
  };
}
