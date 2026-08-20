import { BOUNDARY_IDS, getBoundaryMeta } from "./boundary";
import { utf8 } from "./bytes";
import { buildContext } from "./context";
import { group, formatBytes } from "./format";
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
  /**
   * Build the control package instead: the same spread of formats and data
   * types, with nothing wrong with any of it.
   *
   * A broken package asks whether your map survives bad data. This asks the
   * question underneath it — whether it handles *good* data across every
   * container you claim to accept — and that one is worth asking first,
   * because a reader that mangles a clean shapefile will fail every broken
   * fixture too, for a reason that has nothing to do with the fixture.
   */
  clean?: boolean;
}

export interface PackageEntry {
  options: GenerateOptions;
  /** The data type this file imitates. */
  profileLabel: string;
  file: GeneratedFile;
  /** Where the fixture sits inside the archive. */
  path: string;
  boundaryPath: string | null;
  /**
   * The category this file was built to exercise, before the extra noise.
   * Null in a clean package, which exercises no category at all.
   */
  lead: ProblemCategory | null;
  /** Hash that reloads these exact settings in the app. */
  hash: string;
  url: string;
}

export interface GeneratedPackage extends FilePayload {
  seed: string;
  /** True when every file in it is a control case. */
  clean: boolean;
  entries: PackageEntry[];
  /** The AI context for every file, as it is written into the archive. */
  readme: string;
  manifest: string;
  features: number;
}

/**
 * One file's settings. The lead category rotates, so a package of five has
 * already touched coordinates, geometry, attributes, structure and encoding
 * before anything repeats — the rest of each selection is noise on top.
 *
 * In clean mode the formats and data types still sweep exactly as they do for a
 * broken package: the spread is the point of a package either way, and a
 * control set that only covered GeoJSON would prove nothing about the shapefile
 * reader that is going to be the one that breaks.
 */
function planFile(
  rng: Rng,
  seed: string,
  index: number,
  offset: number,
  clean: boolean,
): { options: GenerateOptions; lead: ProblemCategory | null } {
  const format = SWEEP[index % SWEEP.length];
  const lead = clean ? null : CATEGORY_ORDER[index % CATEGORY_ORDER.length];
  // Data types cycle on a seeded offset, striding by a family's worth each
  // time: consecutive files then come from different corners of the taxonomy
  // rather than walking the catalogue in order. The catalogue length is prime,
  // so the stride still visits every one of them before repeating.
  const profile = DATA_TYPES[(offset + index * FAMILY_STRIDE) % DATA_TYPES.length];

  // A clean package draws nothing here — not an empty selection from a full
  // pool, but no draw at all, so the RNG is never spent on choices that are not
  // going to be made.
  const chosen = new Set<string>();
  if (!clean) {
    const pool = PROBLEMS.filter(
      (p) => appliesTo(p, format) && appliesToProfile(p, profile.id) && p.id !== EXCLUSIVE_PROBLEM,
    );
    // Not every format can express every category — WKT has no attributes to
    // break — so a missing lead is a fact about the format, not a failure.
    const leadPool = pool.filter((p) => p.category === lead);
    if (leadPool.length) chosen.add(rng.pick(leadPool).id);
    // One thing this data type is actually known for, so the file reads as a bad
    // export of its kind rather than a random one wearing its column names.
    const aptPool = pool.filter((p) => profile.apt.includes(p.id));
    if (aptPool.length) chosen.add(rng.pick(aptPool).id);
    // And one problem that exists *only* in this data type. Left to the random
    // fill it rarely appears — there are forty-two general problems against a
    // dozen domain ones — and a package of nine schemas that break in nine
    // generic ways would waste the schemas.
    const domainPool = pool.filter((p) => p.profiles);
    if (domainPool.length) chosen.add(rng.pick(domainPool).id);
    for (const problem of rng.sample(pool, rng.int(2, 6))) chosen.add(problem.id);
  }

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
      intensity: clean ? 0 : 0.2 + rng.next() * 0.6,
      // Derived from the package seed, so one file out of a package is still
      // reproducible on its own from the seed printed beside it.
      seed: `${seed}-${index + 1}`,
      pretty: true,
      boundary: region !== "world" && rng.bool(0.4) ? rng.pick(BOUNDARY_IDS.slice(1)) : "none",
      coverage: 0.25 + rng.next() * 0.5,
    },
    lead,
  };
}

function boundaryLine(entry: PackageEntry): string | null {
  const boundary = entry.file.boundary;
  if (!boundary) return null;
  return (
    `${getBoundaryMeta(boundary.shape).label.toLowerCase()} boundary in \`${entry.boundaryPath}\` — ` +
    `a contains filter should return ${group(boundary.inside)}, ` +
    `an intersects filter ${group(boundary.inside + boundary.crossing)}, ` +
    `and ${group(boundary.outside)} features are outside it`
  );
}

