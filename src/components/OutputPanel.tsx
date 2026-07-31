"use client";

import { useEffect, useState } from "react";
import { Button } from "./ui";
import type { GeneratedFile } from "@/lib/types";

const COPY_LIMIT = 2_000_000;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Shows a label for a moment after an action, then reverts. */
function useFlash(): [string | null, (message: string) => void] {
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 1600);
    return () => clearTimeout(timer);
  }, [message]);
  return [message, setMessage];
}

export function OutputPanel({
  file,
  busy,
  onShare,
}: {
  file: GeneratedFile | null;
  busy: boolean;
  onShare: () => Promise<boolean>;
}) {
  const [flash, setFlash] = useFlash();

  const download = () => {
    if (!file) return;
    const blob =
      typeof file.data === "string"
        ? new Blob([file.data], { type: `${file.mime};charset=utf-8` })
        : new Blob([file.data as BlobPart], { type: file.mime });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = file.filename;
    anchor.click();
    URL.revokeObjectURL(url);
    setFlash("saved");
  };

  const copy = async () => {
    if (!file || typeof file.data !== "string") return;
    try {
      await navigator.clipboard.writeText(file.data);
      setFlash("copied");
    } catch {
      setFlash("copy blocked");
    }
  };

  const share = async () => setFlash((await onShare()) ? "link copied" : "copy blocked");

  const copyable = !!file && typeof file.data === "string" && file.bytes <= COPY_LIMIT;

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl border border-line bg-panel p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-mono text-sm text-ink" title={file?.filename}>
              {file?.filename ?? "—"}
            </p>
            <p className="mt-1 font-mono text-xs text-muted tabular-nums">
              {file ? (
                <>
                  {formatBytes(file.bytes)} · {file.stats.features.toLocaleString()} features ·{" "}
                  {file.stats.problems.length} problem{file.stats.problems.length === 1 ? "" : "s"}
                </>
              ) : (
                "generating…"
              )}
            </p>
          </div>
          <span
            aria-live="polite"
            className={`shrink-0 font-mono text-[11px] ${busy ? "text-dim" : "text-accent"}`}
          >
            {busy ? "working…" : (flash ?? "")}
          </span>
        </div>

        <div className="mt-3.5 flex flex-wrap gap-1.5">
          <Button variant="primary" onClick={download} disabled={!file} className="flex-1">
            Download
          </Button>
          <Button
            onClick={copy}
            disabled={!copyable}
            title={
              file && typeof file.data !== "string"
                ? "Binary format — download it instead"
                : file && file.bytes > COPY_LIMIT
                  ? "Too large to copy — download it instead"
                  : undefined
            }
          >
            Copy
          </Button>
          <Button onClick={share} title="Copy a link that reproduces this exact file">
            Share
          </Button>
        </div>
      </div>

      {!!file?.notes.length && (
        <div className="rounded-xl border border-line bg-panel p-4">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-dim">
            What this file does
          </h2>
          <ul className="mt-2.5 space-y-1.5">
            {file.notes.map((note, i) => (
              <li key={i} className="flex gap-2 text-[11.5px] leading-snug text-muted">
                <span className="text-dim" aria-hidden>
                  ·
                </span>
                <span>{note}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex min-h-0 flex-col rounded-xl border border-line bg-panel">
        <div className="flex items-center justify-between border-b border-line-soft px-4 py-2.5">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-dim">Preview</h2>
          {file?.previewTruncated && (
            <span className="font-mono text-[10px] text-dim">truncated</span>
          )}
        </div>
        {/* Short on phones so the controls stay reachable; roomy on desktop,
            where it sits in its own sticky column. */}
        <pre className="scroll-thin max-h-[240px] overflow-auto p-4 font-mono text-[11px] leading-relaxed text-muted lg:max-h-[46vh]">
          {file?.preview ?? ""}
        </pre>
      </div>
    </div>
  );
}
