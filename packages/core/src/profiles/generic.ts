/* eslint-disable @typescript-eslint/no-explicit-any */
import { round } from "../geo";
import type { Rng } from "../rng";
import type { DataProfile } from "./index";

const ADJECTIVES = [
  "North", "South", "East", "West", "Upper", "Lower", "Old", "New", "Great",
  "Little", "Inner", "Outer", "Central", "Royal", "Kings", "Queens", "Saint",
];

const NOUNS = [
  "Wharf", "Bridge", "Market", "Common", "Yard", "Green", "Mill", "Quay",
  "Gate", "Hill", "Field", "Park", "Bank", "Cross", "Grove", "Court", "Depot",
];

const SUFFIXES = ["Site", "Depot", "Node", "Unit", "Station", "Point", "Works", "Hub"];

export const CATEGORIES = [
  "retail", "logistics", "residential", "industrial", "civic",
  "transport", "utilities", "leisure",
];

export const STATUSES = ["active", "inactive", "pending", "decommissioned"];

/** A plausible-looking label so the output reads like a real export. */
export function makeName(rng: Rng): string {
  return `${rng.pick(ADJECTIVES)} ${rng.pick(NOUNS)} ${rng.pick(SUFFIXES)}`;
}

/**
 * The schema this generator shipped with, kept exactly as it was.
 *
 * It draws from the RNG in precisely the original order, because every fixture
 * generated before data types existed has a share link promising to rebuild it
 * byte for byte. That promise outranks tidiness, so this stays a hand-written
 * function rather than a field list.
 */
function buildProperties(rng: Rng, index: number): Record<string, any> {
  const day = rng.int(1, 28);
  const month = rng.int(1, 12);
  const year = rng.int(2019, 2026);
  return {
    id: index + 1,
    name: makeName(rng),
    category: rng.pick(CATEGORIES),
    status: rng.pick(STATUSES),
    value: round(rng.float(0, 25000), 2),
    count: rng.int(0, 480),
    verified: rng.bool(0.65),
    updated_at: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(
      rng.int(0, 23),
    ).padStart(2, "0")}:${String(rng.int(0, 59)).padStart(2, "0")}:00Z`,
  };
}

export const GENERIC_PROFILE: DataProfile = {
  id: "generic",
  label: "Generic export",
  family: "generic",
  blurb: "Neutral name/category/status columns. No domain assumptions to trip over.",
  geometry: "scatter",
  fields: [],
  apt: [],
  build: buildProperties,
};
