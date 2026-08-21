"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Card, CardTitle } from "./ui";
import { downloadFile, formatBytes } from "@/lib/download";
import {
  QUIRKS,
  QUIRK_CATEGORY_LABELS,
  TERM_FORMATS,
  generateTerms,
  getQuirk,
  getSubject,
  inspectTerms,
  writeTerms,
  DEFAULT_ANCHOR,
  type QuirkCategory,
  type SearchTerm,
  type TermSet,
  type TermsConfig,
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
        {/* Only worth a line when it is not the obvious one: a single kind
            called what the schema calls it says nothing you cannot see. */}
        {term.expect.anySubject ? (
          <div>
            <span className="text-cat-attributes">
              no kind named — every layer, or a question back
            </span>
          </div>
        ) : term.expect.subjects.length > 1 ||
          term.expect.subjects.some((s) => s.typed !== s.canonical) ? (
          <div>
            {term.expect.subjects.map((subject, i) => (
              <span key={i}>
                {i > 0 && <span className="text-dim"> + </span>}
                <span className="text-muted">{visible(subject.typed)}</span>
                {" → "}
                <span className="text-mint-ink">{subject.canonical}</span>
                <span className="text-dim"> ({subject.dataType})</span>
              </span>
            ))}
            {term.expect.subjects.length > 1 && (
              <span className="text-cat-attributes"> · union, not intersection</span>
            )}
          </div>
        ) : null}
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

export function TermsPanel({
  seed,
  profile,
  terms,
}: {
  seed: string;
  profile: string;
  terms: TermsConfig;
}) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  // Cheap enough to run on every change — a hundred short strings, no file
  // written until you ask for one — so this needs no button and no debounce.
  const set: TermSet = useMemo(
    () =>
      generateTerms({
        seed,
        count: terms.count,
        profile,
        quirks: terms.quirks,
        intensity: terms.intensity,
        near: terms.near,
        anchor: DEFAULT_ANCHOR,
        clean: terms.clean,
      }),
    [seed, profile, terms],
  );

  const report = useMemo(() => inspectTerms(set), [set]);
  const file = useMemo(() => writeTerms(set, terms.format, seed), [set, terms.format, seed]);
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
  const formatMeta = TERM_FORMATS.find((f) => f.id === terms.format);

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-3.5">
        <div className="min-w-0">
          <CardTitle>
            {set.terms.length.toLocaleString()} terms about {subject.plural}
          </CardTitle>
          <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
            {terms.clean ? (
              <span className="text-mint-ink">
                Well formed, every one of them: one unambiguous place, a window that resolves, one
                correct answer.
              </span>
            ) : (
              <>
                {covered.size} of {QUIRKS.length} quirks, dealt one per term. Each carries the parse
                it should have received.
              </>
            )}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span className="font-mono text-[11px] tabular-nums text-dim">
            {formatBytes(file.bytes)}
          </span>
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
            Download .{formatMeta?.ext}
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

      {/* break-words because the anchor is one unbreakable 24-character token,
          and on a phone it is wider than the column it sits in. */}
      <p className="break-words border-t border-line px-4 py-3 font-mono text-[10.5px] leading-relaxed text-dim">
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
