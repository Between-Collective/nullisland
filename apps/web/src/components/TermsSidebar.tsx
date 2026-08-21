"use client";

import { Field, Segmented, type Option } from "./ui";
import {
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
  profile,
  subjectProfile,
  patchTerms,
  onProfile,
}: {
  terms: TermsConfig;
  /** Shared with the file half: one data type for the whole app. */
  profile: string;
  /**
   * The data type the noun actually comes from. The same as `profile`, except
   * for the generic export — a schema with no subject, since nobody searches
   * for "records" — which falls through to location pings.
   */
  subjectProfile: string;
  patchTerms: (next: Partial<TermsConfig>) => void;
  onProfile: (id: string) => void;
}) {
  const subject = getSubject(subjectProfile);
  const isGeneric = profile !== subjectProfile;
  const near = terms.near === "anywhere" ? null : getPlace(terms.near);

  return (
    <>
      {/* The subject noun comes from the data type, so it is the same control
          the file half uses — pick Maritime AIS and both the fixture and the
          queries about it are about vessels. */}
      <div className="space-y-2.5">
        <Field label="Data type">
          <select
            value={profile}
            onChange={(e) => onProfile(e.target.value)}
            aria-label="Data type"
            className="w-full rounded-full border border-line-strong bg-white px-3.5 py-2 text-[12px] text-ink"
          >
            {FAMILIES.map((family) => {
              const inFamily = profilesInFamily(family.id);
              if (!inFamily.length) return null;
              return (
                <optgroup key={family.id} label={family.label}>
                  {inFamily.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.label}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        </Field>
        <p className="text-[11.5px] leading-relaxed text-muted">
          Queries about <strong className="font-semibold text-ink">{subject.plural}</strong>.{" "}
          {isGeneric
            ? "The generic export has no subject to search for, so these fall through to devices. Pick a real data type and the terms follow it — vessels for AIS, parcels for cadastral."
            : "The noun follows the data type, so terms generated beside a fixture are about the thing in it."}
        </p>
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
