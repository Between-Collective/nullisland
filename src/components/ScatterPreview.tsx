"use client";

import { useState } from "react";
import type { MapPreview } from "@/lib/types";

const W = 360;
const H = 180;
const GRATICULE_STEPS = [90, 45, 30, 15, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.01, 0.005, 0.001];

type View = [number, number, number, number];

const WORLD: View = [-180, -90, 180, 90];

/**
 * The plot window. Fit mode expands degenerate bounds (every point stacked on
 * one spot has zero width) and forces the 2:1 ratio of the drawing area so the
 * scatter is never stretched.
 */
function computeView(bbox: MapPreview["bbox"], fit: boolean): View {
  if (!fit || !bbox) return WORLD;

  let [x0, y0, x1, y1] = bbox;
  const MIN_SPAN = 0.004;

  if (x1 - x0 < MIN_SPAN) {
    const mid = (x0 + x1) / 2;
    x0 = mid - MIN_SPAN / 2;
    x1 = mid + MIN_SPAN / 2;
  }
  if (y1 - y0 < MIN_SPAN) {
    const mid = (y0 + y1) / 2;
    y0 = mid - MIN_SPAN / 2;
    y1 = mid + MIN_SPAN / 2;
  }

  const padX = (x1 - x0) * 0.12;
  const padY = (y1 - y0) * 0.12;
  x0 -= padX;
  x1 += padX;
  y0 -= padY;
  y1 += padY;

  const width = x1 - x0;
  const height = y1 - y0;
  if (width / height < W / H) {
    const need = (height * W) / H;
    const mid = (x0 + x1) / 2;
    x0 = mid - need / 2;
    x1 = mid + need / 2;
  } else {
    const need = (width * H) / W;
    const mid = (y0 + y1) / 2;
    y0 = mid - need / 2;
    y1 = mid + need / 2;
  }
  return [x0, y0, x1, y1];
}

/** Largest round step that still yields a readable number of grid lines. */
function stepFor(span: number): number {
  return GRATICULE_STEPS.find((s) => span / s >= 3) ?? 0.001;
}

function ticks(min: number, max: number, step: number): number[] {
  const out: number[] = [];
  const start = Math.ceil(min / step) * step;
  for (let v = start; v <= max && out.length < 40; v += step) out.push(v);
  return out;
}

function fmt(value: number): string {
  const abs = Math.abs(value);
  const decimals = abs >= 100 ? 0 : abs >= 1 ? 2 : 4;
  const text = value.toFixed(decimals);
  // Trim only fractional zeros — stripping them off an integer would turn
  // 140 into "14" and -180 into "-18".
  if (decimals === 0) return text;
  const trimmed = text.replace(/0+$/, "").replace(/\.$/, "");
  return trimmed === "" || trimmed === "-" ? "0" : trimmed;
}

interface Blob {
  x: number;
  y: number;
  n: number;
}

/**
 * Points landing on the same spot are merged into one mark sized by how many
 * stacked there. Without this, five overlapping dots and five hundred look
 * identical once opacity saturates — and overplotting is the whole point.
 */
function cluster(
  points: MapPreview["points"],
  px: (lon: number) => number,
  py: (lat: number) => number,
): Blob[] {
  const buckets = new Map<string, Blob>();
  for (const [lon, lat] of points) {
    const x = px(lon);
    const y = py(lat);
    const key = `${Math.round(x * 2)}:${Math.round(y * 2)}`;
    const found = buckets.get(key);
    if (found) found.n++;
    else buckets.set(key, { x, y, n: 1 });
  }
  // Biggest last, so heavy stacks paint over the sparse field around them.
  return [...buckets.values()].sort((a, b) => a.n - b.n);
}

