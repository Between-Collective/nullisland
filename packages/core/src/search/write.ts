import { utf8 } from "../bytes";
import { normaliseSeed } from "../rng";
import { group } from "../format";
import { SITE_HOST, SITE_URL } from "../site";
import { getQuirk, QUIRK_CATEGORY_LABELS, QUIRK_CATEGORY_ORDER, QUIRKS } from "./quirks";
import type { SearchTerm, TermSet } from "./terms";
import type { FilePayload } from "../types";

/**
 * Writing a term set out.
 *
 * Five containers, for five different things you might do with it. JSONL is the
 * one a test suite reads; plain text is the one you paste into a search box by
 * hand; the Markdown is the one you hand to a reviewer, or to an agent, so it
 * can tell whether the answer it got was the right one.
 *
 * Every one of them carries the expected parse except `txt`, which cannot — and
 * which says so in the file it writes rather than leaving you to notice.
 */

export type TermFormatId = "jsonl" | "json" | "csv" | "txt" | "md";

export interface TermFormatMeta {
  id: TermFormatId;
  label: string;
  ext: string;
  mime: string;
  /** What this container is for, in one line. */
  blurb: string;
  /** False when the container cannot carry the expected parse. */
  groundTruth: boolean;
}

export const TERM_FORMATS: TermFormatMeta[] = [
  {
    id: "jsonl",
    label: "JSONL",
    ext: "jsonl",
    mime: "application/x-ndjson",
    blurb: "One term per line, with its expected parse. What a test suite reads.",
    groundTruth: true,
  },
  {
    id: "json",
    label: "JSON",
    ext: "json",
    mime: "application/json",
    blurb: "The whole set as one document, with the notes and the anchor.",
    groundTruth: true,
  },
  {
    id: "csv",
    label: "CSV",
    ext: "csv",
    mime: "text/csv",
    blurb: "Flattened to columns for a spreadsheet or a harness that isn't JS.",
    groundTruth: true,
  },
  {
    id: "txt",
    label: "Plain text",
    ext: "txt",
    mime: "text/plain",
    blurb: "The queries and nothing else, for pasting into a search box.",
    groundTruth: false,
  },
  {
    id: "md",
    label: "Markdown",
    ext: "md",
    mime: "text/markdown",
    blurb: "A readable report: each term, what is hard about it, what to expect.",
    groundTruth: true,
  },
];

export function getTermFormat(id: TermFormatId): TermFormatMeta {
  return TERM_FORMATS.find((f) => f.id === id) ?? TERM_FORMATS[0];
}

/* ── JSON shapes ─────────────────────────────────────────────────────────── */

function termToJson(term: SearchTerm): Record<string, unknown> {
  return {
    id: term.id,
    query: term.text,
    clean: term.clean,
    quirks: term.quirks,
    ...(term.skipped.length ? { skipped: term.skipped } : {}),
    expect: {
      intent: term.expect.intent,
      // Spelled out even when there is one, so a caller never has to know that a
      // bare string would have meant "exactly one kind".
      subjects: term.expect.subjects,
      anySubject: term.expect.anySubject,
      dataType: term.expect.profile,
      resolvable: term.expect.resolvable,
      ambiguous: term.expect.ambiguous,
      empty: term.expect.empty,
      needsLocation: term.expect.needsLocation,
      antimeridian: term.expect.antimeridian,
      bbox: term.expect.bbox,
      places: term.expect.places.map((p) => ({
        typed: p.typed,
        resolvesTo: p.id,
        name: p.name,
        kind: p.kind,
        lon: p.lon,
        lat: p.lat,
        bbox: p.bbox,
        country: p.country,
        within: p.within,
        negated: p.negated,
        // Spelled out even when there is one, so a caller never has to know
        // that a missing key would have meant "unambiguous".
        candidates: p.candidates,
        ...(p.note ? { note: p.note } : {}),
      })),
      time: {
        kind: term.expect.time.kind,
        expression: term.expect.time.expression,
        startsAt: term.expect.time.startsAt,
        endsAt: term.expect.time.endsAt,
        ...(term.expect.time.alternate ? { alternate: term.expect.time.alternate } : {}),
        ...(term.expect.time.empty ? { empty: true } : {}),
      },
    },
    notes: term.notes,
    seed: term.seed,
  };
}

/* ── CSV ─────────────────────────────────────────────────────────────────── */

/** RFC 4180. A query is user input on its way into a spreadsheet; quote it. */
function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  const needsQuotes =
    text.includes(",") ||
    text.includes('"') ||
    text.includes("\n") ||
    text.includes("\r") ||
    text !== text.trim();
  return needsQuotes ? `"${text.replace(/"/g, '""')}"` : text;
}

const CSV_HEADER = [
  "id",
  "query",
  "clean_query",
  "quirks",
  "intent",
  "subjects_typed",
  "subjects_resolved",
  "data_types",
  "places_typed",
  "places_resolved",
  "place_ids",
  "lon",
  "lat",
  "bbox",
  "candidates",
  "time_expression",
  "time_starts_at",
  "time_ends_at",
  "resolvable",
  "ambiguous",
  "expect_empty",
  "needs_location",
  "notes",
];

