#!/usr/bin/env node
/**
 * The command line half of Null Island.
 *
 * It is a thin front for `nullisland-core`: the same generator the web app
 * runs, so a seed produces the same bytes in a terminal, in CI and in a
 * browser. That is why `--from-url` exists — build a fixture by clicking, copy
 * the share link, and paste it into a test suite or a Makefile.
 *
 * No dependencies, no config file, and nothing written outside the directory
 * you point it at.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  appliesTo,
  appliesToProfile,
  BOUNDARIES as BOUNDARY_META,
  buildContext,
  buildPackage,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  contextToText,
  decodeConfig,
  DEFAULT_ANCHOR,
  DEFAULT_PROFILE,
  DEFAULT_SUBJECT_PROFILE,
  encodeConfig,
  FAMILIES,
  formatBytes,
  FORMATS,
  generate,
  generateTerms,
  getFormat,
  getProblem,
  getProfile,
  getQuirk,
  getTermFormat,
  inspectTerms,
  MAX_TERMS,
  PLACES,
  QUIRK_CATEGORY_LABELS,
  QUIRK_CATEGORY_ORDER,
  QUIRKS,
  MAX_FEATURES,
  MAX_PACKAGE_FILES,
  PROBLEMS,
  PROFILES,
  profileShape,
  profilesInFamily,
  normaliseSeed,
  randomSeed,
  Rng,
  REGIONS,
  SITE_URL,
  TERM_FORMATS,
  writeTerms,
  type BoundaryId,
  type FormatId,
  type GenerateOptions,
  type ShapeId,
  type TermFormatId,
} from "nullisland-core";

const NAME = "nullisland";

/* ── argv ────────────────────────────────────────────────────────────────── */

interface Args {
  flags: Set<string>;
  values: Map<string, string>;
  positional: string[];
}

/**
 * Options that take a value, and options that are on or off. Declared rather
 * than inferred, for two reasons: `--intensity -0.5` has to reach the option
 * instead of being read as another flag, and a typo has to be an error. A CLI
 * that silently ignores `--typcal` hands you a clean file and lets you believe
 * it is a broken one, which is the one failure this tool cannot afford.
 */
const TAKES_VALUE = new Set([
  "format", "type", "profile", "count", "shape", "region", "problems", "intensity",
  "seed", "boundary", "coverage", "out", "from-url", "url", "package", "list",
  "terms", "term-format", "quirks", "near", "anchor",
]);

const IS_FLAG = new Set([
  "help", "h", "version", "v", "typical", "clean", "stdout", "context", "json", "compact",
  "extract", "package", "list", "terms",
]);

/** `--key value`, `--key=value`, `--flag`, and bare words. No cleverness. */
function parseArgs(argv: string[]): Args {
  const flags = new Set<string>();
  const values = new Map<string, string>();
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("-")) {
      positional.push(arg);
      continue;
    }
    const bare = arg.replace(/^--?/, "");
    const eq = bare.indexOf("=");
    const name = eq >= 0 ? bare.slice(0, eq) : bare;

    if (!TAKES_VALUE.has(name) && !IS_FLAG.has(name)) {
      fail(`unknown option "--${name}"`, `run \`${NAME} --help\``);
    }
    if (eq >= 0) {
      values.set(name, bare.slice(eq + 1));
      continue;
    }
    const next = argv[i + 1];
    // A value-taking option consumes what follows even when it starts with a
    // dash, so negative numbers arrive intact — but not when what follows is
    // itself an option, or `--out --json` would write to a directory called
    // "--json" and drop the flag.
    const nextIsOption =
      next !== undefined &&
      next.startsWith("-") &&
      (TAKES_VALUE.has(next.replace(/^--?/, "").split("=")[0]) ||
        IS_FLAG.has(next.replace(/^--?/, "").split("=")[0]));
    if (TAKES_VALUE.has(name) && next !== undefined && !nextIsOption) {
      values.set(name, next);
      i++;
    } else if (TAKES_VALUE.has(name) && !IS_FLAG.has(name)) {
      fail(`--${name} needs a value`);
    } else {
      flags.add(name);
    }
  }
  return { flags, values, positional };
}

function fail(message: string, hint?: string): never {
  process.stderr.write(`${NAME}: ${message}\n`);
  if (hint) process.stderr.write(`  ${hint}\n`);
  process.exit(2);
}

function oneOf<T extends string>(
  label: string,
  value: string | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  if (value === undefined) return fallback;
  if ((allowed as readonly string[]).includes(value)) return value as T;
  fail(`unknown ${label} "${value}"`, `try one of: ${allowed.join(", ")}`);
}

