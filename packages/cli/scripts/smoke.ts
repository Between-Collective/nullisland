/* eslint-disable */
/**
 * The CLI's job is to be the same generator as everything else. So the test is
 * not "does it print something" — it is "are these the bytes the library
 * produced, and the bytes a share link from the web app would rebuild".
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildPackage,
  DEFAULT_ANCHOR,
  encodeConfig,
  generate,
  generateTerms,
  PROBLEMS,
  PROFILES,
  QUIRKS,
  writeTerms,
  type GenerateOptions,
} from "nullisland-core";

let failures = 0;
let checks = 0;

function ok(name: string, condition: boolean, detail = "") {
  checks++;
  if (!condition) {
    failures++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const CLI = join(__dirname, "..", "src", "index.ts");

function run(args: string[]): { stdout: string; status: number } {
  try {
    const stdout = execFileSync("npx", ["tsx", CLI, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { stdout, status: 0 };
  } catch (error: any) {
    return { stdout: String(error.stdout ?? ""), status: error.status ?? 1 };
  }
}

function opts(over: Partial<GenerateOptions> = {}): GenerateOptions {
  return {
    format: "geojson",
    count: 40,
    shape: "point",
    region: "london",
    profile: "generic",
    problems: [],
    intensity: 0.4,
    seed: "harbor-lantern-drift",
    pretty: true,
    boundary: "none",
    coverage: 0.6,
    ...over,
  };
}

const work = mkdtempSync(join(tmpdir(), "nullisland-cli-"));

function readJson(path: string): any {
  return JSON.parse(readFileSync(path, "utf8"));
}

try {
  console.log("\ncli");

  /* ── the versions have to move together ──────────────────────────────── */
  {
    const root = join(__dirname, "..", "..", "..");
    const core = readJson(join(root, "packages", "core", "package.json"));
    const cli = readJson(join(root, "packages", "cli", "package.json"));
    const web = readJson(join(root, "apps", "web", "package.json"));
    ok("the cli pins the core version it ships with", cli.dependencies["nullisland-core"] === core.version,
      `${cli.dependencies["nullisland-core"]} vs ${core.version}`);
    ok("the web app pins it too", web.dependencies["nullisland-core"] === core.version,
      `${web.dependencies["nullisland-core"]} vs ${core.version}`);
  }

  /* ── the built binary, not just the source ───────────────────────────── */
  {
    const built = join(__dirname, "..", "dist", "index.js");
    if (!existsSync(built)) {
      ok("the built binary exists (run npm run build -w nullisland)", false, built);
    } else {
      const config = opts({ profile: "flight-adsb", shape: "line", format: "kml", problems: ["track-breaks"] });
      const expected = generate(config);
      execFileSync("node", [built,
        "--format", config.format, "--type", config.profile, "--shape", config.shape,
        "--count", String(config.count), "--region", config.region, "--seed", config.seed,
        "--intensity", String(config.intensity), "--problems", config.problems.join(","),
        "--out", work,
      ], { stdio: ["ignore", "ignore", "pipe"] });
      const written = readFileSync(join(work, expected.filename), "utf8");
      ok("the built binary matches the library byte for byte", written === expected.data);
    }
  }

  /* ── help and listings answer at all ─────────────────────────────────── */
  const help = run(["--help"]);
  ok("--help works", help.status === 0 && help.stdout.includes("USAGE"));
  for (const what of ["types", "formats", "problems", "regions"]) {
    const listing = run(["--list", what]);
    ok(`--list ${what}`, listing.status === 0 && listing.stdout.trim().length > 40);
  }
  ok("--list rejects nonsense", run(["--list", "bananas"]).status === 2);
  // A typo must not be mistaken for a clean fixture, and a value out of range
  // must not be silently clamped.
  ok("a mistyped option is an error", run(["--typcal", "--count", "3"]).status === 2);
  ok("an unknown option is an error", run(["--not-a-flag"]).status === 2);
  ok("--intensity out of range is an error", run(["--intensity", "5"]).status === 2);
  ok("--count out of range is an error", run(["--count", "999999999"]).status === 2);
  ok("a negative value reaches the option", run(["--intensity", "-0.5"]).status === 2);
  ok("--intensity 0.85 is accepted", run(["--intensity", "0.85", "--count", "3", "--stdout"]).status === 0);
  ok("an unknown region is an error", run(["--region", "atlantis"]).status === 2);
  ok("--list with nothing to list is an error", run(["--list"]).status === 2);
  ok("an option that eats the next option is an error", run(["--out", "--json", "--count", "3"]).status === 2);
  ok("a link with no fragment is an error", run(["--from-url", "https://nullisland.app/"]).status === 2);
  ok("a link with an empty fragment is an error", run(["--from-url", "https://nullisland.app/#"]).status === 2);
  ok("--stdout with --json is an error", run(["--stdout", "--json", "--count", "3"]).status === 2);
  ok("--stdout with a boundary is an error", run(["--stdout", "--boundary", "polygon", "--count", "3"]).status === 2);
  ok("--package with --format is an error", run(["--package", "5", "--format", "csv"]).status === 2);
  ok("--package with --typical is an error", run(["--package", "5", "--typical"]).status === 2);
  ok("an unknown data type is an error", run(["--type", "not-a-thing"]).status === 2);
  ok("an unknown problem is an error", run(["--problems", "not-a-problem"]).status === 2);

  /* ── the bytes match the library ─────────────────────────────────────── */
  const cases: Array<Partial<GenerateOptions>> = [
    { format: "geojson", profile: "generic" },
    { format: "csv", profile: "maritime-ais", problems: ["ais-sentinels", "unit-mixture"] },
    { format: "shapefile", profile: "cadastral-parcels", shape: "polygon", problems: ["sliver-gaps"] },
    { format: "kml", profile: "flight-adsb", shape: "line", problems: ["track-breaks"] },
  ];

  for (const over of cases) {
    const config = opts(over);
    const expected = generate(config);
    const args = [
      "--format", config.format,
      "--type", config.profile,
      "--shape", config.shape,
      "--count", String(config.count),
      "--region", config.region,
      "--seed", config.seed,
      "--intensity", String(config.intensity),
      "--out", work,
    ];
    if (config.problems.length) args.push("--problems", config.problems.join(","));
    const result = run(args);
    ok(`${config.format}/${config.profile} exits cleanly`, result.status === 0, result.stdout.slice(0, 120));

    const written = readFileSync(join(work, expected.filename));
    const wanted = typeof expected.data === "string" ? Buffer.from(expected.data) : Buffer.from(expected.data);
    ok(`${config.format}/${config.profile} is byte-identical to the library`, written.equals(wanted),
      `${written.length} vs ${wanted.length} bytes`);
  }

  /* ── a share link rebuilds the same file through the CLI ─────────────── */
  {
    const config = opts({ profile: "census-boundary", shape: "polygon", problems: ["leading-zeros"], format: "ndjson" });
    const expected = generate(config);
    const url = `https://nullisland.app/#${encodeConfig(config)}`;
    const result = run(["--from-url", url, "--out", work]);
    ok("--from-url exits cleanly", result.status === 0, result.stdout.slice(0, 200));
    const written = readFileSync(join(work, expected.filename), "utf8");
    ok("--from-url rebuilds the web app's file byte for byte", written === expected.data);
  }

  /* ── stdout, json and context ────────────────────────────────────────── */
  {
    const config = opts({ count: 12 });
    const expected = generate(config);
    const piped = run(["--count", "12", "--seed", config.seed, "--stdout"]);
    ok("--stdout writes the file itself", piped.stdout === expected.data,
      `${piped.stdout.length} vs ${String(expected.data).length} chars`);

    const json = run(["--count", "12", "--seed", config.seed, "--json", "--out", work]);
    let parsed: any = null;
    try { parsed = JSON.parse(json.stdout); } catch {}
    ok("--json is machine-readable", !!parsed, json.stdout.slice(0, 120));
    ok("--json reports the right counts", parsed?.features === expected.stats.features);
    ok("--json carries the notes", Array.isArray(parsed?.notes));
    ok("--json links back to the app", String(parsed?.url).includes("#f="));

    // No --problems and no --typical, so this run is a control fixture — and
    // the written context has to say so. It used to call every file
    // "deliberately broken" regardless, which is the one thing a fixture tool
    // must not get wrong about its own output.
    const context = run(["--count", "12", "--seed", config.seed, "--context", "--out", work]);
    ok("--context exits cleanly", context.status === 0);
    const md = readFileSync(join(work, `${expected.filename}.md`), "utf8");
    ok("--context names the file", md.includes(expected.filename));
    ok("--context does not call a clean file broken", !md.includes("deliberately broken"), md.slice(0, 120));
    ok("--context lists what was checked", md.includes("Checked on this file"), md.slice(0, 240));

    const brokenConfig = opts({ count: 12, problems: ["coincident", "precision-drift"] });
    const brokenFile = generate(brokenConfig);
    const brokenRun = run([
      "--count", "12", "--seed", brokenConfig.seed,
      "--problems", "coincident,precision-drift", "--context", "--out", work,
    ]);
    ok("--context exits cleanly for a broken file", brokenRun.status === 0);
    const brokenMd = readFileSync(join(work, `${brokenFile.filename}.md`), "utf8");
    ok("--context still calls a broken file broken", brokenMd.includes("deliberately broken"),
      brokenMd.slice(0, 120));
  }

  /* ── the catalogue, as data ──────────────────────────────────────────── */
  // A script or an agent picking ids has to be able to enumerate them without
  // parsing padded columns, and has to be able to tell in advance what a given
  // format or data type will silently skip.
  {
    for (const [thing, key] of [
      ["formats", "formats"],
      ["types", "dataTypes"],
      ["problems", "problems"],
      ["regions", "regions"],
      ["boundaries", "boundaries"],
    ] as const) {
      const result = run(["--list", thing, "--json"]);
      let parsed: any = null;
      try { parsed = JSON.parse(result.stdout); } catch {}
      ok(`--list ${thing} --json is machine-readable`, !!parsed, result.stdout.slice(0, 100));
      ok(`--list ${thing} --json has entries`, Array.isArray(parsed?.[key]) && parsed[key].length > 0);
      ok(`--list ${thing} --json gives every entry an id`,
        parsed?.[key]?.every((e: any) => typeof e.id === "string" && e.id.length > 0));
    }

    const problems = JSON.parse(run(["--list", "problems", "--json"]).stdout);
    // The listing has to agree with the generator, or a selection made from it
    // is a selection made from fiction.
    ok("--list problems --json matches the catalogue", problems.problems.length === PROBLEMS.length,
      `${problems.problems.length} vs ${PROBLEMS.length}`);
    const crs = problems.problems.find((p: any) => p.id === "crs-member");
    ok("--list problems --json spells out the formats a problem applies to",
      Array.isArray(crs?.formats) && !crs.formats.includes("csv") && crs.formats.includes("geojson"),
      JSON.stringify(crs?.formats));
    const ais = problems.problems.find((p: any) => p.id === "ais-sentinels");
    ok("--list problems --json names the data types a domain problem belongs to",
      Array.isArray(ais?.dataTypes) && ais.dataTypes.includes("maritime-ais"),
      JSON.stringify(ais?.dataTypes));
    const general = problems.problems.find((p: any) => p.id === "coincident");
    ok("--list problems --json says 'all' rather than omitting the field",
      general?.dataTypes === "all", JSON.stringify(general?.dataTypes));

    const types = JSON.parse(run(["--list", "types", "--json"]).stdout);
    ok("--list types --json matches the catalogue", types.dataTypes.length === PROFILES.length,
      `${types.dataTypes.length} vs ${PROFILES.length}`);
    ok("--list types --json carries the columns each data type ships",
      types.dataTypes.every((t: any) => Array.isArray(t.columns) && t.columns.length > 0),
      types.dataTypes.filter((t: any) => !t.columns?.length).map((t: any) => t.id).join(","));
    ok("--list types --json carries the geometry each data type comes in",
      types.dataTypes.every((t: any) => ["point", "line", "polygon", "mixed"].includes(t.shape)));

    // Every id it hands out has to be one the generator will actually take.
    const formats = JSON.parse(run(["--list", "formats", "--json"]).stdout);
    const oneOfEach = run([
      "--format", formats.formats[0].id,
      "--type", types.dataTypes[1].id,
      "--problems", problems.problems[0].id,
      "--count", "5", "--out", work,
    ]);
    ok("ids from --list --json are accepted by the generator", oneOfEach.status === 0,
      oneOfEach.stdout.slice(0, 160));

    ok("--list rejects something it cannot list", run(["--list", "nonsense", "--json"]).status === 2);
  }

  /* ── --clean is an assertion, and it holds ───────────────────────────── */
  {
    const clean = run(["--clean", "--type", "cadastral-parcels", "--count", "40",
      "--seed", "control-smoke", "--json", "--out", work]);
    let parsed: any = null;
    try { parsed = JSON.parse(clean.stdout); } catch {}
    ok("--clean exits cleanly", clean.status === 0, clean.stdout.slice(0, 160));
    ok("--clean reports no problems", Array.isArray(parsed?.problems) && parsed.problems.length === 0,
      JSON.stringify(parsed?.problems));
    ok("--clean flags the file as clean", parsed?.clean === true);
    ok("--clean passed every check", parsed?.checks?.passed === true,
      JSON.stringify(parsed?.checks?.ran?.filter((c: any) => !c.ok)));
    ok("--clean ran more than one check", (parsed?.checks?.ran?.length ?? 0) >= 4);

    // The flag is an assertion about the output, so anything that contradicts
    // it has to be refused rather than silently resolved either way.
    const withProblems = run(["--clean", "--problems", "coincident", "--out", work]);
    ok("--clean refuses --problems", withProblems.status === 2, String(withProblems.status));
    const withTypical = run(["--clean", "--typical", "--type", "maritime-ais", "--out", work]);
    ok("--clean refuses --typical", withTypical.status === 2, String(withTypical.status));

    const pack = run(["--package", "5", "--clean", "--seed", "control-smoke", "--json", "--out", work]);
    let packed: any = null;
    try { packed = JSON.parse(pack.stdout); } catch {}
    ok("--package --clean exits cleanly", pack.status === 0, pack.stdout.slice(0, 160));
    ok("--package --clean builds every file clean",
      Array.isArray(packed?.entries) && packed.entries.every((e: any) => e.problems.length === 0),
      JSON.stringify(packed?.entries?.map((e: any) => e.problems)));
    ok("--package --clean names the archive apart", String(packed?.file).includes("clean-pack"),
      String(packed?.file));
  }

  /* ── packages ────────────────────────────────────────────────────────── */
  {
    const pack = buildPackage({ seed: "sand-frost-ember", size: 5 });
    const zipped = run(["--package", "5", "--seed", "sand-frost-ember", "--out", work]);
    ok("--package exits cleanly", zipped.status === 0, zipped.stdout.slice(0, 200));
    const written = readFileSync(join(work, pack.filename));
    ok("--package is byte-identical to the library",
      written.equals(Buffer.from(pack.data as Uint8Array)),
      `${written.length} vs ${(pack.data as Uint8Array).length} bytes`);

    const extracted = mkdtempSync(join(tmpdir(), "nullisland-pack-"));
    const loose = run(["--package", "5", "--seed", "sand-frost-ember", "--extract", "--out", extracted]);
    ok("--extract exits cleanly", loose.status === 0, loose.stdout.slice(0, 200));
    const top = readdirSync(extracted);
    ok("--extract writes the context", top.includes("README.md") && top.includes("manifest.json"), top.join(","));
    const fixtures = readdirSync(join(extracted, "files"));
    const expectedNames = new Set(pack.entries.flatMap((e) =>
      [e.path, e.boundaryPath].filter(Boolean).map((p) => String(p).replace("files/", ""))));
    ok("--extract writes every fixture", fixtures.length === expectedNames.size,
      `${fixtures.length} of ${expectedNames.size}`);
    const first = pack.entries[0];
    const onDisk = readFileSync(join(extracted, first.path));
    const wanted = typeof first.file.data === "string" ? Buffer.from(first.file.data) : Buffer.from(first.file.data);
    ok("--extract fixtures match the library", onDisk.equals(wanted));
    rmSync(extracted, { recursive: true, force: true });
  }

  /* ── search terms ────────────────────────────────────────────────────── */
  {
    // The same rule as everywhere else in this tool: the CLI is a front for the
    // library, so the bytes have to be the library's bytes.
    const set = generateTerms({
      seed: "harbor-lantern-drift",
      count: 43,
      profile: "mobile-location-pings",
      quirks: [],
      intensity: 0.15,
      near: "anywhere",
      anchor: DEFAULT_ANCHOR,
    });
    const expected = writeTerms(set, "jsonl", "harbor-lantern-drift");
    const piped = run([
      "--terms", "43",
      "--type", "mobile-location-pings",
      "--seed", "harbor-lantern-drift",
      "--stdout",
    ]);
    ok("--terms --stdout exits cleanly", piped.status === 0, piped.stdout.slice(0, 200));
    ok("--terms is byte-identical to the library", piped.stdout === expected.data,
      `${piped.stdout.length} vs ${String(expected.data).length} bytes`);

    const written = run([
      "--terms", "20", "--seed", "term-smoke", "--json", "--out", work,
    ]);
    let summary: any = null;
    try { summary = JSON.parse(written.stdout); } catch {}
    ok("--terms --json exits cleanly", written.status === 0, written.stdout.slice(0, 200));
    ok("--terms --json reports its checks", summary?.checks?.passed === true,
      JSON.stringify(summary?.checks?.ran?.filter((c: any) => !c.ok)));
    ok("--terms writes the file it names", !!summary?.file && existsSync(summary.file), String(summary?.file));
    ok("--terms reports what was applied, not what was asked for",
      Array.isArray(summary?.quirks) && summary.quirks.length > 0);
    ok("--terms carries a fixed anchor", summary?.anchor === DEFAULT_ANCHOR, String(summary?.anchor));

    // Every line of the JSONL has to stand alone, or a test reading it line by
    // line gets a parse error rather than a hard query.
    const lines = readFileSync(String(summary.file), "utf8").trim().split("\n");
    ok("--terms writes one parseable line per term", lines.length === 20 &&
      lines.every((line) => { try { return !!JSON.parse(line).query || JSON.parse(line).query === ""; } catch { return false; } }),
      `${lines.length} lines`);

    for (const format of ["json", "csv", "txt", "md"]) {
      const out = run(["--terms", "6", "--seed", "fmt", "--term-format", format, "--stdout"]);
      ok(`--term-format ${format} exits cleanly`, out.status === 0, out.stdout.slice(0, 120));
      ok(`--term-format ${format} writes something`, out.stdout.length > 0);
    }

    // --clean is an assertion about the output, so anything contradicting it is
    // an error rather than a silent winner.
    const cleanTerms = run(["--terms", "12", "--clean", "--seed", "ctrl", "--json", "--out", work]);
    let control: any = null;
    try { control = JSON.parse(cleanTerms.stdout); } catch {}
    ok("--terms --clean exits cleanly", cleanTerms.status === 0, cleanTerms.stdout.slice(0, 200));
    ok("--terms --clean applies nothing", control?.clean === true && control?.quirks?.length === 0,
      JSON.stringify(control?.quirks));
    const contradiction = run(["--terms", "5", "--clean", "--quirks", "misspelled-place", "--out", work]);
    ok("--terms --clean refuses --quirks", contradiction.status === 2, String(contradiction.status));

    // An unknown id is always an error, never a silent default — a run that
    // ignored a typo would hand back a control set you believed was awkward.
    ok("--terms rejects an unknown quirk", run(["--terms", "4", "--quirks", "not-a-quirk"]).status === 2);
    ok("--terms rejects an unknown place", run(["--terms", "4", "--near", "atlantis"]).status === 2);
    ok("--terms rejects a bad anchor", run(["--terms", "4", "--anchor", "yesterday"]).status === 2);
    // Options that describe a file have no meaning here, and saying so beats
    // accepting them and ignoring them.
    ok("--terms refuses --format", run(["--terms", "4", "--format", "csv"]).status === 2);
    ok("--terms refuses --count", run(["--terms", "4", "--count", "50"]).status === 2);
    ok("--terms refuses --boundary", run(["--terms", "4", "--boundary", "bbox"]).status === 2);

    // Asking for one quirk gets that quirk and no other.
    const single = run(["--terms", "6", "--quirks", "ambiguous-place", "--seed", "one", "--json", "--out", work]);
    let onlyOne: any = null;
    try { onlyOne = JSON.parse(single.stdout); } catch {}
    ok("--quirks applies only what was asked for",
      JSON.stringify(onlyOne?.quirks) === JSON.stringify(["ambiguous-place"]),
      JSON.stringify(onlyOne?.quirks));

    // The catalogue as data, so a script can choose without reading source.
    const listed = run(["--list", "quirks", "--json"]);
    let catalogue: any = null;
    try { catalogue = JSON.parse(listed.stdout); } catch {}
    ok("--list quirks --json parses", catalogue?.quirks?.length === QUIRKS.length,
      String(catalogue?.quirks?.length));
    ok("--list quirks --json spells out what each needs",
      catalogue?.quirks?.every((q: any) => typeof q.needs === "string" && typeof q.example === "string"));
    const places = run(["--list", "places", "--json"]);
    let gazetteer: any = null;
    try { gazetteer = JSON.parse(places.stdout); } catch {}
    ok("--list places --json parses", Array.isArray(gazetteer?.places) && gazetteer.places.length > 0);
    ok("--list places --json spells out ambiguity rather than omitting it",
      gazetteer?.places?.every((p: any) => Array.isArray(p.ambiguousWith)));
    ok("--list quirks prints prose too", run(["--list", "quirks"]).stdout.includes("Adversarial"));
    ok("--list places prints prose too", run(["--list", "places"]).stdout.includes("Estádio da Luz"));
  }

  console.log(`\n${checks - failures}/${checks} cli checks passed`);
} finally {
  rmSync(work, { recursive: true, force: true });
}

if (failures) {
  console.log(`${failures} FAILURES`);
  process.exit(1);
}
