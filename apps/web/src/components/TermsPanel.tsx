"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Card, CardTitle } from "./ui";
import { downloadFile, formatBytes } from "@/lib/download";
import {
  PLACES,
  QUIRKS,
  QUIRK_CATEGORY_LABELS,
  TERM_FORMATS,
  generateTerms,
  getQuirk,
  getSubject,
  inspectTerms,
  writeTerms,
  DEFAULT_ANCHOR,
  DEFAULT_PROFILE,
  DEFAULT_SUBJECT_PROFILE,
  type QuirkCategory,
  type SearchTerm,
  type TermFormatId,
  type TermSet,
} from "nullisland-core";

/**
 * The search box, rather than the map.
 *
 * Everything else on this page is about the file a map is handed. This is about
 * the sentence a person types above it — "devices in Tokyo and Kyoto", "devices
 * that were in the Estádio da Luz in Lisbon last week" — and the parse that
 * sentence is supposed to receive. The parse is the part that makes it a
 * fixture rather than a list of strings, so it is on screen rather than only in
 * the download.
 */

// Written out rather than built from the id, so Tailwind's scanner sees them.
const DOT: Record<QuirkCategory, string> = {
  place: "bg-cat-coordinates",
  time: "bg-cat-structure",
  phrasing: "bg-cat-attributes",
  encoding: "bg-cat-encoding",
  adversarial: "bg-cat-geometry",
};

/** A taste, one of everything, or everything three times over. */
const SIZES = [12, QUIRKS.length, 120];

/** Somewhere to pin the terms to. Ordered so the big containers lead. */
const NEARBY = [
  { id: "anywhere", label: "Anywhere" },
  ...PLACES.filter((p) => p.kind === "country" || p.kind === "region" || p.kind === "city")
    .map((p) => ({ id: p.id, label: `${p.name}${p.kind === "city" ? "" : ` (${p.kind})`}` }))
    .sort((a, b) => a.label.localeCompare(b.label, "en")),
];

/** The whitespace nobody can see, made visible without changing the string. */
function visible(text: string): string {
  return [...text]
    .map((char) => {
      const code = char.codePointAt(0) as number;
      if (char === "\n") return "\\n";
      if (char === "\t") return "\\t";
      if (char === "\r") return "\\r";
      // Named rather than substituted with a lookalike glyph: the reason these
      // are worth showing is that you cannot see them, so a marker that could
      // be mistaken for an ordinary character would defeat the point.
      if (code === 0x00a0) return "⟨nbsp⟩";
      if (code === 0x200b) return "⟨zwsp⟩";
      if (code >= 0x200c && code <= 0x200f) return "⟨zw⟩";
      if (code >= 0x202a && code <= 0x202e) return "⟨bidi⟩";
      return char;
    })
    .join("");
}

