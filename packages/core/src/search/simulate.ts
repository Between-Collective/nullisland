/* eslint-disable @typescript-eslint/no-explicit-any */
import { datasetClock } from "../profiles/fields";
import { buildProfileProperties, getProfile } from "../profiles/index";
import { round } from "../geo";
import type { Rng } from "../rng";
import type { LayerExpectation } from "./layers";
import type { Place } from "./places";

/**
 * Rows that look like the feed, inside the place that was asked about.
 *
 * The expected parse says what a query means; this says what the answer to it
 * ought to look like — an `icao24` and a `baro_altitude` for aircraft, an
 * `ad_id` and an `accuracy` for devices, and coordinates that are inside the
 * bounding box of the place the query named rather than somewhere generic.
 *
 * The same field machinery the file half uses builds them, so a row here and a
 * row in a generated fixture of the same data type are the same shape. That is
 * the whole reason it is worth having: a harness can check the columns it gets
 * back against the columns it was told to expect, and both came from one
 * definition.
 *
 * A layer that should have no rows gets none. An empty array is the answer.
 */

/** Somewhere inside the place, drawn from the seed like everything else. */
function pointIn(place: Place, rng: Rng): [number, number] {
  const [minX, minY, maxX, maxY] = place.bbox;
  return [round(rng.float(minX, maxX), 6), round(rng.float(minY, maxY), 6)];
}

export function simulateLayer(
  layer: LayerExpectation,
  places: Place[],
  rng: Rng,
  count: number,
): Array<Record<string, any>> {
  if (!layer.expectRows || count <= 0) return [];
  // The places the layer can actually be in: for vessels that is the wet ones,
  // and a row in the dry one would contradict the reason printed beside it.
  const usable =
    layer.dataType === "maritime-ais" ? places.filter((p) => p.water !== "none") : places;
  if (!usable.length) return [];

  const profile = getProfile(layer.dataType);
  const clock = datasetClock(rng);
  const rows: Array<Record<string, any>> = [];

  for (let i = 0; i < count; i++) {
    const place = usable[i % usable.length];
    const position = pointIn(place, rng);
    const props = buildProfileProperties(profile, rng, {
      rng,
      index: i,
      count,
      position,
      clock,
    });
    // Position first: it is the column a map reads, and a row that carries the
    // schema but lands nowhere is not a row anybody can draw.
    rows.push({ longitude: position[0], latitude: position[1], ...props });
  }
  return rows;
}
