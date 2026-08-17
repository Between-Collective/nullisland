/* eslint-disable @typescript-eslint/no-explicit-any */
import { group } from "./format";
import { buildGeometry, makeLineString, makePolygonRing, scatter } from "./base";
import {
  closeRing,
  firstPosition,
  forEachPosition,
  mapPositions,
  round,
  signedArea,
  toWebMercator,
} from "./geo";
import { clone, note, ringsOf, setOwn, targets, type Ctx, type Transform } from "./kit";
import { DOMAIN_ORDER } from "./domain";
import { getRegion } from "./regions";
import type { Rng } from "./rng";
import type { Dataset, Feature, GenerateOptions, Position } from "./types";

/* ── coordinates ─────────────────────────────────────────────────────────── */

const coincident: Transform = (ctx) => {
  const anchor = firstPosition(ctx.ds.features[0]?.geometry) ?? [0, 0];
  const [lon, lat] = anchor as [number, number];
  // Named "everything on one point", so this one leans hard by design.
  for (const i of targets(ctx, Math.max(ctx.share, 0.75))) {
    mapPositions(ctx.ds.features[i].geometry, () => [lon, lat]);
  }
  note(ctx, `Stacked features on ${lon}, ${lat}.`);
};

const swappedLatLng: Transform = (ctx) => {
  for (const i of targets(ctx)) {
    mapPositions(ctx.ds.features[i].geometry, (pos) => [pos[1], pos[0], ...pos.slice(2)]);
  }
};

const nullIsland: Transform = (ctx) => {
  for (const i of targets(ctx)) {
    mapPositions(ctx.ds.features[i].geometry, () => [0, 0]);
  }
};

const PRECISIONS = [0, 1, 2, 3, 4, 6, 8];

const precisionDrift: Transform = (ctx) => {
  for (const i of targets(ctx, Math.max(ctx.share, 0.5))) {
    const decimals = ctx.rng.pick(PRECISIONS);
    const overlong = ctx.rng.bool(0.25);
    mapPositions(ctx.ds.features[i].geometry, (pos) =>
      pos.map((v, axis) => {
        if (axis > 1 || typeof v !== "number") return v;
        // A tiny epsilon forces a long float expansion in the serialised output.
        return overlong ? v + ctx.rng.float(1e-12, 1e-9) : round(v, decimals);
      }),
    );
  }
};

const outOfRange: Transform = (ctx) => {
  for (const i of targets(ctx)) {
    mapPositions(ctx.ds.features[i].geometry, (pos) => {
      const lon = ctx.rng.bool() ? ctx.rng.float(180.1, 540) : ctx.rng.float(-540, -180.1);
      const lat = ctx.rng.bool() ? ctx.rng.float(90.1, 270) : ctx.rng.float(-270, -90.1);
      return [round(lon, 5), round(lat, 5), ...pos.slice(2)];
    });
  }
};

const stringNumbers: Transform = (ctx) => {
  for (const i of targets(ctx)) {
    mapPositions(ctx.ds.features[i].geometry, (pos) => pos.map((v) => String(v)));
  }
};

const antimeridian: Transform = (ctx) => {
  for (const i of targets(ctx, Math.min(ctx.share, 0.4))) {
    const feature = ctx.ds.features[i];
    const geometry = feature.geometry;
    if (!geometry) continue;
    const anchor = firstPosition(geometry);
    const lat = typeof anchor?.[1] === "number" ? anchor[1] : ctx.rng.float(-40, 40);

    if (geometry.type === "Point") {
      geometry.coordinates = [ctx.rng.bool() ? 179.9812 : -179.9756, round(lat, 5)];
    } else if (geometry.type === "LineString") {
      geometry.coordinates = [
        [178.4, round(lat, 5)],
        [179.6, round(lat + 0.2, 5)],
        [-179.6, round(lat + 0.3, 5)],
        [-178.4, round(lat + 0.1, 5)],
      ];
    } else if (geometry.type === "Polygon") {
      geometry.coordinates = [
        closeRing([
          [178.6, round(lat - 0.5, 5)],
          [-178.6, round(lat - 0.5, 5)],
          [-178.6, round(lat + 0.5, 5)],
          [178.6, round(lat + 0.5, 5)],
        ]),
      ];
    } else {
      mapPositions(geometry, (pos) => [ctx.rng.bool() ? 179.97 : -179.97, pos[1], ...pos.slice(2)]);
    }
  }
  note(ctx, "Some geometry crosses the antimeridian.");
};

