import { group } from "../format";
import type { SearchTerm, TermSet } from "./terms";
import type { CleanCheck, CleanReport } from "../clean";

/**
 * The control set, checked rather than promised.
 *
 * With no quirks selected the generator emits well-formed queries — that is the
 * whole design of the planner, and every quirk is a transform on top of it. But
 * a term set is worse than useless if it quietly lies about itself: a "clean"
 * query that is secretly ambiguous sends you hunting a bug in your parser that
 * lives in your test data, and a term whose expected parse names a place its own
 * text does not contain will fail every implementation there will ever be.
 *
 * So the checks run in both directions. On a control set they establish that
 * nothing is wrong. On any set at all they establish the thing that has to hold
 * whatever the quirks are: that the expectation describes the query that was
 * actually written.
 *
 * A failing check is a bug in Null Island, and it says so in those words.
 */

/**
 * Control, zero-width and bidi characters — nothing a clean query contains.
 *
 * Written as code-point ranges rather than a character class, because a regex
 * with literal control characters in it is unreadable, unreviewable, and the
 * kind of thing a linter is right to object to.
 */
const INVISIBLE_RANGES: Array<[number, number]> = [
  [0x00, 0x08],
  [0x0b, 0x1f],
  [0x7f, 0x9f],
  [0xad, 0xad],
  [0x200b, 0x200f],
  [0x202a, 0x202e],
  [0x2060, 0x2060],
  [0xfeff, 0xfeff],
];

function hasInvisible(text: string): boolean {
  for (const char of text) {
    const code = char.codePointAt(0) as number;
    if (INVISIBLE_RANGES.some(([from, to]) => code >= from && code <= to)) return true;
  }
  return false;
}

/**
 * Does the query text really contain what the expectation says it does?
 *
 * This is the check that matters on every set, quirked or not. A term is a
 * promise about a string; if the string does not carry the place the promise
 * names, the fixture is wrong rather than hard, and no reader can ever pass it.
 */
function describesItsOwnText(term: SearchTerm): boolean {
  for (const place of term.expect.places) {
    if (!place.typed) return false;
    if (!term.text.includes(place.typed)) return false;
  }
  const expression = term.expect.time.expression;
  if (expression && !term.text.includes(expression)) return false;
  return true;
}

function finish(checks: CleanCheck[], examined: number): CleanReport {
  return { checks, passed: checks.every((c) => c.ok), examined, sampled: false };
}

export function inspectTerms(set: TermSet): CleanReport {
  const checks: CleanCheck[] = [];
  const terms = set.terms;

  const mismatched = terms.filter((t) => !describesItsOwnText(t));
  checks.push({
    label: "Every expectation matches its own query text",
    ok: mismatched.length === 0,
    detail: mismatched.length
      ? `${group(mismatched.length)} describe a place or a window their text does not contain (${mismatched
          .slice(0, 3)
          .map((t) => t.id)
          .join(", ")})`
      : `${group(terms.length)} checked, every named place and window present verbatim`,
  });

  // These coordinates reach a bounding-box assertion in somebody's test suite,
  // so an off-world one fails their test and looks like their bug.
  const places = terms.reduce((n, t) => n + t.expect.places.length, 0);
  const offWorld = terms.flatMap((t) =>
    t.expect.places
      .flatMap((p) => p.candidates)
      .filter(
        (c) =>
          !Number.isFinite(c.lon) ||
          !Number.isFinite(c.lat) ||
          Math.abs(c.lon) > 180 ||
          Math.abs(c.lat) > 90,
      ),
  );
  checks.push({
    label: "Every coordinate is inside the WGS84 domain",
    ok: offWorld.length === 0,
    detail: offWorld.length
      ? `${group(offWorld.length)} outside the 180 / 90 degree domain`
      : `${group(places)} places, all in range`,
  });

  const badBoxes = terms.filter((t) => {
    const box = t.expect.bbox;
    return !!box && (box[0] > box[2] || box[1] > box[3]);
  });
  checks.push({
    label: "Every bounding box has its corners the right way round",
    ok: badBoxes.length === 0,
    detail: badBoxes.length ? `${group(badBoxes.length)} inverted` : "min below max on both axes",
  });

  const bounded = terms.filter((t) => t.expect.time.startsAt);
  const badWindows = terms.filter((t) => {
    const { startsAt, endsAt, empty } = t.expect.time;
    if (!startsAt || !endsAt) return false;
    // An inverted range is a quirk, and where one was asked for it is the whole
    // point — so it only counts against the set when nothing declared it.
    return Date.parse(endsAt) < Date.parse(startsAt) && !empty;
  });
  checks.push({
    label: "Every time window ends after it starts",
    ok: badWindows.length === 0,
    detail: badWindows.length
      ? `${group(badWindows.length)} inverted without being declared empty`
      : `${group(bounded.length)} bounded windows, all forward`,
  });

  if (!set.stats.clean) return finish(checks, terms.length);

  // Everything below is a claim about a control set specifically: that these are
  // the easy ones, and that a parser failing them has a real bug.
  const blank = terms.filter((t) => !t.text.trim());
  checks.push({
    label: "No empty queries",
    ok: blank.length === 0,
    detail: blank.length ? `${group(blank.length)} blank` : `${group(terms.length)} non-blank`,
  });

  const invisible = terms.filter((t) => hasInvisible(t.text));
  checks.push({
    label: "Nothing invisible in the text",
    ok: invisible.length === 0,
    detail: invisible.length
      ? `${group(invisible.length)} carry a control, zero-width or bidi character`
      : "no control, zero-width or bidi characters",
  });

  const unresolvable = terms.filter((t) => !t.expect.resolvable);
  checks.push({
    label: "Every place resolves to somewhere",
    ok: unresolvable.length === 0,
    detail: unresolvable.length
      ? `${group(unresolvable.length)} name a place that does not exist`
      : `${group(terms.filter((t) => t.expect.places.length).length)} terms with a place, all resolvable`,
  });

  const ambiguous = terms.filter((t) => t.expect.ambiguous);
  checks.push({
    label: "No place has more than one candidate",
    ok: ambiguous.length === 0,
    detail: ambiguous.length
      ? `${group(ambiguous.length)} could mean two different places (${ambiguous
          .slice(0, 3)
          .map((t) => t.id)
          .join(", ")})`
      : "every named place settles on one answer",
  });

  const unanswerable = terms.filter((t) => t.expect.empty);
  checks.push({
    label: "Every query has an answer that can be non-empty",
    ok: unanswerable.length === 0,
    detail: unanswerable.length
      ? `${group(unanswerable.length)} cannot match anything whatever the data holds`
      : "no future windows and no inverted ranges",
  });

  const quirked = terms.filter((t) => t.quirks.length);
  checks.push({
    label: "Nothing was applied to any of them",
    ok: quirked.length === 0,
    detail: quirked.length
      ? `${group(quirked.length)} carry a quirk despite being generated clean`
      : `${group(terms.length)} terms, no quirks`,
  });

  return finish(checks, terms.length);
}
