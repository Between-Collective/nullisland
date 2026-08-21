import type { Rng } from "../rng";

/**
 * When a query means, resolved to an actual window.
 *
 * "Last week" is the part of a search term that looks easiest and is not. It
 * means the previous calendar week to a reporting tool, the last seven days to
 * an analytics API, and something a day out from both if the user is in Tokyo
 * and the server is in UTC. All three are defensible and only one of them is
 * what your user meant, so this module resolves every expression to explicit
 * ISO instants and — where a second reading is genuinely defensible — carries
 * that one alongside as `alternate`.
 *
 * Everything is anchored to a fixed instant rather than to the clock, because
 * a fixture whose expected answer changes overnight is not a fixture.
 */

/** 2024-06-12T14:35:00Z, a Wednesday afternoon. Fixed so seeds stay stable. */
export const DEFAULT_ANCHOR = "2024-06-12T14:35:00.000Z";

export type TimeKind =
  /** No time constraint in the query at all. */
  | "none"
  /** Anchored to now: last week, yesterday, in the past 3 days. */
  | "relative"
  /** A named day or month: on 14 March 2024, in March 2024. */
  | "absolute"
  /** Two endpoints: between 1 and 7 March. */
  | "range"
  /** Ahead of now. A tracking query for it should return nothing. */
  | "future"
  /** Words with no window behind them: recently, lately, a while back. */
  | "vague";

