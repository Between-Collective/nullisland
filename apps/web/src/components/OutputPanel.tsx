"use client";

import { useEffect, useState } from "react";
import { Button, Card, CardTitle } from "./ui";
import { buildContext, contextToText, type GeneratedFile } from "nullisland-core";

export function OutputPanel({
  file,
  formatLabel,
}: {
  file: GeneratedFile | null;
  formatLabel: string;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(timer);
  }, [copied]);

  const block = file ? buildContext(file, formatLabel) : null;

  const copyContext = async () => {
    if (!block) return;
    try {
      await navigator.clipboard.writeText(contextToText(block));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {/* Written as a plain section rather than <Card>, so the dark tone can't
          lose a class-order fight with the card's own border and background. */}
      <section className="flex flex-col overflow-hidden rounded-[18px] bg-ink">
        <div className="flex items-start justify-between gap-3 px-4 pb-3 pt-4">
          <div className="min-w-0">
            <h2 className="text-[13px] font-semibold leading-snug tracking-tight text-white">
              Working with AI? Paste this context:
            </h2>
            <p className="mt-0.5 text-[11px] text-white/45">
              {file?.stats.clean
                ? "What this file is, and what was checked, in one block."
                : "Everything wrong with this file, in one block."}
            </p>
          </div>
          <Button
            onClick={copyContext}
            disabled={!block}
            confirmed={copied}
            confirmLabel="Copied"
            className="shrink-0 px-3 py-1.5"
          >
            Copy
          </Button>
        </div>

        <div className="scroll-thin-dark mx-4 mb-4 max-h-[268px] overflow-auto rounded-xl border border-white/10 bg-white/[0.03] p-3.5 font-mono text-[11px] leading-[1.7]">
          {block ? (
            <>
              <p className="text-white/45">{block.intro}</p>
              <dl className="mt-3">
                {block.fields.map(([label, value]) => (
                  <div key={label} className="flex gap-2">
                    <dt className="shrink-0 text-mint">{label}:</dt>
                    <dd className="min-w-0 break-words text-white/80">{value}</dd>
                  </div>
                ))}
              </dl>
              {block.checks && (
                <>
                  <p className="mt-3 text-mint">{block.checks.heading}</p>
                  <ul>
                    {block.checks.lines.map((line, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="shrink-0 text-mint/45" aria-hidden>
                          -
                        </span>
                        <span className="text-white/80">{line}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <p className="mt-3 text-mint">{block.heading}</p>
              <ul>
                {block.problems.map((problem, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="shrink-0 text-mint/45" aria-hidden>
                      -
                    </span>
                    <span className="text-white/80">{problem}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-white/35">generating…</p>
          )}
        </div>
      </section>

      <Card className="flex min-h-0 flex-col overflow-hidden p-0">
        <div className="px-4 pt-4">
          <CardTitle
            aside={
              file?.previewTruncated ? (
                <span className="font-mono text-[10px] text-dim">truncated</span>
              ) : undefined
            }
          >
            Preview
          </CardTitle>
        </div>
        <pre className="scroll-thin mt-3 max-h-[300px] overflow-auto px-4 pb-4 font-mono text-[11px] leading-relaxed text-muted">
          {file?.preview ?? ""}
        </pre>
      </Card>
    </div>
  );
}
