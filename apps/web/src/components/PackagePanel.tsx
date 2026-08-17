"use client";

import { useEffect, useState } from "react";
import { Button, Card, CardTitle } from "./ui";
import { downloadFile, formatBytes } from "@/lib/download";
import {
  CATEGORY_LABELS,
  PACKAGE_SIZES,
  getFormat,
  type GeneratedPackage,
  type PackageEntry,
  type ProblemCategory,
} from "nullisland-core";

// Written out rather than built from the id, so Tailwind's scanner sees them.
const DOT: Record<ProblemCategory, string> = {
  coordinates: "bg-cat-coordinates",
  geometry: "bg-cat-geometry",
  attributes: "bg-cat-attributes",
  structure: "bg-cat-structure",
  encoding: "bg-cat-encoding",
};

function Row({ entry, index }: { entry: PackageEntry; index: number }) {
  const { file } = entry;
  const boundary = file.boundary;

  return (
    <li className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-line px-4 py-2.5 first:border-t-0">
      <span className="w-4 shrink-0 font-mono text-[10.5px] tabular-nums text-dim">{index + 1}</span>

      <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-ink" title={file.filename}>
        {file.filename}
      </span>

      <span className="inline-flex items-center gap-1.5 font-mono text-[10.5px] text-muted">
        <span className={`h-1.5 w-1.5 rounded-full ${DOT[entry.lead]}`} aria-hidden />
        {CATEGORY_LABELS[entry.lead]}
      </span>

      {/* The format is already legible in the extension, so the column that
          earns its place here is what the file is *of*. */}
      <span className="font-mono text-[10.5px] text-muted" title={getFormat(entry.options.format).label}>
        {entry.profileLabel}
      </span>
      <span className="font-mono text-[10.5px] tabular-nums text-muted">
        {file.stats.features.toLocaleString()} feat
      </span>
      <span className="font-mono text-[10.5px] tabular-nums text-muted">
        {file.stats.problems.length} prob
      </span>
      {boundary && (
        <span
          className="font-mono text-[10.5px] tabular-nums text-mint-ink"
          title={`A contains filter should return ${boundary.inside.toLocaleString()}; an intersects filter ${(
            boundary.inside + boundary.crossing
          ).toLocaleString()}`}
        >
          ⬠ {boundary.inside.toLocaleString()}/{(boundary.inside + boundary.crossing).toLocaleString()}
        </span>
      )}
      <span className="w-16 text-right font-mono text-[10.5px] tabular-nums text-dim">
        {formatBytes(file.bytes)}
      </span>

      {/* The hash listener in Generator picks this up, so a file from a package
          opens in the main panel with every setting already in place. */}
      <a
        href={`#${entry.hash}`}
        className="font-mono text-[10.5px] text-muted underline underline-offset-2 hover:text-ink"
        title="Load this file's settings above"
      >
        open
      </a>
    </li>
  );
}

export function PackagePanel({
  pkg,
  busy,
  size,
  onSize,
  onBuild,
}: {
  pkg: GeneratedPackage | null;
  busy: boolean;
  size: number;
  onSize: (next: number) => void;
  onBuild: () => void;
}) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!saved && !copied) return;
    const timer = setTimeout(() => {
      setSaved(false);
      setCopied(false);
    }, 1800);
    return () => clearTimeout(timer);
  }, [saved, copied]);

  const download = () => {
    if (!pkg) return;
    downloadFile(pkg);
    setSaved(true);
  };

  const copyContext = async () => {
    if (!pkg) return;
    try {
      await navigator.clipboard.writeText(pkg.readme);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-4">
        <div className="min-w-0">
          <CardTitle>Package</CardTitle>
          <p className="mt-1.5 max-w-xl text-[12.5px] leading-relaxed text-muted">
            A run of files in one download — one per format, each broken differently, with a{" "}
            <code className="font-mono text-[11.5px] text-ink">README.md</code> and{" "}
            <code className="font-mono text-[11.5px] text-ink">manifest.json</code> describing every
            one of them. Hand the folder to an agent and it has the context without opening a file.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div role="radiogroup" aria-label="Package size" className="flex gap-1.5">
            {PACKAGE_SIZES.map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={option === size}
                onClick={() => onSize(option)}
                className={[
                  "rounded-full border px-3 py-1.5 font-mono text-[11.5px] tabular-nums transition-colors",
                  option === size
                    ? "border-ink bg-ink text-white"
                    : "border-line-strong bg-white text-muted hover:border-dim hover:text-ink",
                ].join(" ")}
              >
                {option}
              </button>
            ))}
          </div>
          <Button
            variant="primary"
            onClick={onBuild}
            disabled={busy}
            title="Roll a whole package: every format, random problems, one seed"
          >
            <span className="emoji" aria-hidden>
              🎲
            </span>
            {busy ? "Building…" : pkg ? "Roll again" : "Build package"}
          </Button>
        </div>
      </div>

      {pkg ? (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line px-4 py-3">
            <span className="font-mono text-[11.5px] text-ink" title={pkg.filename}>
              {pkg.filename}
            </span>
            <span className="font-mono text-[11px] tabular-nums text-muted">
              {pkg.entries.length} files · {pkg.features.toLocaleString()} features ·{" "}
              {formatBytes(pkg.bytes)}
            </span>
            <div className="ml-auto flex gap-2">
              <Button onClick={copyContext} confirmed={copied} confirmLabel="Copied">
                Copy AI context
              </Button>
              <Button
                variant="primary"
                onClick={download}
                confirmed={saved}
                confirmLabel="Saved"
                title={`${formatBytes(pkg.bytes)} zip archive`}
              >
                Download .zip
              </Button>
            </div>
          </div>

          <ul className="scroll-thin max-h-[320px] overflow-auto">
            {pkg.entries.map((entry, i) => (
              <Row key={entry.path} entry={entry} index={i} />
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-4 border-t border-line px-4 py-4 font-mono text-[11px] text-dim">
          {busy ? "building…" : "no package yet"}
        </p>
      )}
    </Card>
  );
}
