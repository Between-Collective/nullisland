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
  buildContext,
  buildPackage,
  CATEGORY_LABELS,
  contextToText,
  decodeConfig,
  DEFAULT_PROFILE,
  encodeConfig,
  FAMILIES,
  formatBytes,
  FORMATS,
  generate,
  getFormat,
  getProblem,
  getProfile,
  MAX_FEATURES,
  MAX_PACKAGE_FILES,
  PROBLEMS,
  PROFILES,
  profileShape,
  profilesInFamily,
  normaliseSeed,
  randomSeed,
  REGIONS,
  SITE_URL,
  type BoundaryId,
  type FormatId,
  type GenerateOptions,
  type ShapeId,
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
]);

const IS_FLAG = new Set([
  "help", "h", "version", "v", "typical", "stdout", "context", "json", "compact",
  "extract", "package", "list",
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

function list(what: string): void {
  const out = process.stdout;
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
      }
    }
    out.write("\n");
    return;
  }
  if (what === "regions" || what === "places") {
    for (const region of REGIONS) out.write(`${region.id.padEnd(16)} ${region.label}\n`);
    return;
  }
  fail(`don't know how to list "${what}"`, "try: formats, types, problems, regions");
}

/* ── options ─────────────────────────────────────────────────────────────── */

const SHAPES: ShapeId[] = ["point", "line", "polygon", "mixed"];
const BOUNDARIES: BoundaryId[] = ["none", "bbox", "polygon", "hole", "multipart"];

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
    problems: problems.length ? problems : (shared.problems ?? (args.flags.has("typical") ? profile.apt : [])),
    intensity: number("--intensity", args.values.get("intensity"), shared.intensity ?? 0.4, 0, 1),
    seed: normaliseSeed(args.values.get("seed") ?? shared.seed ?? randomSeed()),
    pretty: !args.flags.has("compact") && (shared.pretty ?? true),
    boundary: oneOf("boundary", args.values.get("boundary"), BOUNDARIES, shared.boundary ?? "none"),
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
      `${file.stats.features.toLocaleString()} features · ${formatBytes(file.bytes)}\n` +
      `seed ${opts.seed}\n`,
  );
  if (file.notes.length) {
    out.write("\n");
    for (const note of file.notes) out.write(`- ${note}\n`);
  }
  out.write(`\nreproduce: ${SITE_URL}/#${encodeConfig(opts)}\n`);
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
  const pack = buildPackage({ seed, size });
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
    `\n${pack.entries.length} files · ${pack.features.toLocaleString()} features · ${formatBytes(pack.bytes)}\n` +
      `seed ${pack.seed}\n\n`,
  );
  for (const [i, entry] of pack.entries.entries()) {
    out.write(
      `${String(i + 1).padStart(2)}. ${entry.profileLabel.slice(0, 30).padEnd(31)} ` +
        `${getFormat(entry.options.format).label.padEnd(10)} ` +
        `${entry.file.stats.features.toLocaleString().padStart(6)} features\n`,
    );
  }
}

/* ── help ────────────────────────────────────────────────────────────────── */

const HELP = `${NAME} — generate deliberately broken geospatial fixtures

USAGE
  ${NAME} [options]                       one fixture
  ${NAME} --package 9 [options]           a run of them, zipped
  ${NAME} --list types|formats|problems|regions

WHAT THE FILE IS
  --format <id>        ${FORMATS.map((f) => f.id).join(", ")}
  --type <id>          data type, e.g. flight-adsb (--list types)
  --count <n>          features (default 500)
  --shape <id>         point, line, polygon, mixed — defaults to the one the data type comes in
  --region <id>        where it lands (--list regions)

WHAT IS WRONG WITH IT
  --problems <a,b,c>   problem ids (--list problems)
  --typical            what this data type usually arrives with
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

EXAMPLES
  ${NAME} --type maritime-ais --format csv --typical --seed harbor-lantern-drift
  ${NAME} --type cadastral-parcels --format shapefile --problems sliver-gaps,unit-mixture --out fixtures
  ${NAME} --package 9 --extract --out test/fixtures --seed sand-frost-ember
  ${NAME} --from-url 'https://nullisland.app/#f=geojson&d=flight-adsb&s=quartz-harbor-drift'
  ${NAME} --format geojson --count 20 --stdout | jq '.features | length'

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
    if (!listing) fail("--list needs something to list", "try: formats, types, problems, regions");
    list(listing);
    return;
  }

  // A count check that is cheap here and expensive to discover after ten
  // minutes of generating: an unknown problem for the chosen format or data
  // type is reported rather than silently skipped.
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
