# Testing a geo search with Null Island corpora — a prompt

Paste this into the agent that has access to your search stack. It is
self-contained: it does not need the Null Island repo, only the endpoint.

---

You are testing a geospatial search. Your job is to find where it misreads what
a user typed, using generated corpora that arrive with the correct answer
attached.

## Getting a corpus

```
GET https://nullisland.app/api/terms
```

JSONL, one query per line, 120 by default, a fresh mix every call. Useful
parameters:

| | |
|---|---|
| `terms=200` | how many, up to 500 |
| `seed=round-one` | reproduce an exact corpus; omit for a new one |
| `types=flight-adsb,maritime-ais` | restrict to the feeds you actually ship |
| `quirks=ambiguous-place,here` | only these failure modes |
| `clean=1` | the control set: nothing hard about any of it |
| `near=tokyo` | build the queries around one place |
| `format=json\|csv\|md` | other shapes; JSONL is the one to parse |
| `samples=3` | attach 3 rows of simulated data to every layer that should have some |
| `list=all` | the catalogue — every data type, and the words people use for it |

The seed comes back in `x-nullisland-seed` and in each record. **Record it.**
Any corpus that finds a bug is rebuildable from it forever.

## What a record looks like

```jsonc
{
  "id": "t01",
  "query": "show our devices that are in Sydney",   // put this in your search
  "clean": "show our devices that are in Scotland", // the same term, nothing hard about it
  "quirks": ["ambiguous-place"],                    // what is hard about it
  "expect": { … },                                  // what your search should have understood
  "notes": ["\"Sydney\" is 2 places: Sydney (AU) or Sydney (CA). …"],
  "seed": "schema-sample-1"
}
```

`expect` is the whole contract:

- **`subjects[]`** — every kind of thing asked for: `{typed, canonical, dataType}`.
  `typed` is the user's word, `canonical` is the schema's. More than one means a
  **union**.
- **`anySubject`** — the query named no kind at all.
- **`places[]`** — `{typed, resolvesTo, name, lat, lon, bbox, country, within,
  negated, candidates[], note}`.
- **`time`** — `{kind, expression, startsAt, endsAt, alternate?, empty?}`.
  Instants are ISO 8601 UTC, anchored to a fixed date, not to the clock.
- **`resolvable` · `ambiguous` · `empty` · `needsLocation` · `antimeridian`** —
  the flags that decide how to grade.
- **`bbox`** — the envelope round the included places. For a query naming
  several, the answer is the union of the individual boxes, **not** this.

## Layers — what should come back

A query naming three kinds is **three result sets**, not one. `expect.layers[]`
has one entry per kind, and they do not behave alike:

```jsonc
"scale": "city",
"layers": [
  { "dataType": "flight-adsb", "typed": "aircraft", "canonical": "aircraft",
    "expectRows": true, "geometry": "track", "render": "lines",
    "fields": ["icao24","callsign","baro_altitude", …] },
  { "dataType": "mobile-location-pings", "typed": "devices", "canonical": "devices",
    "expectRows": true, "geometry": "scatter", "render": "clustered",
    "fields": ["ad_id","id_type","horizontal_accuracy", …] },
  { "dataType": "maritime-ais", "typed": "vessels", "canonical": "vessels",
    "expectRows": false,
    "reason": "There is no vessel traffic at Mexico City: no coast, and no navigable inland waterway. …" }
]
```

- **`expectRows: false` is a correct answer, not a failure.** Show the layer as
  empty *with the reason*. Folding it into "no results for your search" is the
  bug: the other two layers still have rows. Returning vessels in Mexico City is
  the other bug.
- **`fields`** is the column list a row of that layer carries. Compare it
  against what your query actually returns — a missing column is a mapping bug
  you would otherwise find in production.
- **`render`** is the display strategy for that geometry at that width:
  `markers` · `clustered` · `heatmap` · `lines` · `simplified-lines` ·
  `polygons` · `choropleth`. Five hundred points across a country is a heatmap;
  five in a venue is five markers. A viewer drawing both the same way is
  unreadable at one end.