const poles: Transform = (ctx) => {
  for (const i of targets(ctx)) {
    mapPositions(ctx.ds.features[i].geometry, (pos) => [
      pos[0],
      ctx.rng.pick([90, -90, 89.9999999, -89.9999999]),
      ...pos.slice(2),
    ]);
  }
};

const webMercator: Transform = (ctx) => {
  for (const i of targets(ctx)) {
    mapPositions(ctx.ds.features[i].geometry, (pos) => {
      const lon = Number(pos[0]);
      const lat = Number(pos[1]);
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) return pos;
      return [...toWebMercator(lon, lat), ...pos.slice(2)];
    });
  }
  note(ctx, "Some coordinates are EPSG:3857 metres in a file that claims WGS84.");
};

const zmCoords: Transform = (ctx) => {
  for (const i of targets(ctx)) {
    const withM = ctx.rng.bool(0.4);
    mapPositions(ctx.ds.features[i].geometry, (pos) => {
      const z = round(ctx.rng.float(-120, 3400), 2);
      return withM ? [pos[0], pos[1], z, round(ctx.rng.float(0, 1e6), 1)] : [pos[0], pos[1], z];
    });
  }
};

const nanCoords: Transform = (ctx) => {
  const junk = [null, NaN, "NaN", undefined, Infinity];
  for (const i of targets(ctx, Math.min(ctx.share, 0.3))) {
    mapPositions(ctx.ds.features[i].geometry, (pos) => {
      if (!ctx.rng.bool(0.5)) return pos;
      const out = pos.slice();
      out[ctx.rng.int(0, Math.max(0, out.length - 1))] = ctx.rng.pick(junk);
      return out;
    });
  }
};

/* ── geometry ────────────────────────────────────────────────────────────── */

const mixedGeometry: Transform = (ctx) => {
  const region = getRegion(ctx.opts.region);
  const spread = region.spread || 0.25;
  for (const i of targets(ctx, Math.max(ctx.share, 0.6))) {
    const feature = ctx.ds.features[i];
    const origin = firstPosition(feature.geometry) ?? scatter(ctx.rng, region);
    const kind = ctx.rng.pick([
      "Point", "MultiPoint", "LineString", "MultiLineString",
      "Polygon", "MultiPolygon", "GeometryCollection",
    ] as const);

    switch (kind) {
      case "MultiPoint":
        feature.geometry = {
          type: "MultiPoint",
          coordinates: Array.from({ length: ctx.rng.int(2, 6) }, () => scatter(ctx.rng, region)),
        };
        break;
      case "MultiLineString":
        feature.geometry = {
          type: "MultiLineString",
          coordinates: Array.from({ length: ctx.rng.int(2, 3) }, () =>
            makeLineString(ctx.rng, scatter(ctx.rng, region), spread),
          ),
        };
        break;
      case "MultiPolygon":
        feature.geometry = {
          type: "MultiPolygon",
          coordinates: Array.from({ length: ctx.rng.int(2, 3) }, () => [
            makePolygonRing(ctx.rng, scatter(ctx.rng, region), spread),
          ]),
        };
        break;
      case "GeometryCollection":
        feature.geometry = {
          type: "GeometryCollection",
          geometries: [
            buildGeometry(ctx.rng, "point", origin, spread),
            buildGeometry(ctx.rng, "line", scatter(ctx.rng, region), spread),
          ],
        };
        break;
      case "Point":
        feature.geometry = buildGeometry(ctx.rng, "point", origin, spread);
        break;
      case "LineString":
        feature.geometry = buildGeometry(ctx.rng, "line", origin, spread);
        break;
      default:
        feature.geometry = buildGeometry(ctx.rng, "polygon", origin, spread);
    }
  }
  note(ctx, "Geometry types are mixed within a single collection.");
};