function number(
  label: string,
  value: string | undefined,
  fallback: number,
  min = -Infinity,
  max = Infinity,
): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) fail(`${label} must be a number, got "${value}"`);
  // Out of range is a mistake worth reporting: the generator would clamp it and
  // hand back a file that quietly ignored what was asked for.
  if (parsed < min || parsed > max) fail(`${label} must be between ${min} and ${max}, got ${parsed}`);
  return parsed;
}

/* ── listing ─────────────────────────────────────────────────────────────── */

/**
 * The catalogue as data rather than as columns.
 *
 * The prose listing is for a person deciding what to generate. This is for
 * whatever is going to generate it: an agent or a script picking ids needs to
 * know not just that `crs-member` exists but that CSV cannot express it and
 * that `ais-sentinels` only exists in AIS data — facts the padded columns imply
 * at best. Everything here comes from the same catalogue the generator reads,
 * so a listing cannot drift from what the generator will accept.
 */
function listJson(what: string): boolean {
  const out = process.stdout;
  const write = (value: unknown) => out.write(`${JSON.stringify(value, null, 2)}\n`);

  if (what === "formats") {
    write({
      formats: FORMATS.map((f) => ({
        id: f.id,
        label: f.label,
        ext: f.ext,
        mime: f.mime,
        binary: f.binary,
        blurb: f.blurb,
      })),
    });
    return true;
  }
  if (what === "types" || what === "profiles") {
    write({
      dataTypes: PROFILES.map((p) => ({
        id: p.id,
        label: p.label,
        family: p.family,
        // The geometry this data really comes in. Asking for another is allowed
        // but deliberate, and the file says so when you do.
        shape: profileShape(p),
        blurb: p.blurb,
        // The generic profile builds its properties outright rather than from a
        // field list, so its columns are read off one sample rather than
        // reported as none — an empty array would read as "no attributes".
        columns: p.fields?.length
          ? p.fields.map((f) => f.name)
          : p.build
            ? Object.keys(p.build(new Rng("list"), 0))
            : [],
        typicalProblems: p.apt,
      })),
      families: FAMILIES.map((f) => ({ id: f.id, label: f.label })),
    });
    return true;
  }
  if (what === "problems") {
    write({
      problems: PROBLEMS.map((p) => ({
        id: p.id,
        label: p.label,
        blurb: p.blurb,
        category: p.category,
        // Omitted in the catalogue means "all of them"; spelled out here, so a
        // caller never has to know that convention.
        formats: p.appliesTo ?? FORMATS.map((f) => f.id),
        dataTypes: p.profiles ?? "all",
      })),
      categories: CATEGORY_ORDER.map((id) => ({ id, label: CATEGORY_LABELS[id] })),
    });
    return true;
  }
  if (what === "regions") {
    write({ regions: REGIONS.map((r) => ({ id: r.id, label: r.label, lon: r.lon, lat: r.lat })) });
    return true;
  }
  if (what === "quirks") {
    write({
      quirks: QUIRKS.map((q) => ({
        id: q.id,
        label: q.label,
        blurb: q.blurb,
        category: q.category,
        phase: q.phase,
        // What the query must already contain before this means anything. A
        // caller picking ids needs to know that `local-midnight` does nothing
        // to a query with no window in it, rather than discovering it in the
        // skipped list afterwards.
        needs: q.needs,
        example: q.example,
      })),
      categories: QUIRK_CATEGORY_ORDER.map((id) => ({ id, label: QUIRK_CATEGORY_LABELS[id] })),
      formats: TERM_FORMATS.map((f) => ({
        id: f.id,
        ext: f.ext,
        mime: f.mime,
        blurb: f.blurb,
        groundTruth: f.groundTruth,
      })),
    });
    return true;
  }
  if (what === "places" || what === "gazetteer") {
    write({
      places: PLACES.map((p) => ({
        id: p.id,
        name: p.name,
        kind: p.kind,
        lon: p.lon,
        lat: p.lat,
        bbox: p.bbox,
        country: p.country,
        within: p.within ?? null,
        aliases: p.aliases ?? [],
        // Spelled out rather than omitted: "no other place has this name" is a
        // fact worth reading, and an absent key would not say it.
        ambiguousWith: p.ambiguousWith ?? [],
        population: p.population ?? null,
        note: p.note ?? null,
      })),
    });
    return true;
  }
  if (what === "boundaries") {
    write({ boundaries: BOUNDARY_META.map((b) => ({ id: b.id, label: b.label, blurb: b.blurb })) });
    return true;
  }
  return false;
}

