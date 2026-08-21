import type { Rng } from "../rng";

/**
 * The sentence around the filter.
 *
 * A search term is a subject, a place, and a window, wrapped in whatever words
 * the user happened to use. The wrapping is not decoration: "where were my
 * devices in Lisbon last week?" and "devices lisbon last wk" carry the same
 * three filters and break different parsers, so the phrasing varies
 * independently of what is being asked for.
 *
 * Subjects come from the data types, so a term generated beside a fixture is
 * about the thing in the fixture — vessels for AIS, parcels for cadastral,
 * devices for location pings — rather than about "features".
 */

export type Intent =
  /** Where are they now. */
  | "locate"
  /** Where were they, over a past window. */
  | "history"
  /** How many. */
  | "count"
  /** Were there any at all. */
  | "presence"
  /** Give me the rows. */
  | "list"
  /** One place against another. */
  | "compare";

export const INTENTS: Intent[] = ["locate", "history", "count", "presence", "list", "compare"];

export interface Subject {
  /** "device" */
  singular: string;
  /** "devices" — what actually appears in most queries. */
  plural: string;
  /** True when a user would say "my devices" rather than "the devices". */
  owned: boolean;
}

/**
 * What each data type is called when somebody searches for it. Keyed by profile
 * id, so adding a data type to the generator adds it here or falls back to the
 * generic noun — never to a wrong one.
 */
export const SUBJECTS: Record<string, Subject> = {
  generic: { singular: "record", plural: "records", owned: false },
  "flight-adsb": { singular: "aircraft", plural: "aircraft", owned: false },
  "maritime-ais": { singular: "vessel", plural: "vessels", owned: false },
  "fleet-telematics": { singular: "vehicle", plural: "vehicles", owned: true },
  "transit-gtfs": { singular: "bus", plural: "buses", owned: false },
  "micromobility-mds": { singular: "scooter", plural: "scooters", owned: true },
  "mobile-location-pings": { singular: "device", plural: "devices", owned: true },
  "geosocial-checkins": { singular: "check-in", plural: "check-ins", owned: false },
  "poi-venues": { singular: "venue", plural: "venues", owned: false },
  "trade-area-catchment": { singular: "catchment", plural: "catchments", owned: true },
  "psychographics-spending": { singular: "household", plural: "households", owned: false },
  "cadastral-parcels": { singular: "parcel", plural: "parcels", owned: false },
  "building-footprints": { singular: "building", plural: "buildings", owned: false },
  "zoning-land-use": { singular: "zone", plural: "zones", owned: false },
  "indoor-bim": { singular: "asset", plural: "assets", owned: true },
  "utility-networks": { singular: "asset", plural: "assets", owned: true },
  "satellite-scene-footprints": { singular: "scene", plural: "scenes", owned: false },
  "elevation-contours": { singular: "contour", plural: "contours", owned: false },
  "weather-observations": { singular: "station", plural: "stations", owned: false },
  "land-cover-ndvi": { singular: "tile", plural: "tiles", owned: false },
  "natural-hazard-zones": { singular: "hazard zone", plural: "hazard zones", owned: false },
  "census-boundary": { singular: "tract", plural: "tracts", owned: false },
  "crime-incident": { singular: "incident", plural: "incidents", owned: false },
  "health-epidemiology": { singular: "case", plural: "cases", owned: false },
};

export const DEFAULT_SUBJECT_PROFILE = "mobile-location-pings";

export function getSubject(profile: string): Subject {
  return SUBJECTS[profile] ?? SUBJECTS.generic;
}

/** "my devices" / "the vessels" — and the bare noun, which is just as common. */
export function subjectPhrase(subject: Subject, rng: Rng): string {
  if (subject.owned) return rng.pick([`my ${subject.plural}`, subject.plural, `our ${subject.plural}`]);
  return rng.pick([subject.plural, `all ${subject.plural}`, subject.plural]);
}

export interface Slots {
  /** "my devices" */
  subject: string;
  /**
   * The same noun without the possessive. "How many my devices" is not a
   * sentence anybody has typed, so the templates that begin with a quantifier
   * take this one instead.
   */
  bare: string;
  /** "in Tokyo and Kyoto" — the preposition included, because it varies. */
  place: string;
  /** "last week", or empty. */
  time: string;
}

/**
 * Drops the empty slots and squashes the spaces they leave behind.
 *
 * Ordinary spaces only. A `\s+` here would also flatten the non-breaking space
 * a quirk had just put inside a place name — undoing the quirk while the
 * expectation went on recording it, which is the term lying about itself.
 */
function join(...parts: string[]): string {
  return parts
    .filter((p) => p && p.trim())
    .join(" ")
    .replace(/ {2,}/g, " ")
    .trim();
}

type Template = (s: Slots, rng: Rng) => string;

/**
 * Templates per intent. Several apiece, because the same intent asked two ways
 * is the cheapest source of genuine variety — and because the difference
 * between "show me X in Y" and "X in Y" is exactly the preposition half of the
 * parsers in the world are anchored on.
 */
