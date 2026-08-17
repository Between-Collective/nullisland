import { BOUNDARY_IDS } from "./boundary";
import { FORMATS } from "./formats/index";
import { PROBLEMS } from "./problems";
import { normaliseSeed } from "./rng";
import { DEFAULT_PROFILE, PROFILES } from "./profiles/index";
import { REGIONS } from "./regions";
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