function list(what: string, json: boolean): void {
  if (json) {
    if (listJson(what)) return;
    fail(
      `don't know how to list "${what}"`,
      "try: formats, types, problems, regions, boundaries, quirks, places",
    );
  }
  const out = process.stdout;
  if (what === "boundaries") {
    for (const boundary of BOUNDARY_META) {
      out.write(`${boundary.id.padEnd(11)} ${boundary.label.padEnd(22)} ${boundary.blurb}\n`);
    }
    return;
  }
  if (what === "formats") {
    for (const format of FORMATS) {
      out.write(`${format.id.padEnd(11)} .${format.ext.padEnd(10)} ${format.blurb}\n`);
    }
    return;
  }
  if (what === "types" || what === "profiles") {
    for (const family of FAMILIES) {
      const inFamily = profilesInFamily(family.id);
      if (!inFamily.length) continue;
      out.write(`\n${family.label}\n`);
      for (const profile of inFamily) {
        out.write(`  ${profile.id.padEnd(28)} ${profileShape(profile).padEnd(8)} ${profile.blurb}\n`);
      }
    }
    out.write("\n");
    return;
  }
  if (what === "problems") {
    for (const category of ["coordinates", "geometry", "attributes", "structure", "encoding"] as const) {
      out.write(`\n${CATEGORY_LABELS[category]}\n`);
      for (const problem of PROBLEMS.filter((p) => p.category === category)) {
        const scope = problem.profiles ? ` [${problem.profiles.length} data types]` : "";
        out.write(`  ${problem.id.padEnd(24)} ${problem.label}${scope}\n`);
        out.write(`  ${" ".repeat(24)} ${problem.blurb}\n`);
      }
    }
    out.write("\n");
    return;
  }
  if (what === "regions") {
    for (const region of REGIONS) out.write(`${region.id.padEnd(16)} ${region.label}\n`);
    return;
  }
  if (what === "quirks") {
    for (const category of QUIRK_CATEGORY_ORDER) {
      out.write(`\n${QUIRK_CATEGORY_LABELS[category]}\n`);
      for (const quirk of QUIRKS.filter((q) => q.category === category)) {
        const needs = quirk.needs === "none" ? "" : ` [needs a ${quirk.needs.replace(/s$/, "")}]`;
        out.write(`  ${quirk.id.padEnd(22)} ${quirk.label}${needs}\n`);
        out.write(`  ${" ".repeat(22)} ${quirk.blurb}\n`);
        out.write(`  ${" ".repeat(22)} e.g. ${quirk.example}\n`);
      }
    }
    out.write("\n");
    return;
  }
  if (what === "places" || what === "gazetteer") {
    for (const place of PLACES) {
      const also = place.ambiguousWith?.length ? ` (also ${place.ambiguousWith.length} elsewhere)` : "";
      out.write(
        `${place.id.padEnd(20)} ${place.kind.padEnd(8)} ${place.name}${also}\n`,
      );
    }
    return;
  }
  fail(
    `don't know how to list "${what}"`,
    "try: formats, types, problems, regions, boundaries, quirks, places",
  );
}

/* ── options ─────────────────────────────────────────────────────────────── */

const SHAPES: ShapeId[] = ["point", "line", "polygon", "mixed"];
const BOUNDARY_ORDER: BoundaryId[] = ["none", "bbox", "polygon", "hole", "multipart"];

/**
 * A share link is the whole configuration, so it is read first and then
 * overridden by anything given explicitly — `--from-url … --count 50` means
 * "that fixture, but smaller".
 */
