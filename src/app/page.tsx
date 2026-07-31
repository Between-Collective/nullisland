import { Generator } from "@/components/Generator";
import { FORMATS } from "@/lib/formats/index";
import { PROBLEMS } from "@/lib/problems";
import { CREDIT, CREDIT_URL, REPO_URL } from "@/lib/site";

export default function Home() {
  return (
    <div className="mx-auto flex min-h-full max-w-[1400px] flex-col px-4 py-6 sm:px-6 sm:py-10">
      <header className="mb-6 sm:mb-8">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="font-mono text-xl font-semibold tracking-tight text-ink">map/data</h1>
          <span className="font-mono text-[11px] text-dim">
            {PROBLEMS.length} problems · {FORMATS.length} formats
          </span>
        </div>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
          Every geo-viz tool says &ldquo;bring us whatever you&rsquo;ve got&rdquo;. Then a file
          arrives with every point stacked on one lat/lon, coordinates in metres, a BOM at byte
          zero, and half the rows missing a geometry. This generates those files on purpose, so you
          can find out how your map handles them before your users do.
        </p>
        <p className="mt-2 max-w-2xl text-[12.5px] leading-relaxed text-dim">
          Everything runs in your browser — nothing is uploaded, nothing is stored. The seed makes
          each file reproducible, so a fixture that breaks something can go straight into a test
          suite.
        </p>
      </header>

      <main className="flex-1">
        <Generator />
      </main>

      <footer className="mt-10 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line-soft pt-5 text-[11px] text-dim">
        <span>Free, and entirely client-side.</span>
        {REPO_URL && (
          <a href={REPO_URL} className="underline underline-offset-2 hover:text-ink">
            Source
          </a>
        )}
        <a href={CREDIT_URL} className="ml-auto underline underline-offset-2 hover:text-ink">
          {CREDIT}
        </a>
      </footer>
    </div>
  );
}