const nullGeometry: Transform = (ctx) => {
  for (const i of targets(ctx, Math.min(ctx.share, 0.35))) {
    ctx.ds.features[i].geometry = null;
  }
};

const emptyGeometry: Transform = (ctx) => {
  for (const i of targets(ctx, Math.min(ctx.share, 0.3))) {
    const geometry = ctx.ds.features[i].geometry;
    if (!geometry) continue;
    if (geometry.type === "GeometryCollection") geometry.geometries = [];
    else geometry.coordinates = [];
  }
};

const unclosedRings: Transform = (ctx) => {
  let touched = 0;
  for (const i of targets(ctx, Math.max(ctx.share, 0.5))) {
    for (const ring of ringsOf(ctx.ds.features[i].geometry)) {
      if (ring.length > 3) {
        ring.pop();
        touched++;
      }
    }
  }
  if (!touched) note(ctx, "No polygons present, so unclosed rings had nothing to break.");
};

const wrongWinding: Transform = (ctx) => {
  let touched = 0;
  for (const i of targets(ctx, Math.max(ctx.share, 0.5))) {
    const geometry = ctx.ds.features[i].geometry;
    if (!geometry) continue;
    const polygons: Position[][][] =
      geometry.type === "Polygon"
        ? [geometry.coordinates as Position[][]]
        : geometry.type === "MultiPolygon"
          ? (geometry.coordinates as Position[][][])
          : [];
    for (const rings of polygons) {
      if (rings[0] && signedArea(rings[0]) > 0) {
        rings[0].reverse();
        touched++;
      }
    }
  }
  if (!touched) note(ctx, "No polygons present, so winding order had nothing to break.");
};

const selfIntersecting: Transform = (ctx) => {
  let touched = 0;
  for (const i of targets(ctx, Math.max(ctx.share, 0.5))) {
    for (const ring of ringsOf(ctx.ds.features[i].geometry)) {
      if (ring.length < 5) continue;
      // Swapping two non-adjacent vertices turns the ring into a bow tie.
      const a = 1;
      const b = Math.floor((ring.length - 1) / 2) + 1;
      [ring[a], ring[b]] = [ring[b], ring[a]];
      ring[ring.length - 1] = [...ring[0]];
      touched++;
    }
  }
  if (!touched) note(ctx, "No polygons present, so self-intersection had nothing to break.");
};

const degenerate: Transform = (ctx) => {
  for (const i of targets(ctx, Math.min(ctx.share, 0.35))) {
    const feature = ctx.ds.features[i];
    const anchor = (firstPosition(feature.geometry) ?? [0, 0]) as Position;
    const type = feature.geometry?.type;
    if (type === "Polygon" || type === "MultiPolygon") {
      feature.geometry = {
        type: "Polygon",
        coordinates: [[[...anchor], [...anchor], [...anchor], [...anchor]]],
      };
    } else {
      // A zero-length track: entirely normal in GPS exports, entirely un-drawable.
      feature.geometry = { type: "LineString", coordinates: [[...anchor], [...anchor]] };
    }
  }
};

