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
import { buildPackage, encodeConfig, generate, type GenerateOptions } from "nullisland-core";

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

    const context = run(["--count", "12", "--seed", config.seed, "--context", "--out", work]);
    ok("--context exits cleanly", context.status === 0);
    const md = readFileSync(join(work, `${expected.filename}.md`), "utf8");
    ok("--context describes the file", md.includes("deliberately broken") && md.includes(expected.filename));
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

  console.log(`\n${checks - failures}/${checks} cli checks passed`);
} finally {
  rmSync(work, { recursive: true, force: true });
}

if (failures) {
  console.log(`${failures} FAILURES`);
  process.exit(1);
}