function optionsFrom(args: Args): GenerateOptions {
  const fromUrl = args.values.get("from-url") ?? args.values.get("url");
  let shared: Partial<GenerateOptions> = {};
  if (fromUrl !== undefined) {
    if (!fromUrl.includes("#")) {
      fail("that link has no # fragment, which is where the configuration lives",
        "copy the whole URL from the Share button");
    }
    shared = decodeConfig(fromUrl.slice(fromUrl.indexOf("#") + 1));
    if (!Object.keys(shared).length) {
      fail("nothing recognisable in that link's fragment",
        `run \`${NAME} --help\` for the options, or copy the link again`);
    }
  }

  const profileId = args.values.get("profile") ?? args.values.get("type") ?? shared.profile ?? DEFAULT_PROFILE;
  if (!PROFILES.some((p) => p.id === profileId)) {
    fail(`unknown data type "${profileId}"`, `run \`${NAME} --list types\``);
  }
  const profile = getProfile(profileId);

  const problems = (args.values.get("problems") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  for (const id of problems) {
    if (!getProblem(id)) fail(`unknown problem "${id}"`, `run \`${NAME} --list problems\``);
  }

  // --clean is an assertion about the output, not a default, so anything that
  // would put a problem in the file contradicts it outright. Quietly winning
  // that argument in either direction is the failure mode worth avoiding: a
  // file you believe is a control case and isn't teaches you the wrong thing
  // about your reader, and so does the reverse.
  const clean = args.flags.has("clean");
  if (clean) {
    if (problems.length) {
      fail("--clean and --problems ask for opposite things",
        "drop one: --clean for a control fixture, --problems for a broken one");
    }
    if (args.flags.has("typical")) {
      fail("--clean and --typical ask for opposite things",
        "--typical is what this data type usually arrives broken with");
    }
    if (fromUrl !== undefined && (shared.problems?.length ?? 0) > 0) {
      fail("--clean contradicts that share link, which carries problems",
        "drop --clean to rebuild the link as it was");
    }
  }

  const format = oneOf(
    "format",
    args.values.get("format"),
    FORMATS.map((f) => f.id),
    (shared.format ?? "geojson") as FormatId,
  );

  return {
    format,
    count: Math.round(number("--count", args.values.get("count"), shared.count ?? 500, 0, MAX_FEATURES)),
    // A data type has a geometry; asking for another is allowed but deliberate.
    shape: oneOf("shape", args.values.get("shape"), SHAPES, shared.shape ?? (profileId === DEFAULT_PROFILE ? "point" : profileShape(profile))),
    region: oneOf("region", args.values.get("region"), REGIONS.map((r) => r.id), shared.region ?? "london"),
    profile: profileId,
    problems: clean
      ? []
      : problems.length
        ? problems
        : (shared.problems ?? (args.flags.has("typical") ? profile.apt : [])),
    intensity: clean ? 0 : number("--intensity", args.values.get("intensity"), shared.intensity ?? 0.4, 0, 1),
    seed: normaliseSeed(args.values.get("seed") ?? shared.seed ?? randomSeed()),
    pretty: !args.flags.has("compact") && (shared.pretty ?? true),
    boundary: oneOf("boundary", args.values.get("boundary"), BOUNDARY_ORDER, shared.boundary ?? "none"),
    coverage: number("--coverage", args.values.get("coverage"), shared.coverage ?? 0.6, 0, 1),
  };
}

function write(directory: string, filename: string, data: string | Uint8Array): string {
  const path = resolve(join(directory, filename));
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, typeof data === "string" ? data : Buffer.from(data));
  return path;
}

/* ── the two things it does ──────────────────────────────────────────────── */

