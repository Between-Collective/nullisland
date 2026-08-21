/* eslint-disable */
/**
 * Corpus soak: generate a set at full intensity, and try hard to break it.
 *
 * `verify.ts` asserts the properties the generator is supposed to have. This
 * asks a blunter question of a whole corpus at once — is every one of these
 * forty-three terms a thing a person could have typed, and does it describe
 * itself honestly — because at 100% intensity quirks stack, and stacked quirks
 * interact in ways no single-quirk assertion sees.
 *
 *   npm run soak -w nullisland-core                  five new seeds
 *   npm run soak -w nullisland-core -- <seed> ...    those seeds, in order
 *
 * A failure prints the term, the quirks on it, and what is wrong, because the
 * point is to fix the generator rather than to score it.
 */
import { generateTerms } from "../src/search/terms";
import { inspectTerms } from "../src/search/clean";
import { CLAIMED_BY, getQuirk, QUIRKS } from "../src/search/quirks";
import { SUBJECTS } from "../src/search/phrasing";
import { PLACES } from "../src/search/places";
import { DEFAULT_ANCHOR } from "../src/search/time";
import { writeTerms } from "../src/search/write";
import { randomSeed } from "../src/rng";
import type { SearchTerm } from "../src/search/terms";

interface Finding {
  check: string;
  term: string;
  quirks: string[];
  detail: string;
}

/** Quirks whose whole point is to produce text that reads wrong. */
const DELIBERATELY_MANGLED = new Set([
  "empty", "overlong", "control-chars", "bidi-override", "zero-width",
  "homoglyph", "mojibake", "nbsp", "prompt-injection", "rambling", "filler",
  "misspelled-place", "misspelled-subject", "keyword-only", "other-language",
  "smart-quotes", "emoji", "casing", "bare-coordinates",
]);

const untouched = (t: SearchTerm) => t.quirks.every((q) => !DELIBERATELY_MANGLED.has(q));

