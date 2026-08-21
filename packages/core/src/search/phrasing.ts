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
  /**
   * What people call it instead of the word in your schema.
   *
   * Nobody types "aircraft" — they type planes, jets, flights, or aviation, and
   * a search that only knows the schema's noun resolves the place, fails to
   * resolve the thing, and returns everything or nothing depending on which way
   * the unmatched token falls. The family the data type belongs to is not a
   * synonym: "mobility" is a category, not a thing anyone searches for.
   */
  aliases?: readonly string[];
  /**
   * The words for it that have no plural — aviation, shipping, weather, the
   * fleet.
   *
   * Real, and used constantly, but they cannot follow a quantifier: "how many
   * aviation were in Lisbon" is not a sentence. Kept apart from `aliases` so
   * the phrasing can reach for them only where they work.
   */
  massAliases?: readonly string[];
}

/**
 * What each data type is called when somebody searches for it. Keyed by profile
 * id, so adding a data type to the generator adds it here or falls back to the
 * generic noun — never to a wrong one.
 */
export const SUBJECTS: Record<string, Subject> = {
  generic: { singular: "record", plural: "records", owned: false, aliases: ["rows", "entries", "features"] },
  "flight-adsb": { singular: "aircraft", plural: "aircraft", owned: false, aliases: ["planes", "flights", "jets"], massAliases: ["aviation", "air traffic"] },
  "maritime-ais": { singular: "vessel", plural: "vessels", owned: false, aliases: ["ships", "boats"], massAliases: ["shipping", "marine traffic"] },
  "fleet-telematics": { singular: "vehicle", plural: "vehicles", owned: true, aliases: ["trucks", "vans", "lorries", "fleet vehicles"], massAliases: ["the fleet"] },
  "transit-gtfs": { singular: "bus", plural: "buses", owned: false, aliases: ["services"], massAliases: ["transit", "public transport"] },
  "micromobility-mds": { singular: "scooter", plural: "scooters", owned: true, aliases: ["e-scooters", "bikes"], massAliases: ["micromobility"] },
  "mobile-location-pings": { singular: "device", plural: "devices", owned: true, aliases: ["phones", "handsets", "mobiles", "mobile devices"], massAliases: ["mobile"] },
  "geosocial-checkins": { singular: "check-in", plural: "check-ins", owned: false, aliases: ["checkins", "posts"], massAliases: ["social data"] },
  "poi-venues": { singular: "venue", plural: "venues", owned: false, aliases: ["places", "POIs", "locations"] },
  "trade-area-catchment": { singular: "catchment", plural: "catchments", owned: true, aliases: ["trade areas", "drive times"] },
  "psychographics-spending": { singular: "household", plural: "households", owned: false, aliases: ["segments"], massAliases: ["spend data"] },
  "cadastral-parcels": { singular: "parcel", plural: "parcels", owned: false, aliases: ["lots", "plots", "titles", "land parcels"] },
  "building-footprints": { singular: "building", plural: "buildings", owned: false, aliases: ["footprints", "structures"] },
  "zoning-land-use": { singular: "zone", plural: "zones", owned: false, aliases: ["districts"], massAliases: ["land use"] },
  "indoor-bim": { singular: "room", plural: "rooms", owned: false, aliases: ["spaces", "floors", "indoor assets"] },
  "utility-networks": { singular: "asset", plural: "assets", owned: true, aliases: ["mains", "pipes"], massAliases: ["the network"] },
  "satellite-scene-footprints": { singular: "scene", plural: "scenes", owned: false, aliases: ["scenes", "captures"], massAliases: ["imagery"] },
  "elevation-contours": { singular: "contour", plural: "contours", owned: false, aliases: ["isolines"], massAliases: ["elevation"] },
  "weather-observations": { singular: "station", plural: "stations", owned: false, aliases: ["sensors", "gauges"], massAliases: ["weather"] },
  "land-cover-ndvi": { singular: "tile", plural: "tiles", owned: false, aliases: ["rasters"], massAliases: ["land cover"] },
  "natural-hazard-zones": { singular: "hazard zone", plural: "hazard zones", owned: false, aliases: ["flood zones", "hazard areas"] },
  "census-boundary": { singular: "tract", plural: "tracts", owned: false, aliases: ["census tracts", "block groups"] },
  "crime-incident": { singular: "incident", plural: "incidents", owned: false, aliases: ["crimes", "reports", "offences"] },
  "health-epidemiology": { singular: "case", plural: "cases", owned: false, aliases: ["infections", "notifications"] },
};

export const DEFAULT_SUBJECT_PROFILE = "mobile-location-pings";

export function getSubject(profile: string): Subject {
  return SUBJECTS[profile] ?? SUBJECTS.generic;
}

/**
 * "my devices", "the vessels", "devices and aircraft" — and the bare noun,
 * which is just as common.
 *
 * Several nouns are joined by the word people actually use, which is "and" far
 * more often than "or" even when they mean a union. That is the trap the
 * multi-subject quirk exists to set: nothing is both a device and an aircraft,
 * so a query planner that reads the conjunction literally returns an empty set
 * with total confidence.
 */
export function subjectPhrase(nouns: string[], owned: boolean, rng: Rng): string {
  const joined = joinNouns(nouns, rng.bool(0.75) ? "and" : "or");
  if (owned) return rng.pick([`my ${joined}`, joined, `our ${joined}`]);
  return rng.pick([joined, `all ${joined}`, joined]);
}

/** "devices", "devices and aircraft", "devices, aircraft and vessels". */
export function joinNouns(nouns: string[], word: "and" | "or"): string {
  if (nouns.length <= 1) return nouns[0] ?? "";
  return `${nouns.slice(0, -1).join(", ")} ${word} ${nouns[nouns.length - 1]}`;
}