const holes: Transform = (ctx) => {
  let touched = 0;
  for (const i of targets(ctx, Math.max(ctx.share, 0.4))) {
    const geometry = ctx.ds.features[i].geometry;
    if (geometry?.type !== "Polygon") continue;
    const rings = geometry.coordinates as Position[][];
    const shell = rings[0];
    if (!shell || shell.length < 4) continue;
    const xs = shell.map((p) => Number(p[0])).filter(Number.isFinite);
    const ys = shell.map((p) => Number(p[1])).filter(Number.isFinite);
    if (!xs.length || !ys.length) continue;
    const cx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const cy = ys.reduce((a, b) => a + b, 0) / ys.length;
    const radius = (Math.max(...xs) - Math.min(...xs)) / 6 || 0.001;
    // Every so often, put the hole outside the shell it belongs to.
    const escaped = ctx.rng.bool(0.25);
    const ox = escaped ? cx + radius * 12 : cx;
    const oy = escaped ? cy + radius * 12 : cy;
    const hole: Position[] = [];
    for (let k = 4; k >= 0; k--) {
      const angle = (k / 5) * Math.PI * 2;
      hole.push([round(ox + Math.cos(angle) * radius, 6), round(oy + Math.sin(angle) * radius, 6)]);
    }
    rings.push(closeRing(hole));
    touched++;
    if (escaped) note(ctx, "At least one interior ring sits outside its exterior ring.");
  }
  if (!touched) note(ctx, "No polygons present, so interior rings had nothing to add.");
};

const VERTEX_BOMB_SIZE = 50000;

const vertexBomb: Transform = (ctx) => {
  // Capped hard: two of these is already several megabytes.
  for (const i of targets(ctx, ctx.share, 2)) {
    const anchor = (firstPosition(ctx.ds.features[i].geometry) ?? [0, 0]) as [number, number];
    const line: Position[] = [];
    for (let k = 0; k < VERTEX_BOMB_SIZE; k++) {
      const angle = k * 0.017;
      const radius = 0.00002 * k;
      line.push([
        round(anchor[0] + Math.cos(angle) * radius, 7),
        round(anchor[1] + Math.sin(angle) * radius * 0.6, 7),
      ]);
    }
    ctx.ds.features[i].geometry = { type: "LineString", coordinates: line };
  }
  note(ctx, `Vertex bomb: a single geometry with ${group(VERTEX_BOMB_SIZE)} vertices.`);
};

const nestedCollections: Transform = (ctx) => {
  const region = getRegion(ctx.opts.region);
  for (const i of targets(ctx, Math.min(ctx.share, 0.3))) {
    const feature = ctx.ds.features[i];
    const inner = feature.geometry ?? buildGeometry(ctx.rng, "point", scatter(ctx.rng, region), 0.2);
    feature.geometry = {
      type: "GeometryCollection",
      geometries: [
        {
          type: "GeometryCollection",
          geometries: [inner, buildGeometry(ctx.rng, "point", scatter(ctx.rng, region), 0.2)],
        },
      ],
    };
  }
};

/* ── attributes ──────────────────────────────────────────────────────────── */

const EXTRA_KEYS = ["ref", "owner", "notes", "zone", "grade", "source_id", "legacy_code", "tags"];

const mixedSchema: Transform = (ctx) => {
  for (const i of targets(ctx, Math.max(ctx.share, 0.6))) {
    const props = ctx.ds.features[i].properties;
    if (!props) continue;
    for (const key of Object.keys(props)) {
      if (key !== "id" && ctx.rng.bool(0.4)) delete props[key];
    }
    for (const key of ctx.rng.sample(EXTRA_KEYS, ctx.rng.int(0, 3))) {
      props[key] = ctx.rng.bool() ? ctx.rng.int(1, 9999) : `v${ctx.rng.int(1, 40)}`;
    }
  }
  note(ctx, "Property keys differ from feature to feature.");
};

const unstableTypes: Transform = (ctx) => {
  const values = [
    () => "1,234.50",
    () => "n/a",
    () => true,
    () => false,
    () => null,
    () => [1, 2, 3],
    () => ({ amount: 12 }),
    () => "12e3",
    () => " 42 ",
  ];
  for (const i of targets(ctx, Math.max(ctx.share, 0.5))) {
    const props = ctx.ds.features[i].properties;
    if (!props) continue;
    const key = ctx.rng.pick(["value", "count", "verified", "status"]);
    if (key in props) props[key] = ctx.rng.pick(values)();
  }
  note(ctx, "At least one property key holds several different types.");
};