function writeReadme(seed: string, entries: PackageEntry[], clean: boolean): string {
  const features = entries.reduce((sum, e) => sum + e.file.stats.features, 0);
  const bytes = entries.reduce((sum, e) => sum + e.file.bytes, 0);
  const failed = entries.filter((e) => e.file.clean && !e.file.clean.passed).length;

  const lines: string[] = [
    clean ? "# Null Island clean fixture package" : "# Null Island fixture package",
    "",
    `Seed \`${seed}\` · ${entries.length} files · ${group(features)} features · ${formatBytes(bytes)}`,
    "",
    ...(clean
      ? [
          `Every file in \`files/\` is a clean, well-formed geospatial fixture, generated by Null Island (${SITE_URL}).`,
          "Nothing is wrong with any of them. This is the control package: the one you run first, to establish",
          "that your reader handles good data in every container you claim to accept, before you go looking at",
          "how it handles bad data.",
          "",
          "None of it is real data. Nothing was uploaded anywhere — the whole package was built in the browser",
          "from the seed above, and that seed rebuilds it byte for byte.",
          "",
          "## How to use this",
          "",
          "Load every file the way a user would. **All of them should load, and every feature should appear.**",
          "There is no trick in here and nothing to catch you out, so any file that fails, drops features, or",
          "lands in the wrong place has found a bug on the reading side — not in the fixture.",
          "",
          "Each entry below lists what the file holds and the checks that were run on it before it was written.",
          "Where a container genuinely cannot carry something — GPX has no attributes, WKT has no properties at",
          "all — the entry says what was dropped and why. That is the format's limit, not a defect in the file.",
        ]
      : [
          `Every file in \`files/\` is a deliberately broken geospatial fixture, generated by Null Island (${SITE_URL}).`,
          "None of it is real data. Nothing was uploaded anywhere — the whole package was built in the browser",
          "from the seed above, and that seed rebuilds it byte for byte.",
          "",
          "## How to use this",
          "",
          "Load each file the way a user would, and compare what your map does against the entry for it below.",
          "Each entry lists what the file contains, what is wrong with it, and what a correct reader is expected",
          "to do. Where a format could not express a requested problem, the entry says so rather than pretending.",
        ]),
    "",
    "Where a file has a boundary sidecar, its counts are ground truth rather than an observation: a",
    "`contains` filter that returns a different number is wrong, not merely different.",
    "",
    "When something breaks, the reproduction is the file's own seed plus the link at the end of its entry.",
    "",
    ...(failed
      ? [
          `WARNING: ${group(failed)} of these files did not pass their own clean check. That is a bug in`,
          `Null Island rather than in your reader — please report it at ${SITE_URL}.`,
          "",
        ]
      : []),
    "## Contents",
    "",
  ];

  entries.forEach((entry, i) => {
    const format = getFormat(entry.options.format).label;
    lines.push(
      `${i + 1}. \`${entry.path}\` — ${entry.profileLabel} as ${format}, ` +
        `${group(entry.file.stats.features)} features` +
        (entry.lead ? `, leaning on ${CATEGORY_LABELS[entry.lead].toLowerCase()}` : ", clean"),
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

    if (block.checks) {
      lines.push("", block.checks.heading);
      for (const check of block.checks.lines) lines.push(`- ${check}`);
    }

    lines.push("", block.heading);
    for (const problem of block.problems) lines.push(`- ${problem}`);
    lines.push("", `Reproduce: ${entry.url}`);
  });

  lines.push("");
  return lines.join("\n");
}

function writeManifest(seed: string, entries: PackageEntry[], clean: boolean): string {
  return JSON.stringify(
    {
      generator: "Null Island",
      url: SITE_URL,
      seed,
      clean,
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
          clean: file.stats.clean,
          // Present only on a clean file: what was checked, and whether it held.
          checks: file.clean
            ? {
                passed: file.clean.passed,
                ran: file.clean.checks.map((c) => ({ check: c.label, ok: c.ok, detail: c.detail })),
              }
            : null,
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
  const clean = options.clean === true;
  // Namespaced so a package seed and a single-file seed of the same words are
  // not quietly the same roll — and the two modes are namespaced apart from
  // each other too, so a clean package and a broken one from the same words are
  // not the same files with the damage switched off.
  const rng = new Rng(clean ? `clean-package:${seed}` : `package:${seed}`);
  // Where the data-type cycle starts. Drawn once, so the types inside a package
  // are spread rather than repeated, and two seeds start in different places.
  const offset = rng.int(0, DATA_TYPES.length - 1);

  const entries: PackageEntry[] = [];
  const archive: ZipEntry[] = [];

  for (let i = 0; i < size; i++) {
    const { options: opts, lead } = planFile(rng, seed, i, offset, clean);
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

  const readme = writeReadme(seed, entries, clean);
  const manifest = writeManifest(seed, entries, clean);
  // First in the archive, so the context is the first thing an unzip lists.
  archive.unshift(
    { name: "README.md", data: utf8(readme) },
    { name: "manifest.json", data: utf8(manifest) },
  );

  const data = makeZip(archive);

  return {
    // Named apart, so a clean package and a broken one do not sit in a
    // downloads folder looking like the same thing.
    filename: clean
      ? `nullisland-clean-pack-${entries.length}-${seed}.zip`
      : `nullisland-pack-${entries.length}-${seed}.zip`,
    mime: "application/zip",
    data,
    bytes: data.length,
    seed,
    clean,
    entries,
    readme,
    manifest,
    features: entries.reduce((sum, e) => sum + e.file.stats.features, 0),
  };
}
