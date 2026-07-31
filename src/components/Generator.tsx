"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { OutputPanel } from "./OutputPanel";
import { ProblemGrid } from "./ProblemGrid";
import { Button, Field, Panel, Segmented, type Option } from "./ui";
import { FORMATS, getFormat } from "@/lib/formats/index";
import { generate, MAX_FEATURES } from "@/lib/generate";
import { appliesTo, PROBLEMS } from "@/lib/problems";
import { REGIONS } from "@/lib/regions";
import { randomSeed } from "@/lib/rng";
import { decodeConfig, encodeConfig } from "@/lib/share";
import type { FormatId, GeneratedFile, GenerateOptions, ShapeId } from "@/lib/types";

const COUNT_STEPS = [
  0, 1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, MAX_FEATURES,
];

const SHAPE_OPTIONS: Option<ShapeId>[] = [
  { value: "point", label: "Points" },
  { value: "line", label: "Lines" },
  { value: "polygon", label: "Polygons" },
  { value: "mixed", label: "Mixed" },
];

const FORMAT_OPTIONS: Option<FormatId>[] = FORMATS.map((f) => ({
  value: f.id,
  label: f.label,
  hint: f.blurb,
}));

const JSON_FORMATS: FormatId[] = ["geojson", "ndjson", "topojson"];

/**
 * Wiping the dataset hides every other problem in the file, so the bulk
 * selectors leave it out. Picking it on purpose still works.
 */
const EXCLUSIVE = "empty-dataset";

const DEFAULTS: GenerateOptions = {
  format: "geojson",
  count: 500,
  shape: "point",
  region: "london",
  problems: ["coincident", "precision-drift", "mixed-schema"],
  intensity: 0.4,
  // Replaced with a random one on mount; a constant keeps SSR and the first
  // client render identical.
  seed: "firstrun",
  pretty: true,
};

function closestStep(count: number): number {
  let best = 0;
  for (let i = 1; i < COUNT_STEPS.length; i++) {
    if (Math.abs(COUNT_STEPS[i] - count) < Math.abs(COUNT_STEPS[best] - count)) best = i;
  }
  return best;
}

function randomFrom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/** The last finished generation, tagged with the settings that produced it. */
interface Result {
  source: GenerateOptions | null;
  file: GeneratedFile | null;
  error: string | null;
}