const FAKE_NULLS = [null, "", "   ", "NULL", "null", "N/A", "-", "None", "undefined", "#N/A"];

const nullEmpties: Transform = (ctx) => {
  for (const i of targets(ctx, Math.max(ctx.share, 0.5))) {
    const props = ctx.ds.features[i].properties;
    if (!props) continue;
    const keys = Object.keys(props).filter((k) => k !== "id");
    if (!keys.length) continue;
    for (const key of ctx.rng.sample(keys, ctx.rng.int(1, 2))) {
      props[key] = ctx.rng.pick(FAKE_NULLS);
    }
  }
};

const UNICODE = [
  "Café ☕ Ñoño",
  "北京市朝阳区仓库",
  "مركز البيانات الرئيسي",
  "🚚 📦 depot 🗺️",
  "Ångström‌site",
  "école normale",
  "‮reversed text‬",
  "İstanbul Şubesi",
  "𝕲𝖔𝖙𝖍𝖎𝖈 𝕾𝖎𝖙𝖊",
  "Ｆｕｌｌｗｉｄｔｈ Ｄｅｐｏｔ",
  "line one\nline two\ttabbed",
];

const unicodeChaos: Transform = (ctx) => {
  for (const i of targets(ctx, Math.max(ctx.share, 0.5))) {
    const props = ctx.ds.features[i].properties;
    if (!props) continue;
    props.name = ctx.rng.pick(UNICODE);
  }
};

const INJECTION = [
  "<script>alert('xss')</script>",
  '<img src=x onerror="alert(1)">',
  "=1+1",
  '=cmd|\'/c calc\'!A1',
  "+41 20 7946 0000",
  "{{7*7}}",
  "${7*7}",
  "'; DROP TABLE features; --",
  "../../../etc/passwd",
  "</Placemark><Placemark>",
  '{"nested":"json","in":"a string"}',
  "a,b,\"c\",d",
];

const injectionStrings: Transform = (ctx) => {
  for (const i of targets(ctx, Math.max(ctx.share, 0.4))) {
    const props = ctx.ds.features[i].properties;
    if (!props) continue;
    props[ctx.rng.pick(["name", "notes", "label"])] = ctx.rng.pick(INJECTION);
  }
  note(ctx, "Contains injection-shaped strings — check popup escaping and CSV quoting.");
};

const hugeProperties: Transform = (ctx) => {
  const blob = "lorem ipsum dolor sit amet consectetur adipiscing elit ".repeat(1900);
  for (const i of targets(ctx, ctx.share, 5)) {
    const props = ctx.ds.features[i].properties;
    if (!props) continue;
    props.description = blob;
    props.metadata = {
      level1: { level2: { level3: { level4: { level5: { value: "deep", list: [1, 2, 3] } } } } },
    };
  }
  note(ctx, `Oversized properties: ~${Math.round(blob.length / 1024)} KB of text per affected feature.`);
};

const dateChaos: Transform = (ctx) => {
  const formats: Array<(rng: Rng) => any> = [
    () => "2024-03-07T09:15:00Z",
    () => "03/07/2024",
    () => "07/03/2024",
    () => "07-Mar-24",
    () => 1709802900,
    () => 1709802900000,
    () => 45358.3854166667,
    () => "7 March 2024",
    () => "2024-03-07 09:15:00+00",
    () => "",
  ];
  for (const i of targets(ctx, Math.max(ctx.share, 0.6))) {
    const props = ctx.ds.features[i].properties;
    if (!props) continue;
    props.updated_at = ctx.rng.pick(formats)(ctx.rng);
  }
  note(ctx, "updated_at mixes ISO, DD/MM, MM/DD, epoch seconds, epoch millis and Excel serials.");
};