function generateOne(args: Args): void {
  const opts = optionsFrom(args);
  const file = generate(opts);
  const json = args.flags.has("json");

  if (args.flags.has("stdout")) {
    // One file down a pipe. Anything that implies a second output has to be
    // refused outright: silently dropping the boundary — the thing that carries
    // the ground truth — would be the worst kind of quiet.
    for (const [flag, why] of [
      ["json", "prints a summary as well as the file"],
      ["context", "writes a second file"],
    ] as const) {
      if (args.flags.has(flag)) fail(`--stdout cannot be combined with --${flag}: it ${why}`, "use --out instead");
    }
    if (opts.boundary !== "none") {
      fail("--boundary writes a second file, which cannot go down one pipe", "use --out instead");
    }
    if (typeof file.data === "string") process.stdout.write(file.data);
    else process.stdout.write(Buffer.from(file.data));
    // stdout carries the file and nothing else, but a control fixture that
    // failed its own check still has to say so — stderr is not the pipe, and
    // silence here would hand a broken control case straight into a test.
    if (file.clean && !file.clean.passed) {
      process.stderr.write(
        `${NAME}: this file did not pass its own clean check — that is a bug in Null Island.\n` +
          `  please report it at ${SITE_URL}\n`,
      );
      process.exit(1);
    }
    return;
  }

  const directory = args.values.get("out") ?? ".";
  const written = [write(directory, file.filename, file.data)];
  if (file.boundary) written.push(write(directory, file.boundary.filename, file.boundary.data));

  const context = contextToText(buildContext(file, getFormat(opts.format).label));
  if (args.flags.has("context")) {
    written.push(write(directory, `${file.filename}.md`, `${context}\n`));
  }

  if (json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          files: written,
          format: opts.format,
          dataType: opts.profile,
          seed: opts.seed,
          features: file.stats.features,
          positions: file.map.total,
          bytes: file.bytes,
          bbox: file.map.bbox,
          offWorld: { outOfRange: file.map.outOfRange, invalid: file.map.invalid },
          problems: file.stats.problems,
          clean: file.stats.clean,
          // Present only on a control fixture: what was checked, and whether it
          // held. `passed: false` is a bug in Null Island, and worth failing a
          // CI step over.
          checks: file.clean
            ? {
                passed: file.clean.passed,
                ran: file.clean.checks.map((c) => ({ check: c.label, ok: c.ok, detail: c.detail })),
              }
            : null,
          notes: file.notes,
          boundary: file.boundary
            ? {
                contains: file.boundary.inside,
                intersects: file.boundary.inside + file.boundary.crossing,
                outside: file.boundary.outside,
              }
            : null,
          url: `${SITE_URL}/#${encodeConfig(opts)}`,
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  const out = process.stdout;
  for (const path of written) out.write(`${path}\n`);
  out.write(
    `\n${getFormat(opts.format).label} · ${getProfile(opts.profile).label} · ` +
      `${file.stats.features.toLocaleString()} features · ${formatBytes(file.bytes)}` +
      `${file.stats.clean ? " · clean" : ""}\n` +
      `seed ${opts.seed}\n`,
  );

  // A control fixture is only worth anything if it really is one, so the checks
  // are printed rather than assumed — and a failure is loud, because it means
  // the fixture is lying.
  if (file.clean) {
    out.write("\n");
    for (const check of file.clean.checks) {
      out.write(`${check.ok ? "  ok  " : "FAIL  "}${check.label} (${check.detail})\n`);
    }
    if (!file.clean.passed) {
      process.stderr.write(
        `\n${NAME}: this file did not pass its own clean check — that is a bug in Null Island.\n` +
          `  please report it at ${SITE_URL}\n`,
      );
    }
  }

  if (file.notes.length) {
    out.write("\n");
    for (const note of file.notes) out.write(`- ${note}\n`);
  }
  out.write(`\nreproduce: ${SITE_URL}/#${encodeConfig(opts)}\n`);
  // Exit non-zero so a control fixture that is not actually clean cannot pass
  // unnoticed through a script that only checks the status.
  if (file.clean && !file.clean.passed) process.exit(1);
}

function generatePackage(args: Args): void {
  // A package chooses its own formats, data types and problems — that is what
  // makes it a package. An option that would have no effect is a mistake worth
  // reporting, not something to swallow.
  for (const option of ["format", "type", "profile", "shape", "count", "region", "problems", "intensity", "coverage", "boundary", "from-url", "url"]) {
    if (args.values.has(option)) {
      fail(`--${option} has no meaning with --package`, "a package picks its own spread; drop --package to build one file");
    }
  }
  for (const flag of ["typical", "stdout", "context"]) {
    if (args.flags.has(flag)) fail(`--${flag} has no meaning with --package`);
  }
  const size = Math.round(number("--package", args.values.get("package"), 9));
  if (size < 1 || size > MAX_PACKAGE_FILES) {
    fail(`--package must be between 1 and ${MAX_PACKAGE_FILES}`);
  }
  const seed = args.values.get("seed") ?? randomSeed();
  // The one option that does mean something here: same sweep of formats and
  // data types, nothing wrong with any of it.
  const clean = args.flags.has("clean");
  const pack = buildPackage({ seed, size, clean });
  const directory = args.values.get("out") ?? ".";

  // A zip is the shareable artefact; --extract is what you want in a repo, so
  // the fixtures and their README sit where a test can open them.
  if (args.flags.has("extract")) {
    const written: string[] = [];
    for (const entry of pack.entries) {
      written.push(write(directory, entry.path, entry.file.data));
      if (entry.boundaryPath && entry.file.boundary) {
        written.push(write(directory, entry.boundaryPath, entry.file.boundary.data));
      }
    }
    written.push(write(directory, "README.md", pack.readme));
    written.push(write(directory, "manifest.json", `${pack.manifest}\n`));
    if (args.flags.has("json")) {
      process.stdout.write(`${JSON.stringify({ files: written, seed: pack.seed }, null, 2)}\n`);
      return;
    }
    for (const path of written) process.stdout.write(`${path}\n`);
  } else {
    const path = write(directory, pack.filename, pack.data);
    if (args.flags.has("json")) {
      process.stdout.write(
        `${JSON.stringify(
          {
            file: path,
            seed: pack.seed,
            files: pack.entries.length,
            features: pack.features,
            bytes: pack.bytes,
            entries: pack.entries.map((e) => ({
              path: e.path,
              format: e.options.format,
              dataType: e.options.profile,
              features: e.file.stats.features,
              problems: e.file.stats.problems,
              url: e.url,
            })),
          },
          null,
          2,
        )}\n`,
      );
      return;
    }
    process.stdout.write(`${path}\n`);
  }

  const out = process.stdout;
  out.write(
    `\n${pack.clean ? "clean package · " : ""}${pack.entries.length} files · ` +
      `${pack.features.toLocaleString()} features · ${formatBytes(pack.bytes)}\n` +
      `seed ${pack.seed}\n\n`,
  );
  for (const [i, entry] of pack.entries.entries()) {
    out.write(
      `${String(i + 1).padStart(2)}. ${entry.profileLabel.slice(0, 30).padEnd(31)} ` +
        `${getFormat(entry.options.format).label.padEnd(10)} ` +
        `${entry.file.stats.features.toLocaleString().padStart(6)} features\n`,
    );
  }

  const failed = pack.entries.filter((e) => e.file.clean && !e.file.clean.passed);
  if (failed.length) {
    process.stderr.write(
      `\n${NAME}: ${failed.length} file(s) did not pass their own clean check — ` +
        `that is a bug in Null Island.\n  please report it at ${SITE_URL}\n`,
    );
    process.exit(1);
  }
  if (pack.clean) {
    out.write("\nEvery file above is a control case: all of them should load, with no features lost.\n");
  }
}

const TERM_FORMAT_IDS = TERM_FORMATS.map((f) => f.id);

/**
 * A set of search terms, and the parse each one is supposed to receive.
 *
 * The same shape as `--package`: it picks its own spread, so an option that
 * would have no effect on it is a mistake worth reporting rather than
 * swallowing. `--clean` means here what it means everywhere else in this tool —
 * the control case, checked before it is handed over.
 */
function generateTermSet(args: Args): void {
  for (const option of ["format", "shape", "region", "problems", "boundary", "coverage", "count", "from-url", "url", "package"]) {
    if (args.values.has(option)) {
      fail(
        `--${option} describes a file, and --terms builds queries`,
        option === "count" ? "use --terms <n> for how many" : "drop it, or drop --terms",
      );
    }
  }
  for (const flag of ["typical", "context", "compact", "extract", "package"]) {
    if (args.flags.has(flag)) fail(`--${flag} has no meaning with --terms`);
  }

  const count = Math.round(number("--terms", args.values.get("terms"), 40, 0, MAX_TERMS));
  const clean = args.flags.has("clean");
  const quirks = (args.values.get("quirks") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  for (const id of quirks) {
    if (!getQuirk(id)) fail(`unknown quirk "${id}"`, `run \`${NAME} --list quirks\``);
  }
  // Same rule as the file half: --clean is an assertion about the output, and
  // anything that would put a quirk in it contradicts that outright.
  if (clean && quirks.length) {
    fail(
      "--clean and --quirks ask for opposite things",
      "drop one: --clean for control queries, --quirks for awkward ones",
    );
  }

  const profile = args.values.get("profile") ?? args.values.get("type") ?? DEFAULT_SUBJECT_PROFILE;
  if (!PROFILES.some((p) => p.id === profile)) {
    fail(`unknown data type "${profile}"`, `run \`${NAME} --list types\``);
  }

  const near = args.values.get("near") ?? "anywhere";
  if (near !== "anywhere" && !PLACES.some((p) => p.id === near)) {
    fail(`unknown place "${near}"`, `run \`${NAME} --list places\`, or use "anywhere"`);
  }

  const anchor = args.values.get("anchor") ?? DEFAULT_ANCHOR;
  if (!Number.isFinite(Date.parse(anchor))) {
    fail(`--anchor must be an ISO 8601 instant, got "${anchor}"`, `e.g. ${DEFAULT_ANCHOR}`);
  }

  const format = oneOf("term format", args.values.get("term-format"), TERM_FORMAT_IDS, "jsonl" as TermFormatId);
  const seed = normaliseSeed(args.values.get("seed") ?? randomSeed());

  const set = generateTerms({
    seed,
    count,
    profile,
    quirks,
    intensity: clean ? 0 : number("--intensity", args.values.get("intensity"), 0.15, 0, 1),
    near,
    anchor,
    clean,
  });
  const report = inspectTerms(set);
  const file = writeTerms(set, format, seed);

  if (args.flags.has("stdout")) {
    if (args.flags.has("json")) {
      fail("--stdout cannot be combined with --json: it prints a summary as well as the terms", "use --out instead");
    }
    process.stdout.write(file.data as string);
    // stdout carries the terms and nothing else, but a set that failed its own
    // check still has to say so — silence here would hand a fixture that lies
    // about itself straight into a test.
    if (!report.passed) {
      process.stderr.write(
        `${NAME}: this term set did not pass its own check — that is a bug in Null Island.\n` +
          `  please report it at ${SITE_URL}\n`,
      );
      process.exit(1);
    }
    return;
  }

  const path = write(args.values.get("out") ?? ".", file.filename, file.data);

  if (args.flags.has("json")) {
    process.stdout.write(
      `${JSON.stringify(
        {
          file: path,
          format,
          dataType: profile,
          seed,
          anchor: set.stats.anchor,
          terms: set.terms.length,
          bytes: file.bytes,
          clean: set.stats.clean,
          // What was actually applied, never what was asked for: a quirk the
          // query shape could not carry is reported here as skipped.
          quirks: set.stats.quirks,
          skipped: set.terms
            .filter((t) => t.skipped.length)
            .map((t) => ({ id: t.id, skipped: t.skipped })),
          checks: {
            passed: report.passed,
            ran: report.checks.map((c) => ({ check: c.label, ok: c.ok, detail: c.detail })),
          },
          notes: set.notes,
        },
        null,
        2,
      )}\n`,
    );
    if (!report.passed) process.exit(1);
    return;
  }

  const out = process.stdout;
  out.write(`${path}\n`);
  out.write(
    `\n${getTermFormat(format).label} · ${getProfile(profile).label} · ` +
      `${set.terms.length.toLocaleString()} terms · ${formatBytes(file.bytes)}` +
      `${set.stats.clean ? " · clean" : ` · ${set.stats.quirks.length} quirks`}\n` +
      `seed ${seed} · anchored to ${set.stats.anchor}\n`,
  );

  // The checks are printed rather than assumed, for the same reason they are on
  // a control file: a fixture is only worth anything if it really is what it
  // says it is, and a failure means this one is lying.
  out.write("\n");
  for (const check of report.checks) {
    out.write(`${check.ok ? "  ok  " : "FAIL  "}${check.label} (${check.detail})\n`);
  }

  const skipped = set.terms.filter((t) => t.skipped.length);
  if (skipped.length) {
    out.write("\n");
    for (const term of skipped) {
      for (const skip of term.skipped) {
        out.write(`- ${term.id}: ${skip.id} not applied — ${skip.why}.\n`);
      }
    }
  }

  if (set.notes.length) {
    out.write("\n");
    for (const note of set.notes) out.write(`- ${note}\n`);
  }

  if (!report.passed) {
    process.stderr.write(
      `\n${NAME}: this term set did not pass its own check — that is a bug in Null Island.\n` +
        `  please report it at ${SITE_URL}\n`,
    );
    process.exit(1);
  }
}

/* ── help ────────────────────────────────────────────────────────────────── */

const HELP = `${NAME} — generate deliberately broken geospatial fixtures

USAGE
  ${NAME} [options]                       one fixture
  ${NAME} --clean [options]               one fixture with nothing wrong with it
  ${NAME} --package 9 [options]           a run of them, zipped
  ${NAME} --package 9 --clean             a run of clean ones, to test the happy path
  ${NAME} --list types|formats|problems|regions|boundaries

  Working inside a clone of this repo? There are two ways in, and they are not
  the same thing:

    npm run cli -- <options>     runs the CURRENT source, rebuilding core first
    npx ${NAME} <options>     runs packages/cli/dist, whatever it last built

  The workspace links the second one for you, so it works without installing
  anything — but it is a build artefact. After editing source, it is stale until
  \`npm run build\`, and it will not say so. Prefer the first while developing.
  Add npm's own --silent when piping, or its banner lands on stdout in front of
  the file:

    npm run --silent cli -- --clean --format geojson --count 20 --stdout | jq .

WHAT THE FILE IS
  --format <id>        ${FORMATS.map((f) => f.id).join(", ")}
  --type <id>          data type, e.g. flight-adsb (--list types)
  --count <n>          features (default 500)
  --shape <id>         point, line, polygon, mixed — defaults to the one the data type comes in
  --region <id>        where it lands (--list regions)

WHAT IS WRONG WITH IT
  --problems <a,b,c>   problem ids (--list problems)
  --typical            what this data type usually arrives with
  --clean              nothing wrong with it: a control fixture, checked before it is written
  --intensity <0-1>    how much of the file each problem touches (default 0.4)
  --boundary <id>      none, bbox, polygon, hole, multipart — writes a second file plus ground truth
  --coverage <0-1>     share of features aimed inside the boundary

REPRODUCING
  --seed <string>      the same seed always gives the same bytes (default: a random three-word seed)
  --from-url <url>     read the whole configuration from a share link, then apply any options above

OUTPUT
  --out <dir>          where to write (default: the current directory)
  --stdout             write the file to stdout instead
  --context            also write a .md describing everything wrong with it
  --json               print a machine-readable summary instead of prose
  --compact            no pretty-printing for JSON formats
  --extract            for --package: write the files out rather than zipping them

DRIVING THIS FROM A SCRIPT OR AN AGENT
  --list <thing> --json    the catalogue as data: every id, plus the formats and
                           data types each problem applies to, so a selection can
                           be made without guessing at what will be skipped
  --json                   the summary as data: counts, bounds, off-world tallies,
                           the notes, the boundary's expected filter results, and
                           for a clean file every check that was run on it

  Exit codes: 0 success · 1 a clean file failed its own check, which is a bug in
  ${NAME} rather than in your settings · 2 a usage error, printed on stderr.
  An unknown option, data type or problem id is always an error and never a
  silent default — a run that quietly ignored a typo would hand back a file you
  would go on to believe things about.

EXAMPLES
  ${NAME} --type maritime-ais --format csv --typical --seed harbor-lantern-drift
  ${NAME} --type cadastral-parcels --format shapefile --problems sliver-gaps,unit-mixture --out fixtures
  ${NAME} --clean --type cadastral-parcels --format shapefile --count 500 --out fixtures
  ${NAME} --package 9 --clean --extract --out test/fixtures/clean
  ${NAME} --package 9 --extract --out test/fixtures --seed sand-frost-ember
  ${NAME} --from-url 'https://nullisland.app/#f=geojson&d=flight-adsb&s=quartz-harbor-drift'
  ${NAME} --format geojson --count 20 --stdout | jq '.features | length'
  ${NAME} --list problems --json | jq '[.problems[] | select(.formats | index("csv")) | .id]'

Every fixture is reproducible from its seed, and nothing is uploaded anywhere.
${SITE_URL}
`;

/* ── main ────────────────────────────────────────────────────────────────── */

function main(): void {
  // `nullisland --stdout | head` closes the pipe early; that is the consumer
  // being done, not a failure.
  process.stdout.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EPIPE") process.exit(0);
    throw error;
  });

  const args = parseArgs(process.argv.slice(2));

  if (args.flags.has("help") || args.flags.has("h") || args.positional[0] === "help") {
    process.stdout.write(HELP);
    return;
  }
  if (args.flags.has("version") || args.flags.has("v")) {
    // Read from the package rather than repeating it here, and from disk rather
    // than through an import, so the built file keeps its flat rootDir.
    const manifest = readFileSync(join(__dirname, "..", "package.json"), "utf8");
    process.stdout.write(`${(JSON.parse(manifest) as { version: string }).version}\n`);
    return;
  }

  if (args.values.has("list") || args.flags.has("list")) {
    const listing = args.values.get("list") ?? args.positional[0];
    if (!listing) {
      fail(
        "--list needs something to list",
        "try: formats, types, problems, regions, boundaries, quirks, places",
      );
    }
    list(listing, args.flags.has("json"));
    return;
  }

  // A count check that is cheap here and expensive to discover after ten
  // minutes of generating: an unknown problem for the chosen format or data
  // type is reported rather than silently skipped.
  if (args.values.has("terms") || args.flags.has("terms")) {
    generateTermSet(args);
    return;
  }

  const opts = args.values.has("package") || args.flags.has("package") ? null : optionsFrom(args);
  if (opts) {
    for (const id of opts.problems) {
      const problem = getProblem(id);
      if (!problem) continue;
      if (!appliesToProfile(problem, opts.profile)) {
        process.stderr.write(
          `${NAME}: "${id}" does not exist in ${getProfile(opts.profile).label} data — skipping it.\n`,
        );
      } else if (!appliesTo(problem, opts.format)) {
        process.stderr.write(
          `${NAME}: ${getFormat(opts.format).label} cannot express "${id}" — skipping it.\n`,
        );
      }
    }
  }

  if (args.values.has("package") || args.flags.has("package")) generatePackage(args);
  else generateOne(args);
}

main();
