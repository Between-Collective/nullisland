"use client";

import { useState } from "react";
import { Button } from "./ui";
import { getFormat } from "@/lib/formats/index";
import { appliesTo, appliesToProfile, CATEGORY_LABELS, CATEGORY_ORDER, PROBLEMS } from "@/lib/problems";
import { getProfile } from "@/lib/profiles/index";
import type { FormatId, ProblemCategory } from "@/lib/types";

// Written out rather than built from the category id so Tailwind's scanner
// actually sees every class name.
const DOT: Record<ProblemCategory, string> = {
  coordinates: "bg-cat-coordinates",
  geometry: "bg-cat-geometry",
  attributes: "bg-cat-attributes",
  structure: "bg-cat-structure",
  encoding: "bg-cat-encoding",
};

type Filter = ProblemCategory | "all";

function FilterPill({
  label,
  count,
  active,
  dot,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  dot?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={[
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors",
        active
          ? "border-ink bg-ink text-white"
          : "border-line-strong bg-white text-muted hover:border-dim hover:text-ink",
      ].join(" ")}
    >
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />}
      {label}
      <span className={active ? "text-white/55" : "text-dim"}>{count}</span>
    </button>
  );
}

export function ProblemGrid({
  selected,
  format,
  profile,
  onToggle,
  onPickRandom,
  onSelectAll,
  onClear,
  onPickTypical,
}: {
  selected: string[];
  format: FormatId;
  profile: string;
  onToggle: (id: string) => void;
  onPickRandom: (howMany: number) => void;
  onSelectAll: () => void;
  onClear: () => void;
  onPickTypical: () => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const chosen = new Set(selected);
  const formatLabel = getFormat(format).label;
  const dataType = getProfile(profile);

  // The catalogue is the general problems plus the ones this data type brings
  // with it. Another type's problems are not hidden so much as absent: they do
  // not exist in this data.
  const catalogue = PROBLEMS.filter((p) => appliesToProfile(p, profile));
  const visible = catalogue.filter((p) => filter === "all" || p.category === filter);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h2 className="text-[19px] font-bold tracking-[-0.02em] text-ink">Problems</h2>
          <span className="rounded-full bg-paper px-2 py-0.5 font-mono text-[11px] text-muted">
            {selected.length}/{catalogue.length}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {dataType.apt.length > 0 && (
            <Button
              onClick={onPickTypical}
              title={`What ${dataType.label} files actually arrive with`}
            >
              Typical for {dataType.label}
            </Button>
          )}
          <Button onClick={() => onPickRandom(1)} title="Pick exactly one at random">
            Random 1
          </Button>
          <Button
            onClick={() => onPickRandom(3 + Math.floor(Math.random() * 6))}
            title="Pick a random handful"
          >
            Random mix
          </Button>
          <Button
            onClick={onSelectAll}
            title="Everything this format supports, except the empty-result case"
          >
            All
          </Button>
          <Button variant="quiet" onClick={onClear}>
            None
          </Button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        <FilterPill
          label="All"
          count={catalogue.length}
          active={filter === "all"}
          onClick={() => setFilter("all")}
        />
        {CATEGORY_ORDER.map((category) => (
          <FilterPill
            key={category}
            label={CATEGORY_LABELS[category]}
            count={catalogue.filter((p) => p.category === category).length}
            dot={DOT[category]}
            active={filter === category}
            onClick={() => setFilter(category)}
          />
        ))}
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((problem) => {
          const usable = appliesTo(problem, format);
          const active = chosen.has(problem.id);
          return (
            <button
              key={problem.id}
              type="button"
              role="checkbox"
              aria-checked={active}
              onClick={() => onToggle(problem.id)}
              title={usable ? undefined : `${formatLabel} can't express this — it will be skipped.`}
              className={[
                "rounded-2xl border p-3 text-left transition-colors",
                active
                  ? "border-ink bg-mint"
                  : "border-line bg-card hover:border-line-strong hover:bg-paper",
                usable ? "" : "opacity-50",
              ].join(" ")}
            >
              <span className="flex items-start gap-2.5">
                <span
                  aria-hidden
                  className={[
                    "mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-md border text-[10px] leading-none",
                    active ? "border-ink bg-ink text-white" : "border-line-strong text-transparent",
                  ].join(" ")}
                >
                  ✓
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT[problem.category]}`} aria-hidden />
                    <span className="text-[12.5px] font-semibold tracking-tight text-ink">
                      {problem.label}
                    </span>
                  </span>
                  <span className="mt-1 block text-[11.5px] leading-snug text-muted">
                    {problem.blurb}
                  </span>
                  <span className="mt-1.5 flex flex-wrap gap-x-2 font-mono text-[10px]">
                    {problem.profiles && (
                      <span className="text-mint-ink">{dataType.label} only</span>
                    )}
                    {!usable && <span className="text-dim">not in {formatLabel}</span>}
                  </span>
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
