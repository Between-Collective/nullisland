/* eslint-disable @typescript-eslint/no-explicit-any */
import { firstPosition, propertyKeys } from "../geo";
import type { Dataset } from "../types";
import { geometryToWKT } from "./wkt";

/**
 * RFC 4180 quoting. Deliberately does NOT defang formula-injection values —
 * the point of the injection-strings problem is to check whether the tool
 * downstream escapes them, so they go out verbatim inside proper quotes.
 */
function csvCell(value: any): string {
  if (value === null || value === undefined) return "";
  let text: string;
  if (typeof value === "object") text = JSON.stringify(value);
  else text = String(value);

  const needsQuotes =
    text.includes(",") ||
    text.includes('"') ||
    text.includes("\n") ||
    text.includes("\r") ||
    text !== text.trim();
  return needsQuotes ? `"${text.replace(/"/g, '""')}"` : text;
}

export function writeCSV(ds: Dataset): string {
  const keys = propertyKeys(ds.features);
  const needsWkt = ds.features.some((f) => f.geometry && f.geometry.type !== "Point");

  const header = ["longitude", "latitude", ...(needsWkt ? ["wkt"] : []), ...keys];
  const lines = [header.map(csvCell).join(",")];

  for (const feature of ds.features) {
    const anchor = feature.geometry?.type === "Point" ? firstPosition(feature.geometry) : null;
    const row: any[] = [anchor?.[0] ?? "", anchor?.[1] ?? ""];
    if (needsWkt) row.push(geometryToWKT(feature.geometry));
    for (const key of keys) {
      row.push(feature.properties && key in feature.properties ? feature.properties[key] : "");
    }
    lines.push(row.map(csvCell).join(","));
  }

  if (needsWkt) {
    ds.notes.push("Non-point geometry moved into a wkt column; longitude/latitude left blank for those rows.");
  }
  return lines.join("\n") + "\n";
}