function writeCsv(set: TermSet): string {
  const lines = [CSV_HEADER.join(",")];
  for (const term of set.terms) {
    const places = term.expect.places;
    const first = places.find((p) => p.id) ?? places[0];
    lines.push(
      [
        term.id,
        term.text,
        term.clean,
        term.quirks.join(" "),
        term.expect.intent,
        term.expect.anySubject ? "(any)" : term.expect.subjects.map((s) => s.typed).join(" | "),
        term.expect.anySubject ? "(any)" : term.expect.subjects.map((s) => s.canonical).join(" | "),
        term.expect.subjects.map((s) => s.dataType).join(" | "),
        places.map((p) => p.typed).join(" | "),
        places.map((p) => p.name ?? "(unresolvable)").join(" | "),
        places.map((p) => p.id ?? "").join(" | "),
        first?.lon ?? "",
        first?.lat ?? "",
        term.expect.bbox ? term.expect.bbox.join(" ") : "",
        // The count rather than the names: one column cannot hold the answer to
        // "which Cambridge", and pretending otherwise would be worse than a
        // number pointing at the JSONL.
        places.map((p) => p.candidates.length).join(" | "),
        term.expect.time.expression,
        term.expect.time.startsAt ?? "",
        term.expect.time.endsAt ?? "",
        term.expect.resolvable,
        term.expect.ambiguous,
        term.expect.empty,
        term.expect.needsLocation,
        term.notes.join(" "),
      ]
        .map(cell)
        .join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

/* ── plain text ──────────────────────────────────────────────────────────── */

function writeTxt(set: TermSet): string {
  const lines = [
    `# ${set.terms.length} search terms from Null Island (${SITE_HOST}).`,
    "# This container holds the queries and nothing else — no expected places, no",
    "# windows, no candidates. Use the JSONL or CSV if you want to assert rather",
    "# than eyeball.",
    "#",
    `# Relative windows are anchored to ${set.stats.anchor}.`,
    "",
  ];
  for (const term of set.terms) {
    // A blank query is still a test case, and a blank line in a file is not.
    lines.push(term.text.trim() ? term.text.replace(/\r?\n/g, " ") : "(empty query)");
  }
  return `${lines.join("\n")}\n`;
}

/* ── Markdown ────────────────────────────────────────────────────────────── */

function bullet(term: SearchTerm): string[] {
  const out: string[] = [];
  const places = term.expect.places;

  if (!places.length) {
    out.push("- No place in the query. There is no area to filter on.");
  }
  for (const place of places) {
    if (!place.candidates.length) {
      out.push(`- \`${place.typed}\` resolves to nothing. Expect zero rows, and a reason.`);
      continue;
    }
    if (!place.id) {
      const list = place.candidates.map((c) => `**${c.name}** (${c.country}, ${c.lat}, ${c.lon})`);
      out.push(
        `- \`${place.typed}\` is ${place.candidates.length} places — ${list.join(" or ")}. ` +
          "No single one is the right answer; the first is the biggest, which is the tie-break most " +
          "stacks use and the one to state out loud rather than apply quietly.",
      );
      continue;
    }
    const where = place.within.length ? ` (${place.within.join(", ")})` : "";
    const lead = place.negated ? "excluded" : "included";
    out.push(
      `- \`${place.typed}\` → **${place.name}**${where}, ${place.lat}, ${place.lon} — ${lead}` +
        (place.candidates.length > 1
          ? `, and ${place.candidates.length - 1} other place${place.candidates.length > 2 ? "s" : ""} answer${place.candidates.length === 2 ? "s" : ""} to the same name: ${place.candidates
              .filter((c) => c.id !== place.id)
              .map((c) => `${c.name} (${c.country})`)
              .join(", ")}`
          : ""),
    );
  }

  const time = term.expect.time;
  if (time.kind !== "none") {
    out.push(
      time.startsAt
        ? `- \`${time.expression}\` → ${time.startsAt} to ${time.endsAt}` +
            (time.alternate ? `, or ${time.alternate.startsAt} to ${time.alternate.endsAt} ${time.alternate.why}` : "")
        : `- \`${time.expression}\` bounds nothing. Any window applied here was invented.`,
    );
  }
  if (term.expect.needsLocation) {
    out.push(
      "- **No answer without the caller's position.** Ask for it, or use the one you were given — " +
        "and say which. A silent default centres a user in Lisbon on London.",
    );
  }
  if (term.expect.empty) {
    out.push("- **The correct answer is zero rows**, and the reason is part of the answer.");
  }
  return out;
}

function writeMd(set: TermSet): string {
  const quirked = set.terms.filter((t) => t.quirks.length).length;
  const lines: string[] = [
    set.stats.clean ? "# Null Island clean search terms" : "# Null Island search terms",
    "",
    `${group(set.terms.length)} terms · ${group(set.stats.quirks.length)} distinct quirks · ` +
      `subject: ${set.stats.profile}`,
    "",
    `Generated by Null Island (${SITE_URL}). These are the search terms your users type, with the`,
    "parse each one is supposed to receive written down beside it. None of it is real user data.",
    "",
    "## How to use this",
    "",
    ...(set.stats.clean
      ? [
          "Every term below is well formed: one unambiguous place, a window that resolves, one correct",
          "answer. **All of them should work.** Anything that fails here has found a bug in the search",
          "stack rather than in the query, and there is no point looking at the awkward ones until these",
          "pass.",
        ]
      : [
          "Run each query through your search the way a user would, and compare what comes back against the",
          "expected parse below it. The places are real, the coordinates are real, and the windows are",
          "resolved to instants — so \"it returned something\" is not a pass and \"it returned nothing\" is",
          "not always a fail.",
          "",
          "Three failures are worth more attention than the rest, because all three look like success:",
          "a query with two possible places answered confidently with one, a window read as the other",
          "defensible reading, and an unresolvable place answered with an empty area rather than an",
          "explanation.",
        ]),
    "",
    `Relative expressions are anchored to **${set.stats.anchor}** rather than to the clock, so the`,
    "expected answers are still true tomorrow.",
    "",
    // The anchor already has a line of its own above, so its note is dropped
    // here rather than printed twice.
    ...set.notes.filter((n) => !n.startsWith("Relative windows are anchored")).map((n) => `> ${n}`),
    "",
    "## Terms",
    "",
  ];

  for (const term of set.terms) {
    const labels = term.quirks.map((id) => getQuirk(id)?.label ?? id);
    lines.push(`### ${term.id}. \`${term.text.trim() || "(empty)"}\``, "");
    if (labels.length) lines.push(`Quirks: ${labels.join(", ")}`, "");
    else lines.push("Nothing wrong with this one — it is a control case.", "");
    lines.push(
      `Intent: ${term.expect.intent} · Asks for: ` +
        (term.expect.anySubject
          ? "everything — no kind of thing named"
          : term.expect.subjects
              .map((s) => (s.typed === s.canonical ? s.canonical : `${s.typed} (${s.canonical})`))
              .join(" + ")),
    );
    if (term.clean.trim() && term.clean !== term.text) {
      lines.push(`Written cleanly, this is: \`${term.clean.trim()}\``);
    }
    lines.push("", "Expected parse:", ...bullet(term));
    if (term.notes.length) {
      lines.push("", "What a correct search does with this:");
      for (const note of term.notes) lines.push(`- ${note}`);
    }
    if (term.skipped.length) {
      lines.push("", "Asked for and not applied:");
      for (const skip of term.skipped) lines.push(`- \`${skip.id}\` — ${skip.why}.`);
    }
    lines.push("");
  }

  if (!set.stats.clean) {
    lines.push(
      "## Coverage",
      "",
      `${group(quirked)} of ${group(set.terms.length)} terms carry at least one quirk. By category:`,
      "",
    );
    for (const category of QUIRK_CATEGORY_ORDER) {
      const ids = QUIRKS.filter((q) => q.category === category).map((q) => q.id);
      const hit = ids.filter((id) => set.stats.quirks.includes(id));
      lines.push(
        `- **${QUIRK_CATEGORY_LABELS[category]}** — ${hit.length} of ${ids.length}` +
          (hit.length < ids.length
            ? `; not in this set: ${ids.filter((id) => !hit.includes(id)).join(", ")}`
            : ""),
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

/* ── the payload ─────────────────────────────────────────────────────────── */

export interface TermFile extends FilePayload {
  format: TermFormatId;
  terms: number;
}

export function writeTerms(set: TermSet, format: TermFormatId, rawSeed: string): TermFile {
  const meta = getTermFormat(format);
  // The seed reaches a filename from here, so it is normalised at the point the
  // filename is built rather than trusted to have been normalised by whoever
  // called — a seed of `../../etc/passwd` is otherwise a path, not a name.
  const seed = normaliseSeed(rawSeed);
  let text: string;

  if (format === "jsonl") {
    text = `${set.terms.map((t) => JSON.stringify(termToJson(t))).join("\n")}\n`;
  } else if (format === "json") {
    text = `${JSON.stringify(
      {
        generator: "Null Island",
        url: SITE_URL,
        seed,
        anchor: set.stats.anchor,
        dataType: set.stats.profile,
        clean: set.stats.clean,
        quirks: set.stats.quirks,
        notes: set.notes,
        terms: set.terms.map(termToJson),
      },
      null,
      2,
    )}\n`;
  } else if (format === "csv") {
    text = writeCsv(set);
  } else if (format === "txt") {
    text = writeTxt(set);
  } else {
    text = writeMd(set);
  }

  return {
    filename: `nullisland-terms-${set.terms.length}-${seed}.${meta.ext}`,
    mime: meta.mime,
    data: text,
    bytes: utf8(text).length,
    format,
    terms: set.terms.length,
  };
}
