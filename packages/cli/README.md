# nullisland

Generate deliberately broken geospatial files from the command line, so you can find out how your map handles them before your users do.

```bash
npx nullisland --type maritime-ais --format csv --typical --count 200
```

> Not on npm yet. Until it is published that command resolves only inside a clone of this repo, where the workspace links the binary — see [Running it from a clone](#driving-it-from-a-script-or-an-agent).

It is a front end for [`nullisland-core`](https://www.npmjs.com/package/nullisland-core) — the same generator behind [nullisland.app](https://nullisland.app) — so a seed produces the same bytes here, in CI, and in the browser.

## Why a CLI

Fixtures belong in your test suite, not in your downloads folder. A seed is smaller than a file and never goes stale:

```bash
# Regenerate the exact fixture a bug report came from
nullisland --from-url 'https://nullisland.app/#f=geojson&d=flight-adsb&s=quartz-harbor-drift'

# A run of fixtures for a repo, with the notes describing each one
nullisland --package 9 --extract --out test/fixtures --seed sand-frost-ember

# Assert on what came out, without writing a file
nullisland --format geojson --count 20 --json | jq '.notes'
nullisland --format csv --count 20 --stdout | wc -l

# Prove the happy path first: valid files across every format you accept
nullisland --package 9 --clean --extract --out test/fixtures/clean

# And the other end of it: the search terms your users type, with the parse each should get
nullisland --terms 46 --type mobile-location-pings --out test/fixtures/search
```

## What it makes

Nine formats — GeoJSON, GeoJSONL, CSV, KML, KMZ, GPX, WKT, TopoJSON and a real shapefile bundle — carrying any of 23 data types: ADS-B tracks, AIS positions, GTFS stops, cadastral parcels, building footprints, census tracts, ad-exchange pings, scene footprints, and the rest. `--list types` prints them all.

72 problems to bake in, from stacked coordinates and unclosed rings to the ones that only exist in a particular feed — AIS sentinel positions, GTFS times past `24:00:00`, a census GEOID that lost its leading zero in a spreadsheet. `--list problems` prints those.

`--clean` builds the opposite of the usual output: a valid file with nothing wrong with it, checked before it is written and exiting non-zero if a check fails. `--package --clean` does the same across every format at once — the control set to run before the broken one.

`--terms` builds search terms instead of files: the sentences somebody types above a map — *devices in Tokyo and Kyoto*, *devices and aircraft in new zealand*, *devices that were in the Estádio da Luz in Lisbon last week* — each one carrying the parse it should have received. 46 quirks in the catalogue, dealt one per term, so a set of 46 is 46 different problems rather than 46 rolls of the same dice. `--list quirks` prints them and `--list places` prints the gazetteer they resolve against.

`--boundary` writes a second GeoJSON — the area you would filter by — and reports how many features a `contains` and an `intersects` filter should each return, measured from the finished file.

## Options

```
WHAT THE FILE IS
  --format <id>        geojson, ndjson, csv, kml, kmz, gpx, wkt, topojson, shapefile
  --type <id>          data type (--list types)
  --count <n>          features (default 500)
  --shape <id>         point, line, polygon, mixed — defaults to the one the data type comes in
  --region <id>        where it lands (--list regions)

WHAT IS WRONG WITH IT
  --problems <a,b,c>   problem ids (--list problems)
  --typical            what this data type usually arrives with
  --clean              nothing wrong with it: a control fixture, checked before it is written
  --intensity <0-1>    how much of the file each problem touches (default 0.4)
  --boundary <id>      none, bbox, polygon, hole, multipart
  --coverage <0-1>     share of features aimed inside the boundary

REPRODUCING
  --seed <string>      same seed, same bytes (default: a random three-word seed)
  --from-url <url>     read the whole configuration from a share link

OUTPUT
  --out <dir>          where to write (default: the current directory)
  --stdout             write the file to stdout instead
  --context            also write a .md describing everything wrong with it
  --json               a machine-readable summary instead of prose
  --compact            no pretty-printing for JSON formats
  --package <n>        5, 9 or 18 fixtures in one zip
  --extract            write a package out as files rather than a zip

SEARCH TERMS INSTEAD OF FILES
  --terms <n>          build n search terms (default 40) rather than a file
  --quirks <a,b,c>     quirk ids (--list quirks). Omitted deals the whole catalogue out, one per term
  --clean              well-formed queries: the control set, checked before it is written
  --near <id>          build them around a place (--list places), or "anywhere"
  --anchor <iso>       the instant "last week" is relative to (default 2024-06-12T14:35:00.000Z)
  --type <id>          the data type the subject noun comes from — devices, vessels, parcels
  --types <a,b,c>      several kinds in one set. Terms spread across them, and with
                       --quirks many-subjects every query names them together
  --intensity <0-1>    how often a term picks up a second quirk (default 0.15)
  --term-format <id>   jsonl, json, csv, txt, md (default jsonl)

LISTING
  --list <thing>       formats, types, problems, regions, boundaries, quirks, places
  --list <thing> --json   the same catalogue as data, for a script or an agent
```

## Driving it from a script or an agent

Nothing here needs the prose output parsed. Every id comes from `--list <thing> --json`, and every result comes from `--json`.

**The catalogue, as data.** `--list formats|types|problems|regions|boundaries --json`. The problems listing is the one worth having: each entry carries the formats and data types it applies to, so a selection can be made without guessing at what will be silently skipped.

```bash
# Every problem CSV can actually express
nullisland --list problems --json | jq '[.problems[] | select(.formats | index("csv")) | .id]'

# What a data type usually arrives broken with, and the columns it ships
nullisland --list types --json | jq '.dataTypes[] | select(.id=="maritime-ais") | {shape, columns, typicalProblems}'
```

**The result, as data.** `--json` returns the paths written plus everything measured about the file:

```jsonc
{
  "files": ["/abs/path/nullisland-500-seed.geojson"], // every path written, boundary included
  "format": "geojson",
  "dataType": "cadastral-parcels",
  "seed": "harbor-lantern-drift",       // rebuilds these exact bytes
  "features": 500,
  "positions": 2500,
  "bytes": 193512,
  "bbox": [minX, minY, maxX, maxY],     // null when nothing landed in range
  "offWorld": { "outOfRange": 0, "invalid": 0 },
  "problems": ["coincident"],           // what was actually applied, not what was asked for
  "clean": false,                       // true when nothing was applied
  "checks": null,                       // on a clean file: { passed, ran: [{ check, ok, detail }] }
  "notes": ["..."],                     // what was done, and what the format dropped
  "boundary": { "contains": 300, "intersects": 340, "outside": 160 },  // null without --boundary
  "url": "https://nullisland.app/#..."  // reopens this exact configuration
}
```

`problems` is what survived, not what was requested — a problem the format cannot express is dropped, and `clean` goes true if nothing is left. Assert on `problems`, never on the flags you passed.

**Search terms, as data.** `--terms` writes JSONL by default: one term per line, each carrying the query and the parse it should receive.

```jsonc
{
  "id": "t02",
  "query": "devices that were in Dublin in the past 3 days",
  "clean": "devices that were in Japan in the past 3 days",  // the same term with nothing wrong with it
  "quirks": ["ambiguous-place"],                // what was applied, not what was asked for
  "expect": {
    "intent": "history",
    // Always a list: a query can name several kinds, and the answer is their
    // union. `anySubject` is true when it names none at all.
    "subjects": [{ "typed": "devices", "canonical": "devices", "dataType": "mobile-location-pings" }],
    "anySubject": false,
    "resolvable": true,                         // something is there to resolve
    "ambiguous": true,                          // more than one place answers to a name in it
    "empty": false,                             // true when zero rows is the only correct answer
    "antimeridian": false,
    "bbox": null,                               // null while nothing settles on one area
    "places": [{
      "typed": "Dublin",                        // exactly as it appears in the query
      "resolvesTo": null,                       // null: two places answer to this name
      "candidates": [                           // biggest first — the tie-break most stacks use
        { "id": "dublin", "name": "Dublin", "country": "IE", "lat": 53.3498, "lon": -6.2603, "bbox": [], "population": 592000 },
        { "id": "dublin-oh", "name": "Dublin", "country": "US", "lat": 40.0992, "lon": -83.1141, "bbox": [], "population": 49000 }
      ],
      "within": [], "negated": false
    }],
    "time": {
      "kind": "relative",
      "expression": "in the past 3 days",
      "startsAt": "2024-06-10T00:00:00.000Z",
      "endsAt": "2024-06-12T14:35:00.000Z",
      "alternate": { "startsAt": "...", "endsAt": "...", "why": "read as 3 x 24 hours from now rather than 3 calendar days" }
    }
  },
  "notes": ["..."],                             // what a correct search does with this
  "seed": "harbor-lantern-drift-2"
}
```

`resolvesTo` is null in the two cases where no single id is right — the name belongs to nowhere, or to more than one somewhere — so a single confident answer is testable as the bug it is. Windows are anchored to a fixed instant rather than to the clock, so an expected answer that is right today is still right next month; `--anchor` moves it.

```bash
# Just the queries, for pasting into a search box by hand
nullisland --terms 40 --near tokyo --term-format txt --stdout

# Every term whose only correct answer is zero rows
nullisland --terms 46 --stdout | jq -r 'select(.expect.empty) | .query'

# Every quirk that needs a place in the query before it means anything
nullisland --list quirks --json | jq -r '.quirks[] | select(.needs=="place") | .id'

# A report to hand a reviewer, rather than a file to assert against
nullisland --terms 46 --term-format md --out docs

# Queries that span the feeds you actually ship, every one of them
nullisland --terms 40 --types mobile-location-pings,flight-adsb,maritime-ais --quirks many-subjects
```

**Exit codes.** `0` success · `1` a clean file, or a term set, failed its own check — which is a bug in Null Island rather than in your settings · `2` a usage error, printed on stderr. An unknown option, data type, problem, quirk or place id is always an error and never a silent default: a run that quietly ignored a typo would hand back a file you would go on to believe things about.

**Running it from a clone.** Two ways in, and they are not the same thing:

```bash
npm run cli -- --clean --type cadastral-parcels --out fixtures   # current source, rebuilds core first
npx nullisland --clean --type cadastral-parcels --out fixtures   # packages/cli/dist, whatever it last built
```

The workspace links `node_modules/.bin/nullisland` to `packages/cli/dist/index.js`, so the second works without installing anything — but it is a build artefact, and after editing source it runs the previous build until `npm run build`, without saying so. Prefer the first while developing.

When piping, add npm's own `--silent`, or its banner lands on stdout in front of the file:

```bash
npm run --silent cli -- --format geojson --count 20 --stdout | jq .
```

## Handle the output with care

Generated CSVs contain real formula-injection payloads, not defanged lookalikes — that is the point, but do not double-click one into a spreadsheet. The same category includes XSS-shaped and SQL-shaped strings: inert as data, dangerous only if something renders or executes them, which is exactly the property you are testing for.

Nothing is uploaded anywhere, no network calls are made, and nothing is written outside the directory you point it at.

MIT licensed. Bugs and ideas: https://github.com/Between-Collective/nullisland/issues