const TEMPLATES: Record<Intent, Template[]> = {
  locate: [
    (s) => join("show me", s.subject, s.place, s.time),
    (s) => join(s.subject, s.place, s.time),
    (s) => join("find", s.subject, s.place, s.time),
    (s) => join("where are", s.subject, s.place, s.time),
    (s) => join("show", s.subject, "that are", s.place, s.time),
  ],
  history: [
    (s) => join(s.subject, "that were", s.place, s.time),
    (s) => join("show me", s.subject, "that were", s.place, s.time),
    (s) => join("which", s.bare, "were", s.place, s.time),
    (s) => join(s.subject, "seen", s.place, s.time),
    (s) => join("anything", s.place, s.time),
  ],
  count: [
    (s) => join("how many", s.bare, "were", s.place, s.time),
    (s) => join("how many", s.bare, s.place, s.time),
    (s) => join("count", s.bare, s.place, s.time),
    (s) => join("number of", s.bare, s.place, s.time),
  ],
  presence: [
    (s) => join("were there any", s.bare, s.place, s.time),
    (s) => join("any", s.bare, s.place, s.time),
    (s) => join("did any", s.bare, "go", s.place, s.time),
    (s) => join("is there anything", s.place, s.time),
  ],
  list: [
    (s) => join("list", s.subject, s.place, s.time),
    (s) => join("list all", s.subject, s.place, s.time),
    (s) => join("export", s.subject, s.place, s.time),
    (s) => join("give me all", s.bare, s.place, s.time),
  ],
  compare: [
    (s) => join("compare", s.subject, s.place, s.time),
    (s) => join(s.subject, s.place, s.time, "— which has more"),
    (s) => join("break down", s.subject, s.place, s.time),
  ],
};

export function render(intent: Intent, slots: Slots, rng: Rng): string {
  return rng.pick(TEMPLATES[intent])(slots, rng);
}

/**
 * Keywords, with no sentence around them. Drawn from the same stream as
 * `render` so a term keeps its seed, and deliberately not a template: the
 * absence of the verb and the preposition is the whole point of this one, and
 * "devices that are Tokyo" would be neither a keyword query nor English.
 */
export function renderKeywords(slots: Slots, rng: Rng): string {
  rng.next();
  return join(slots.bare, slots.place, slots.time);
}

/** Whether this intent is about the past, and so wants a window on it. */
export function wantsTime(intent: Intent): boolean {
  return intent === "history" || intent === "count" || intent === "presence";
}

/** Words that carry no filter and are typed anyway. */
export const FILLERS = [
  "hey",
  "hi there",
  "quick one",
  "sorry to bother you",
  "ok so",
  "hey quick question",
];

export const POLITE = [
  "can you please",
  "could you",
  "please",
  "I need you to",
  "would you mind showing me",
  "I'd like to see",
];

/** Sentences of context wrapped round one filter. */
export const PREAMBLE = [
  "so I was looking at the dashboard earlier and the numbers seemed off",
  "the client asked about this on the call and I said I'd check",
  "not sure if this is the right place to ask but here goes",
  "following up on the ticket from yesterday",
  "I've been going round in circles on this one",
];

export const POSTAMBLE = [
  "thanks",
  "no rush",
  "let me know if that's not possible",
  "cheers",
  "if that's easy enough",
];

/** Translations of the whole query, so the place is findable and the verb is not. */
export const OTHER_LANGUAGES: Array<{
  code: string;
  language: string;
  /** Builds the query from an already-rendered place name and time phrase. */
  render: (subject: string, place: string, time: string) => string;
  subjects: Record<string, string>;
  times: Record<string, string>;
}> = [
  {
    code: "es",
    language: "Spanish",
    render: (subject, place, time) => join("muéstrame los", subject, "en", place, time),
    subjects: { device: "dispositivos", vehicle: "vehículos", vessel: "buques", parcel: "parcelas" },
    times: { "last week": "la semana pasada", yesterday: "ayer", today: "hoy" },
  },
  {
    code: "fr",
    language: "French",
    render: (subject, place, time) => join("montre-moi les", subject, "à", place, time),
    subjects: { device: "appareils", vehicle: "véhicules", vessel: "navires", parcel: "parcelles" },
    times: { "last week": "la semaine dernière", yesterday: "hier", today: "aujourd'hui" },
  },
  {
    code: "de",
    language: "German",
    render: (subject, place, time) => join("zeig mir die", subject, "in", place, time),
    subjects: { device: "Geräte", vehicle: "Fahrzeuge", vessel: "Schiffe", parcel: "Grundstücke" },
    times: { "last week": "letzte Woche", yesterday: "gestern", today: "heute" },
  },
  {
    code: "pt",
    language: "Portuguese",
    render: (subject, place, time) => join("mostra-me os", subject, "em", place, time),
    subjects: { device: "dispositivos", vehicle: "veículos", vessel: "navios", parcel: "parcelas" },
    times: { "last week": "na semana passada", yesterday: "ontem", today: "hoje" },
  },
  {
    code: "ja",
    language: "Japanese",
    // Built without the spaces rather than stripped of them: a trailing
    // `.replace(/\s+/g, "")` would also close up "Times Square".
    render: (subject, place, time) => `${time}${place}にあった${subject}を見せて`,
    subjects: { device: "デバイス", vehicle: "車両", vessel: "船舶", parcel: "区画" },
    times: { "last week": "先週", yesterday: "昨日", today: "今日" },
  },
];

export { join };
