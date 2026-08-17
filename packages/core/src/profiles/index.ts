/* eslint-disable @typescript-eslint/no-explicit-any */
import { ADTECH_PROFILES } from "./adtech";
import { CONSISTENCY } from "./consistency";
import { EARTH_PROFILES } from "./earth";
import { fieldValue, type Clock, type ProfileField } from "./fields";
import { naturalShape, type GeometryMode } from "./geometry";
import { GENERIC_PROFILE } from "./generic";
import { MOBILITY_PROFILES } from "./mobility";
import { PUBLIC_PROFILES } from "./public";
import { REALESTATE_PROFILES } from "./realestate";
import type { Rng } from "../rng";
import type { Position, ShapeId } from "../types";

/**
 * Data types: what the file is *of*, as opposed to what is wrong with it.
 *
 * A generic export with `name` and `category` columns exercises a parser. It
 * does not exercise the code someone wrote for ADS-B altitudes, or for a parcel
 * number, or for a census GEOID with a leading zero — and that is where the
 * bugs live, because that is where the assumptions live. A profile swaps the
 * schema and the shape of the geometry for a real one, so the fixture arrives
 * looking like the feed it is standing in for.
 *
 * Profiles are declarative: a field list, a geometry mode, and the problems
 * this data type is known for. That keeps 23 of them readable, and keeps the
 * mutation pipeline entirely unaware that any of this exists.
 */

export type ProfileFamily = "generic" | "mobility" | "adtech" | "realestate" | "earth" | "public";

export interface FamilyMeta {
  id: ProfileFamily;
  label: string;
}

export const FAMILIES: FamilyMeta[] = [
  { id: "generic", label: "Generic" },
  { id: "mobility", label: "Mobility & transport" },
  { id: "adtech", label: "AdTech, retail & consumer" },
  { id: "realestate", label: "Real estate & planning" },
  { id: "earth", label: "Earth observation" },
  { id: "public", label: "Demographics & public admin" },
];

/** Everything the generator needs to know about one feature being built. */
export interface RefineContext {
  rng: Rng;
  index: number;
  count: number;
  /** Where this feature landed, before any problem has moved it. */
  position: Position | null;
  clock: Clock;
}

export interface DataProfile {
  id: string;
  label: string;
  family: ProfileFamily;
  /** One line: what the data is, and what it does to a viewer. */
  blurb: string;
  geometry: GeometryMode;
  fields: ProfileField[];
  /** Problems this data type is known for — the "typical" preset. */
  apt: string[];
  /**
   * Builds the properties outright, instead of from the field list. Only the
   * generic profile uses this, so that fixtures generated before profiles
   * existed still reproduce byte for byte from their seed.
   */
  build?: (rng: Rng, index: number) => Record<string, any>;
  /**
   * Cross-field consistency a field list cannot express: an altitude that
   * agrees with a phase of flight, a geohash that agrees with the position it
   * sits beside. Runs after the fields are drawn, and may add or remove keys.
   */
  refine?: (props: Record<string, any>, ctx: RefineContext) => void;
}

export const PROFILES: DataProfile[] = [
  GENERIC_PROFILE,
  ...MOBILITY_PROFILES,
  ...ADTECH_PROFILES,
  ...REALESTATE_PROFILES,
  ...EARTH_PROFILES,
  ...PUBLIC_PROFILES,
];

export const DEFAULT_PROFILE = GENERIC_PROFILE.id;

const BY_ID = new Map(PROFILES.map((p) => [p.id, p]));

export function getProfile(id: string): DataProfile {
  return BY_ID.get(id) ?? GENERIC_PROFILE;
}

export function profilesInFamily(family: ProfileFamily): DataProfile[] {
  return PROFILES.filter((p) => p.family === family);
}

/** The geometry kind this data type actually comes in. */
export function profileShape(profile: DataProfile): ShapeId {
  return naturalShape(profile.geometry);
}

export function buildProfileProperties(
  profile: DataProfile,
  rng: Rng,
  ctx: RefineContext,
): Record<string, any> {
  if (profile.build) return profile.build(rng, ctx.index);

  const props: Record<string, any> = {};
  for (const field of profile.fields) {
    props[field.name] = fieldValue(field, rng, ctx.clock);
  }
  // The schema first, then the arithmetic between its columns.
  CONSISTENCY[profile.id]?.(props, ctx);
  profile.refine?.(props, ctx);
  return props;
}

/** The line about this data type that goes into the notes and the AI context. */
export function profileNote(profile: DataProfile): string {
  const names = profile.fields.map((f) => f.name).join(", ");
  return `Attributes follow a ${profile.label} schema: ${names}.`;
}

export type { GeometryMode, ProfileField };
export { naturalShape };
