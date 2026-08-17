# nullisland

Generate deliberately broken geospatial files from the command line, so you can find out how your map handles them before your users do.

```bash
npx nullisland --type maritime-ais --format csv --typical --count 200
```

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
```

## What it makes

Nine formats — GeoJSON, GeoJSONL, CSV, KML, KMZ, GPX, WKT, TopoJSON and a real shapefile bundle — carrying any of 23 data types: ADS-B tracks, AIS positions, GTFS stops, cadastral parcels, building footprints, census tracts, ad-exchange pings, scene footprints, and the rest. `--list types` prints them all.

72 problems to bake in, from stacked coordinates and unclosed rings to the ones that only exist in a particular feed — AIS sentinel positions, GTFS times past `24:00:00`, a census GEOID that lost its leading zero in a spreadsheet. `--list problems` prints those.

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
```

## Handle the output with care

Generated CSVs contain real formula-injection payloads, not defanged lookalikes — that is the point, but do not double-click one into a spreadsheet. The same category includes XSS-shaped and SQL-shaped strings: inert as data, dangerous only if something renders or executes them, which is exactly the property you are testing for.

Nothing is uploaded anywhere, no network calls are made, and nothing is written outside the directory you point it at.

MIT licensed. Bugs and ideas: https://github.com/Between-Collective/nullisland/issues
