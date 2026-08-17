/* eslint-disable @typescript-eslint/no-explicit-any */
import { round } from "../geo";
import type { Rng } from "../rng";

/**
 * Attribute generation for data-type profiles.
 *
 * A profile is a schema, not a pile of generators: each field says what it is
 * and roughly what its values look like, and this turns that into something a
 * practitioner would recognise. Values are shaped from a real example rather
 * than invented — an `icao24` of `4ca1fa` yields another six hex digits, a
 * `06037-123-456` parcel number yields another parcel number — so a profile can
 * be written as data instead of as a hundred bespoke functions.
 *
 * Everything is drawn from the seeded Rng, so a profile changes what a fixture
 * contains without ever changing the promise that a seed reproduces it.
 */

export type FieldType =
  | "string"
  | "int"
  | "float"
  | "bool"
  | "iso-datetime"
  | "epoch-seconds"
  | "epoch-millis";

export interface ProfileField {
  name: string;
  type: FieldType;
  /** A real value from a real file. Its shape is copied; its content is not. */
  example?: string;
  /** The value pool, when the real field is a vocabulary rather than a pattern. */
  values?: readonly string[];
  min?: number;
  max?: number;
  /** Decimal places. Inferred from the example when omitted. */
  decimals?: number;
  /**
   * Keep the letters, vary only the digits. For fields where the words are
   * part of the format — `Census Tract 124.02`, `S2B_MSIL2A_20240317T104629`,
   * `Gate 12` — and mutating them would produce something no reader has met.
   */
  literal?: boolean;
  /** The real feed leaves this empty sometimes. So does this one. */
  nullable?: boolean;
  /** What a reader gets wrong about this field. Carried into the AI context. */
  note?: string;
}

/**
 * The window a generated feed covers.
 *
 * Drawn once per dataset so timestamps within a file agree with each other —
 * a live feed is minutes wide, an archive is years, and both look wrong if
 * every row lands on an unrelated date.
 */
export interface Clock {
  /** Epoch seconds at the start of the window. */
  start: number;
  /** Window width in seconds. */
  span: number;
}

const YEAR = 31_536_000;

/** 2019-01-01, the floor for generated dates. Fixed, so seeds stay stable. */
const EPOCH_FLOOR = 1_546_300_800;

export function datasetClock(rng: Rng): Clock {
  // Somewhere in the last few years, covering a working day.
  return { start: EPOCH_FLOOR + Math.floor(rng.next() * YEAR * 6), span: 86_400 };
}

const DIGITS = "0123456789";
const LOWER = "abcdefghijklmnopqrstuvwxyz";
const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const HEX_LOWER = "0123456789abcdef";
const HEX_UPPER = "0123456789ABCDEF";

function isHexish(text: string, alphabet: string): boolean {
  return text.length >= 4 && /[a-f]/i.test(text) && [...text].every((c) => alphabet.includes(c));
}

/**
 * A new value with the same shape as the example: digits stay digits, letters
 * stay letters of the same case, and everything else — hyphens, slashes, dots,
 * spaces — is kept exactly where it was.
 */
export function fromTemplate(example: string, rng: Rng, literal = false): string {
  if (literal) {
    return [...example].map((c) => (DIGITS.includes(c) ? rng.pick([...DIGITS]) : c)).join("");
  }
  if (isHexish(example, HEX_LOWER)) {
    return Array.from({ length: example.length }, () => rng.pick([...HEX_LOWER])).join("");
  }
  if (isHexish(example, HEX_UPPER)) {
    return Array.from({ length: example.length }, () => rng.pick([...HEX_UPPER])).join("");
  }
  let out = "";
  for (const char of example) {
    if (DIGITS.includes(char)) out += rng.pick([...DIGITS]);
    else if (LOWER.includes(char)) out += rng.pick([...LOWER]);
    else if (UPPER.includes(char)) out += rng.pick([...UPPER]);
    else out += char;
  }
  return out;
}

function decimalsOf(field: ProfileField): number {
  if (field.decimals !== undefined) return field.decimals;
  const dot = field.example?.indexOf(".") ?? -1;
  if (dot >= 0) return field.example!.length - dot - 1;
  return 2;
}

/**
 * ISO 8601 in UTC, which is what a well-behaved feed emits.
 *
 * Built from an explicit epoch rather than the clock, so it stays deterministic:
 * `toISOString` is UTC by definition and carries no local timezone with it.
 */
export function isoFromEpoch(seconds: number): string {
  return new Date(seconds * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** A moment inside the dataset's window. */
export function momentIn(clock: Clock, rng: Rng): number {
  return clock.start + Math.floor(rng.next() * clock.span);
}

export function fieldValue(field: ProfileField, rng: Rng, clock: Clock): any {
  // Emptiness first: a field the real feed leaves blank is blank here too,
  // roughly one row in twelve. That is realism, not a problem — the fixture is
  // still valid, and the notes say it happened.
  if (field.nullable && rng.bool(0.08)) return null;

  if (field.values?.length) return rng.pick(field.values);

  switch (field.type) {
    case "int":
      return rng.int(Math.round(field.min ?? 0), Math.round(field.max ?? 1000));
    case "float":
      return round(rng.float(field.min ?? 0, field.max ?? 1000), decimalsOf(field));
    case "bool":
      return rng.bool(0.7);
    case "iso-datetime":
      return isoFromEpoch(momentIn(clock, rng));
    case "epoch-seconds":
      return momentIn(clock, rng);
    case "epoch-millis":
      return momentIn(clock, rng) * 1000;
    default:
      return field.example
        ? fromTemplate(field.example, rng, field.literal)
        : `value-${rng.int(1000, 9999)}`;
  }
}
