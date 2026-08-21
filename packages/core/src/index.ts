/**
 * Null Island's generator, as a library.
 *
 * Everything the web app does to build a fixture happens in here, and nothing
 * in here touches a DOM — so the same call that draws the plot in a browser
 * writes the file in a CLI or in your test suite, from the same seed, down to
 * the same bytes. That is the point of there being one implementation.
 *
 *   import { generate } from "nullisland-core";
 *
 *   const file = generate({
 *     format: "geojson",
 *     profile: "flight-adsb",
 *     count: 500,
 *     shape: "line",
 *     region: "london",
 *     problems: ["unit-mixture", "track-breaks"],
 *     intensity: 0.4,
 *     seed: "harbor-lantern-drift",
 *     pretty: true,
 *     boundary: "none",
 *     coverage: 0.6,
 *   });
 */

/* ── generating ──────────────────────────────────────────────────────────── */
export { generate, MAX_FEATURES } from "./generate";
export { buildPackage, MAX_PACKAGE_FILES, PACKAGE_SIZES } from "./package";
export type { GeneratedPackage, PackageEntry, PackageOptions } from "./package";

/* ── what there is to choose from ────────────────────────────────────────── */
export { FORMATS, getFormat } from "./formats/index";
export type { FormatMeta } from "./formats/index";
export {
  appliesTo,
  appliesToProfile,
  applicableProblems,
  availableProblems,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  domainProblems,
  EXCLUSIVE_PROBLEM,
  getProblem,
  PROBLEMS,
  problemsForFormat,
} from "./problems";
export {
  DEFAULT_PROFILE,
  FAMILIES,
  getProfile,
  naturalShape,
  PROFILES,
  profileNote,
  profileShape,
  profilesInFamily,
} from "./profiles/index";
export type { DataProfile, FamilyMeta, ProfileFamily, ProfileField } from "./profiles/index";
export { BOUNDARIES, BOUNDARY_IDS, coversWorld, getBoundaryMeta, regionExtent } from "./boundary";
export type { BoundaryMeta, Extent } from "./boundary";
export { DEFAULT_REGION, getRegion, REGIONS } from "./regions";
export type { Region } from "./regions";

/* ── the search box, rather than the map ─────────────────────────────────── */
export { generateTerms, inspectTerms, MAX_TERMS, writeTerms, TERM_FORMATS, getTermFormat } from "./search/index";
export {
  EXCLUSIVE_QUIRKS,
  getQuirk,
  QUIRK_CATEGORY_LABELS,
  QUIRK_CATEGORY_ORDER,
  QUIRKS,
  quirksInCategory,
} from "./search/index";
export {
  aliasOfKind,
  allNames,
  containers,
  DEFAULT_ANCHOR,
  DEFAULT_SUBJECT_PROFILE,
  getPlace,
  getSubject,
  INTENTS,
  PLACES,
  placesOfKind,
  SUBJECTS,
} from "./search/index";
export type {
  Alias,
  AliasKind,
  Intent,
  Place,
  PlaceExpectation,
  PlaceKind,
  Quirk,
  QuirkCategory,
  QuirkNeeds,
  QuirkPhase,
  SearchTerm,
  Subject,
  TermExpectation,
  TermFile,
  TermFormatId,
  TermFormatMeta,
  TermSet,
  TermsOptions,
  TimeKind,
  TimeWindow,
} from "./search/index";

/* ── describing the result ───────────────────────────────────────────────── */
export { buildContext, contextToText } from "./context";
export type { ContextBlock } from "./context";
export { inspectClean } from "./clean";
export type { CleanCheck, CleanReport } from "./clean";
export { formatBytes } from "./format";

/* ── reproducing it ──────────────────────────────────────────────────────── */
export { decodeApp, decodeConfig, encodeApp, encodeConfig } from "./share";
export type { AppConfig, AppMode, DecodedApp, TermsConfig } from "./share";
export { normaliseSeed, randomSeed, Rng } from "./rng";

/* ── where it lives ──────────────────────────────────────────────────────── */
export { CREDIT, CREDIT_URL, ISSUES_URL, LICENCE, NEW_ISSUE_URL, REPO_STAR_URL, REPO_URL, SITE_HOST, SITE_URL } from "./site";

/* ── types ───────────────────────────────────────────────────────────────── */
export type {
  BoundaryId,
  BoundaryOutput,
  Dataset,
  Feature,
  FilePayload,
  FormatId,
  GeneratedFile,
  GenerateOptions,
  Geometry,
  MapPreview,
  Position,
  Problem,
  ProblemCategory,
  ProblemPhase,
  ShapeId,
} from "./types";
