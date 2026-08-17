import { Generator } from "@/components/Generator";
import { GitHubStar } from "@/components/GitHubStar";
import { CREDIT, CREDIT_URL, ISSUES_URL, LICENCE, REPO_URL } from "nullisland-core";

export default function Home() {
  return (
    <div className="min-h-full p-3 sm:p-5">
      <div className="mx-auto max-w-[1560px]">
        <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 px-2 pb-4 pt-2 sm:px-3">
          <div>
            {/* The coordinates carry the name: 0°N 0°E is where every record with
                missing coordinates quietly ends up. */}
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
              0°N 0°E · Test fixtures for map software
            </p>
            <h1 className="mt-2 text-[26px] font-bold leading-[1.12] tracking-[-0.03em] text-ink sm:text-[34px]">
              Break your map before your users do.
            </h1>
          </div>
          <GitHubStar className="mt-1 shrink-0" />
        </header>

        <div className="overflow-hidden rounded-[26px] border border-line bg-card shadow-[0_1px_2px_rgba(12,13,13,0.04),0_12px_32px_-12px_rgba(12,13,13,0.12)]">
          <Generator />
        </div>

        <footer className="flex flex-wrap items-center gap-x-5 gap-y-2 px-2 py-5 text-[11.5px] text-muted sm:px-3">
          <span>Nothing is uploaded. Every file is reproducible from its seed.</span>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-ink"
          >
            Source
          </a>
          <a
            href={ISSUES_URL}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-ink"
          >
            Bugs &amp; suggestions
          </a>
          <span>{LICENCE} licensed</span>
          <a href={CREDIT_URL} className="ml-auto underline underline-offset-2 hover:text-ink">
            {CREDIT}
          </a>
        </footer>
      </div>
    </div>
  );
}
