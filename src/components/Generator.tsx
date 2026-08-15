"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Contribute } from "./Contribute";
import { HeroPanel } from "./HeroPanel";
import { OutputPanel } from "./OutputPanel";
import { ProblemGrid } from "./ProblemGrid";
import { Sidebar } from "./Sidebar";
import { Button, Card } from "./ui";
import { BOUNDARY_IDS } from "@/lib/boundary";
import { copyFile, downloadFile } from "@/lib/download";
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

const SHAPES: ShapeId[] = ["point", "line", "polygon", "mixed"];
const JSON_FORMATS: FormatId[] = ["geojson", "ndjson", "topojson"];

/**
 * Wiping the dataset hides every other problem in the file, so the bulk
 * selectors leave it out. Picking it on purpose still works.
 */
const EXCLUSIVE = "empty-dataset";

/**
 * Above this, a shared link asks before it generates.
 *
 * Generation is synchronous, and at the top of the range it means seconds of
 * blocked main thread and over a gigabyte of heap — enough to kill a tab on a
 * phone. Reaching that with the sliders is a choice; arriving at it because
 * someone sent you a link is not, so a link that large loads its settings and
 * waits. Nothing is capped: the Generate button is right there.
 */
const LINK_AUTORUN_LIMIT = 10000;

const DEFAULTS: GenerateOptions = {
  format: "geojson",
  count: 500,
  shape: "point",
  region: "london",
  problems: ["coincident", "precision-drift", "mixed-schema"],
  intensity: 0.4,
  // Replaced with a random one on mount; a constant keeps SSR and the first
  // client render identical.
  seed: "quartz-harbor-drift",
  pretty: true,
  boundary: "none",
  coverage: 0.6,
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

type FlashAction = "share" | "copy" | "download" | "boundary";

/**
 * Which control just did something, and whether it worked. Held as an object so
 * that pressing the same button twice is a new value — a bare string would be
 * identical on the second press, and the reset timer would never restart.
 */
interface Flash {
  action: FlashAction;
  message: string;
  ok: boolean;
}

export function Generator() {
  const [opts, setOpts] = useState<GenerateOptions>(DEFAULTS);
  const [result, setResult] = useState<Result>({ source: null, file: null, error: null });
  const [flash, setFlash] = useState<Flash | null>(null);
  // Set only from a URL, and cleared by the user's first deliberate action.
  const [heldBack, setHeldBack] = useState(0);
  const hydrated = useRef(false);

  const confirmed = (action: FlashAction) => flash?.action === action && flash.ok;

  // Derived rather than stored: anything not yet generated from the current
  // settings is, by definition, still in flight.
  const busy = !heldBack && result.source !== opts;
  const { file, error } = result;

  const patch = useCallback((next: Partial<GenerateOptions>) => {
    // Touching any control is the user taking the wheel, so the link's hold
    // no longer applies.
    setHeldBack(0);
    setOpts((current) => ({ ...current, ...next }));
  }, []);

  // The seed and the shared URL both live outside React and are only readable
  // once mounted, so this genuinely is an effect. It runs exactly once, and the
  // one extra render it causes is the price of matching the prerendered HTML.
  useEffect(() => {
    const fromUrl = window.location.hash.length > 1 ? decodeConfig(window.location.hash) : null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpts((current) => ({ ...current, seed: randomSeed(), ...(fromUrl ?? {}) }));
    if ((fromUrl?.count ?? 0) > LINK_AUTORUN_LIMIT) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHeldBack(fromUrl!.count!);
    }
    hydrated.current = true;
  }, []);

  // A hash-only navigation — a pasted share link, or the back button — never
  // remounts, so the effect above would not see it.
  useEffect(() => {
    const onHashChange = () => {
      const next = decodeConfig(window.location.hash);
      if (!Object.keys(next).length) return;
      setHeldBack((next.count ?? 0) > LINK_AUTORUN_LIMIT ? next.count! : 0);
      setOpts((current) => ({ ...current, ...next }));
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // Debounced regeneration. Everything is synchronous, so the delay is there to
  // stop a slider drag from generating a 25 MB file on every pixel.
  useEffect(() => {
    if (heldBack) return;
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
  }, [opts, heldBack]);

  useEffect(() => {
    if (!hydrated.current) return;
    window.history.replaceState(null, "", `#${encodeConfig(opts)}`);
  }, [opts]);

  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(null), 1600);
    return () => clearTimeout(timer);
  }, [flash]);

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
      shape: randomFrom(SHAPES),
      region: randomFrom(REGIONS).id,
      problems: pool.sort(() => Math.random() - 0.5).slice(0, 2 + Math.floor(Math.random() * 7)),
      intensity: 0.2 + Math.random() * 0.6,
      seed: randomSeed(),
      pretty: true,
      // Weighted towards no boundary: it is a mode, not a flavour of noise.
      boundary: Math.random() < 0.4 ? randomFrom(BOUNDARY_IDS.slice(1)) : "none",
      coverage: 0.25 + Math.random() * 0.5,
    });
  };

  const share = async () => {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}${window.location.pathname}#${encodeConfig(opts)}`,
      );
      setFlash({ action: "share", message: "Link copied", ok: true });
    } catch {
      setFlash({ action: "share", message: "Copy blocked", ok: false });
    }
  };

  const copy = async () => {
    if (!file) return;
    const done = await copyFile(file);
    setFlash({ action: "copy", message: done ? "File copied" : "Copy blocked", ok: done });
  };

  const download = () => {
    if (!file) return;
    downloadFile(file);
    setFlash({ action: "download", message: "Saved", ok: true });
  };

  const downloadBoundary = () => {
    if (!file?.boundary) return;
    downloadFile(file.boundary);
    setFlash({ action: "boundary", message: "Boundary saved", ok: true });
  };

  return (
    /* Output first on a phone — the file and its Download are the point, and
       the settings column is long. Side by side from lg up, sidebar leading. */
    <div className="grid lg:grid-cols-[316px_minmax(0,1fr)]">
      <Sidebar
        opts={opts}
        patch={patch}
        countSteps={COUNT_STEPS}
        countIndex={closestStep(opts.count)}
      />

      <main className="order-1 min-w-0 bg-paper p-4 sm:p-5 lg:order-2">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <label className="flex w-full min-w-0 items-center gap-2 rounded-full border border-line-strong bg-card px-3.5 py-2 sm:w-auto sm:flex-1">
            <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-dim">seed</span>
            <input
              value={opts.seed}
              onChange={(e) => patch({ seed: e.target.value.slice(0, 40) })}
              spellCheck={false}
              aria-label="Seed"
              placeholder="three-word-seed, or anything you like"
              className="min-w-0 flex-1 bg-transparent font-mono text-[12.5px] text-ink outline-none placeholder:text-dim"
            />
          </label>

          {/* The buttons carry the confirmation now, but it still has to be
              announced — a drawn tick is invisible to a screen reader. */}
          <span
            aria-live="polite"
            className={`min-w-[72px] font-mono text-[11px] ${
              flash && !flash.ok ? "text-cat-encoding" : "text-muted"
            }`}
          >
            {busy ? "working…" : (flash?.message ?? "")}
          </span>

          {JSON_FORMATS.includes(opts.format) && (
            <Button
              onClick={() => patch({ pretty: !opts.pretty })}
              active={opts.pretty}
              title="Toggle pretty-printed JSON"
            >
              Pretty print
            </Button>
          )}
          <Button onClick={() => patch({ seed: randomSeed() })} title="New random seed">
            New seed
          </Button>
          <Button
            onClick={randomiseEverything}
            title="Roll a new format, size, place and problem set in one go"
          >
            {/* Decorative: the label already says what the button does. */}
            <span className="emoji" aria-hidden>
              🎲
            </span>
            Randomise everything
          </Button>
          <Button
            onClick={share}
            confirmed={confirmed("share")}
            confirmLabel="Link copied"
            title="Copy a link that reproduces this exact file"
          >
            Share
          </Button>
        </div>

        {heldBack ? (
          <Card className="p-5">
            <h2 className="text-[15px] font-semibold tracking-tight text-ink">
              This link asks for {heldBack.toLocaleString()} features.
            </h2>
            <p className="mt-1.5 max-w-2xl text-[12.5px] leading-relaxed text-muted">
              A file that size takes a few seconds to build, and the tab will not respond while it
              does — long enough to be killed on a phone. Nothing has been generated yet, and every
              setting from the link is already loaded, so you can change them first.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => setHeldBack(0)}>
                Generate anyway
              </Button>
              <Button
                onClick={() => {
                  setHeldBack(0);
                  setOpts((current) => ({ ...current, count: 1000 }));
                }}
              >
                Use 1,000 instead
              </Button>
            </div>
          </Card>
        ) : error ? (
          <Card className="p-5">
            <p className="text-[13px] text-cat-encoding">Generation failed: {error}</p>
            <p className="mt-2 text-[12px] text-muted">
              That is a bug in Null Island, not in your settings. Lower the feature count and try again.
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            <HeroPanel
              file={file}
              busy={busy}
              onDownload={download}
              onCopy={copy}
              onDownloadBoundary={downloadBoundary}
              copied={confirmed("copy")}
              saved={confirmed("download")}
              boundarySaved={confirmed("boundary")}
            />
            <OutputPanel file={file} formatLabel={getFormat(opts.format).label} />
          </div>
        )}

        <div className="mt-8">
          <ProblemGrid
            selected={opts.problems}
            format={opts.format}
            onToggle={toggleProblem}
            onPickRandom={pickRandomProblems}
            onSelectAll={() =>
              patch({ problems: applicable.filter((p) => p.id !== EXCLUSIVE).map((p) => p.id) })
            }
            onClear={() => patch({ problems: [] })}
          />
        </div>

        <Contribute />
      </main>
    </div>
  );
}
