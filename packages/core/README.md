# nullisland-core

The generator behind [nullisland.app](https://nullisland.app): deliberately broken geospatial fixtures, from a seed.

```bash
npm install --save-dev nullisland-core
```

```ts
import { generate } from "nullisland-core";

const file = generate({
  format: "geojson",
  profile: "flight-adsb",
  count: 500,
  shape: "line",
  region: "london",
  problems: ["unit-mixture", "track-breaks", "sentinel-values"],
  intensity: 0.4,
  seed: "harbor-lantern-drift",
  pretty: true,
  boundary: "none",
  coverage: 0.6,
});

file.filename;      // "nullisland-500-harbor-lantern-drift.geojson"
file.data;          // string, or Uint8Array for KMZ and shapefiles
file.notes;         // what was done, and what the format silently dropped
file.map;           // sampled positions, with off-world counts, for assertions
file.stats;         // features, problems applied, data type
```

No dependencies, no DOM: it runs in Node, in a bundler, or in a browser, and the same seed produces the same bytes in all three. That is what makes a fixture reportable — a failing test is a seed and a settings object, not a checked-in file.

## What it can build

- **Nine formats.** GeoJSON, GeoJSONL, CSV, KML, KMZ, GPX, WKT, TopoJSON, and a real `.shp`/`.shx`/`.dbf`/`.prj`/`.cpg` bundle in a ZIP — both writers hand-rolled.
- **23 data types.** Real schemas rather than themed column names: `icao24` and `baro_altitude`, `mmsi` and `nav_status`, `APN` and `LAND_VAL`, `B01003_001E`. `PROFILES` lists them; columns agree with each other before a problem breaks them.
- **72 problems.** 42 general, 30 that only exist in a particular data type. `PROBLEMS` lists them, each with the format and data types it applies to.
- **Boundaries with ground truth.** `boundary` emits a second file plus the counts a `contains` and an `intersects` filter should each return, measured from the finished geometry.
- **Packages.** `buildPackage({ seed, size })` returns a ZIP of fixtures sweeping formats and data types, with a README describing every one of them.

## Useful exports

```ts
import {
  generate, buildPackage,            // build things
  FORMATS, PROFILES, PROBLEMS, REGIONS, BOUNDARIES,   // what there is to choose from
  buildContext, contextToText,       // a written account of a fixture, for an issue or an agent
  encodeConfig, decodeConfig,        // the share-link format nullisland.app uses
  randomSeed, normaliseSeed, Rng,    // seeds
} from "nullisland-core";
```

Generated CSVs contain live formula-injection payloads by design — see the [repository README](https://github.com/Between-Collective/nullisland#handling-what-comes-out) before opening one in a spreadsheet.

MIT licensed.