function inspectCorpus(terms: SearchTerm[], jsonl: string): Finding[] {
  const out: Finding[] = [];
  const add = (check: string, t: SearchTerm, detail: string) =>
    out.push({ check, term: t.text.slice(0, 96), quirks: t.quirks, detail });

  // Every line has to stand alone: a harness reads this one line at a time.
  const lines = jsonl.trim().split("\n");
  if (lines.length !== terms.length) {
    out.push({ check: "jsonl line count", term: "", quirks: [], detail: `${lines.length} lines for ${terms.length} terms` });
  }
  lines.forEach((line, i) => {
    try {
      const row = JSON.parse(line);
      if (typeof row.query !== "string" || !row.expect) throw new Error("shape");
    } catch {
      out.push({ check: "jsonl parses", term: line.slice(0, 96), quirks: [], detail: `line ${i + 1}` });
    }
  });

  for (const t of terms) {
    const text = t.text;

    // ── it has to be a sentence a person could have typed ──
    if (untouched(t)) {
      const doubled = /\b(\w+) \1\b/i.exec(text);
      if (doubled) add("repeated word", t, `"${doubled[0]}"`);

      const prepositions = /\b(in|at|near|on|from|to|of) (in|at|near|on|of)\b/i.exec(text);
      if (prepositions) add("stacked prepositions", t, `"${prepositions[0]}"`);

      // "how many everything", "which all data were" — a quantifier in front of
      // a mass noun, or plural agreement against a singular one.
      const agreement = /\b(how many|number of|count) (everything|anything|all data|any kind of thing)\b/i.exec(text);
      if (agreement) add("quantifier on a mass noun", t, `"${agreement[0]}"`);
      const wereAgreement = /\b(everything|anything|all data|any kind of thing) (were|are)\b/i.exec(text);
      if (wereAgreement) add("plural verb on a mass noun", t, `"${wereAgreement[0]}"`);

      if (/\s{2,}/.test(text)) add("collapsed spacing", t, "two or more spaces in a row");
      if (text !== text.trim()) add("untrimmed", t, "leading or trailing whitespace");
      if (/\b(undefined|null|NaN|\[object)/.test(text)) add("leaked value", t, "a JS value reached the text");
    }

    // ── it has to describe itself, whatever was done to it ──
    for (const s of t.expect.subjects) {
      if (!text.includes(s.typed)) add("kind not in text", t, `claims "${s.typed}"`);
    }
    for (const p of t.expect.places) {
      if (!text.includes(p.typed)) add("place not in text", t, `claims "${p.typed}"`);
    }
    if (t.expect.time.expression && !text.includes(t.expect.time.expression)) {
      add("window not in text", t, `claims "${t.expect.time.expression}"`);
    }

    // ── the expectation has to be internally coherent ──
    if (t.expect.anySubject && t.expect.subjects.length) {
      add("names a kind and no kind", t, `${t.expect.subjects.length} kinds with anySubject`);
    }
    for (const p of t.expect.places) {
      if (p.candidates.length > 1 && p.id !== null) add("ambiguous but settled", t, `${p.typed} -> ${p.id}`);
      if (p.id && !p.bbox) add("resolved without a box", t, p.typed);
      if (p.bbox && (p.bbox[0] > p.bbox[2] || p.bbox[1] > p.bbox[3])) add("inverted box", t, p.typed);
      if (p.lon !== null && (Math.abs(p.lon) > 180 || Math.abs(p.lat as number) > 90)) {
        add("off-world", t, `${p.lon}, ${p.lat}`);
      }
    }
    const { startsAt, endsAt, empty } = t.expect.time;
    if ((startsAt === null) !== (endsAt === null)) add("half a window", t, `${startsAt} .. ${endsAt}`);
    if (startsAt && endsAt && Date.parse(endsAt) < Date.parse(startsAt) && !empty) {
      add("inverted window, undeclared", t, `${startsAt} .. ${endsAt}`);
    }

    // ── it has to demonstrate everything it reports ──
    // Two quirks deciding the same thing means the second overwrote the first,
    // and the term is reporting work that is no longer in it.
    {
      const claimed = new Map<string, string[]>();
      for (const id of t.quirks) {
        const claims = getQuirk(id)?.claims;
        if (claims) claimed.set(claims, [...(claimed.get(claims) ?? []), id]);
      }
      for (const [what, ids] of claimed) {
        if (ids.length > 1) add(`two quirks decide the ${what}`, t, ids.join(" + "));
      }
    }

    // A word with no plural cannot follow a quantifier. The countable forms go
    // first: "mobile" is a mass alias and "mobile devices" is a countable one,
    // and the short one sits inside the long one.
    // Not when the noun was deliberately mangled: "how many mobile ddevices" is
    // a misspelling of a countable phrase, and the strip below cannot see
    // through the typo to know that.
    if ((untouched(t) || t.quirks.includes("subject-synonym")) && !t.quirks.includes("misspelled-subject")) {
      const esc = (w: string) => w.replace(/[.*+?^$()|[\]\\]/g, "\\$&");
      const countable = Object.values(SUBJECTS)
        .flatMap((s) => [s.plural, ...(s.aliases ?? [])])
        .sort((a, b) => b.length - a.length);
      const stripped = countable.reduce(
        (acc, word) => acc.replace(new RegExp(`\\b${esc(word)}\\b`, "gi"), "\u0000"),
        text,
      );
      const mass = Object.values(SUBJECTS).flatMap((s) => s.massAliases ?? []);
      if (mass.length) {
        const pattern = new RegExp(
          `\\b(how many|number of|count|were there any|did any|which)\\s+(${mass.map(esc).join("|")})\\b`,
          "i",
        );
        const hit = pattern.exec(stripped);
        if (hit) add("quantifier on a word with no plural", t, `"${hit[0]}"`);
      }
    }

    // Politeness that does not agree with the sentence after it: "would you
    // mind showing me show me devices", "I need you to devices".
    if (/\b(showing me|show me|see|after|get)\s+(show me|list|find|export|count|give me|break down|compare)\b/i.test(text)) {
      add("polite phrase doubles the verb", t, /.{0,30}(showing me|show me)\s+(show me|list|find|export|count|give me|break down|compare).{0,10}/i.exec(text)?.[0] ?? "");
    }
    // "would you mind showing me" is the noun-taking form and is correct, so
    // the lookahead has to let its "would you" prefix past.
    if (/\b(can you please|could you|I need you to|would you(?! mind)|please)\s+(?!show|list|find|export|count|give|break|compare|which|how|number|were|did|is|what|where|mind)[a-z]/i.test(text)) {
      add("polite phrase with no verb after it", t, /.{0,26}(can you please|could you|I need you to|would you)\s+\S+/i.exec(text)?.[0] ?? "");
    }

    // A container the place is not in — a stale qualifier left by a swap.
    for (const p of t.expect.places) {
      if (!p.id || !p.within.length) continue;
      const after = text.slice(text.indexOf(p.typed) + p.typed.length, text.indexOf(p.typed) + p.typed.length + 40);
      const claimed = /^ in ([A-ZÀ-Þ][\w'-]*(?: [A-ZÀ-Þ][\w'-]*)*)/.exec(after)?.[1];
      // Only a real place is a container: "in August 2023" is a window, and it
      // capitalises exactly like one.
      const isPlace = claimed && PLACES.some((g) => g.name === claimed);
      if (claimed && isPlace && !p.within.includes(claimed) && !t.quirks.includes("wrong-container")) {
        add("qualified by a place it is not in", t, `${p.name} in ${claimed}, but it is in ${p.within.join(", ") || "nothing"}`);
      }
    }

    // A query claiming no kind must not name one anyway — including in
    // translation, where the noun used to fall back to the English generic.
    if (t.expect.anySubject) {
      const nouns = Object.values(SUBJECTS).flatMap((s) => [s.plural, ...(s.aliases ?? [])]);
      const named = nouns.find((n) => new RegExp(`\\b${n.replace(/[.*+?^$()|[\]\\]/g, "\\$&")}\\b`, "i").test(text));
      if (named) add("names a kind while claiming none", t, `"${named}"`);
    }

    // Punctuation that arrived in the wrong order.
    // Not a full stop: "México D.F., no rush" is an abbreviation followed by a
    // comma, which is how it is written.
    if (/[?!][,;]/.test(text)) add("punctuation out of order", t, /.{0,14}[?!][,;].{0,14}/.exec(text)?.[0] ?? "");
    if (/\s+[,.?]/.test(text) && untouched(t)) add("space before punctuation", t, "");

    // ── it has to report what it did ──
    if (t.quirks.length && !t.notes.length) add("applied without saying what", t, t.quirks.join(","));
    if (new Set(t.quirks).size !== t.quirks.length) add("quirk reported twice", t, t.quirks.join(","));
    for (const s of t.skipped) {
      if (t.quirks.includes(s.id)) add("both applied and skipped", t, s.id);
      if (!s.why) add("skipped without a reason", t, s.id);
    }
    if (!t.quirks.includes("empty") && !text.trim()) add("blank without the quirk for it", t, "");
  }
  return out;
}

