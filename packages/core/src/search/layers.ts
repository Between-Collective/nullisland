import { getProfile, type GeometryMode } from "../profiles/index";
import { getSubject } from "./phrasing";
import type { Place } from "./places";

/**
 * What should come back, per kind of thing, and how a map should draw it.
 *
 * A query naming three kinds is three result sets, not one, and they do not
 * behave alike: aircraft are tracks, parcels are polygons, devices are a cloud
 * of points, and one of the three may correctly be empty. "Show me aircraft,
 * devices and vessels in México D.F." has an honest answer of two layers and a
 * blank — Mexico City is 2,240 m above sea level and 300 km from the coast, so
 * there is no vessel traffic to find. A search that returns vessels there is
 * wrong; so is one that reports the whole query as no results.
 *
 * The display strategy is here for the same reason the geometry is: five
 * hundred points at country scale is a heatmap and five at venue scale is five
 * markers, and a viewer that draws both the same way is unreadable at one end
 * or the other.
 */

/** How wide the query is, which decides how its results have to be drawn. */
export type Scale = "venue" | "city" | "region" | "country" | "none";

export type Render =
  /** Individual, labelled. */
  | "markers"
  /** Too many to place individually; group them. */
  | "clustered"
  /** Far too many; draw density instead. */
  | "heatmap"
  | "lines"
  /** Lines, generalised — full precision at this width is wasted bytes. */
  | "simplified-lines"
  | "polygons"
  /** Polygons carrying a value, shaded by it. */
  | "choropleth";

export interface LayerExpectation {
  /** The data type this layer is of. */
  dataType: string;
  /** The word the query used for it. */
  typed: string;
  /** The word the schema uses. */
  canonical: string;
  /**
   * Whether this layer can have rows here at all.
   *
   * False is a real answer and a correct one. A viewer should say the layer is
   * empty and why, rather than folding it into "no results".
   */
  expectRows: boolean;
  /** Why there are none, when there are none. */
  reason?: string;
  /** The shape the geometry comes in. */
  geometry: GeometryMode;
  /** What to draw, given that shape at this width. */
  render: Render;
  /** The columns a row of this carries. */
  fields: string[];
  /** A few rows, shaped like the real feed. Present only when asked for. */
  sample?: Array<Record<string, unknown>>;
}

/** The widest place the query names, which is what the results have to fit. */
export function scaleOf(places: Array<Place | null>): Scale {
  const kinds = places.filter(Boolean).map((p) => (p as Place).kind);
  if (kinds.includes("country")) return "country";
  if (kinds.includes("region")) return "region";
  if (kinds.includes("city")) return "city";
  if (kinds.includes("venue")) return "venue";
  return "none";
}

/** Geometry that is drawn as an area rather than as a position or a path. */
const AREAL: GeometryMode[] = ["parcel", "zone", "footprint", "tile"];
const LINEAR: GeometryMode[] = ["track", "route", "network"];

/**
 * What to draw. The geometry decides the family; the width decides whether the
 * individual features are still worth drawing individually.
 */
export function renderFor(geometry: GeometryMode, scale: Scale): Render {
  if (LINEAR.includes(geometry)) {
    return scale === "country" || scale === "region" ? "simplified-lines" : "lines";
  }
  if (AREAL.includes(geometry)) {
    return scale === "country" || scale === "region" ? "choropleth" : "polygons";
  }
  // Points. At a venue you can place every one; across a country you cannot.
  if (scale === "country") return "heatmap";
  if (scale === "region" || scale === "city") return "clustered";
  return "markers";
}

/**
 * Whether a kind of thing can be here at all, and what to say when it cannot.
 *
 * Deliberately one rule. Vessel traffic is a fact about a place that holds
 * today and next year, so it can be asserted; whether a city has a scooter
 * scheme or publishes a GTFS feed is a fact about this month, and a fixture
 * asserting it would be wrong by the time somebody read it.
 */
export function rowsExpected(
  dataType: string,
  places: Array<Place | null>,
): { expectRows: boolean; reason?: string } {
  const known = places.filter(Boolean) as Place[];
  // The query named somewhere and none of it resolved, so there is nowhere to
  // look — for any kind, not just this one. Different from naming nowhere at
  // all, which is an unbounded query rather than an unanswerable one.
  if (places.length && !known.length) {
    return {
      expectRows: false,
      reason:
        "No place in this query resolves, so there is nowhere to look. Zero rows is right for " +
        "every layer here, and the reason is that the place is unknown rather than that it is empty.",
    };
  }
  if (!known.length || dataType !== "maritime-ais") return { expectRows: true };

  // One place with water is enough: "vessels in Lisbon and Madrid" has an
  // answer, it is just entirely in Lisbon.
  const wet = known.filter((p) => p.water !== "none");
  if (wet.length) return { expectRows: true };

  const names = known.map((p) => p.name).join(" or ");
  return {
    expectRows: false,
    reason:
      `There is no vessel traffic at ${names}: no coast, and no navigable inland waterway. ` +
      "An empty layer is the correct answer here, and it is not the same as the query having failed — " +
      "the other layers should still return their rows.",
  };
}

export function buildLayer(
  dataType: string,
  typed: string,
  places: Array<Place | null>,
  scale: Scale,
): LayerExpectation {
  const profile = getProfile(dataType);
  const { expectRows, reason } = rowsExpected(dataType, places);
  return {
    dataType,
    typed,
    canonical: getSubject(dataType).plural,
    expectRows,
    ...(reason ? { reason } : {}),
    geometry: profile.geometry,
    render: renderFor(profile.geometry, scale),
    fields: profile.fields?.length ? profile.fields.map((f) => f.name) : [],
  };
}