function Row({ term }: { term: SearchTerm }) {
  const places = term.expect.places;
  const time = term.expect.time;
  const long = term.text.length > 220;

  return (
    <li className="border-t border-line px-4 py-3 first:border-t-0">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="w-6 shrink-0 font-mono text-[10.5px] tabular-nums text-dim">{term.id}</span>
        <span className="min-w-0 flex-1 font-mono text-[12px] leading-relaxed text-ink">
          {term.text.trim() ? (
            <>
              {visible(long ? `${term.text.slice(0, 220)}` : term.text)}
              {/* Truncated on screen only; the file carries every byte, and
                  saying how many is the difference between a display choice
                  and a claim about the fixture. */}
              {long && (
                <span className="text-dim"> … {term.text.length.toLocaleString()} characters</span>
              )}
            </>
          ) : (
            <span className="text-dim">(empty query)</span>
          )}
        </span>
      </div>

      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1 pl-9">
        {term.quirks.length ? (
          term.quirks.map((id) => {
            const quirk = getQuirk(id);
            if (!quirk) return null;
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1.5 font-mono text-[10.5px] text-muted"
                title={quirk.blurb}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${DOT[quirk.category]}`} aria-hidden />
                {quirk.label}
              </span>
            );
          })
        ) : (
          <span className="inline-flex items-center gap-1.5 font-mono text-[10.5px] text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-ink" aria-hidden />
            clean
          </span>
        )}
      </div>

      {/* The expected parse. This is the thing you assert against, so it is on
          screen rather than only in the file. */}
      <div className="mt-1.5 space-y-0.5 pl-9 font-mono text-[10.5px] leading-relaxed text-dim">
        {places.length === 0 && <div>no place — nothing to filter on</div>}
        {places.map((place, i) => (
          <div key={i}>
            {place.negated && <span className="text-cat-encoding">not </span>}
            <span className="text-muted">{visible(place.typed)}</span>
            {" → "}
            {place.id ? (
              <span className="text-mint-ink">
                {place.name} · {place.lat}, {place.lon}
              </span>
            ) : place.candidates.length ? (
              <span className="text-cat-attributes">
                {place.candidates.length} places with this name:{" "}
                {place.candidates.map((c) => `${c.name} (${c.country})`).join(", ")}
              </span>
            ) : (
              <span className="text-cat-encoding">nowhere — expect zero rows</span>
            )}
          </div>
        ))}
        {time.kind !== "none" && (
          <div>
            <span className="text-muted">{visible(time.expression)}</span>
            {" → "}
            {time.startsAt ? (
              <span className={time.empty ? "text-cat-encoding" : "text-mint-ink"}>
                {time.startsAt} to {time.endsAt}
                {time.empty && " — empty by definition"}
              </span>
            ) : (
              <span className="text-cat-attributes">unbounded — any window is invented</span>
            )}
            {time.alternate && (
              <span className="text-cat-attributes">
                {" "}
                · or {time.alternate.startsAt} to {time.alternate.endsAt}, {time.alternate.why}
              </span>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

export function TermsPanel({ seed, profile: chosen }: { seed: string; profile: string }) {
  // The generic export is a schema with no subject — nobody searches for
  // "records" — so it falls through to location pings, which is what a term
  // about devices needs. Pick any real data type in the sidebar and the terms
  // follow it: vessels for AIS, parcels for cadastral.
  const profile = chosen === DEFAULT_PROFILE ? DEFAULT_SUBJECT_PROFILE : chosen;
  const [count, setCount] = useState(QUIRKS.length);
  const [clean, setClean] = useState(false);
  const [near, setNear] = useState("anywhere");
  const [format, setFormat] = useState<TermFormatId>("jsonl");
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  // Cheap enough to run on every change — a hundred short strings, no file
  // written until you ask for one — so this needs no button and no debounce.
  const set: TermSet = useMemo(
    () =>
      generateTerms({
        seed,
        count,
        profile,
        quirks: [],
        intensity: clean ? 0 : 0.15,
        near,
        anchor: DEFAULT_ANCHOR,
        clean,
      }),
    [seed, count, profile, near, clean],
  );

  const report = useMemo(() => inspectTerms(set), [set]);
  const file = useMemo(() => writeTerms(set, format, seed), [set, format, seed]);
  const subject = getSubject(profile);

  useEffect(() => {
    if (!saved && !copied) return;
    const timer = setTimeout(() => {
      setSaved(false);
      setCopied(false);
    }, 1800);
    return () => clearTimeout(timer);
  }, [saved, copied]);

  const download = () => {
    downloadFile(file);
    setSaved(true);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(file.data as string);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const covered = new Set(set.stats.quirks);

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-4">
        <div className="min-w-0">
          <CardTitle>Search terms</CardTitle>
          <p className="mt-1.5 max-w-xl text-[12.5px] leading-relaxed text-muted">
            The other end of the same problem: not the file your map is handed, but the sentence
            somebody types above it. Every term comes with the parse it is supposed to receive —
            which places, resolved to real coordinates, and which window, resolved to instants — so
            you can assert on the answer instead of squinting at it.
          </p>
          {clean ? (
            <p className="mt-2 max-w-xl text-[12.5px] leading-relaxed text-mint-ink">
              One unambiguous place, a window that resolves, one correct answer. Every one of these
              should work. Run them before the awkward ones, not after.
            </p>
          ) : (
            <p className="mt-2 max-w-xl text-[12.5px] leading-relaxed text-muted">
              {covered.size} of {QUIRKS.length} quirks in this set, dealt one per term — so a set of{" "}
              {QUIRKS.length} is {QUIRKS.length} different problems rather than {QUIRKS.length} rolls
              of the same dice.
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div role="radiogroup" aria-label="Term set contents" className="flex gap-1.5">
            {[
              { value: false, label: "Awkward", hint: "One thing hard about each" },
              { value: true, label: "Clean", hint: "Well-formed queries — the control set" },
            ].map((option) => (
              <button
                key={String(option.value)}
                type="button"
                role="radio"
                aria-checked={option.value === clean}
                title={option.hint}
                onClick={() => setClean(option.value)}
                className={[
                  "rounded-full border px-3 py-1.5 text-[11.5px] transition-colors",
                  option.value === clean
                    ? "border-ink bg-ink text-white"
                    : "border-line-strong bg-white text-muted hover:border-dim hover:text-ink",
                ].join(" ")}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div role="radiogroup" aria-label="How many terms" className="flex gap-1.5">
            {SIZES.map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={option === count}
                title={
                  option === QUIRKS.length
                    ? "One of every quirk in the catalogue"
                    : `${option} terms`
                }
                onClick={() => setCount(option)}
                className={[
                  "rounded-full border px-3 py-1.5 font-mono text-[11.5px] tabular-nums transition-colors",
                  option === count
                    ? "border-ink bg-ink text-white"
                    : "border-line-strong bg-white text-muted hover:border-dim hover:text-ink",
                ].join(" ")}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line px-4 py-3">
        <label className="flex items-center gap-2">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.13em] text-dim">
            near
          </span>
          <select
            value={near}
            onChange={(e) => setNear(e.target.value)}
            aria-label="Build terms around a place"
            className="rounded-full border border-line-strong bg-white px-3 py-1.5 font-mono text-[11.5px] text-ink outline-none hover:border-dim"
          >
            {NEARBY.map((place) => (
              <option key={place.id} value={place.id}>
                {place.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.13em] text-dim">
            as
          </span>
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as TermFormatId)}
            aria-label="Download format"
            className="rounded-full border border-line-strong bg-white px-3 py-1.5 font-mono text-[11.5px] text-ink outline-none hover:border-dim"
          >
            {TERM_FORMATS.map((meta) => (
              <option key={meta.id} value={meta.id} title={meta.blurb}>
                {meta.label}
                {meta.groundTruth ? "" : " — queries only"}
              </option>
            ))}
          </select>
        </label>

        <span
          className="font-mono text-[11px] tabular-nums text-muted"
          title={
            chosen === DEFAULT_PROFILE
              ? "The generic export has no subject to search for, so these are about devices. Pick a data type in the sidebar and the terms follow it."
              : "The noun comes from the data type in the sidebar"
          }
        >
          {set.terms.length} terms about {subject.plural} · {formatBytes(file.bytes)}
        </span>

        <div className="ml-auto flex gap-2">
          <Button onClick={copy} confirmed={copied} confirmLabel="Copied">
            Copy
          </Button>
          <Button
            variant="primary"
            onClick={download}
            confirmed={saved}
            confirmLabel="Saved"
            title={file.filename}
          >
            Download .{TERM_FORMATS.find((f) => f.id === format)?.ext}
          </Button>
        </div>
      </div>

      {/* A fixture is only worth something if it really is what it says it is,
          so the checks are shown rather than assumed — exactly as they are on a
          control file. A failure here is a bug in Null Island. */}
      {!report.passed && (
        <p className="border-t border-line px-4 py-3 text-[12px] text-cat-encoding">
          This set did not pass its own check —{" "}
          {report.checks
            .filter((c) => !c.ok)
            .map((c) => `${c.label.toLowerCase()} (${c.detail})`)
            .join("; ")}
          . That is a bug in Null Island, not in your settings. Please report it.
        </p>
      )}

      <ul className="scroll-thin max-h-[460px] overflow-auto border-t border-line">
        {set.terms.map((term) => (
          <Row key={term.id} term={term} />
        ))}
      </ul>

      <p className="border-t border-line px-4 py-3 font-mono text-[10.5px] leading-relaxed text-dim">
        Relative windows are anchored to {set.stats.anchor}, not to the clock, so an expected answer
        that is right today is still right next month. Categories:{" "}
        {(Object.keys(DOT) as QuirkCategory[]).map((category, i) => (
          <span key={category} className="whitespace-nowrap">
            {i > 0 && " · "}
            <span
              className={`mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle ${DOT[category]}`}
              aria-hidden
            />
            {QUIRK_CATEGORY_LABELS[category]}
          </span>
        ))}
        .
      </p>
    </Card>
  );
}
