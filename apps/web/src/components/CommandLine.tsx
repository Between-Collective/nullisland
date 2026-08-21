"use client";

import { useEffect, useState } from "react";
import { Button } from "./ui";
import { PROFILES, QUIRKS, REPO_URL } from "nullisland-core";

/**
 * The part the buttons above cannot do.
 *
 * One file at a time is a browser's job. A fixture per data type, or a matrix
 * of every data type in every container, is a loop — and the same generator
 * runs in a terminal from the same seed, so a file built by clicking and a file
 * built in CI are the same bytes.
 *
 * Every command here is one you can paste. Nothing is elided behind an ellipsis
 * and nothing is pseudo-code, because a command that has to be edited before it
 * runs is a command that will be run unedited.
 */

interface Command {
  title: string;
  blurb: React.ReactNode;
  command: string;
}

/** Includes the generic export, which is a data type you can pick like any other. */
const TYPE_COUNT = PROFILES.length;

const COMMANDS: Command[] = [
  {
    title: "One clean file",
    blurb: (
      <>
        The control case, in whichever container you want to test. It prints the checks it ran
        before writing, and exits non-zero if any of them failed.
      </>
    ),
    command: "npx nullisland --clean --type cadastral-parcels --format shapefile --count 500",
  },
  {
    title: `One for every data type — ${TYPE_COUNT} files`,
    blurb: (
      <>
        Asks the generator what data types exist, then builds a clean fixture of each. The per-type
        seed matters: filenames are{" "}
        <code className="text-white/70">nullisland-&lt;count&gt;-&lt;seed&gt;</code> and carry no
        data type, so one shared seed would write all {TYPE_COUNT} to the same filename.
      </>
    ),
    command:
      'for t in $(npx nullisland --list types --json | jq -r \'.dataTypes[].id\'); do npx nullisland --clean --type "$t" --count 200 --seed "clean-$t" --out fixtures/clean; done',
  },
  {
    title: "Every data type, in every format",
    blurb: (
      <>
        {TYPE_COUNT} data types across all nine containers, sorted into a directory per format.
        Around a minute, and roughly 20&nbsp;MB.
      </>
    ),
    command:
      'for t in $(npx nullisland --list types --json | jq -r \'.dataTypes[].id\'); do for f in geojson ndjson csv kml kmz gpx wkt topojson shapefile; do npx nullisland --clean --type "$t" --format "$f" --count 100 --seed "clean-$t" --out "fixtures/clean/$f"; done; done',
  },
  {
    title: "Or one archive to hand someone",
    blurb: (
      <>
        Nine clean fixtures sweeping formats and data types, with the{" "}
        <code className="text-white/70">README.md</code> and{" "}
        <code className="text-white/70">manifest.json</code> that describe them. Fewer files than
        the loops above, and it arrives explaining itself.
      </>
    ),
    command: "npx nullisland --package 9 --clean --extract --out fixtures/clean",
  },
  {
    title: `Search terms — ${QUIRKS.length} of them, one problem each`,
    blurb: (
      <>
        The queries your users type, with the parse each one should receive. JSONL, one term per
        line, so a test can read it straight off disk. Swap{" "}
        <code className="text-white/70">--term-format md</code> for a report to hand a reviewer, or{" "}
        <code className="text-white/70">--clean</code> for the control set.
      </>
    ),
    command:
      "npx nullisland --terms 43 --type mobile-location-pings --out fixtures/search",
  },
  {
    title: "Search terms pinned to one place",
    blurb: (
      <>
        Everything in and around a place from the gazetteer —{" "}
        <code className="text-white/70">--list places</code> has the ids. A quirk needing a name
        nowhere near it will still reach further, and the expected parse always names the place it
        actually used.
      </>
    ),
    command:
      "npx nullisland --terms 40 --near tokyo --term-format jsonl --seed harbor-lantern-drift --stdout | jq -r '.query'",
  },
];

const SETUP = `git clone ${REPO_URL}.git
cd nullisland && npm install && npm run build`;

function CommandBlock({ command, label }: { command: string; label: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="mt-2 flex items-start gap-2">
      {/* The command scrolls inside its own box: these are long enough to force
          the whole page sideways otherwise, and wrapping a shell loop across
          lines invites it being pasted half-copied. */}
      <pre className="scroll-thin-dark min-w-0 flex-1 overflow-x-auto rounded-xl border border-white/10 bg-white/[0.03] p-3 font-mono text-[11px] leading-relaxed text-white/80">
        {command}
      </pre>
      <Button
        onClick={copy}
        confirmed={copied}
        confirmLabel="Copied"
        title={`Copy: ${label}`}
        className="shrink-0 px-3 py-1.5"
      >
        Copy
      </Button>
    </div>
  );
}

export function CommandLine() {
  return (
    <section className="overflow-hidden rounded-[18px] bg-ink p-4 sm:p-5">
      <div className="max-w-3xl">
        <p className="text-[12.5px] leading-relaxed text-white/55">
          One file at a time is what the page above is for. A fixture for every data type, or a
          matrix of every data type in every format, is a loop — so there is a command line, running
          the same generator from the same seeds. A file you build by clicking and a file you build
          in CI are the same bytes.
        </p>
      </div>

      {/* Honest about where it comes from: publishing it to npm is the plan, and
          until that happens `npx nullisland` only resolves inside a clone. */}
      <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
        <h3 className="text-[12.5px] font-semibold tracking-tight text-white">First, once</h3>
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-white/55">
          Not on npm yet, so the commands below run from a clone — the workspace links{" "}
          <code className="text-white/70">nullisland</code> for you once it is built. Node 20 or
          newer, and <code className="text-white/70">jq</code> for the loops that read the
          catalogue.
        </p>
        <CommandBlock command={SETUP} label="clone and build" />
      </div>

      <div className="mt-2 grid gap-2 lg:grid-cols-2">
        {COMMANDS.map((entry) => (
          <div
            key={entry.title}
            className="flex min-w-0 flex-col rounded-2xl border border-white/10 bg-white/[0.02] p-4"
          >
            <h3 className="text-[12.5px] font-semibold tracking-tight text-white">{entry.title}</h3>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-white/55">{entry.blurb}</p>
            <div className="mt-auto min-w-0">
              <CommandBlock command={entry.command} label={entry.title} />
            </div>
          </div>
        ))}
      </div>

      <p className="mt-3 text-[11.5px] leading-relaxed text-white/45">
        <code className="text-white/70">npx nullisland --help</code> lists every option, and{" "}
        <code className="text-white/70">--list types|formats|problems|quirks|places --json</code> hands
        the whole catalogue back as data — every id, the formats and data types each problem applies
        to, and for the gazetteer every alias and every other place that answers to the same name —
        so a script can choose without guessing at what will be skipped. Add{" "}
        <code className="text-white/70">--json</code> to any run to get the counts, the bounds and
        the checks instead of prose.
      </p>
    </section>
  );
}
