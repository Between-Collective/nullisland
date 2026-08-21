import { BOUNDARY_IDS } from "./boundary";
import { FORMATS } from "./formats/index";
import { PROBLEMS } from "./problems";
import { normaliseSeed } from "./rng";
import { DEFAULT_PROFILE, PROFILES } from "./profiles/index";
import { REGIONS } from "./regions";
import { PLACES } from "./search/places";
import { QUIRKS } from "./search/quirks";
import { TERM_FORMATS } from "./search/write";
import type { TermFormatId } from "./search/write";
import type { BoundaryId, FormatId, GenerateOptions, ShapeId } from "./types";

/**
 * Config lives in the URL hash so a fixture is shareable and reproducible:
 * seed plus settings is everything the generator needs.
 *
 * The link is the narrower channel, so it defines the precision everything else
 * has to live within: fractions travel as whole percent. `linkPercent` is that
 * rule, and `generate` applies it to what it is given — otherwise a setting
 * could exist on screen that no link can carry, and the app's own address bar
 * would quietly describe a different file.
 */

/** The precision a share link can carry: whole percent. */
export function linkPercent(value: number): number {
  return Math.round(value * 100) / 100;
}

const SHAPES: ShapeId[] = ["point", "line", "polygon", "mixed"];

export function encodeConfig(opts: GenerateOptions): string {
  const params = new URLSearchParams();
  params.set("f", opts.format);
  params.set("n", String(opts.count));
  params.set("g", opts.shape);
  params.set("r", opts.region);
  // Omitted when generic, so links made before data types existed still decode
  // to the schema they were generated with.
  if (opts.profile && opts.profile !== DEFAULT_PROFILE) params.set("d", opts.profile);
  params.set("i", String(Math.round(opts.intensity * 100)));
  // The canonical seed, so the link, the filename and the RNG cannot disagree.
  params.set("s", normaliseSeed(opts.seed));
  if (!opts.pretty) params.set("c", "1");
  // Omitted when off, so links made before boundaries existed still decode.
  if (opts.boundary !== "none") {
    params.set("b", opts.boundary);
    params.set("v", String(Math.round(opts.coverage * 100)));
  }
  if (opts.problems.length) params.set("p", opts.problems.join("."));
  return params.toString();
}

export function decodeConfig(hash: string): Partial<GenerateOptions> {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const out: Partial<GenerateOptions> = {};

  const format = params.get("f");
  if (format && FORMATS.some((f) => f.id === format)) out.format = format as FormatId;

  // `has` before `Number`: Number(null) is 0, so an absent key would otherwise
  // decode as "zero features" rather than "not specified" — and a link without
  // an n would silently produce an empty file.
  const count = Number(params.get("n"));
  if (params.has("n") && Number.isFinite(count) && count >= 0) out.count = Math.floor(count);

  const shape = params.get("g");
  if (shape && SHAPES.includes(shape as ShapeId)) out.shape = shape as ShapeId;

  const region = params.get("r");
  if (region && REGIONS.some((r) => r.id === region)) out.region = region;

  const profile = params.get("d");
  if (profile && PROFILES.some((p) => p.id === profile)) out.profile = profile;

  const intensity = Number(params.get("i"));
  if (params.has("i") && Number.isFinite(intensity)) {
    out.intensity = Math.max(0.05, Math.min(1, intensity / 100));
  }

  const seed = params.get("s");
  if (seed) out.seed = seed.slice(0, 40);

  if (params.get("c") === "1") out.pretty = false;

  const boundary = params.get("b");
  if (boundary && BOUNDARY_IDS.includes(boundary as BoundaryId)) {
    out.boundary = boundary as BoundaryId;
  }

  const coverage = Number(params.get("v"));
  if (Number.isFinite(coverage) && params.get("v") !== null) {
    out.coverage = Math.max(0, Math.min(1, coverage / 100));
  }

  const problems = params.get("p");
  if (problems !== null) {
    const known = new Set(PROBLEMS.map((p) => p.id));
    out.problems = problems.split(".").filter((id) => known.has(id));
  }

  return out;
}


/* ── the other half of the app ───────────────────────────────────────────── */

/**
 * Which generator the app is showing.
 *
 * Omitted from a link rather than written as "files", so every link made before
 * search terms existed still decodes to the half it was made in.
 */
export type AppMode = "files" | "terms";

/**
 * What the search half holds, minus the two things it shares with the file
 * half: the seed, and the data type the subject noun comes from. Those are one
 * setting each for the whole app, so they are carried once.
 */
export interface TermsConfig {
  count: number;
  quirks: string[];
  intensity: number;
  near: string;
  clean: boolean;
  format: TermFormatId;
}

/** Everything on screen, in both halves. */
export interface AppConfig {
  mode: AppMode;
  file: GenerateOptions;
  terms: TermsConfig;
}

/**
 * The whole app as a link.
 *
 * The file half keeps the keys it has always had, so a link from before this
 * existed decodes exactly as it used to. The search half is namespaced under
 * `t`, and the mode under `m` — both absent by default, so the shortest link
 * is still a file link.
 */
export function encodeApp(config: AppConfig): string {
  const params = new URLSearchParams(encodeConfig(config.file));
  if (config.mode === "terms") params.set("m", "t");

  const { terms } = config;
  params.set("tn", String(terms.count));
  params.set("ti", String(Math.round(terms.intensity * 100)));
  if (terms.near !== "anywhere") params.set("tr", terms.near);
  if (terms.format !== "jsonl") params.set("tf", terms.format);
  // A control set and an empty selection are different things — no quirks means
  // "deal the whole catalogue out", and clean means "apply none of it" — so the
  // flag is carried rather than inferred from the selection being empty.
  if (terms.clean) params.set("tc", "1");
  if (terms.quirks.length) params.set("tq", terms.quirks.join("."));
  return params.toString();
}

/**
 * What a link actually carries: some of each half, and possibly neither.
 *
 * Partial all the way down on purpose — an absent key means "not specified"
 * rather than a default, so a link that names only a seed leaves everything
 * else exactly as the app already had it.
 */
export interface DecodedApp {
  mode?: AppMode;
  file: Partial<GenerateOptions>;
  terms?: Partial<TermsConfig>;
}

export function decodeApp(hash: string): DecodedApp {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const out: DecodedApp = { file: decodeConfig(hash) };

  if (params.get("m") === "t") out.mode = "terms";
  else if (params.has("m")) out.mode = "files";

  const terms: Partial<TermsConfig> = {};

  const count = Number(params.get("tn"));
  if (params.has("tn") && Number.isFinite(count) && count >= 0) terms.count = Math.floor(count);

  const intensity = Number(params.get("ti"));
  if (params.has("ti") && Number.isFinite(intensity)) {
    terms.intensity = Math.max(0, Math.min(1, intensity / 100));
  }

  const near = params.get("tr");
  if (near && (near === "anywhere" || PLACES.some((p) => p.id === near))) terms.near = near;

  const format = params.get("tf");
  if (format && TERM_FORMATS.some((f) => f.id === format)) terms.format = format as TermFormatId;

  if (params.has("tc")) terms.clean = params.get("tc") === "1";

  const quirks = params.get("tq");
  if (quirks !== null) {
    const known = new Set(QUIRKS.map((q) => q.id));
    terms.quirks = quirks.split(".").filter((id) => known.has(id));
  }

  if (Object.keys(terms).length) out.terms = terms;
  return out;
}