export interface TimeWindow {
  kind: TimeKind;
  /** The words as they appear in the query. Empty when there are none. */
  expression: string;
  /** Inclusive start, ISO 8601 UTC. Null when the query does not bound it. */
  startsAt: string | null;
  /** Exclusive end, ISO 8601 UTC. Null when the query does not bound it. */
  endsAt: string | null;
  /**
   * The other defensible reading of the same words, when there is one — the
   * previous calendar week against the last seven days, 03/04 as April the 3rd
   * against March the 4th. A parser that lands here is not wrong so much as
   * differently right, and the difference is worth failing a test over rather
   * than discovering in a support ticket.
   */
  alternate?: { startsAt: string; endsAt: string; why: string };
  /** True when the window cannot contain anything: a future or inverted range. */
  empty?: boolean;
  /** What a reader gets wrong about this expression. */
  note?: string;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

/** Midnight UTC at the start of the day containing `ms`. */
function startOfDay(ms: number): number {
  return Math.floor(ms / DAY) * DAY;
}

/** Midnight UTC on the Monday of the ISO week containing `ms`. */
function startOfWeek(ms: number): number {
  const day = startOfDay(ms);
  // getUTCDay is 0 for Sunday; ISO weeks start on Monday.
  const weekday = (new Date(day).getUTCDay() + 6) % 7;
  return day - weekday * DAY;
}

function startOfMonth(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

function addMonths(ms: number, months: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, d.getUTCDate());
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** The pool of expressions, each of which knows how to resolve itself. */
type Builder = (anchor: number, rng: Rng) => TimeWindow;

const RELATIVE: Builder[] = [
  (anchor) => {
    const thisWeek = startOfWeek(anchor);
    return {
      kind: "relative",
      expression: "last week",
      startsAt: iso(thisWeek - 7 * DAY),
      endsAt: iso(thisWeek),
      alternate: {
        startsAt: iso(anchor - 7 * DAY),
        endsAt: iso(anchor),
        why: "read as a rolling seven days rather than the previous calendar week",
      },
      note: "Two readings, both common: the previous Monday-to-Sunday, or the last seven days ending now. They overlap by days and agree on neither endpoint.",
    };
  },
  (anchor) => ({
    kind: "relative",
    expression: "yesterday",
    startsAt: iso(startOfDay(anchor) - DAY),
    endsAt: iso(startOfDay(anchor)),
    note: "A calendar day, so it depends entirely on whose midnight. In UTC+9 it starts nine hours before it does in UTC.",
  }),
  (anchor) => ({
    kind: "relative",
    expression: "today",
    startsAt: iso(startOfDay(anchor)),
    endsAt: iso(startOfDay(anchor) + DAY),
    note: "Runs to the end of the day, which is in the future. A range check against now returns a shorter window than the words describe.",
  }),
  (anchor) => ({
    kind: "relative",
    expression: "in the last 24 hours",
    startsAt: iso(anchor - DAY),
    endsAt: iso(anchor),
    note: "Unambiguous, and the only one of this family that is. Rolling from now, so it is not the same as \"today\".",
  }),
  (anchor, rng) => {
    const days = rng.pick([3, 5, 7, 14, 30]);
    return {
      kind: "relative",
      expression: `in the past ${days} days`,
      startsAt: iso(startOfDay(anchor) - (days - 1) * DAY),
      endsAt: iso(anchor),
      alternate: {
        startsAt: iso(anchor - days * DAY),
        endsAt: iso(anchor),
        why: `read as ${days} × 24 hours from now rather than ${days} calendar days`,
      },
      note: "Off by one either way: counting calendar days includes part of a day that has not finished, counting 24-hour blocks does not.",
    };
  },
  (anchor) => {
    const month = startOfMonth(anchor);
    return {
      kind: "relative",
      expression: "last month",
      startsAt: iso(addMonths(month, -1)),
      endsAt: iso(month),
      alternate: {
        startsAt: iso(anchor - 30 * DAY),
        endsAt: iso(anchor),
        why: "read as the last 30 days rather than the previous calendar month",
      },
      note: "Calendar months are 28 to 31 days long, so a \"month\" of 30 days is wrong eleven times a year.",
    };
  },
  (anchor) => {
    const day = startOfDay(anchor);
    return {
      kind: "relative",
      expression: "this morning",
      startsAt: iso(day),
      endsAt: iso(day + 12 * HOUR),
      note: "Nobody has defined when morning ends. Midday is a guess, and the user's is different from yours.",
    };
  },
  (anchor) => {
    const week = startOfWeek(anchor);
    return {
      kind: "relative",
      expression: "over the weekend",
      startsAt: iso(week - 2 * DAY),
      endsAt: iso(week),
      note: "Saturday and Sunday in most of the world, Friday and Saturday across much of the Middle East. The dataset does not say which one the devices were in.",
    };
  },
];

const ABSOLUTE: Builder[] = [
  (anchor, rng) => {
    const day = startOfDay(anchor) - rng.int(20, 200) * DAY;
    const d = new Date(day);
    return {
      kind: "absolute",
      expression: `on ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`,
      startsAt: iso(day),
      endsAt: iso(day + DAY),
    };
  },
  (anchor, rng) => {
    const day = startOfDay(anchor) - rng.int(20, 200) * DAY;
    return {
      kind: "absolute",
      expression: `on ${iso(day).slice(0, 10)}`,
      startsAt: iso(day),
      endsAt: iso(day + DAY),
      note: "ISO 8601 with no offset. Whether that means UTC or the user's own midnight is a decision somebody has to make explicitly.",
    };
  },
  (anchor, rng) => {
    const month = addMonths(startOfMonth(anchor), -rng.int(1, 10));
    const d = new Date(month);
    return {
      kind: "absolute",
      expression: `in ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`,
      startsAt: iso(month),
      endsAt: iso(addMonths(month, 1)),
    };
  },
];

const RANGE: Builder[] = [
  (anchor, rng) => {
    const start = startOfDay(anchor) - rng.int(30, 120) * DAY;
    const span = rng.int(2, 9);
    const a = new Date(start);
    const b = new Date(start + span * DAY);
    const sameMonth = a.getUTCMonth() === b.getUTCMonth();
    return {
      kind: "range",
      expression: sameMonth
        ? `between ${a.getUTCDate()} and ${b.getUTCDate()} ${MONTHS[b.getUTCMonth()]}`
        : `between ${a.getUTCDate()} ${MONTHS[a.getUTCMonth()]} and ${b.getUTCDate()} ${MONTHS[b.getUTCMonth()]}`,
      startsAt: iso(start),
      endsAt: iso(start + (span + 1) * DAY),
      note: "\"Between the 4th and the 9th\" almost always means both days included, so the window ends at midnight on the 10th. Half of all implementations stop a day early.",
    };
  },
  (anchor, rng) => {
    const week = startOfWeek(anchor) - rng.int(1, 6) * 7 * DAY;
    return {
      kind: "range",
      expression: "from Monday to Friday",
      startsAt: iso(week),
      endsAt: iso(week + 5 * DAY),
      note: "Which Monday is not stated. The most recent one is a guess, and the query does not contain the information to check it.",
    };
  },
];

const FUTURE: Builder[] = [
  (anchor) => {
    const week = startOfWeek(anchor);
    return {
      kind: "future",
      expression: "next week",
      startsAt: iso(week + 7 * DAY),
      endsAt: iso(week + 14 * DAY),
      empty: true,
      note: "A tracking query about the future. The right answer is zero rows and a word about why — not zero rows presented as \"no devices in that area\".",
    };
  },
  (anchor) => ({
    kind: "future",
    expression: "tomorrow",
    startsAt: iso(startOfDay(anchor) + DAY),
    endsAt: iso(startOfDay(anchor) + 2 * DAY),
    empty: true,
    note: "Historic positions cannot exist for tomorrow, so anything returned here came from a range check that was written the wrong way round.",
  }),
];

const VAGUE: Builder[] = [
  () => ({
    kind: "vague",
    expression: "recently",
    startsAt: null,
    endsAt: null,
    note: "No window at all. Whatever default you apply is invented, and it should be stated in the response rather than assumed.",
  }),
  () => ({
    kind: "vague",
    expression: "a while back",
    startsAt: null,
    endsAt: null,
    note: "Explicitly not recent, and otherwise unbounded. There is no correct window; there is only a stated one.",
  }),
];

export const NO_TIME: TimeWindow = {
  kind: "none",
  expression: "",
  startsAt: null,
  endsAt: null,
};

/**
 * An inverted range: the end before the start. Nothing can match it, and the
 * failure worth catching is a query planner that silently swaps the two and
 * returns a confident answer to a question nobody asked.
 */
export function invertedRange(anchor: number, rng: Rng): TimeWindow {
  const later = startOfDay(anchor) - rng.int(10, 40) * DAY;
  // Far enough back that the two month names differ: "between May and May"
  // reads as a typo rather than as a range with its ends the wrong way round,
  // and demonstrates nothing.
  let earlier = later - rng.int(40, 90) * DAY;
  while (new Date(earlier).getUTCMonth() === new Date(later).getUTCMonth()) {
    earlier -= 30 * DAY;
  }
  const a = new Date(later);
  const b = new Date(earlier);
  return {
    kind: "range",
    expression: `between ${MONTHS[a.getUTCMonth()]} and ${MONTHS[b.getUTCMonth()]}`,
    startsAt: iso(later),
    endsAt: iso(earlier),
    empty: true,
    note: "The end is before the start, so the window is empty. Swapping them to be helpful answers a different question than the one that was asked.",
  };
}

/**
 * A slash date, which is two dates. 03/04/2024 is the 3rd of April to most of
 * the world and the 4th of March to the United States, and the query carries
 * nothing that resolves it.
 */
export function ambiguousDate(anchor: number, rng: Rng): TimeWindow {
  // Both components ≤ 12, or there would be nothing ambiguous about it.
  const first = rng.int(1, 12);
  let second = rng.int(1, 12);
  if (second === first) second = (second % 12) + 1;
  const year = new Date(anchor).getUTCFullYear();
  const dmy = Date.UTC(year, second - 1, first);
  const mdy = Date.UTC(year, first - 1, second);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    kind: "absolute",
    expression: `on ${pad(first)}/${pad(second)}/${year}`,
    startsAt: iso(dmy),
    endsAt: iso(dmy + DAY),
    alternate: {
      startsAt: iso(mdy),
      endsAt: iso(mdy + DAY),
      why: "read month-first, as the United States writes it",
    },
    note: "Both components are 12 or less, so both readings are valid dates and neither the string nor the locale of the server settles it. The two are weeks apart.",
  };
}

/** The same window as somebody standing in the place would mean it. */
export function shiftToLocal(window: TimeWindow, offsetHours: number): TimeWindow {
  if (!window.startsAt || !window.endsAt) return window;
  const shift = -offsetHours * HOUR;
  return {
    ...window,
    startsAt: iso(Date.parse(window.startsAt) + shift),
    endsAt: iso(Date.parse(window.endsAt) + shift),
  };
}

export function pickTime(rng: Rng, anchor: number, kind: TimeKind | "any"): TimeWindow {
  const pools: Record<Exclude<TimeKind, "none">, Builder[]> = {
    relative: RELATIVE,
    absolute: ABSOLUTE,
    range: RANGE,
    future: FUTURE,
    vague: VAGUE,
  };
  if (kind === "none") return NO_TIME;
  if (kind !== "any") return rng.pick(pools[kind])(anchor, rng);
  // Weighted towards relative, because that is what people actually type.
  const pool = rng.pick([...RELATIVE, ...RELATIVE, ...ABSOLUTE, ...RANGE, ...VAGUE]);
  return pool(anchor, rng);
}

export { DAY, HOUR, iso };