const AWKWARD_KEYS = [
  "geo.point.lat",
  "Name ",
  " leading_space",
  "1st_value",
  "__proto__",
  "constructor",
  "a_really_long_field_name_that_dbf_will_truncate",
  "another_really_long_field_name_truncated_too",
  "UPPER Case Key",
  "key-with-dashes",
  "key,with,commas",
  'key"with"quotes',
  "",
];

const awkwardKeys: Transform = (ctx) => {
  for (const i of targets(ctx, Math.max(ctx.share, 0.5))) {
    const props = ctx.ds.features[i].properties;
    if (!props) continue;
    for (const key of ctx.rng.sample(AWKWARD_KEYS, ctx.rng.int(1, 3))) {
      setOwn(props, key, ctx.rng.pick(["ok", 1, true, null]));
    }
  }
  note(ctx, "Property keys include dots, spaces, quotes, __proto__ and names past the 10-char DBF limit.");
};

const idChaos: Transform = (ctx) => {
  const n = ctx.ds.features.length;
  for (const i of targets(ctx, Math.max(ctx.share, 0.5))) {
    const feature = ctx.ds.features[i];
    const mode = ctx.rng.int(0, 3);
    if (mode === 0) delete feature.id;
    else if (mode === 1) feature.id = String(ctx.rng.int(1, Math.max(1, n)));
    else if (mode === 2) feature.id = ctx.ds.features[0]?.id ?? 1;
    else feature.id = null;
    if (feature.properties) feature.properties.id = feature.id;
  }
  note(ctx, "Feature ids are duplicated, missing, or change type between rows.");
};

/* ── structure ───────────────────────────────────────────────────────────── */

const duplicates: Transform = (ctx) => {
  const picked = targets(ctx, Math.min(ctx.share, 0.4));
  const copies = picked.map((i) => clone(ctx.ds.features[i]));
  ctx.ds.features.push(...copies);
  note(ctx, `Appended ${copies.length} exact duplicate feature(s).`);
};

const denseCluster: Transform = (ctx) => {
  const anchor = (firstPosition(ctx.ds.features[0]?.geometry) ?? [0, 0]) as [number, number];
  const cx = Number(anchor[0]) || 0;
  const cy = Number(anchor[1]) || 0;
  for (const i of targets(ctx, Math.max(ctx.share, 0.33))) {
    // ±0.00005° is roughly a 10 m box: one dot at anything below street zoom.
    mapPositions(ctx.ds.features[i].geometry, () => [
      round(cx + ctx.rng.float(-0.00005, 0.00005), 7),
      round(cy + ctx.rng.float(-0.00005, 0.00005), 7),
    ]);
  }
  note(ctx, "A third of the features sit inside a ~10 m box.");
};

const sparseGlobal: Transform = (ctx) => {
  const spots: Position[] = [
    [-175.2, -8.5], [172.9, 71.2], [-68.4, -54.8], [113.6, -25.9],
    [-45.1, 60.3], [58.2, 23.4], [-149.9, 61.2], [166.4, -77.8],
  ];
  const picked = targets(ctx, Math.min(ctx.share, 0.1), 8);
  picked.forEach((i, k) => {
    const spot = spots[k % spots.length];
    mapPositions(ctx.ds.features[i].geometry, () => [...spot]);
  });
  note(ctx, `${picked.length} outlier(s) scattered worldwide — fit-to-bounds will zoom right out.`);
};

const crsMember: Transform = (ctx) => {
  const epsg = ctx.rng.pick(["27700", "3857", "2154", "28992", "4269"]);
  ctx.ds.extras.crs = {
    type: "name",
    properties: { name: `urn:ogc:def:crs:EPSG::${epsg}` },
  };
  note(ctx, `Declares a legacy crs member for EPSG:${epsg} while the coordinates say otherwise.`);
};

