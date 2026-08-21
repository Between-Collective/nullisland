# Null Island

**Generate deliberately broken geospatial files, so you can find out how your map handles them before your users do.**

Every geo-viz tool says "bring us whatever you've got". Then a file arrives with every point stacked on one lat/lon, coordinates in metres, a BOM at byte zero, and half the rows missing a geometry.

Null Island generates those files on purpose. Pick a format, pick a data type — ADS-B tracks, AIS positions, parcels, census tracts, ad-exchange pings — pick which problems to bake in, and download a fixture. Or randomise it, or take a whole package of them at once.

It generates the other kind too. Pick no problems at all and you get a **clean** file — valid, well-formed, wearing the same real schema — because "does my map load good data" is the question worth settling before any of the rest.

And it generates the other end of the same problem: the **search terms** somebody types above the map. *Devices in Tokyo and Kyoto.* *Devices in new zealand.* *Devices that were in the Estádio da Luz in Lisbon last week.* Each one arrives with the parse it is supposed to receive — the places resolved to real coordinates, the window resolved to instants — so you can assert on the answer instead of squinting at it.

Everything runs in the browser. Nothing is uploaded, nothing is stored, and the whole thing builds to static files. There is a command line too — same generator, same bytes:

```bash
npx nullisland --type maritime-ais --format csv --typical --count 200
```

*Null Island is 0°N 0°E, in the Gulf of Guinea — the spot every record with missing or zeroed coordinates quietly lands on. It is the most-visited place on Earth that does not exist.*

## How to use it

1. **Say what the file is.** Pick a format, and a data type for what it holds — the data type swaps generic columns for a real schema and brings the geometry that goes with it.
2. **Say what is wrong with it.** Tick problems, or press *Typical* for what that kind of feed actually arrives with. *Chaos* sets how much of the file each problem touches. Press *Clean* for the opposite — a valid file, checked before it is handed over, to prove the happy path first.
3. **Watch it happen.** The plot redraws as you go; *Fit* against *World* tells "wrong place" from "wrong shape".
4. **Add a boundary** if you want an answer rather than a picture: a second GeoJSON to filter by, plus the counts `contains` and `intersects` should each return.
5. **Take the file and its context.** Download or copy the fixture; the dark panel holds a written account of everything wrong with it, for an issue or an agent.
6. **Make it reproducible.** Every file comes from its seed, so *Share* copies a link that rebuilds it byte for byte. Put the seed in your test suite instead of committing the file.
7. **Or take a package** — 5, 9 or 18 fixtures in one zip, every format and a spread of data types, with a README and a manifest describing all of them.
8. **Then test the box above the map.** Switch to the *Search terms* tab and the query catalogue is dealt out one problem apiece — a misspelled venue, a name that means two cities, a window that reads two ways — each with its expected parse. *Clean* gives the control set here too.

