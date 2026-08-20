"use client";

import { ScatterPreview } from "./ScatterPreview";
import { Button } from "./ui";
import { formatBytes, isCopyable } from "@/lib/download";
import { type GeneratedFile } from "nullisland-core";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-mint-ink/60">{label}</p>
      <p className="mt-0.5 text-[15px] font-semibold tabular-nums tracking-tight text-ink">{value}</p>
    </div>
  );
}

/**
 * The point of a boundary is the number, not the polygon: what your filter is
 * supposed to hand back. Both filter semantics are shown, because a `contains`
 * and an `intersects` implementation legitimately disagree the moment a line or
 * a polygon straddles the edge.
 */
function BoundaryTruth({ boundary }: { boundary: NonNullable<GeneratedFile["boundary"]> }) {
  const intersecting = boundary.inside + boundary.crossing;
  return (
    <div className="mt-4 rounded-xl border border-mint-deep bg-white/70 p-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-mint-ink/60">
        Your filter should return
      </p>
      <dl className="mt-1.5 space-y-0.5 text-[12px]">
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-mint-ink/80">contains</dt>
          <dd className="font-semibold tabular-nums text-ink">
            {boundary.inside.toLocaleString()}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-mint-ink/80">intersects</dt>
          <dd className="font-semibold tabular-nums text-ink">
            {intersecting.toLocaleString()}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-2 border-t border-mint-deep pt-1">
          <dt className="text-mint-ink/60">outside</dt>
          <dd className="tabular-nums text-mint-ink/70">{boundary.outside.toLocaleString()}</dd>
        </div>
      </dl>
    </div>
  );
}

export function HeroPanel({
  file,
  busy,
  onDownload,
  onCopy,
  onDownloadBoundary,
  copied = false,
  saved = false,
  boundarySaved = false,
}: {
  file: GeneratedFile | null;
  busy: boolean;
  onDownload: () => void;
  onCopy: () => void;
  onDownloadBoundary: () => void;
  copied?: boolean;
  saved?: boolean;
  boundarySaved?: boolean;
}) {
  return (
    <div className="rounded-[22px] bg-mint p-4 sm:p-5">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(230px,1fr)]">
        {file ? (
          <ScatterPreview map={file.map} boundary={file.boundary} />
        ) : (
          <div className="flex min-h-[220px] items-center justify-center rounded-2xl border border-mint-deep bg-white">
            <span className="font-mono text-[11px] text-dim">generating…</span>
          </div>
        )}

        <div className="flex flex-col lg:border-l lg:border-mint-deep lg:pl-6">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[10.5px] font-semibold uppercase tracking-[0.13em] text-mint-ink/60">
              Output file
            </h2>
            {file && file.stats.problems.length > 0 && (
              <span className="rounded-full bg-white/70 px-2 py-0.5 font-mono text-[10.5px] text-mint-ink">
                {file.stats.problems.length} problem{file.stats.problems.length === 1 ? "" : "s"}
              </span>
            )}
            {/* A clean file says so on its face. "0 problems" would read as an
                absence; this is the control case, which is a thing you chose. */}
            {file?.stats.clean && (
              <span
                className={
                  file.clean && !file.clean.passed
                    ? "rounded-full bg-cat-encoding px-2 py-0.5 font-mono text-[10.5px] text-white"
                    : "rounded-full bg-ink px-2 py-0.5 font-mono text-[10.5px] text-white"
                }
                title={
                  file.clean && !file.clean.passed
                    ? "This file failed its own clean check — that is a bug in Null Island"
                    : file.clean
                      ? `${file.clean.checks.length} checks run on this file, all passed`
                      : undefined
                }
              >
                {file.clean && !file.clean.passed ? "check failed" : "clean"}
              </span>
            )}
          </div>

          <p className="display-figure mt-2 text-[38px] leading-none text-ink sm:text-[44px]">
            {file ? formatBytes(file.bytes) : "—"}
          </p>

          <p
            className="mt-2 truncate font-mono text-[11.5px] text-mint-ink/80"
            title={file?.filename}
          >
            {file?.filename ?? ""}
          </p>

          <div className="mt-5 grid grid-cols-2 gap-4 border-t border-mint-deep pt-4">
            <Stat label="Features" value={file ? file.stats.features.toLocaleString() : "—"} />
            <Stat label="Positions" value={file ? file.map.total.toLocaleString() : "—"} />
          </div>

          {file?.boundary && <BoundaryTruth boundary={file.boundary} />}

          <div className="mt-5 flex gap-2 lg:mt-auto lg:pt-5">
            <Button
              variant="primary"
              onClick={onDownload}
              disabled={!file}
              confirmed={saved}
              confirmLabel="Saved"
              className="flex-1 py-2.5"
            >
              {busy ? "Working…" : "Download"}
            </Button>
            <Button
              onClick={onCopy}
              disabled={!isCopyable(file)}
              confirmed={copied}
              confirmLabel="Copied"
              title={
                file && typeof file.data !== "string"
                  ? "Binary format — download it instead"
                  : file && !isCopyable(file)
                    ? "Too large to copy — download it instead"
                    : "Copy the file contents"
              }
            >
              Copy
            </Button>
          </div>

          {file?.boundary && (
            <Button
              onClick={onDownloadBoundary}
              confirmed={boundarySaved}
              confirmLabel="Boundary saved"
              title={`${formatBytes(file.boundary.bytes)} · ${file.boundary.filename}`}
              className="mt-2 w-full py-2.5"
            >
              Download boundary
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