- **`scale`** — `venue` · `city` · `region` · `country` · `none` — is where
  `render` comes from, and is worth asserting on its own if you pick your own
  strategy.
- **`sample[]`** appears when you pass `samples=n`: rows shaped like the real
  feed, with coordinates inside the place the query named. Use them to check
  your column mapping without standing up the data.

One rule decides `expectRows`, and only one, because only one can be stated for
every place without guessing: **vessels need water.** Everything else returns
rows anywhere. If the place itself does not resolve, *no* layer has rows — that
is different from a query naming no place at all, which is unbounded.

## Grading

Run `query` through your search. Capture what it resolved to — places, window,
entity types — before it hits the database. Then:

**Places.**
- `resolvesTo` is an id → your search must land on that place. Compare
  coordinates against `lat`/`lon`, or containment against `bbox`.
- `resolvesTo` is `null` **and `candidates` is non-empty** → the name means more
  than one place. Returning one **without saying so is a failure**, even if it
  is `candidates[0]`. Surfacing the choice, or ranking with the tie-break
  stated, is a pass. `candidates` is ordered biggest-population first.
- `resolvesTo` is `null` **and `candidates` is empty** → the name resolves to
  nothing. Zero results *plus a reason* is a pass. Zero results presented as an
  empty area is a failure, and so is a fallback to everything.
- `negated: true` → the place is excluded. Returning its complement means you
  dropped the "not".
- `within` is the containment chain. `"Estádio da Luz in Lisbon"` is **one**
  place; resolving it as two and returning all of Lisbon is a failure.

**Time.**
- `startsAt`/`endsAt` non-null → your window should match. `alternate` is a
  second defensible reading (calendar week vs rolling seven days); landing on it
  is not wrong, landing on it **silently** is what to flag.
- Both null with an `expression` → the words bound nothing. Any window you
  applied was invented; the response should say so.
- `empty: true` → the window cannot contain anything (future, or inverted).
  Zero rows is correct; **quietly swapping the endpoints to be helpful is not**.

**Kinds.**
- One entry → resolve `typed` to `dataType`. `typed !== canonical` means a
  synonym; failing to map it is the common bug, and it usually widens the query
  to everything rather than narrowing it.
- Several → **union, not intersection**. Nothing is both a device and an
  aircraft, so reading the "and" literally over one collection returns zero and
  looks like an honest empty result. That is the failure.
- `anySubject: true` → every layer, or a question back. Not a silent default to
  whichever is first.

**`needsLocation: true`** → there is no answer without the caller's position.
Asking for it, or using one you were given and saying so, is a pass. Centring on
a default is a failure — that is how a user in Lisbon gets results for London.

**Layers.** For each entry in `expect.layers`: did you return that data type at
all; do the columns match `fields`; and for `expectRows: false`, did you say the
layer is empty *and why* rather than reporting the whole query as no results.

**`antimeridian: true`** → the area crosses ±180°. A `minLon < x < maxLon`
filter returns nothing or everything.

## The loop

1. Fetch a corpus with **no seed**. Record the seed you got back.
2. Run all of it. Grade every term by the rules above.
3. Report per round: pass rate, and every failure as
   `seed · term id · query · expected · got · which rule`.
4. For each failure, decide whether it is a bug in the search or a rule you
   disagree with. Fix the bugs. Write down the disagreements — do not silently
   grade around them.
5. Re-run **every seed that has previously failed**, to catch regressions.
6. Then a new seed. Repeat.

**You pass when five consecutive fresh seeds grade 100%, and every previously
failing seed still passes.**

Two things to watch for:

- Run `?clean=1` **first**. Those queries have nothing hard about them. If they
  do not pass, nothing else you learn is about the awkward cases.
- The endpoint is behind bot mitigation. Polling hard can get you a challenge
  page instead of JSONL — check the content type, back off, and prefer
  `?seed=…` for repeat fetches, which are cached and immutable.

## Reporting

At the end, state: rounds run, seeds, pass rate per round, every distinct
failure class with an example, what you fixed, and what you chose not to and
why. A failure class is worth more than a count — "ambiguous place names
resolved silently to the largest candidate, 14 times across 4 seeds" is
actionable; "87% pass" is not.
