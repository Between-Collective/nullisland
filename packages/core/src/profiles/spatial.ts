/**
 * Spatial index keys that sit in a column next to the coordinates.
 *
 * A geohash is generated from the position it belongs to, so a clean file has a
 * key that genuinely decodes back to its own point — which is the only way the
 * problem where the two disagree means anything.
 */

const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

/** Standard geohash. Precision 7 is roughly 150 m, which is what ad data ships. */
export function geohash(lon: number, lat: number, precision = 7): string {
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return "";
  let west = -180;
  let east = 180;
  let south = -90;
  let north = 90;
  let hash = "";
  let bits = 0;
  let value = 0;
  let even = true;

  while (hash.length < precision) {
    if (even) {
      const mid = (west + east) / 2;
      if (lon >= mid) {
        value = (value << 1) + 1;
        west = mid;
      } else {
        value = value << 1;
        east = mid;
      }
    } else {
      const mid = (south + north) / 2;
      if (lat >= mid) {
        value = (value << 1) + 1;
        south = mid;
      } else {
        value = value << 1;
        north = mid;
      }
    }
    even = !even;
    if (++bits === 5) {
      hash += BASE32[value];
      bits = 0;
      value = 0;
    }
  }
  return hash;
}

/** Metres per degree of longitude at a latitude, for accuracy-style fields. */
export function metresPerDegree(lat: number): number {
  return 111_320 * Math.cos((lat * Math.PI) / 180);
}
