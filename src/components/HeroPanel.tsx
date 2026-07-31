"use client";

import { ScatterPreview } from "./ScatterPreview";
import { Button } from "./ui";
import { formatBytes, isCopyable } from "@/lib/download";
import type { GeneratedFile } from "@/lib/types";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-mint-ink/60">{label}</p>
      <p className="mt-0.5 text-[15px] font-semibold tabular-nums tracking-tight text-ink">{value}</p>
    </div>
  );
}

export function HeroPanel({
  file,
  busy,
  onDownload,
  onCopy,
}: {
  file: GeneratedFile | null;
  busy: boolean;
  onDownload: () => void;
  onCopy: () => void;
}) {
  return (
    <div className="rounded-[22px] bg-mint p-4 sm:p-5">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(230px,1fr)]">
        {file ? (
          <ScatterPreview map={file.map} />
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

          <div className="mt-5 flex gap-2 lg:mt-auto lg:pt-5">
            <Button variant="primary" onClick={onDownload} disabled={!file} className="flex-1 py-2.5">
              {busy ? "Working…" : "Download"}
            </Button>
            <Button
              onClick={onCopy}
              disabled={!isCopyable(file)}
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
        </div>
      </div>
    </div>
  );
}
