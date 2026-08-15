# Null Island

**Generate deliberately broken geospatial files, so you can find out how your map handles them before your users do.**

Every geo-viz tool says "bring us whatever you've got". Then a file arrives with every point stacked on one lat/lon, coordinates in metres, a BOM at byte zero, and half the rows missing a geometry.

Null Island generates those files on purpose. Pick a format, pick a size, pick which problems to bake in — or randomise it — and download a fixture.

Everything runs in the browser. Nothing is uploaded, nothing is stored, and the whole thing builds to static files.

*Null Island is 0°N 0°E, in the Gulf of Guinea — the spot every record with missing or zeroed coordinates quietly lands on. It is the most-visited place on Earth that does not exist.*

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

The shapefile and ZIP writers are hand-rolled — there are no dependencies beyond React and Next.

Where a format can't express a problem (there is no `crs` member in a CSV), the app says so and skips it rather than pretending. Where a format silently loses data — GPX flattening polygons to tracks, WKT dropping every attribute, a shapefile coercing mixed geometry to null shapes — the output panel tells you exactly what was dropped.

## Problems

42 of them, in five categories.

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

That runs `tsc --noEmit`, ESLint, and `scripts/verify.ts` — 618 assertions covering every problem in every format it applies to, plus binary structure validation of generated shapefiles (header lengths, record tiling, `.shx`/`.dbf` consistency, ZIP CRCs), XML well-formedness for KML and GPX, ring closure and winding order for boundaries, and determinism.

The boundary checks are deliberately paranoid: every reported count is re-derived with an independent point-in-polygon pass over the written file, because a ground truth you can't trust is worse than none at all.

`npm run build` produces a fully static site in `out/`, deployable to any static host.

## Using the generator without the UI

`src/lib` has no React or Next dependency, so it runs in Node or any bundler:

```ts
import { generate } from "./src/lib/generate";

const file = generate({
  format: "geojson",
  count: 500,
  shape: "point",
  region: "london",
  problems: ["coincident", "precision-drift", "mixed-schema"],
  intensity: 0.4,
  seed: "harbor-lantern-drift",
  pretty: true,
});

file.filename; // "nullisland-500-harbor-lantern-drift.geojson"
file.data;     // string, or Uint8Array for KMZ and shapefiles
file.notes;    // what was done, and what the format silently dropped
```

`generate()` also returns a `map` field — a sampled, bounded view of where the geometry landed, with counts of invalid and out-of-range positions. That's what the plot draws, and it's useful on its own for assertions.

Layout:

- `lib/base.ts` — builds a clean, well-formed dataset
- `lib/mutate.ts` — every problem, as a transform over that dataset, applied in a fixed order
- `lib/text.ts` — byte-level corruptions applied after serialisation
- `lib/formats/` — one writer per format
- `lib/problems.ts` — the catalogue, including which formats can express what

Adding a problem means adding a catalogue entry and one transform function.

## Sharing a fixture

The full configuration lives in the URL hash, so every file you generate has a link that reproduces it exactly. The **Share** button copies it.

## Design

Host Grotesk, a near-black `#0C0D0D`, and a single signature mint `#ECF4EE` that marks anything generated. Light only — it's a daytime tool. Tokens live in `src/app/globals.css`; there are no component libraries and no CSS beyond Tailwind utilities.

## Contributing

42 problems is not all of them. If a real file broke your viewer in a way this can't reproduce yet, [open an issue](https://github.com/Between-Collective/nullisland/issues/new) and describe it — the file, the viewer, and what went wrong.

Pull requests welcome. A new problem is two things:

1. An entry in `src/lib/problems.ts` — id, label, a one-line blurb describing what actually breaks, a category, a phase (`data` for feature-level, `text` for byte-level), and `appliesTo` if only some formats can express it.
2. A transform in `src/lib/mutate.ts`, registered in the `ORDER` array. Geometry is reshaped before coordinates are mangled, coordinates before attributes, and whole-dataset transforms last.

Run `npm run check` before opening a PR. Anything new should keep the suite green, and problems that apply to every format get exercised against every format automatically.

## Licence

MIT — see [LICENSE](LICENSE).
