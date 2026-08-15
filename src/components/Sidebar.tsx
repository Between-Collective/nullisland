"use client";

import { Wordmark } from "./Logo";
import { Field, Segmented, type Option } from "./ui";
import { BOUNDARIES, coversWorld, regionExtent } from "@/lib/boundary";
import { FORMATS } from "@/lib/formats/index";
import { getRegion, REGIONS } from "@/lib/regions";
import type { BoundaryId, FormatId, GenerateOptions, ShapeId } from "@/lib/types";

const SHAPE_OPTIONS: Option<ShapeId>[] = [
  { value: "point", label: "Points" },
  { value: "line", label: "Lines" },
  { value: "polygon", label: "Polygons" },
  { value: "mixed", label: "Mixed" },
];

const BOUNDARY_OPTIONS: Option<BoundaryId>[] = BOUNDARIES.map((b) => ({
  value: b.id,
  label: b.label,
  hint: b.blurb,
}));

function FormatTile({
  id,
  label,
  ext,
  hint,
  active,
  onSelect,
}: {
  id: FormatId;
  label: string;
  ext: string;
  hint: string;
  active: boolean;
  onSelect: (id: FormatId) => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      title={hint}
      onClick={() => onSelect(id)}
      className={[
        "rounded-xl border px-2.5 py-3 text-left transition-colors",
        active
          ? "border-ink bg-ink text-white"
          : "border-line-strong bg-white text-ink hover:border-dim",
      ].join(" ")}
    >
      <span className="block truncate text-[12px] font-semibold tracking-tight">{label}</span>
      <span
        className={`mt-0.5 block truncate font-mono text-[10px] ${active ? "text-white/55" : "text-dim"}`}
      >
        .{ext}
      </span>
    </button>
  );
}

export function Sidebar({
  opts,
  patch,
  countSteps,
  countIndex,
}: {
  opts: GenerateOptions;
  patch: (next: Partial<GenerateOptions>) => void;
  countSteps: number[];
  countIndex: number;
}) {
  const isWorldWide = coversWorld(regionExtent(getRegion(opts.region)));

  return (
    <aside className="order-2 flex flex-col gap-6 border-line bg-card p-4 sm:p-5 lg:order-1 lg:h-full lg:border-r">
      <div className="flex items-center justify-between">
        <Wordmark />
      </div>

      {/* Nine formats divide exactly into a 3x3 block, so every tile is the
          same size at every breakpoint. */}
      <div role="radiogroup" aria-label="Output format" className="space-y-2">
        <span className="block text-[10.5px] font-semibold uppercase tracking-[0.13em] text-dim">
          Format
        </span>
        <div className="grid grid-cols-3 gap-2">
          {FORMATS.map((format) => (
            <FormatTile
              key={format.id}
              id={format.id}
              label={format.label}
              ext={format.ext}
              hint={format.blurb}
              active={opts.format === format.id}
              onSelect={(id) => patch({ format: id })}
            />
          ))}
        </div>
      </div>

      <div className="space-y-5 border-t border-line pt-5">
        <Field label="Features" value={opts.count.toLocaleString()}>
          <input
            type="range"
            min={0}
            max={countSteps.length - 1}
            step={1}
            value={countIndex}
            onChange={(e) => patch({ count: countSteps[Number(e.target.value)] })}
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
            className="w-full rounded-full border border-line-strong bg-white px-3.5 py-2 text-[12px] text-ink"
          >
            {REGIONS.map((region) => (
              <option key={region.id} value={region.id}>
                {region.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {/* Boundaries get their own block: turning one on changes what comes out
          of the generator — two files instead of one — rather than just tuning
          the dataset the way the controls above do. */}
      <div className="space-y-5 border-t border-line pt-5">
        <Field label="Boundary">
          <Segmented
            ariaLabel="Boundary shape"
            options={BOUNDARY_OPTIONS}
            value={opts.boundary}
            onChange={(value) => patch({ boundary: value })}
          />
        </Field>

        {opts.boundary === "none" ? (
          <p className="text-[11.5px] leading-relaxed text-muted">
            Add a boundary to get a second GeoJSON — the area you upload to filter by — plus a
            count of how many features should survive that filter.
          </p>
        ) : (
          <>
            <Field label="Inside" value={`${Math.round(opts.coverage * 100)}%`}>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={Math.round(opts.coverage * 100)}
                onChange={(e) => patch({ coverage: Number(e.target.value) / 100 })}
                aria-label="Share of features placed inside the boundary"
                className="w-full"
              />
            </Field>
            <p className="text-[11.5px] leading-relaxed text-muted">
              {isWorldWide
                ? "A whole-world boundary contains everything. Pick a city for an inside/outside split."
                : "Every feature is tagged with the answer your filter should give."}
            </p>
          </>
        )}
      </div>
    </aside>
  );
}
