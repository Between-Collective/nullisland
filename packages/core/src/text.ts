import type { Rng } from "./rng";

/**
 * Byte-level corruptions, applied after serialisation. These are the ones that
 * can't be modelled in the data — a trailing comma isn't a property of a
 * feature, it's a property of the text a serialiser produced.
 */

/** Replaces up to `count` randomly chosen matches, leaving the rest alone. */
function replaceSome(
  text: string,
  pattern: RegExp,
  replacer: (match: RegExpMatchArray) => string,
  rng: Rng,
  count: number,
): { text: string; changed: number } {
  const matches = [...text.matchAll(pattern)];
  if (!matches.length) return { text, changed: 0 };

  const chosen = rng
    .sample(matches, Math.min(count, matches.length))
    .sort((a, b) => (b.index ?? 0) - (a.index ?? 0));

  let out = text;
  for (const match of chosen) {
    const at = match.index ?? 0;
    out = out.slice(0, at) + replacer(match) + out.slice(at + match[0].length);
  }
  return { text: out, changed: chosen.length };
}

export function addBom(text: string): string {
  return "﻿" + text;
}

export function mixLineEndings(text: string, rng: Rng): string {
  return text
    .split("\n")
    .map((line, i) => (i > 0 && rng.bool(0.5) ? "\r" + line : line))
    .join("\n");
}

export function malformJson(text: string, rng: Rng): { text: string; notes: string[] } {
  const notes: string[] = [];
  let out = text;

  const unquoted = replaceSome(out, /"(name|category|status|value|count)":/g, (m) => `${m[1]}:`, rng, 3);
  out = unquoted.text;
  if (unquoted.changed) notes.push(`${unquoted.changed} object key(s) left unquoted.`);

  const singles = replaceSome(
    out,
    /"([A-Za-z][A-Za-z ]{2,24})"(\s*[,}\]])/g,
    (m) => `'${m[1]}'${m[2]}`,
    rng,
    3,
  );
  out = singles.text;
  if (singles.changed) notes.push(`${singles.changed} string(s) rewritten with single quotes.`);

  const trailing = replaceSome(out, /([}\]])(\s*)([}\]])/g, (m) => `${m[1]},${m[2]}${m[3]}`, rng, 2);
  out = trailing.text;
  if (trailing.changed) notes.push(`${trailing.changed} trailing comma(s) added before a closing bracket.`);

  return { text: out, notes };
}

export function injectNanLiterals(text: string, rng: Rng): { text: string; notes: string[] } {
  const result = replaceSome(
    text,
    /-?\d+\.\d+/g,
    () => rng.pick(["NaN", "Infinity", "-Infinity"]),
    rng,
    6,
  );
  return {
    text: result.text,
    notes: result.changed
      ? [`${result.changed} number(s) replaced with bare NaN/Infinity — not valid JSON.`]
      : [],
  };
}

/**
 * What you get when a UTF-8 file is read as Latin-1. Pure ASCII passes through
 * untouched, exactly as it would in the real failure.
 */
function toMojibake(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let out = "";
  for (const byte of bytes) out += String.fromCharCode(byte);
  return out;
}

export function mojibakeStrings(text: string): { text: string; notes: string[] } {
  let changed = 0;
  // The control range is deliberate: this matches everything that is *not*
  // plain ASCII, which is exactly the text a Latin-1 round-trip mangles.
  // eslint-disable-next-line no-control-regex
  const out = text.replace(/[^\x00-\x7F]+/gu, (run) => {
    changed++;
    return toMojibake(run);
  });
  return {
    text: out,
    notes: changed
      ? [`${changed} non-ASCII run(s) re-encoded as Latin-1 mojibake.`]
      : ["Mojibake had no effect: the file is pure ASCII. Turn on Unicode chaos to see it."],
  };
}