/**
 * What a query asks for when it names no type at all. Not a subject — the
 * absence of one — so it is rendered rather than drawn from the catalogue.
 */
// All mass or singular: they follow "that was" without disagreeing with it, and
// "all layers that was in Tokyo" is the kind of small wrongness that makes a
// fixture look machine-made.
export const ANY_SUBJECT = ["everything", "anything", "all data", "any kind of thing"];

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
 * Templates per intent.
 *
 * Every one of them renders the subject slot. "Is there anything in Tokyo" is a
 * real query and it is not here: it names no kind of thing, which is what the
 * `any-subject` quirk means, and reaching it by accident made terms claim a
 * noun their own text never contained.
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
  ],
  list: [
    (s) => join("list", s.subject, s.place, s.time),
    // `bare`, not `subject`: the possessive form can already begin with "all",
    // and "list all all devices" is the kind of small wrongness that makes a
    // fixture look machine-made.
    (s) => join("list all", s.bare, s.place, s.time),
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
 * A query that names no kind of thing.
 *
 * "Everything" is a mass noun and most of the templates above want a countable
 * one — "which everything were in Tokyo" is not a sentence — so this phrasing
 * is its own small set rather than a filter over the others. One of them names
 * nothing at all, which is the purest form of the case: "what was in Tokyo last
 * week" is a real question with no entity type in it anywhere.
 */
export function renderAny(slots: Slots, rng: Rng): string {
  return rng.pick<Template>([
    (s) => join("show me", s.subject, s.place, s.time),
    (s) => join(s.subject, s.place, s.time),
    (s) => join("what was", s.place, s.time),
    (s) => join("list", s.subject, s.place, s.time),
    (s) => join(s.subject, "that was", s.place, s.time),
    (s) => join("show me", s.subject, "seen", s.place, s.time),
  ])(slots, rng);
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

/**
 * Adds a trailing clause without stepping on the punctuation already there.
 *
 * "…which has more?" plus ", no rush" gave "?, no rush", which no one has ever
 * typed. The mark belongs at the end of the sentence, so it is lifted off,
 * the clause goes on, and it goes back.
 */
export function append(text: string, clause: string): string {
  // Only ? and !. A full stop at the end of a query is as likely to belong to
  // an abbreviation as to the sentence — "devices in México D.F." — and lifting
  // it off renames the place.
  const mark = /[?!]$/.exec(text)?.[0] ?? "";
  const body = mark ? text.slice(0, -1) : text;
  return `${body}, ${clause}${mark}`;
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

/**
 * Politeness, in two shapes.
 *
 * A query either starts with a verb — "show me devices in Tokyo" — or with the
 * thing itself — "devices in Tokyo". The polite phrase in front of it has to
 * agree: "can you please" wants a verb after it and "would you mind showing me"
 * wants a noun, and getting it backwards gives "would you mind showing me show
 * me devices" or "I need you to devices", both of which read as a generator
 * with no ear.
 */
export const POLITE_BEFORE_VERB = [
  "can you please",
  "could you",
  "please",
  "I need you to",
  "would you",
];

export const POLITE_BEFORE_NOUN = [
  "would you mind showing me",
  "I'd like to see",
  "can you show me",
  "I'm after",
  "could I get",
];

/** The verbs the templates open with, and the quantifiers that behave like them. */
const OPENS_WITH_VERB =
  /^(show|list|find|export|count|give|break|compare|which|how many|number of|were|did|is|what|where)\b/i;

/** The right politeness for this sentence, whichever shape it turned out to be. */
export function polite(text: string, rng: Rng): string {
  return rng.pick(OPENS_WITH_VERB.test(text) ? POLITE_BEFORE_VERB : POLITE_BEFORE_NOUN);
}

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
  /** What "everything" is, for a query naming no kind of thing. */
  any: string;
}> = [
  {
    code: "es",
    language: "Spanish",
    render: (subject, place, time) => join("muéstrame los", subject, "en", place, time),
    subjects: { device: "dispositivos", vehicle: "vehículos", vessel: "buques", parcel: "parcelas" },
    times: { "last week": "la semana pasada", yesterday: "ayer", today: "hoy" },
    any: "todo",
  },
  {
    code: "fr",
    language: "French",
    render: (subject, place, time) => join("montre-moi les", subject, "à", place, time),
    subjects: { device: "appareils", vehicle: "véhicules", vessel: "navires", parcel: "parcelles" },
    times: { "last week": "la semaine dernière", yesterday: "hier", today: "aujourd'hui" },
    any: "tout",
  },
  {
    code: "de",
    language: "German",
    render: (subject, place, time) => join("zeig mir die", subject, "in", place, time),
    subjects: { device: "Geräte", vehicle: "Fahrzeuge", vessel: "Schiffe", parcel: "Grundstücke" },
    times: { "last week": "letzte Woche", yesterday: "gestern", today: "heute" },
    any: "alles",
  },
  {
    code: "pt",
    language: "Portuguese",
    render: (subject, place, time) => join("mostra-me os", subject, "em", place, time),
    subjects: { device: "dispositivos", vehicle: "veículos", vessel: "navios", parcel: "parcelas" },
    times: { "last week": "na semana passada", yesterday: "ontem", today: "hoje" },
    any: "tudo",
  },
  {
    code: "ja",
    language: "Japanese",
    // Built without the spaces rather than stripped of them: a trailing
    // `.replace(/\s+/g, "")` would also close up "Times Square".
    render: (subject, place, time) => `${time}${place}にあった${subject}を見せて`,
    subjects: { device: "デバイス", vehicle: "車両", vessel: "船舶", parcel: "区画" },
    times: { "last week": "先週", yesterday: "昨日", today: "今日" },
    any: "すべて",
  },
];

export { join };
