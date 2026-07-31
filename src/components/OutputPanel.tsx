"use client";

import { Card, CardTitle } from "./ui";
import type { GeneratedFile } from "@/lib/types";

export function OutputPanel({ file }: { file: GeneratedFile | null }) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Card className="p-4">
        <CardTitle>What this file does</CardTitle>
        {file?.notes.length ? (
          <ul className="mt-3 space-y-2">
            {file.notes.map((note, i) => (
              <li key={i} className="flex gap-2.5 text-[12px] leading-snug text-muted">
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-line-strong" aria-hidden />
                <span>{note}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-[12px] leading-snug text-dim">
            Nothing selected — this is a clean, well-formed file. Useful as the control case.
          </p>
        )}
      </Card>

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
