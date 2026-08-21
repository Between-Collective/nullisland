# Alias soak — a prompt

The corpus soak asks whether a generated term is a sentence someone could have
typed. This one asks the question underneath it: **when a user's word is not
your schema's word, does the search still find the thing.**

That is one mapping — `planes → flight-adsb`, `Bombay → mumbai`, `LHR →
heathrow`, `Holland → nl` — and it fails in both directions. A search that only
knows the schema's word returns nothing and calls the area empty. A search that
matches too loosely returns Nice, France for the word "nice".

Paste the block below. It is written to be run as a loop, and to stop when the
mapping holds rather than when the queries look plausible.

---

Work on the alias mapping in Null Island — the words people use for a thing
against the word the schema uses for it. Both halves count:

- **Kind aliases** — `SUBJECTS` in `packages/core/src/search/phrasing.ts`.
  `aliases` are countable (planes, boats, phones); `massAliases` have no plural
  (aviation, shipping, weather) and cannot follow a quantifier.
- **Place aliases** — `PLACES` in `packages/core/src/search/places.ts`.
  Endonyms (München), exonyms, abbreviations (NYC), former names (Bombay),
  colloquial names (Holland), codes (LHR).

Run this loop, and do not stop early:

1. Generate a corpus that is nothing but alias queries. New seed each round:

   ```bash
   npm run --silent cli -- --terms 60 --shuffle \
     --quirks subject-synonym,local-name,former-name,abbreviated-place,colloquial-name,code-for-place,stripped-diacritics \
     --intensity 0 --seed <new-seed> --stdout
   ```

2. **Read every line.** Not the checks — the lines. For each one ask:
   - Is this a word a person really uses for that thing, or one I invented?
   - Does `expect.subjects[].typed` carry the word in the text, and
     `canonical` the schema's word?
   - Does `expect.places[].typed` carry the alias, with `resolvesTo` the place
     it means?
   - Would a reasonable fuzzy matcher get from the typed word to the canonical
     one? If not, the alias is a trap rather than a test, and the note beside
     it has to say which.

3. Check the mapping is a function. No word may point at two things — that is
   asserted for kinds already; do the same for places, across every alias of
   every entry, and across the two catalogues together. `Georgia` pointing at a
   country and a US state is *deliberate ambiguity* and must be modelled with
   `ambiguousWith`, not left as a silent collision.

4. Anything wrong: document it in one line, fix the generator or the gazetteer
   — not the test — then re-run every seed that has ever failed before moving
   on to a new one.

5. Pass when five consecutive new seeds are clean, and `npm run check` is green.

Add what you learn to the suite as you go: `verify.ts` for anything that is a
property (an alias round-trips, no word points at two things), `scripts/soak.ts`
for anything you could only see by reading (a word that reads as invented, a
mass noun after a quantifier).

Constraints that are not negotiable:

- **Nothing invented.** Every alias must be a word people really use. An
  invented one fails a search for a reason no user can reproduce, which is
  worse than no test.
- **The expectation describes the text.** If a quirk rewrites the word, the
  expectation carries the rewritten one. `inspectTerms` enforces this; do not
  weaken it.
- **Determinism.** `rng.*` call sites are append-only. Adding a draw shifts
  every seed ever generated — if a change needs one, prove the old seeds still
  reproduce byte for byte and say so.
- **The catalogue is the deliverable.** `buildCatalogue()` is what a classifier
  reads. Every alias you add has to appear there, on the right side of the
  countable/mass split.

Finish by saying what the mapping now covers, what it deliberately does not,
and which aliases you rejected as invented.
