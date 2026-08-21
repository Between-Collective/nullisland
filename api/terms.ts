/**
 * A corpus of search terms, over HTTP.
 *
 * The page is a static export and stays one: this is a serverless function
 * sitting beside it, for the case the page cannot serve — a test harness that
 * wants a fresh mixed corpus, runs against it, and asks for another. Hit it
 * with no parameters at all and that is exactly what you get.
 *
 *   GET /api/terms
 *   GET /api/terms?terms=200&types=flight-adsb,maritime-ais
 *   GET /api/terms?clean=1&format=json
 *
 * Every response carries the seed it was built from, in the body and in an
 * `x-nullisland-seed` header, so any corpus that finds a bug can be rebuilt
 * exactly — from here, from the CLI, or from the library.
 */
import {
  buildCatalogue,
  DEFAULT_ANCHOR,
  DEFAULT_SUBJECT_PROFILE,
  generateTerms,
  getQuirk,
  inspectTerms,
  normaliseSeed,
  PLACES,
  PROFILES,
  QUIRKS,
  randomSeed,
  TERM_FORMATS,
  writeTerms,
  type TermFormatId,
} from "nullisland-core";

/** Enough for a round of testing, small enough to stay a fast response. */
const MAX_TERMS = 500;
const DEFAULT_TERMS = 120;

interface Request {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
}

interface Response {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body?: string): void;
}

function list(value: string | null): string[] {
  return (value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function flag(value: string | null, fallback: boolean): boolean {
  if (value === null) return fallback;
  return value !== "0" && value !== "false" && value !== "";
}

export default function handler(req: Request, res: Response): void {
  // Read-only, generated, and about nowhere real — so a harness running in a
  // browser can call it from anywhere. Nothing here reads a cookie or a header,
  // so there is no cross-origin state to protect.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.statusCode = 405;
    res.setHeader("Allow", "GET, HEAD, OPTIONS");
    res.end(JSON.stringify({ error: "method not allowed" }));
    return;
  }

  const host = String(req.headers["host"] ?? "nullisland.app");
  const params = new URL(req.url ?? "/", `https://${host}`).searchParams;

  const fail = (message: string, hint: string) => {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(`${JSON.stringify({ error: message, hint }, null, 2)}\n`);
  };

  // The catalogue as data, so a harness can pick ids without reading source or
  // guessing at what will be refused.
  const listing = params.get("list");
  if (listing === "all" || listing === "catalogue") {
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.end(`${JSON.stringify(buildCatalogue(), null, 2)}\n`);
    return;
  }
  if (listing) {
    const catalogue: Record<string, unknown> = {
      types: PROFILES.map((p) => ({ id: p.id, label: p.label, family: p.family })),
      quirks: QUIRKS.map((q) => ({
        id: q.id,
        label: q.label,
        category: q.category,
        needs: q.needs,
        blurb: q.blurb,
      })),
      places: PLACES.map((p) => ({ id: p.id, name: p.name, kind: p.kind, country: p.country })),
      formats: TERM_FORMATS.map((f) => ({ id: f.id, mime: f.mime, groundTruth: f.groundTruth })),
    };
    if (!(listing in catalogue)) {
      return fail(`don't know how to list "${listing}"`, ["all", ...Object.keys(catalogue)].join(", "));
    }
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.end(`${JSON.stringify({ [listing]: catalogue[listing] }, null, 2)}\n`);
    return;
  }

  const count = Math.floor(Number(params.get("terms") ?? params.get("count") ?? DEFAULT_TERMS));
  if (!Number.isFinite(count) || count < 0) {
    return fail(`terms must be a number, got "${params.get("terms")}"`, `0 to ${MAX_TERMS}`);
  }
  if (count > MAX_TERMS) {
    // Refused rather than clamped: a harness that asked for 5,000 and silently
    // got 500 would draw conclusions about coverage it has not got.
    return fail(`terms must be ${MAX_TERMS} or fewer, got ${count}`, "ask for several rounds instead");
  }

  const types = list(params.get("types") ?? params.get("type"));
  for (const id of types) {
    if (!PROFILES.some((p) => p.id === id)) {
      return fail(`unknown data type "${id}"`, "GET /api/terms?list=types");
    }
  }

  const quirks = list(params.get("quirks"));
  for (const id of quirks) {
    if (!getQuirk(id)) return fail(`unknown quirk "${id}"`, "GET /api/terms?list=quirks");
  }

  const near = params.get("near") ?? "anywhere";
  if (near !== "anywhere" && !PLACES.some((p) => p.id === near)) {
    return fail(`unknown place "${near}"`, "GET /api/terms?list=places");
  }

  const format = (params.get("format") ?? "jsonl") as TermFormatId;
  const meta = TERM_FORMATS.find((f) => f.id === format);
  if (!meta) {
    return fail(`unknown format "${format}"`, TERM_FORMATS.map((f) => f.id).join(", "));
  }

  const anchor = params.get("anchor") ?? DEFAULT_ANCHOR;
  if (!Number.isFinite(Date.parse(anchor))) {
    return fail(`anchor must be an ISO 8601 instant, got "${anchor}"`, DEFAULT_ANCHOR);
  }

  const clean = flag(params.get("clean"), false);
  if (clean && quirks.length) {
    return fail("clean and quirks ask for opposite things", "drop one");
  }

  // Shuffled unless told otherwise: an unparameterised call is a harness asking
  // for a broad corpus, and the same spread every time would be the one thing
  // that cannot answer "have we covered it yet".
  const shuffle = flag(params.get("shuffle"), !types.length);
  // No seed means a new corpus on every call, which is what makes the loop a
  // loop. Pass one to get the same corpus back.
  const seed = normaliseSeed(params.get("seed") ?? randomSeed());

  const set = generateTerms({
    seed,
    count,
    profile: types[0] ?? DEFAULT_SUBJECT_PROFILE,
    profiles: types,
    shuffle,
    quirks,
    intensity: clean ? 0 : Number(params.get("intensity") ?? 0.15),
    near,
    anchor,
    clean,
  });

  const report = inspectTerms(set);
  const file = writeTerms(set, format, seed);

  res.setHeader("Content-Type", `${meta.mime}; charset=utf-8`);
  res.setHeader("x-nullisland-seed", seed);
  res.setHeader("x-nullisland-terms", String(set.terms.length));
  res.setHeader("Content-Disposition", `inline; filename="${file.filename}"`);
  // A seeded request is the same bytes forever; an unseeded one is a new corpus
  // every time and must never be served from a cache.
  res.setHeader(
    "Cache-Control",
    params.get("seed") ? "public, max-age=31536000, immutable" : "no-store",
  );

  // A set that fails its own checks is a bug in Null Island, and a harness
  // reading this must not quietly treat it as a fixture.
  if (!report.passed) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(
      `${JSON.stringify(
        {
          error: "this term set did not pass its own checks — that is a bug in Null Island",
          seed,
          failed: report.checks.filter((c) => !c.ok),
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  res.statusCode = 200;
  res.end(req.method === "HEAD" ? "" : (file.data as string));
}
