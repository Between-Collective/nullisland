import { Generator } from "@/components/Generator";
import { CREDIT, CREDIT_URL, REPO_URL } from "@/lib/site";

export default function Home() {
  return (
    <div className="min-h-full p-3 sm:p-5">
      <div className="mx-auto max-w-[1560px]">
        <header className="px-2 pb-4 pt-2 sm:px-3">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
            Test fixtures for map software
          </p>
          <h1 className="mt-2 text-[26px] font-bold leading-[1.12] tracking-[-0.03em] text-ink sm:text-[34px]">
            Break your map before your users do.
          </h1>
        </header>

        <div className="overflow-hidden rounded-[26px] border border-line bg-card shadow-[0_1px_2px_rgba(12,13,13,0.04),0_12px_32px_-12px_rgba(12,13,13,0.12)]">
          <Generator />
        </div>

        <footer className="flex flex-wrap items-center gap-x-5 gap-y-2 px-2 py-5 text-[11.5px] text-muted sm:px-3">
          <span>Nothing is uploaded. Every file is reproducible from its seed.</span>
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
    </div>
  );
}
