/**
 * The search half of Null Island: the terms your users type, as fixtures.
 *
 * Same contract as the file half — deterministic from a seed, a control case
 * first, one thing wrong at a time, and nothing claimed that was not actually
 * done. The difference is what the ground truth is: a file's is a feature
 * count, and a query's is the interpretation it should have been given.
 */
export { generateTerms, MAX_TERMS } from "./terms";
export type {
  PlaceExpectation,
  SearchTerm,
  TermExpectation,
  TermSet,
  TermsOptions,
} from "./terms";

export {
  EXCLUSIVE_QUIRKS,
  getQuirk,
  QUIRK_CATEGORY_LABELS,
  QUIRK_CATEGORY_ORDER,
  QUIRKS,
  quirksInCategory,
} from "./quirks";
export type { Quirk, QuirkCategory, QuirkNeeds, QuirkPhase } from "./quirks";

export {
  aliasOfKind,
  allNames,
  containers,
  getPlace,
  PLACES,
  placesOfKind,
  QUOTED_PLACES,
  UNKNOWN_PLACES,
  WORD_PLACES,
} from "./places";
export type { Alias, AliasKind, Place, PlaceKind } from "./places";

export { DEFAULT_ANCHOR } from "./time";
export type { TimeKind, TimeWindow } from "./time";

export {
  DEFAULT_SUBJECT_PROFILE,
  getSubject,
  INTENTS,
  SUBJECTS,
} from "./phrasing";
export type { Intent, Subject } from "./phrasing";

export { buildLayer, renderFor, rowsExpected, scaleOf } from "./layers";
export type { LayerExpectation, Render, Scale } from "./layers";
export { simulateLayer } from "./simulate";
export { inspectTerms } from "./clean";
export { getTermFormat, TERM_FORMATS, writeTerms } from "./write";
export type { TermFile, TermFormatId, TermFormatMeta } from "./write";