export function ScatterPreview({ map }: { map: MapPreview }) {
  const [fit, setFit] = useState(true);
  const view = computeView(map.bbox, fit);
  const [x0, y0, x1, y1] = view;

  const px = (lon: number) => ((lon - x0) / (x1 - x0)) * W;
  const py = (lat: number) => (1 - (lat - y0) / (y1 - y0)) * H;

  const lonStep = stepFor(x1 - x0);
  const latStep = stepFor(y1 - y0);
  const offworld = map.invalid + map.outOfRange;

  const blobs = cluster(map.points, px, py);
  const heaviest = blobs.length ? blobs[blobs.length - 1].n : 0;
  // Scale back up to the real total: the plot only ever holds a sample.
  const stackedTotal = Math.round((heaviest / Math.max(1, map.points.length)) * map.total);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight text-ink">Where it lands</h2>
          <p className="mt-0.5 text-[11.5px] text-mint-ink/70">
            {map.points.length < map.total
              ? `${map.points.length.toLocaleString()} of ${map.total.toLocaleString()} positions`
              : `${map.total.toLocaleString()} positions`}
          </p>
        </div>
        <div className="flex rounded-full border border-mint-deep bg-white/60 p-0.5">
          {[
            { id: "fit", label: "Fit" },
            { id: "world", label: "World" },
          ].map((option) => {
            const on = (option.id === "fit") === fit;
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={on}
                onClick={() => setFit(option.id === "fit")}
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  on ? "bg-ink text-white" : "text-mint-ink/70 hover:text-ink"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-mint-deep bg-white">
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img"
          aria-label={`Scatter plot of ${map.points.length} generated positions`}>
          <rect width={W} height={H} fill="#fff" />

          {ticks(x0, x1, lonStep).map((lon) => (
            <line key={`v${lon}`} x1={px(lon)} y1={0} x2={px(lon)} y2={H}
              stroke="#ebecef" strokeWidth={0.5} />
          ))}
          {ticks(y0, y1, latStep).map((lat) => (
            <line key={`h${lat}`} x1={0} y1={py(lat)} x2={W} y2={py(lat)}
              stroke="#ebecef" strokeWidth={0.5} />
          ))}

          {/* Equator and prime meridian, when they fall inside the window. */}
          {y0 < 0 && y1 > 0 && (
            <line x1={0} y1={py(0)} x2={W} y2={py(0)} stroke="#dcdee3" strokeWidth={0.9} />
          )}
          {x0 < 0 && x1 > 0 && (
            <line x1={px(0)} y1={0} x2={px(0)} y2={H} stroke="#dcdee3" strokeWidth={0.9} />
          )}

          {/* The edge of the valid WGS84 domain. */}
          {(x0 < -180 || x1 > 180 || y0 < -90 || y1 > 90) && (
            <rect x={px(-180)} y={py(90)} width={px(180) - px(-180)} height={py(-90) - py(90)}
              fill="none" stroke="#d4443e" strokeWidth={0.7} strokeDasharray="3 2" opacity={0.65} />
          )}

          {blobs.map((blob, i) => {
            const stacked = blob.n > 1;
            const r = stacked ? Math.min(7, 1.4 + Math.log2(blob.n) * 0.95) : 1.15;
            return (
              <g key={i}>
                {stacked && (
                  <circle cx={blob.x} cy={blob.y} r={r + 2.4} fill="#0c0d0d" opacity={0.1} />
                )}
                <circle cx={blob.x} cy={blob.y} r={r} fill="#0c0d0d" opacity={stacked ? 0.85 : 0.55} />
              </g>
            );
          })}

          {!map.points.length && (
            <text x={W / 2} y={H / 2} textAnchor="middle" dominantBaseline="middle"
              fontSize={9} fill="#9aa0a6" fontFamily="var(--font-mono)">
              nothing plottable
            </text>
          )}
        </svg>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10.5px] text-mint-ink/70">
        {map.bbox ? (
          <span>
            bbox {fmt(map.bbox[0])}, {fmt(map.bbox[1])} → {fmt(map.bbox[2])}, {fmt(map.bbox[3])}
          </span>
        ) : (
          <span>no valid bounds</span>
        )}
        {/* Two points sharing a spot is a coincidence, not a finding. */}
        {stackedTotal >= 5 && (
          <span className="inline-flex items-center gap-1.5 text-ink">
            <span className="h-1.5 w-1.5 rounded-full bg-ink" aria-hidden />
            {stackedTotal.toLocaleString()} on one spot
          </span>
        )}
        {offworld > 0 && (
          <span className="inline-flex items-center gap-1.5 text-[#d4443e]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#d4443e]" aria-hidden />
            {offworld.toLocaleString()} off-world
            {map.invalid > 0 && ` (${map.invalid.toLocaleString()} not a number)`}
          </span>
        )}
      </div>
    </div>
  );
}