export function Generator() {
  const [opts, setOpts] = useState<GenerateOptions>(DEFAULTS);
  const [result, setResult] = useState<Result>({ source: null, file: null, error: null });
  const hydrated = useRef(false);

  // Derived rather than stored: anything not yet generated from the current
  // settings is, by definition, still in flight.
  const busy = result.source !== opts;
  const { file, error } = result;

  const patch = useCallback((next: Partial<GenerateOptions>) => {
    setOpts((current) => ({ ...current, ...next }));
  }, []);

  // The seed and the shared URL both live outside React and are only readable
  // once mounted, so this genuinely is an effect. It runs exactly once, and the
  // one extra render it causes is the price of matching the prerendered HTML.
  useEffect(() => {
    const fromUrl = window.location.hash.length > 1 ? decodeConfig(window.location.hash) : null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpts((current) => ({ ...current, seed: randomSeed(), ...(fromUrl ?? {}) }));
    hydrated.current = true;
  }, []);

  // A hash-only navigation — a pasted share link, or the back button — never
  // remounts, so the effect above would not see it.
  useEffect(() => {
    const onHashChange = () => {
      const next = decodeConfig(window.location.hash);
      if (Object.keys(next).length) setOpts((current) => ({ ...current, ...next }));
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // Debounced regeneration. Everything is synchronous, so the delay is there to
  // stop a slider drag from generating a 25 MB file on every pixel.
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        setResult({ source: opts, file: generate(opts), error: null });
      } catch (cause) {
        setResult({
          source: opts,
          file: null,
          error: cause instanceof Error ? cause.message : String(cause),
        });
      }
    }, 220);
    return () => clearTimeout(timer);
  }, [opts]);

  // Keep the address bar in sync without stacking up history entries.
  useEffect(() => {
    if (!hydrated.current) return;
    window.history.replaceState(null, "", `#${encodeConfig(opts)}`);
  }, [opts]);

  const toggleProblem = useCallback((id: string) => {
    setOpts((current) => ({
      ...current,
      problems: current.problems.includes(id)
        ? current.problems.filter((p) => p !== id)
        : [...current.problems, id],
    }));
  }, []);

  const applicable = PROBLEMS.filter((p) => appliesTo(p, opts.format));

  const pickRandomProblems = (howMany: number) => {
    // A single random pick may legitimately be the empty-result case; a random
    // handful should not have every other choice erased by it.
    const source = howMany === 1 ? applicable : applicable.filter((p) => p.id !== EXCLUSIVE);
    const pool = source.map((p) => p.id).sort(() => Math.random() - 0.5);
    patch({ problems: pool.slice(0, howMany) });
  };

  const randomiseEverything = () => {
    const format = randomFrom(FORMATS).id;
    const pool = PROBLEMS.filter((p) => appliesTo(p, format) && p.id !== EXCLUSIVE).map((p) => p.id);
    setOpts({
      format,
      count: randomFrom(COUNT_STEPS.slice(3, 11)),
      shape: randomFrom(SHAPE_OPTIONS).value,
      region: randomFrom(REGIONS).id,
      problems: pool.sort(() => Math.random() - 0.5).slice(0, 2 + Math.floor(Math.random() * 7)),
      intensity: 0.2 + Math.random() * 0.6,
      seed: randomSeed(),
      pretty: true,
    });
  };

  const shareCurrent = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}#${encodeConfig(opts)}`);
      return true;
    } catch {
      return false;
    }
  }, [opts]);

  const format = getFormat(opts.format);
  const selectedCount = opts.problems.length;
  const skipped = opts.problems.filter((id) => {
    const problem = PROBLEMS.find((p) => p.id === id);
    return problem && !appliesTo(problem, opts.format);
  }).length;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(340px,420px)] lg:items-start">
      <div className="order-2 space-y-4 lg:order-1">
        <Panel className="p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium text-ink">Settings</h2>
            <Button onClick={randomiseEverything} title="Randomise every setting at once">
              Randomise everything
            </Button>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Format" value={`.${format.ext}`}>
                <Segmented
                  ariaLabel="Output format"
                  options={FORMAT_OPTIONS}
                  value={opts.format}
                  onChange={(value) => patch({ format: value })}
                />
              </Field>
              <p className="mt-2 text-[11.5px] leading-snug text-muted">{format.blurb}</p>
            </div>

            <Field label="Features" value={opts.count.toLocaleString()}>
              <input
                type="range"
                min={0}
                max={COUNT_STEPS.length - 1}
                step={1}
                value={closestStep(opts.count)}
                onChange={(e) => patch({ count: COUNT_STEPS[Number(e.target.value)] })}
                aria-label="Number of features"
                className="w-full"
              />
            </Field>

            <Field label="Chaos" value={`${Math.round(opts.intensity * 100)}%`}>
              <input
                type="range"
                min={5}
                max={100}
                step={5}
                value={Math.round(opts.intensity * 100)}
                onChange={(e) => patch({ intensity: Number(e.target.value) / 100 })}
                aria-label="How much of the data each problem affects"
                className="w-full"
              />
            </Field>

            <Field label="Geometry">
              <Segmented
                ariaLabel="Geometry type"
                options={SHAPE_OPTIONS}
                value={opts.shape}
                onChange={(value) => patch({ shape: value })}
              />
            </Field>

            <Field label="Where">
              <select
                value={opts.region}
                onChange={(e) => patch({ region: e.target.value })}
                aria-label="Region"
                className="w-full rounded-md border border-line bg-raised px-2.5 py-2 text-xs text-ink"
              >
                {REGIONS.map((region) => (
                  <option key={region.id} value={region.id}>
                    {region.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Seed">
              <div className="flex gap-1.5">
                <input
                  value={opts.seed}
                  onChange={(e) => patch({ seed: e.target.value.slice(0, 40) })}
                  spellCheck={false}
                  aria-label="Seed"
                  className="min-w-0 flex-1 rounded-md border border-line bg-raised px-2.5 py-2 font-mono text-xs text-ink"
                />
                <Button onClick={() => patch({ seed: randomSeed() })} title="New random seed">
                  ↻
                </Button>
              </div>
            </Field>

            {JSON_FORMATS.includes(opts.format) && (
              <Field label="Options">
                <Button
                  onClick={() => patch({ pretty: !opts.pretty })}
                  title="Toggle pretty-printed JSON"
                  active={opts.pretty}
                >
                  Pretty print
                </Button>
              </Field>
            )}
          </div>
        </Panel>

        <Panel className="p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-medium text-ink">Problems</h2>
              <p className="mt-0.5 font-mono text-[11px] text-dim">
                {selectedCount} selected
                {skipped > 0 && ` · ${skipped} not supported by ${format.label}`}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button onClick={() => pickRandomProblems(1)} title="Pick exactly one at random">
                Random 1
              </Button>
              <Button
                onClick={() => pickRandomProblems(3 + Math.floor(Math.random() * 6))}
                title="Pick a random handful"
              >
                Random mix
              </Button>
              <Button
                onClick={() =>
                  patch({
                    problems: applicable.filter((p) => p.id !== EXCLUSIVE).map((p) => p.id),
                  })
                }
                title="Everything this format supports, except the empty-result case"
              >
                All
              </Button>
              <Button variant="quiet" onClick={() => patch({ problems: [] })}>
                None
              </Button>
            </div>
          </div>

          <ProblemGrid selected={opts.problems} format={opts.format} onToggle={toggleProblem} />
        </Panel>
      </div>

      <div className="order-1 lg:sticky lg:top-4 lg:order-2">
        {error ? (
          <Panel className="p-4">
            <p className="text-xs text-cat-encoding">Generation failed: {error}</p>
            <p className="mt-2 text-[11px] text-muted">
              That is a bug in map/data, not in your settings. Lower the feature count and try again.
            </p>
          </Panel>
        ) : (
          <OutputPanel file={file} busy={busy} onShare={shareCurrent} />
        )}
      </div>
    </div>
  );
}
