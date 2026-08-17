/** Anchor points so generated data lands somewhere plausible instead of the sea. */

export interface Region {
  id: string;
  label: string;
  lon: number;
  lat: number;
  /** Rough radius in degrees used to scatter features around the anchor. */
  spread: number;
}

export const REGIONS: Region[] = [
  { id: "world", label: "Whole world", lon: 0, lat: 0, spread: 0 },
  { id: "london", label: "London", lon: -0.1276, lat: 51.5072, spread: 0.25 },
  { id: "paris", label: "Paris", lon: 2.3522, lat: 48.8566, spread: 0.2 },
  { id: "berlin", label: "Berlin", lon: 13.405, lat: 52.52, spread: 0.25 },
  { id: "lisbon", label: "Lisbon", lon: -9.1393, lat: 38.7223, spread: 0.18 },
  { id: "newyork", label: "New York", lon: -74.006, lat: 40.7128, spread: 0.22 },
  { id: "sanfrancisco", label: "San Francisco", lon: -122.4194, lat: 37.7749, spread: 0.15 },
  { id: "mexicocity", label: "Mexico City", lon: -99.1332, lat: 19.4326, spread: 0.28 },
  { id: "saopaulo", label: "São Paulo", lon: -46.6333, lat: -23.5505, spread: 0.3 },
  { id: "lagos", label: "Lagos", lon: 3.3792, lat: 6.5244, spread: 0.25 },
  { id: "cairo", label: "Cairo", lon: 31.2357, lat: 30.0444, spread: 0.25 },
  { id: "capetown", label: "Cape Town", lon: 18.4241, lat: -33.9249, spread: 0.25 },
  { id: "dubai", label: "Dubai", lon: 55.2708, lat: 25.2048, spread: 0.2 },
  { id: "mumbai", label: "Mumbai", lon: 72.8777, lat: 19.076, spread: 0.22 },
  { id: "singapore", label: "Singapore", lon: 103.8198, lat: 1.3521, spread: 0.14 },
  { id: "tokyo", label: "Tokyo", lon: 139.6917, lat: 35.6895, spread: 0.3 },
  { id: "seoul", label: "Seoul", lon: 126.978, lat: 37.5665, spread: 0.22 },
  { id: "sydney", label: "Sydney", lon: 151.2093, lat: -33.8688, spread: 0.28 },
  { id: "auckland", label: "Auckland", lon: 174.7633, lat: -36.8485, spread: 0.2 },
  { id: "reykjavik", label: "Reykjavík", lon: -21.9426, lat: 64.1466, spread: 0.2 },
  { id: "svalbard", label: "Svalbard (high latitude)", lon: 15.6469, lat: 78.2232, spread: 0.4 },
  { id: "fiji", label: "Fiji (antimeridian)", lon: 178.065, lat: -17.7134, spread: 1.6 },
];

export const DEFAULT_REGION = "london";

export function getRegion(id: string): Region {
  return REGIONS.find((r) => r.id === id) ?? REGIONS[1];
}