A word of warning before you open anything in a spreadsheet: see [Handling what comes out](#handling-what-comes-out).

## Why bother

The interesting bugs in map software are almost never in the happy path. They're in the file that a council exported from a 2009 GIS install, or the CSV someone opened in Excel first, or the shapefile whose field names got truncated to ten characters. Those files are hard to keep a good library of, and harder still to reduce to a minimal repro.

So: generate them. Every file is produced from a **seed**, so the same seed always yields byte-identical output. When a fixture breaks something, drop the seed and settings into your test suite and it will reproduce exactly.

## Seeing it

The generated geometry is plotted as you build it, so a problem is something you watch happen rather than read about:

- **Everything on one point** collapses the cloud into a single weighted dot — marks are sized by how many positions stacked there, so five overlapping points and five hundred don't look the same.
- **Swapped lat/lon** flips the cloud into the wrong hemisphere.
- **Out-of-range values** and **null/NaN coordinates** are counted as off-world rather than quietly dropped, with the edge of the valid WGS84 domain drawn in.
- **Global outliers** blow the bounding box out to the whole planet — exactly what fit-to-bounds will do to your viewport.

Toggle between **Fit** (the data's own bounds) and **World** to see whether the data is in the wrong place or merely the wrong shape.

## Formats

| Format | Extension | Notes |
| --- | --- | --- |
| GeoJSON | `.geojson` | RFC 7946. The default everywhere, and the loosest in practice. |
| GeoJSONL | `.geojsonl` | Newline-delimited features. Streams well, breaks on line endings. |
| CSV | `.csv` | Lat/lon columns plus WKT. Quoting and formula injection live here. |
| KML | `.kml` | Google Earth XML. Coordinates are `lon,lat,alt` — easy to mis-read. |
| KMZ | `.kmz` | A zipped KML. Tests that your loader unzips before it parses. |
| GPX | `.gpx` | GPS tracks. No polygons, no real attributes — deeply lossy. |
| WKT | `.wkt` | Bare geometry, one per line. Every attribute is dropped. |
| TopoJSON | `.topojson` | Arc-indexed topology. Most viewers need a conversion step first. |
| Shapefile | `.zip` | Real `.shp`/`.shx`/`.dbf`/`.prj`/`.cpg`, written byte by byte. |

The shapefile and ZIP writers are hand-rolled: the generator package has no dependencies at all, and the web app has none beyond React and Next.

Where a format can't express a problem (there is no `crs` member in a CSV), the app says so and skips it rather than pretending. Where a format silently loses data — GPX flattening polygons to tracks, WKT dropping every attribute, a shapefile coercing mixed geometry to null shapes — the output panel tells you exactly what was dropped.

## Data types

A file of `name`, `category` and `status` columns exercises a parser. It does not exercise the code somebody wrote for an ADS-B altitude, a parcel number or a census GEOID — and that is where the assumptions are, so that is where the bugs are.

Pick a **data type** and the fixture arrives wearing the schema of a real feed: the right column names, the right value ranges, the right geometry. A flight track is a long smooth line, a parcel is a cell of a lot grid that shares edges with its neighbours, a scene footprint is a big axis-aligned rectangle that will happily cross the antimeridian.

| Family | Data types |
| --- | --- |
| Mobility & transport | Flight & aviation (ADS-B) · Maritime & shipping (AIS) · Telematics & fleet · Transit feeds (GTFS) · Micromobility (MDS) |
| AdTech, retail & consumer | Mobile location data · Points of interest · Geosocial & check-ins · Trade area & catchment · Psychographics & spending |
| Real estate & planning | Cadastral & parcel · Building footprints · Zoning & land use · Indoor mapping (IMDF/BIM) · Infrastructure & utilities |
| Earth observation | Satellite & aerial imagery · Elevation contours & spot heights · Weather observations · Land cover & vegetation (NDVI) · Natural hazard zones |
| Demographics & public admin | Census & boundary · Epidemiological & health · Crime & incident |

Earth observation ships as the vector products that arrive alongside the imagery — scene footprints with STAC-style metadata, contours and spot heights, station observations, class polygons — because this is a vector generator. There is no raster pipeline.

Columns agree with each other before anything breaks them: `TOTAL_VAL` is `LAND_VAL` plus `BLDG_VAL`, `last_contact` runs ahead of `time_position`, a vessel at anchor has a speed of zero, the `geo_hash` column is computed from the coordinate beside it, and a tract's `INTPTLAT` is its own internal point. That matters, because a fixture where everything is subtly wrong tests nothing — the point is that everything is right except the thing you selected.

### Problems that only exist in one world

Each data type brings its own catalogue entries, tagged as its own and offered nowhere else: an AIS sentinel position is not a thing that happens to a parcel export, and the app says so rather than inventing it.

**Mobility** — AIS not-available sentinels (position 91/181, speed 102.3, heading 511) · receiver gaps and out-of-order fixes · movement with the engine off · GTFS times past 24:00:00 · ids that belong to the equipment rather than the thing · fixed-width padding

**AdTech & consumer** — coordinates rounded for privacy but still claiming 8 m accuracy · geocoder centroid pile-ups · 64-bit ids through a double · outlines squared off to their envelope · areas that overlap by design · code lists that change mid-file · columns that look categorical and aren't

**Real estate** — slivers and gaps at shared edges · roof outlines rather than ground outlines · coordinates still in the building's own grid · endpoints that nearly meet · many records on one outline · retired records beside their replacements · one key written several ways · area cached from another projection

**Earth observation** — longitudes in the 0–360 domain · two units in one column · unknown as a number (-9999, 99.9, 0)

**Public administration** — leading zeros eaten · two boundary vintages in one key column · population on a tract with no land · unknown times defaulted to midnight on the 1st

**The spreadsheet in the middle** — round-tripped through Excel (`sep=,`, `1.00016E+09`, zeros gone) · unquoted commas shifting every column right

Where several families ship the same breakage under different names, it is one problem that knows the difference: *two units, one column* converts feet to metres for a building height, Celsius to Fahrenheit for a temperature, and 0–1 to 0–100 for a battery, and says which column it touched.

**Typical for this data type** selects what that feed actually arrives with, so you can start from a realistic bad file rather than assembling one.

## The control case

Before you ask whether your map survives bad data, it is worth establishing that it handles good data — and a reader that mangles a clean shapefile will fail every broken fixture too, for a reason that has nothing to do with the fixture.

So **Clean** is a first-class setting rather than the absence of one. Press it (or pass `--clean`) and you get a valid file wearing a real schema: every coordinate inside the WGS84 domain, every ring closed, every feature carrying the same keys, UTF-8 with no BOM and LF throughout. Upload it to prove the happy path works, then tick a problem and watch what changes.

The claim is checked rather than promised. A clean file is inspected before it is handed over, and the checks travel with it — on screen, in the copied context block, in the package README and in `--json`:

```
  ok  Every coordinate is a finite number inside the WGS84 domain (1,000 positions, none off-world)
  ok  Every feature has a geometry and a properties object (200 features, none null or empty)
  ok  Every polygon ring is closed, with at least four positions (200 rings, all closed)
  ok  Every feature carries the same attribute keys (14 keys, identical across 200 features)
  ok  UTF-8 with no byte-order mark, and LF line endings throughout (no BOM, no CR)
```

A failing check is a bug in Null Island, and it says so in those words — the CLI exits non-zero, because a control fixture that is not actually clean sends you hunting a bug in your reader that lives in your test data.

Two things a clean file still does, because real clean data does them: optional attributes are sometimes empty, and a lossy container still drops what it cannot carry — GPX has no attributes, WKT has no properties at all. Both are stated in the notes rather than left for you to discover.

`--package --clean` builds the same sweep of formats and data types with nothing wrong with any of it, which is the artefact to reach for when the question is "does every container we accept actually work".

## Problems

42 general ones, in five categories, plus 30 that belong to particular data types.

**Coordinates** — everything on one point · swapped lat/lon · Null Island · precision drift · out-of-range values · numbers as strings · antimeridian crossing · polar coordinates · projected metres (EPSG:3857) · Z and M values · null/NaN inside coordinates

**Geometry** — mixed geometry types · null geometry · empty coordinate arrays · unclosed rings · wrong winding order · self-intersecting polygons · degenerate shapes · interior rings · vertex bomb · nested GeometryCollections

**Attributes** — inconsistent schema · unstable property types · nulls and fake nulls · Unicode chaos · injection-shaped strings · oversized properties · six date formats · awkward property keys · broken feature ids

**Structure** — exact duplicates · overplotted cluster · global outliers · legacy `crs` member · lying bbox · foreign members · empty result

**Bytes & encoding** — UTF-8 BOM · mixed line endings · malformed JSON · bare NaN/Infinity · mojibake

The **Chaos** slider controls how much of the dataset each selected problem touches.

## Boundaries

Filtering by an uploaded area is its own class of bug, and the reason those bugs survive is that you can't tell by looking. A map draws a boundary, draws some pins, returns a number — and the number looks fine whether or not it's right.

So Null Island generates the boundary and the data together, and tells you the answer.

Pick a boundary shape and you get a **second file**, `…-boundary.geojson`, holding one polygon:

| Shape | Geometry | What it catches |
| --- | --- | --- |
| **Box** | `Polygon`, 5 positions, plus a `bbox` member | The plain min/max case |
| **Irregular** | `Polygon`, 48 vertices | Forces real point-in-polygon, not a min/max comparison |
| **Hole** | `Polygon` with an interior ring | Points in the hole are outside — plenty of filters disagree |
| **Two parts** | `MultiPolygon`, two disjoint areas | Naive readers only ever see the first part |

Exterior rings wind counter-clockwise and interior rings clockwise, per RFC 7946, because getting that backwards is itself a common way to make a filter return nothing at all.

The **Inside** slider sets how much of the dataset lands within the boundary. Every feature is then tagged with the answer your filter should give:

```json
{ "type": "Feature",
  "properties": { "name": "West Quay Depot", "inside": true, "intersects": true, … },
  "geometry": { "type": "Point", "coordinates": [-0.0713, 51.5019] } }
```

- `inside` — every position within the boundary. A **contains** filter should return exactly these.
- `intersects` — at least one position within. An **intersects** filter should return these too.

For points the two agree. For lines and polygons they don't, and the difference is the whole problem: a 250-feature polygon set against a box might be 107 contained and 119 intersecting. If your filter returns 119 when you meant containment, that gap is the bug.

The counts are measured from the finished file, not from what was requested — so they stay true when a problem is selected too. Turn on **Null Island** and watch the contained count fall as features get dragged to 0°N 0°E.

Boundaries are off by default, and the whole configuration still lives in the URL, so a boundary fixture shares and reproduces like any other.

## Packages

One file at a time answers "does my map survive this problem". A **package** answers the question you actually have — does it survive a morning of real uploads — by rolling 5, 9 or 18 fixtures at once and zipping them together.

The formats are swept rather than drawn at random, so a nine-file package contains every container exactly once, and a five-file one still covers GeoJSON, CSV, a real shapefile bundle, KML and GeoJSONL. The data types are swept too, striding across the taxonomy so nine files are nine different kinds of data from at least four families — flight tracks as KML next to a parcel shapefile next to census tracts as TopoJSON. Each file gets its own size, place and problem set, including at least one thing its data type is known for, and the lead problem category rotates so coordinates, geometry, attributes, structure and encoding are all represented before anything repeats. Roughly two files in five come with a boundary and its ground-truth counts.

The archive contains:

```
README.md          every file, what's in it, what's wrong with it, and a link that rebuilds it
manifest.json      the same thing for something that would rather not read prose
files/             the fixtures, plus any boundary sidecars
```

`README.md` is the AI context for the whole package rather than a single file — drop the folder into an agent's working directory and it can test against the notes without opening a fixture. Every entry ends with a link that regenerates that exact file, and the on-screen listing has an **open** link per file that loads its settings back into the generator.

Switch the package to **Clean** and the sweep stays exactly the same — every container, the same spread of data types, the same boundary ground truth — with nothing wrong with any of it. That archive is named `nullisland-clean-pack-…` so it cannot be mistaken for the other one on disk, and its README says plainly that every file should load with no features lost.

The whole package derives from one seed, so `nullisland-pack-9-sand-frost-ember.zip` is rebuilt byte for byte from `sand-frost-ember`, and each file inside it from `sand-frost-ember-3` and so on. Packages stay in the hundreds of features per file: breadth is the point, and breadth at 500 features finds the same bugs as breadth at 50,000.

## Search terms

A map has two inputs. The file is one. The other is the sentence in the search box, and it fails in a completely different set of ways — so the same idea is applied to it: a control case first, then one thing hard at a time, everything reproducible from a seed.

```bash
npx nullisland --terms 46 --type mobile-location-pings --out test/fixtures/search
```

The catalogue has **46 quirks** across five categories, and with none selected they are dealt out one per term — so a set of 46 is 46 different problems rather than 46 rolls of the same dice.

- **Place** — a misspelled venue, a name that means two cities, an endonym, an abbreviation, a former name, a place that does not exist, a whole country whose real bounding box is not the one everybody draws.
- **Time** — *last week* (the previous calendar week, or a rolling seven days?), `03/04/2024` (both readings are valid dates, weeks apart), *next week* for historic positions, a range with its ends the wrong way round.
- **Phrasing** — no place at all, a negation, one area minus another, keywords with no preposition to hang the place on, a question, politeness, another language entirely. And what the query is *about*: several kinds of thing at once, the user's word rather than your schema's, or no kind at all.
- **Encoding** — curly quotes out of a word processor, a non-breaking space inside *New York*, a zero-width space, a Cyrillic `о` in *Tokyo*, UTF-8 read as Latin-1.
- **Adversarial** — an apostrophe in a name that has always had one, instructions aimed at the model behind the search, a newline in the middle, far more input than expected.

The part that makes them fixtures rather than strings is what travels beside them:

```jsonc
{
  "query": "devices that were in Dublin in the past 3 days",
  "quirks": ["ambiguous-place"],
  "expect": {
    "subjects": [{ "typed": "devices", "canonical": "devices", "dataType": "mobile-location-pings" }],
    "ambiguous": true,
    "places": [{
      "typed": "Dublin",
      "resolvesTo": null,           // two places answer to this name, so no single id is right
      "candidates": [               // biggest first: the tie-break most stacks reach for
        { "name": "Dublin", "country": "IE", "lat": 53.3498, "lon": -6.2603, "population": 592000 },
        { "name": "Dublin", "country": "US", "lat": 40.0992, "lon": -83.1141, "population": 49000 }
      ]
    }],
    "time": { "startsAt": "2024-06-10T00:00:00.000Z", "endsAt": "2024-06-12T14:35:00.000Z", "alternate": { "why": "read as 3 x 24 hours from now rather than 3 calendar days" } }
  }
}
```

### More than one kind of thing

A query does not have to be about one layer. `devices and aircraft in Tokyo` names two, and the answer is their **union** — nothing is both, so a planner that reads the conjunction literally over one collection returns zero rows and looks right doing it. `everything in Tokyo` names none, and the answer is every layer or a question back, not a silent default to whichever is first.

So `subjects` is always a list, and it carries what was typed alongside what your schema calls it:

```jsonc
"subjects": [
  { "typed": "devices", "canonical": "devices",  "dataType": "mobile-location-pings" },
  { "typed": "planes",  "canonical": "aircraft", "dataType": "flight-adsb" }
],
"anySubject": false
```

`typed` and `canonical` differ whenever somebody used their word instead of yours — planes for aircraft, boats for vessels, phones for devices, lorries for vehicles. That is its own quirk, and it is the one that quietly widens a query to everything: the place resolves, the kind does not, and the unmatched token has to go somewhere.

Kinds are drawn from the ones people name in the same breath — things that move, things on the ground, things measured from orbit, things about people — so you get `aircraft and vessels` rather than `devices and census tracts`.

`resolvesTo` is null in exactly the two cases where no single answer is correct — the name belongs to nowhere, or to more than one somewhere — because a search that returns one result confidently is the failure this is here to catch, and an expectation that named a winner would contradict its own note.

Windows are anchored to a fixed instant rather than to the clock, so an expected answer that is right today is still right next month. `--anchor` moves it.

Five containers: `jsonl` (one term per line, what a test suite reads), `json`, `csv`, `txt` (the queries and nothing else, for pasting into a search box) and `md` (a report to hand a reviewer or an agent). The `txt` one cannot carry the expected parse, and says so in the file it writes.

`--near tokyo` builds the terms around a place and everything inside it. It is a preference rather than a fence: a quirk that needs a name with a particular property — one that means two places, one with an old name — reaches further when nothing local has that property, and the expectation always names the place it actually used.

Everything here goes through the same checks the files do, in both directions. On a control set they establish that nothing is wrong. On any set at all they establish the thing that has to hold whatever the quirks are: that the query text really contains the place and the window the expectation names. A term that describes a string it does not contain would fail every implementation there will ever be, so a failure is reported as a bug in Null Island rather than in your search.

## Handling what comes out

The files are hostile on purpose, and a couple of them are hostile to *you*, not just to your parser.

**Generated CSVs contain real formula-injection payloads.** Pick "injection-shaped strings" and rows will include `=cmd|'/c calc'!A1` — the actual DDE payload, not a defanged lookalike. That is the point: if your importer writes it to a CSV that someone later opens in Excel, you want to have found that out here. But don't casually double-click a generated CSV yourself. Open it in a text editor, or import it with formulas disabled.

**Generated files are meant for parsers, not for people.** The same category includes XSS-shaped strings and SQL-shaped strings. They are inert as data and dangerous only if something renders or executes them — which is exactly the property you are testing for.

**The seed is normalised before it reaches a filename.** Seeds arrive from the URL, and the filename ends up as the member names inside a generated ZIP, so anything outside `A-Za-z0-9._-` is flattened to a dash. Without that, a seed of `../../x` would produce a shapefile archive whose five members escape the directory they were extracted into — a real problem for the exact audience this tool has. Three-word seeds are unaffected.

**Large share links ask first.** A link requesting more than 10,000 features loads its settings but waits for a click. Generation is synchronous, and at the top of the range it blocks the tab for seconds and allocates over a gigabyte — fine as a choice you made with the sliders, not fine as something a link does to you on open. Nothing is capped.

The deployed site sends a strict `Content-Security-Policy` along with `nosniff`, `frame-ancestors 'none'` and a closed `Permissions-Policy` (see [vercel.json](vercel.json)). `script-src` has to allow `'unsafe-inline'` because a static Next export inlines its hydration payload and has no server to mint a nonce — so the CSP is a hardening measure here, not a complete XSS defence. The app has no HTML-injection sinks, no backend, no auth, no cookies and no analytics, and after load it makes no network requests at all, which is what lets `connect-src` stay closed.

## Running it

```bash
npm install
npm run dev
```

To check everything:

```bash
npm run check
```

That builds the core package, then runs `tsc --noEmit` and ESLint over all three workspaces, `packages/core/scripts/verify.ts` (2,414 assertions) and the CLI smoke test (119 assertions). It covers every problem in every format it applies to, binary structure validation of generated shapefiles (header lengths, record tiling, `.shx`/`.dbf` consistency, ZIP CRCs), XML well-formedness for KML and GPX, ring closure and winding order for boundaries, every data type in three formats, every domain problem against the data types it claims (and its refusal against the ones it doesn't), and determinism — including that every reproduce link in a package README really does rebuild its file byte for byte, that the CLI's output matches the library's to the byte, and that any settings rebuild from their own share link — the fractions included, since a link only carries whole percent.

For the search half it covers the gazetteer itself (every centroid inside its own box, every containment chain terminating, ambiguity symmetric in both directions), that every quirk in the catalogue really applies rather than being offered and doing nothing, that every set describes its own query text, that the containers round-trip — every CSV row the same width, every JSONL line parseable on its own, every query preserved byte for byte — and the edges: a hostile seed that cannot escape the filename, an anchor that is not a date, a quirk id that is not in the catalogue.

The boundary checks are deliberately paranoid: every reported count is re-derived with an independent point-in-polygon pass over the written file, because a ground truth you can't trust is worse than none at all.

`npm run build` builds the core package and produces a fully static site in `apps/web/out/`, deployable to any static host.

## Layout

Three workspaces, one implementation of the generator:

```
packages/core/   nullisland-core — the generator. No dependencies, no DOM.
packages/cli/    nullisland — the command line, a thin front for core.
apps/web/        nullisland.app — the Next app, importing core.
```

The split is by layer rather than by language on purpose. The promise this tool makes is that a seed reproduces a file byte for byte, which is what lets a share link become a test case — and two implementations in two languages could not hold that without a conformance suite policing every new problem forever. So there is one generator, and the CLI and the web app are both thin.

## The command line

```bash
npx nullisland --list types
npx nullisland --type cadastral-parcels --format shapefile --typical --out fixtures
npx nullisland --clean --type cadastral-parcels --format shapefile --out fixtures
npx nullisland --package 9 --clean --extract --out test/fixtures/clean
npx nullisland --package 9 --extract --out test/fixtures --seed sand-frost-ember
npx nullisland --from-url 'https://nullisland.app/#f=geojson&d=flight-adsb&s=quartz-harbor-drift'
npx nullisland --format geojson --count 20 --json | jq '.notes'
npx nullisland --terms 46 --type mobile-location-pings --out test/fixtures/search
npx nullisland --terms 40 --near tokyo --term-format txt --stdout
npx nullisland --list quirks --json | jq -r '.quirks[] | select(.needs=="place") | .id'
```

`--from-url` is the one worth knowing: build a fixture by clicking, copy the share link, and the CLI rebuilds that exact file in CI. `--json` prints the counts, the bounds, the off-world tally and the notes, so a test can assert on what it was given. Full options in [packages/cli/README.md](packages/cli/README.md).

## Using the generator without the UI

`nullisland-core` has no dependencies and no DOM, so it runs in Node, in a bundler, or in a browser:

```ts
import { generate } from "nullisland-core";

const file = generate({
  format: "geojson",
  count: 500,
  shape: "point",
  region: "london",
  profile: "flight-adsb",
  problems: ["coincident", "precision-drift", "mixed-schema"],
  intensity: 0.4,
  seed: "harbor-lantern-drift",
  pretty: true,
});

file.filename; // "nullisland-500-harbor-lantern-drift.geojson"
file.data;     // string, or Uint8Array for KMZ and shapefiles
file.notes;    // what was done, and what the format silently dropped
```

Packages come from the same place:

```ts
import { buildPackage } from "nullisland-core";

const pack = buildPackage({ seed: "sand-frost-ember", size: 9 });

pack.filename; // "nullisland-pack-9-sand-frost-ember.zip"
pack.data;     // Uint8Array — the archive
pack.readme;   // the AI context for every file in it
pack.entries;  // each file, its options, its notes and its path inside the zip
```

Pass `problems: []` for a control fixture, or `clean: true` for a whole control package. Either way the result carries the checks that were run on it:

```ts
const control = generate({ ...options, problems: [] });

control.stats.clean;    // true — nothing was applied
control.clean.passed;   // true — and it was checked, not assumed
control.clean.checks;   // each check, with the measurement behind it
```

Search terms too, from the same package and the same kind of seed:

```ts
import { generateTerms, inspectTerms, writeTerms } from "nullisland-core";

const set = generateTerms({
  seed: "harbor-lantern-drift",
  count: 43,
  profile: "mobile-location-pings",
  quirks: [],          // empty deals the whole catalogue out, one per term
  intensity: 0.15,
  near: "anywhere",
  anchor: "2024-06-12T14:35:00.000Z",
});

set.terms[0].text;     // the query, exactly as a user would type it
set.terms[0].expect;   // the parse it should receive: places, coordinates, window
set.terms[0].clean;    // the same term with nothing wrong with it
inspectTerms(set);     // the checks that establish it describes its own text
writeTerms(set, "jsonl", "harbor-lantern-drift");
```

Pass `clean: true` for the control set. `generate()` also returns a `map` field — a sampled, bounded view of where the geometry landed, with counts of invalid and out-of-range positions. That's what the plot draws, and it's useful on its own for assertions.

Inside the package:

- `base.ts` — builds a clean, well-formed dataset
- `mutate.ts` — every problem, as a transform over that dataset, applied in a fixed order
- `text.ts` — byte-level corruptions applied after serialisation
- `formats/` — one writer per format
- `problems.ts` — the catalogue, including which formats and data types can express what
- `profiles/` — the 23 data types: field lists, geometry modes, and the cross-column arithmetic that has to hold
- `domain.ts` — problems that only exist inside a data type, each told which columns it applies to
- `lib/package.ts` — the format sweep, the archive, and the context written into it
- `search/places.ts` — the gazetteer: coordinates, bounding boxes, aliases, and every other place that answers to the same name
- `search/quirks.ts` — the query catalogue, and what a query has to contain before each one means anything
- `search/terms.ts` — the planner, the quirks as transforms, and the expected parse that comes out of it

Adding a problem means adding a catalogue entry and one transform function. Adding a data type means adding a field list — the writers, the problems and the UI pick it up from there.

## Sharing a fixture

The full configuration lives in the URL hash, so every file you generate has a link that reproduces it exactly. The **Share** button copies it.

## Design

Host Grotesk, a near-black `#0C0D0D`, and a single signature mint `#ECF4EE` that marks anything generated. Light only — it's a daytime tool. Tokens live in `apps/web/src/app/globals.css`; there are no component libraries and no CSS beyond Tailwind utilities.

## Contributing

72 problems is not all of them. If a real file broke your viewer in a way this can't reproduce yet, [open an issue](https://github.com/Between-Collective/nullisland/issues/new) and describe it — the file, the viewer, and what went wrong.

Pull requests welcome. A new problem is two things:

1. An entry in `packages/core/src/problems.ts` — id, label, a one-line blurb describing what actually breaks, a category, a phase (`data` for feature-level, `text` for byte-level), `appliesTo` if only some formats can express it, and `profiles` if it only exists in particular data types.
2. A transform in `packages/core/src/mutate.ts` (or `domain.ts` for a data-type-specific one), registered in the `ORDER` array. Geometry is reshaped before coordinates are mangled, coordinates before attributes, and whole-dataset transforms last.

A new data type is one field list in `packages/core/src/profiles/` — the writers, the problem grid, the CLI and the package sweep pick it up from there.

A new search quirk is the same shape: an entry in `packages/core/src/search/quirks.ts` — id, label, blurb, category, a phase (`plan` if it changes what the query asks for, `text` if it only changes how the query is written), and `needs` for what the query must already contain — plus one transform in `packages/core/src/search/terms.ts`. The suite will then check that it really applies rather than being offered and quietly doing nothing.

Run `npm run check` before opening a PR. Anything new should keep the suite green, and problems that apply to every format get exercised against every format automatically.

## Licence

MIT — see [LICENSE](LICENSE).