const wrongBbox: Transform = (ctx) => {
  const nonsense = (): number[] => [
    round(ctx.rng.float(-180, -90), 4),
    round(ctx.rng.float(-90, -20), 4),
    round(ctx.rng.float(90, 180), 4),
    round(ctx.rng.float(20, 90), 4),
  ];
  ctx.ds.extras.bbox = nonsense();
  // Also per-feature, so the problem survives formats with no collection wrapper.
  for (const i of targets(ctx, Math.max(ctx.share, 0.4))) {
    ctx.ds.features[i].bbox = nonsense();
  }
  note(ctx, "The bbox members do not match the geometry they describe.");
};

const foreignMembers: Transform = (ctx) => {
  ctx.ds.extras.generator = "nullisland";
  ctx.ds.extras.totalFeatures = ctx.ds.features.length + ctx.rng.int(1, 50);
  ctx.ds.extras.links = [{ rel: "self", href: "https://example.invalid/items" }];
  for (const i of targets(ctx, Math.max(ctx.share, 0.4))) {
    ctx.ds.features[i].style = { color: "#ff0000", weight: 2 };
    ctx.ds.features[i].when = "2024-03-07T09:15:00Z";
  }
  note(ctx, "Top-level and feature-level foreign members are present.");
};

const emptyDataset: Transform = (ctx) => {
  ctx.ds.features = [];
  note(ctx, "Zero features — the empty-result case.");
};

/* ── registry ────────────────────────────────────────────────────────────── */

/**
 * Applied in this order regardless of selection order. Geometry is reshaped
 * before coordinates are mangled, coordinates before attributes, and the
 * whole-dataset transforms last — otherwise, for example, precision drift would
 * be undone by a later antimeridian rewrite.
 */
const ORDER: Array<[string, Transform]> = [
  ["mixed-geometry", mixedGeometry],
  ["nested-collections", nestedCollections],
  ["holes", holes],
  ["vertex-bomb", vertexBomb],
  ["dense-cluster", denseCluster],
  ["sparse-global", sparseGlobal],
  ["antimeridian", antimeridian],
  ["coincident", coincident],
  ["null-island", nullIsland],
  ["poles", poles],
  ["unclosed-rings", unclosedRings],
  ["wrong-winding", wrongWinding],
  ["self-intersecting", selfIntersecting],
  ["degenerate", degenerate],
  ["web-mercator", webMercator],
  ["swapped-latlng", swappedLatLng],
  ["zm-coords", zmCoords],
  ["precision-drift", precisionDrift],
  ["out-of-range", outOfRange],
  ["nan-coords", nanCoords],
  ["string-numbers", stringNumbers],
  ["empty-geometry", emptyGeometry],
  ["null-geometry", nullGeometry],
  ["mixed-schema", mixedSchema],
  ["unstable-types", unstableTypes],
  ["date-chaos", dateChaos],
  ["null-empties", nullEmpties],
  ["unicode-chaos", unicodeChaos],
  ["injection-strings", injectionStrings],
  ["huge-properties", hugeProperties],
  ["awkward-keys", awkwardKeys],
  ["id-chaos", idChaos],
  ["duplicates", duplicates],
  ["crs-member", crsMember],
  ["wrong-bbox", wrongBbox],
  ["foreign-members", foreignMembers],
  ["empty-dataset", emptyDataset],
];

/**
 * Domain problems run first: they are part of what the data *is*, and the
 * general catalogue is then free to corrupt the result on top of them.
 */
const ALL: Array<[string, Transform]> = [...DOMAIN_ORDER, ...ORDER];

export function applyProblems(ds: Dataset, ids: string[], opts: GenerateOptions, rng: Rng): void {
  const selected = new Set(ids);
  const ctx: Ctx = {
    rng,
    opts,
    ds,
    share: Math.max(0.02, Math.min(1, opts.intensity)),
  };
  for (const [id, transform] of ALL) {
    if (selected.has(id)) transform(ctx);
  }
}

export const DATA_PROBLEM_IDS = ALL.map(([id]) => id);
export type { Feature };
export { forEachPosition };
