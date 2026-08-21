import { FORMATS, PROBLEMS, QUIRKS } from "nullisland-core";

/**
 * The manual, on the page rather than in a wiki nobody opens.
 *
 * The controls are discoverable enough to click through, but the *reason* to
 * click them is not: that a boundary is a ground truth rather than a picture,
 * that the seed is what makes a failure reportable, that the CSVs contain live
 * formula-injection payloads. That is what this says.
 */

const domainCount = PROBLEMS.filter((p) => p.profiles).length;
const generalCount = PROBLEMS.length - domainCount;

interface Step {
  title: string;
  body: React.ReactNode;
}

const STEPS: Step[] = [
  {
    title: "1. Say what the file is",
    body: (
      <>
        Pick a <strong>format</strong> — {FORMATS.length} of them, from GeoJSON to a real shapefile
        bundle — and a <strong>data type</strong> for what it holds. A data type swaps the generic
        columns for a real schema: ADS-B gives you <code>icao24</code> and <code>baro_altitude</code>,
        a parcel export gives you <code>APN</code> and <code>LAND_VAL</code>, and the geometry
        follows suit, so tracks are tracks and parcels tile a block. That is where the bugs live,
        because that is where your assumptions live.
      </>
    ),
  },
  {
    title: "2. Prove the happy path first",
    body: (
      <>
        Press <strong>Clean</strong> and nothing is wrong with the file: a valid export wearing a
        real schema. That is the control case, and it is worth settling before anything else —
        a reader that mangles a clean shapefile will fail every broken fixture too, for a reason
        that has nothing to do with the fixture. Every clean file is checked before you get it, and
        the panel lists what was measured: coordinates inside the WGS84 domain, rings closed, one
        schema throughout, no BOM. If this one does not load, the bug is on the reading side.
      </>
    ),
  },
  {
    title: "3. Say what is wrong with it",
    body: (
      <>
        Tick problems in the grid below, or press <strong>Typical</strong> to load what that kind of
        feed actually arrives with. {generalCount} problems apply to anything; {domainCount} more
        exist only inside a particular data type and appear when you choose it. <strong>Chaos</strong>{" "}
        sets how much of the file each one touches — low is a needle in a haystack, high is a file
        that fails immediately.
      </>
    ),
  },
  {
    title: "4. Watch it happen",
    body: (
      <>
        The plot redraws as you go, so a problem is something you see rather than something you read
        about: coincident points collapse to one weighted dot, swapped lat/lon flips the cloud into
        the wrong hemisphere, projected metres throw everything off-world. Toggle{" "}
        <strong>Fit</strong> and <strong>World</strong> to tell &ldquo;wrong place&rdquo; from
        &ldquo;wrong shape&rdquo;.
      </>
    ),
  },
  {
    title: "5. Add a boundary to get an answer, not a picture",
    body: (
      <>
        Turn on a <strong>boundary</strong> and you get a second GeoJSON — the area you would upload
        to filter by — plus the number your filter should return. Both numbers, in fact:{" "}
        <code>contains</code> and <code>intersects</code> disagree the moment a line straddles the
        edge, and every feature is tagged with the expected answer. The counts are measured from the
        finished file, so they stay true even when a problem has dragged features across the world.
      </>
    ),
  },
  {
    title: "6. Take the file, and the context",
    body: (
      <>
        <strong>Download</strong> or <strong>Copy</strong> the fixture. The dark panel holds a
        written account of what it is — everything wrong with it and what the format silently
        dropped, or, for a clean file, the checks it passed. Paste that into an agent or an issue so
        whoever reads the file knows what it is meant to contain.
      </>
    ),
  },
  {
    title: "7. Make it reproducible",
    body: (
      <>
        Every file comes from its <strong>seed</strong>: the same seed and settings always produce
        byte-identical output. <strong>Share</strong> copies a link carrying the whole configuration,
        so a bug report can be a URL. Put the seed in your test suite and the fixture rebuilds itself
        on every run — nothing to commit, nothing to keep in sync.
      </>
    ),
  },
  {
    title: "8. Or take a package",
    body: (
      <>
        A <strong>package</strong> is 5, 9 or 18 fixtures in one zip — every format, a spread of data
        types, each broken differently — with a <code>README.md</code> describing all of them and a{" "}
        <code>manifest.json</code> beside it. Drop the folder into an agent&rsquo;s working directory
        and it can test against the notes without opening a file. One seed rebuilds the whole
        package; every entry links back to the settings for its own file. Switch it to{" "}
        <strong>Clean</strong> for the same sweep with nothing wrong with any of it — the set to run
        before the broken one, where every file should load and no feature should go missing.
      </>
    ),
  },
  {
    title: "9. Then test the box above the map",
    body: (
      <>
        A file is half of it. The other half is what somebody types into the search box —{" "}
        <em>devices in Tokyo and Kyoto</em>, <em>devices in new zealand</em>,{" "}
        <em>devices that were in the Estádio da Luz in Lisbon last week</em>. The{" "}
        <strong>search terms</strong> panel deals out {QUIRKS.length} of those, one problem apiece:
        a misspelled venue, a name that means two different cities, a window that reads two ways.
        Each one carries the parse it should have been given — the places resolved to real
        coordinates, the window resolved to instants — so you can assert on the answer rather than
        squint at it. <strong>Clean</strong> gives you the control set, same as everywhere else.
      </>
    ),
  },
];

export function HowToUse() {
  return (
    <section>
      {/* No heading of its own: this sits inside a disclosure whose summary
          already names it, and two titles in a row read as a mistake. */}
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {STEPS.map((step) => (
          <div key={step.title} className="rounded-2xl border border-line bg-card p-4">
            <h3 className="text-[12.5px] font-semibold tracking-tight text-ink">{step.title}</h3>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">{step.body}</p>
          </div>
        ))}
      </div>

      {/* The files are hostile on purpose, and two of those ways are hostile to
          the person holding them rather than to their parser. */}
      <div className="mt-2 rounded-2xl border border-cat-encoding/30 bg-paper p-4">
        <h3 className="flex items-center gap-2 text-[12.5px] font-semibold tracking-tight text-ink">
          <span className="h-1.5 w-1.5 rounded-full bg-cat-encoding" aria-hidden />
          Handle the output with care
        </h3>
        <p className="mt-1.5 max-w-3xl text-[11.5px] leading-relaxed text-muted">
          Generated CSVs contain real formula-injection payloads, not defanged lookalikes — that is
          the point, but do not double-click one into a spreadsheet. Open it in a text editor, or
          import it with formulas disabled. The same category includes XSS-shaped and SQL-shaped
          strings: inert as data, dangerous only if something renders or executes them, which is
          exactly the property you are testing for. Nothing you generate is uploaded anywhere, and
          none of it is real data about real places.
        </p>
      </div>
    </section>
  );
}
