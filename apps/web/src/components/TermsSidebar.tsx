"use client";

import { Field, Segmented, type Option } from "./ui";
import {
  DEFAULT_PROFILE,
  FAMILIES,
  PLACES,
  QUIRKS,
  TERM_FORMATS,
  getPlace,
  getSubject,
  profilesInFamily,
  type TermFormatId,
  type TermsConfig,
} from "nullisland-core";

/** A taste, one of everything, or everything roughly three times over. */
export const TERM_SIZES = [12, QUIRKS.length, 120];

const SIZE_OPTIONS: Option<string>[] = TERM_SIZES.map((n) => ({
  value: String(n),
  label: String(n),
  hint:
    n === QUIRKS.length
      ? "One of every quirk in the catalogue"
      : `${n} terms`,
}));

/**
 * Somewhere to pin the terms to. Grouped by kind so the big containers lead —
 * "New Zealand" and "Japan" are the useful anchors, and the venue list is long.
 */
const NEAR_GROUPS = [
  { label: "Countries", kind: "country" as const },
  { label: "Regions", kind: "region" as const },
  { label: "Cities", kind: "city" as const },
  { label: "Venues", kind: "venue" as const },
];

export function TermsSidebar({
  terms,
  subjectProfile,
  patchTerms,
}: {
  terms: TermsConfig;
  /**
   * The data type the noun falls back to when nothing is ticked. The file
   * half's, except for the generic export — a schema with no subject, since
   * nobody searches for "records" — which falls through to location pings.
   */
  subjectProfile: string;
  patchTerms: (next: Partial<TermsConfig>) => void;
}) {
  const chosen = terms.profiles.length ? terms.profiles : [subjectProfile];
  // The noun in the copy is whatever the query will actually say: one kind, or
  // the list of them joined the way the query joins them.
  const subject = {
    plural: chosen.map((id) => getSubject(id).plural).join(" and "),
  };
  const combining = terms.quirks.includes("many-subjects");

  const toggleKind = (id: string) => {
    const next = chosen.includes(id) ? chosen.filter((k) => k !== id) : [...chosen, id];
    // Never nothing: a set with no kind in it is the `any-subject` quirk, and
    // that is asked for in the catalogue rather than by emptying this list.
    if (!next.length) return;
    patchTerms({ profiles: next });
  };

  const onCombine = () =>
    patchTerms({
      clean: false,
      quirks: combining
        ? terms.quirks.filter((q) => q !== "many-subjects")
        : [...terms.quirks, "many-subjects"],
    });
  const near = terms.near === "anywhere" ? null : getPlace(terms.near);

  return (
    <>
      {/* One kind or several. A query naming two is a different problem from a
          query naming one — the answer is their union, and nothing is both — so
          which kinds are in play is a control rather than something the
          generator picks for you. */}
      <div className="space-y-2.5">
        <Field label="Kinds of thing" value={`${chosen.length} selected`}>
          <div className="scroll-thin max-h-[188px] overflow-y-auto rounded-2xl border border-line-strong bg-white">
            {FAMILIES.map((family) => {
              const inFamily = profilesInFamily(family.id).filter((p) => p.id !== DEFAULT_PROFILE);
              if (!inFamily.length) return null;
              return (
                <div key={family.id}>
                  <p className="sticky top-0 bg-paper px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.11em] text-dim">
                    {family.label}
                  </p>
                  {inFamily.map((entry) => {
                    const on = chosen.includes(entry.id);
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        role="checkbox"
                        aria-checked={on}
                        onClick={() => toggleKind(entry.id)}
                        title={getSubject(entry.id).plural}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-paper"
                      >
                        <span
                          aria-hidden
                          className={[
                            "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border text-[9px] leading-none",
                            on ? "border-ink bg-ink text-white" : "border-line-strong text-transparent",
                          ].join(" ")}
                        >
                          ✓
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[11.5px] text-ink">
                          {entry.label}
                        </span>
                        <span className="shrink-0 font-mono text-[10px] text-dim">
                          {getSubject(entry.id).plural}
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </Field>

        {/* The mode for a broad corpus: kinds vary term to term rather than
            being held fixed, so two seeds give two genuinely different spreads
            instead of the same spread reworded. */}
        <button
          type="button"
          aria-pressed={terms.shuffle}
          onClick={() => patchTerms({ shuffle: !terms.shuffle })}
          className={[
            "w-full rounded-full border px-3 py-2 text-[12px] font-medium transition-colors",
            terms.shuffle
              ? "border-ink bg-ink text-white"
              : "border-line-strong bg-white text-ink hover:border-dim",
          ].join(" ")}
        >
          {terms.shuffle ? "Shuffling kinds every term" : "Shuffle kinds"}
        </button>
        {terms.shuffle && (
          <p className="text-[11.5px] leading-relaxed text-muted">
            Every term draws its own kind{terms.profiles.length > 1 ? " from the ones ticked" : " from all of them"},
            and a share of them name several. Press <strong className="font-semibold text-ink">New seed</strong> for
            another spread — a few rounds and you have covered the catalogue.
          </p>
        )}

        {chosen.length > 1 && !terms.shuffle ? (
          <>
            <button
              type="button"
              aria-pressed={combining}
              onClick={onCombine}
              className={[
                "w-full rounded-full border px-3 py-2 text-[12px] font-medium transition-colors",
                combining
                  ? "border-ink bg-ink text-white"
                  : "border-line-strong bg-white text-ink hover:border-dim",
              ].join(" ")}
            >
              {combining ? "Every query names them together" : "Combine them in one query"}
            </button>
            <p className="text-[11.5px] leading-relaxed text-muted">
              {combining
                ? `Every term asks for ${subject.plural} together — and the answer is their union. Nothing is both, so a planner reading the "and" literally over one collection returns zero rows and looks right doing it.`
                : `Terms are spread across ${chosen.length} kinds, one each. Combine them to put ${subject.plural} in the same query.`}
            </p>
          </>
        ) : terms.shuffle ? null : (
          <p className="text-[11.5px] leading-relaxed text-muted">
            Queries about <strong className="font-semibold text-ink">{subject.plural}</strong>. Tick
            another kind to get queries that span more than one — which is a different problem, and
            the one where an empty result looks like a correct answer.
          </p>
        )}
      </div>

      <div className="space-y-5 border-t border-line pt-5">
        <Field label="Terms" value={terms.count.toLocaleString()}>
          <Segmented
            ariaLabel="How many terms"
            options={SIZE_OPTIONS}
            value={String(terms.count)}
            onChange={(value) => patchTerms({ count: Number(value) })}
          />
        </Field>

        <Field label="Extra quirks" value={`${Math.round(terms.intensity * 100)}%`}>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={Math.round(terms.intensity * 100)}
            onChange={(e) => patchTerms({ intensity: Number(e.target.value) / 100 })}
            aria-label="How often a term picks up a second quirk"
            disabled={terms.clean}
            className="w-full disabled:opacity-40"
          />
        </Field>
        <p className="text-[11.5px] leading-relaxed text-muted">
          {terms.clean
            ? "Nothing is applied to a control set, so this has nothing to turn up."
            : "Every term gets one quirk. This is how often it picks up a second on top."}
        </p>
      </div>

      {/* Where the places come from. A preference rather than a fence, and the
          copy says so — a quirk needing a name with a particular property
          reaches further when nothing local has it. */}
      <div className="space-y-2.5 border-t border-line pt-5">
        <Field label="Near">
          <select
            value={terms.near}
            onChange={(e) => patchTerms({ near: e.target.value })}
            aria-label="Build terms around a place"
            className="w-full rounded-full border border-line-strong bg-white px-3.5 py-2 text-[12px] text-ink"
          >
            <option value="anywhere">Anywhere</option>
            {NEAR_GROUPS.map((group) => {
              const inGroup = PLACES.filter((p) => p.kind === group.kind);
              if (!inGroup.length) return null;
              return (
                <optgroup key={group.kind} label={group.label}>
                  {inGroup
                    .slice()
                    .sort((a, b) => a.name.localeCompare(b.name, "en"))
                    .map((place) => (
                      <option key={place.id} value={place.id}>
                        {place.name}
                      </option>
                    ))}
                </optgroup>
              );
            })}
          </select>
        </Field>
        <p className="text-[11.5px] leading-relaxed text-muted">
          {near
            ? `${near.name}, everything inside it, and everything it is inside. A quirk needing a name nowhere near it still reaches further — the expected parse always names the place it really used.`
            : "Terms are drawn from the whole gazetteer. Pick a place to keep them local."}
        </p>
      </div>

      <div className="space-y-2.5 border-t border-line pt-5">
        <Field label="Download as">
          <select
            value={terms.format}
            onChange={(e) => patchTerms({ format: e.target.value as TermFormatId })}
            aria-label="Download format"
            className="w-full rounded-full border border-line-strong bg-white px-3.5 py-2 text-[12px] text-ink"
          >
            {TERM_FORMATS.map((meta) => (
              <option key={meta.id} value={meta.id}>
                {meta.label}
                {meta.groundTruth ? "" : " — queries only"}
              </option>
            ))}
          </select>
        </Field>
        <p className="text-[11.5px] leading-relaxed text-muted">
          {TERM_FORMATS.find((f) => f.id === terms.format)?.blurb}
        </p>
      </div>
    </>
  );
}
