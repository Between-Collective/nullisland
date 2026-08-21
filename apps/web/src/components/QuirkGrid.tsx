"use client";

import { useState } from "react";
import { Button } from "./ui";
import {
  EXCLUSIVE_QUIRKS,
  QUIRKS,
  QUIRK_CATEGORY_LABELS,
  QUIRK_CATEGORY_ORDER,
  getSubject,
  type QuirkCategory,
} from "nullisland-core";

// Written out rather than built from the id so Tailwind's scanner sees them.
const DOT: Record<QuirkCategory, string> = {
  place: "bg-cat-coordinates",
  time: "bg-cat-structure",
  phrasing: "bg-cat-attributes",
  encoding: "bg-cat-encoding",
  adversarial: "bg-cat-geometry",
};

type Filter = QuirkCategory | "all";

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

/**
 * The query catalogue, selectable — the search half's answer to the problem
 * grid.
 *
 * One difference matters enough to say out loud on screen: an empty selection
 * here does not mean an empty set. With nothing ticked the whole catalogue is
 * dealt out one quirk per term, which is the useful default. "Clean" is how you
 * ask for none, and it is a separate state rather than the absence of one.
 */
export function QuirkGrid({
  selected,
  clean,
  profile,
  onToggle,
  onClean,
  onSpread,
  onPickRandom,
}: {
  selected: string[];
  clean: boolean;
  profile: string;
  onToggle: (id: string) => void;
  onClean: () => void;
  onSpread: () => void;
  onPickRandom: (howMany: number) => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [expanded, setExpanded] = useState(false);
  const chosen = new Set(selected);
  const subject = getSubject(profile);

  const visible = QUIRKS.filter((q) => filter === "all" || q.category === filter);
  // Closed, the grid shows what is actually selected. With nothing selected
  // there is nothing to show, so it opens itself rather than rendering a void.
  const showAll = expanded || filter !== "all";
  const shown = showAll ? visible : visible.filter((q) => chosen.has(q.id));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h2 className="text-[19px] font-bold tracking-[-0.02em] text-ink">Quirks</h2>
          <span className="rounded-full bg-paper px-2 py-0.5 font-mono text-[11px] text-muted">
            {clean ? "none" : selected.length ? `${selected.length}/${QUIRKS.length}` : `all ${QUIRKS.length}`}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button
            onClick={onClean}
            active={clean}
            title="Well-formed queries with nothing hard about them — the control set"
          >
            Clean
          </Button>
          <Button
            onClick={onSpread}
            active={!clean && selected.length === 0}
            title="Deal the whole catalogue out, one quirk per term"
          >
            One of everything
          </Button>
          <Button onClick={() => onPickRandom(1)} title="Pick exactly one at random">
            Random 1
          </Button>
          <Button
            onClick={() => onPickRandom(3 + Math.floor(Math.random() * 6))}
            title="Pick a random handful"
          >
            Random mix
          </Button>
        </div>
      </div>

      {clean ? (
        <p className="mb-4 rounded-xl border border-mint-deep bg-mint px-3.5 py-2.5 text-[12px] leading-relaxed text-mint-ink">
          <span className="font-semibold text-ink">Nothing selected, so every query is clean.</span>{" "}
          One unambiguous place, a window that resolves, one correct answer. Run these before the
          awkward ones — a search that fumbles them will fail every quirk for a reason that has
          nothing to do with the quirk.
        </p>
      ) : selected.length === 0 ? (
        <p className="mb-4 rounded-xl border border-line-strong bg-paper px-3.5 py-2.5 text-[12px] leading-relaxed text-muted">
          <span className="font-semibold text-ink">
            Nothing ticked, so the whole catalogue is dealt out — one quirk per term.
          </span>{" "}
          That is the useful default: a set of {QUIRKS.length} is {QUIRKS.length} different problems
          rather than {QUIRKS.length} rolls of the same dice. Tick some to narrow it, or press Clean
          for queries about {subject.plural} with nothing wrong with them.
        </p>
      ) : null}

      <div className="mb-4 flex flex-wrap gap-1.5">
        <FilterPill
          label="All"
          count={QUIRKS.length}
          active={filter === "all"}
          onClick={() => setFilter("all")}
        />
        {QUIRK_CATEGORY_ORDER.map((category) => (
          <FilterPill
            key={category}
            label={QUIRK_CATEGORY_LABELS[category]}
            count={QUIRKS.filter((q) => q.category === category).length}
            dot={DOT[category]}
            active={filter === category}
            onClick={() => setFilter(category)}
          />
        ))}
        {!showAll && (
          <Button onClick={() => setExpanded(true)} className="ml-auto">
            {selected.length ? "Show all" : "Browse all"} {QUIRKS.length}
          </Button>
        )}
        {expanded && filter === "all" && (
          <Button onClick={() => setExpanded(false)} className="ml-auto">
            {selected.length ? "Show selected only" : "Collapse"}
          </Button>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map((quirk) => {
          const active = chosen.has(quirk.id);
          return (
            <button
              key={quirk.id}
              type="button"
              role="checkbox"
              aria-checked={active}
              onClick={() => onToggle(quirk.id)}
              title={quirk.example}
              className={[
                "rounded-2xl border p-3 text-left transition-colors",
                active
                  ? "border-ink bg-mint"
                  : "border-line bg-card hover:border-line-strong hover:bg-paper",
                clean ? "opacity-50" : "",
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
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT[quirk.category]}`} aria-hidden />
                    <span className="text-[12.5px] font-semibold tracking-tight text-ink">
                      {quirk.label}
                    </span>
                  </span>
                  <span className="mt-1 block text-[11.5px] leading-snug text-muted">
                    {quirk.blurb}
                  </span>
                  <span className="mt-1.5 flex flex-wrap gap-x-2 font-mono text-[10px]">
                    {/* What a query has to already contain before this means
                        anything — the direct analogue of a format that cannot
                        express a problem. */}
                    {quirk.needs !== "none" && (
                      <span className="text-dim">needs a {quirk.needs.replace(/s$/, "")}</span>
                    )}
                    {EXCLUSIVE_QUIRKS.includes(quirk.id) && (
                      <span className="text-mint-ink">stands alone</span>
                    )}
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
