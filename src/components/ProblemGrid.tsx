"use client";

import { getFormat } from "@/lib/formats/index";
import { appliesTo, CATEGORY_LABELS, CATEGORY_ORDER, PROBLEMS } from "@/lib/problems";
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

export function ProblemGrid({
  selected,
  format,
  onToggle,
}: {
  selected: string[];
  format: FormatId;
  onToggle: (id: string) => void;
}) {
  const chosen = new Set(selected);
  const formatLabel = getFormat(format).label;

  return (
    <div className="space-y-7">
      {CATEGORY_ORDER.map((category) => {
        const problems = PROBLEMS.filter((p) => p.category === category);
        const count = problems.filter((p) => chosen.has(p.id)).length;

        return (
          <div key={category}>
            <div className="mb-2.5 flex items-center gap-2">
              <span className={`h-1.5 w-1.5 rounded-full ${DOT[category]}`} aria-hidden />
              <h3 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
                {CATEGORY_LABELS[category]}
              </h3>
              <span className="font-mono text-[11px] text-dim">
                {count}/{problems.length}
              </span>
            </div>

            <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
              {problems.map((problem) => {
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
                      "group rounded-lg border p-2.5 text-left transition-colors",
                      active
                        ? "border-accent/70 bg-accent-soft/40"
                        : "border-line-soft bg-raised/40 hover:border-line hover:bg-raised",
                      usable ? "" : "opacity-45",
                    ].join(" ")}
                  >
                    <span className="flex items-start gap-2">
                      <span
                        aria-hidden
                        className={[
                          "mt-px flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[4px] border text-[9px] leading-none",
                          active
                            ? "border-accent bg-accent text-[#0a0b0d]"
                            : "border-dim/60 text-transparent",
                        ].join(" ")}
                      >
                        ✓
                      </span>
                      <span className="min-w-0">
                        <span className="block text-xs font-medium text-ink">{problem.label}</span>
                        <span className="mt-0.5 block text-[11px] leading-snug text-muted">
                          {problem.blurb}
                        </span>
                        {!usable && (
                          <span className="mt-1 block font-mono text-[10px] text-dim">
                            not in {formatLabel}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