function round(seed: string): { seed: string; findings: Finding[]; quirks: number; terms: number } {
  const set = generateTerms({
    seed,
    count: 43,
    profile: "mobile-location-pings",
    quirks: [],
    // What the shared link asks for: every term carrying as much as it can.
    intensity: 1,
    near: "anywhere",
    anchor: DEFAULT_ANCHOR,
  });
  const jsonl = writeTerms(set, "jsonl", seed).data as string;
  const findings = inspectCorpus(set.terms, jsonl);
  const report = inspectTerms(set);
  for (const check of report.checks.filter((c) => !c.ok)) {
    findings.push({ check: `self-check: ${check.label}`, term: "", quirks: [], detail: check.detail });
  }
  return { seed, findings, quirks: set.stats.quirks.length, terms: set.terms.length };
}

const seeds = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const runs = seeds.length ? seeds : Array.from({ length: 5 }, () => randomSeed());

let failed = 0;
console.log(`\ncorpus soak · ${runs.length} rounds · 43 terms · 100% intensity`);
console.log(`claims enforced: ${Object.entries(CLAIMED_BY).map(([k, v]) => `${k}(${v.length})`).join(" ")}\n`);
for (const seed of runs) {
  const result = round(seed);
  const status = result.findings.length ? "FAIL" : " ok ";
  console.log(`${status}  ${seed.padEnd(28)} ${result.terms} terms · ${result.quirks}/${QUIRKS.length} quirks · ${result.findings.length} findings`);
  if (result.findings.length) {
    failed++;
    const byCheck = new Map<string, Finding[]>();
    for (const f of result.findings) byCheck.set(f.check, [...(byCheck.get(f.check) ?? []), f]);
    for (const [check, list] of byCheck) {
      console.log(`        ${check} (${list.length})`);
      for (const f of list.slice(0, 3)) {
        console.log(`          ${JSON.stringify(f.term)}`);
        console.log(`            [${f.quirks.join(",")}] ${f.detail}`);
      }
    }
  }
}
console.log(`\n${runs.length - failed}/${runs.length} corpora clean\n`);
process.exit(failed ? 1 : 0);
