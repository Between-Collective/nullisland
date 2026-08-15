import { BOUNDARY_IDS } from "./boundary";
import { FORMATS } from "./formats/index";
import { PROBLEMS } from "./problems";
import { REGIONS } from "./regions";
import type { BoundaryId, FormatId, GenerateOptions, ShapeId } from "./types";

/**
 * Config lives in the URL hash so a fixture is shareable and reproducible:
 * seed plus settings is everything the generator needs.
 */

const SHAPES: ShapeId[] = ["point", "line", "polygon", "mixed"];

export function encodeConfig(opts: GenerateOptions): string {
  const params = new URLSearchParams();
  params.set("f", opts.format);
  params.set("n", String(opts.count));
  params.set("g", opts.shape);
  params.set("r", opts.region);
  params.set("i", String(Math.round(opts.intensity * 100)));
  params.set("s", opts.seed);
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

  const count = Number(params.get("n"));
  if (Number.isFinite(count) && count >= 0) out.count = Math.floor(count);

  const shape = params.get("g");
  if (shape && SHAPES.includes(shape as ShapeId)) out.shape = shape as ShapeId;

  const region = params.get("r");
  if (region && REGIONS.some((r) => r.id === region)) out.region = region;

  const intensity = Number(params.get("i"));
  if (Number.isFinite(intensity)) out.intensity = Math.max(0.05, Math.min(1, intensity / 100));

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
