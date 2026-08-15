import { GitHubStar } from "./GitHubStar";
import { PROBLEMS } from "@/lib/problems";
import { NEW_ISSUE_URL, REPO_URL } from "@/lib/site";

// Links open in a new tab on purpose: the whole configuration lives in this
// page's URL hash, so navigating away would throw away the fixture you built.
const linkBase =
  "inline-flex items-center justify-center gap-1.5 rounded-full border px-3.5 py-2 text-[12px] font-medium transition-colors";

export function Contribute() {
  return (
    <section className="mt-8 rounded-[18px] bg-mint p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
        <div className="max-w-xl">
          <h2 className="text-[15px] font-semibold tracking-tight text-ink">
            Know a way to break a map that isn&rsquo;t here?
          </h2>
          <p className="mt-1 text-[12.5px] leading-relaxed text-mint-ink/80">
            {/* Explicit nbsp: JSX drops the space when the text node wraps to the
                next line, and it keeps the count from orphaning from its noun. */}
            {PROBLEMS.length}&nbsp;problems is not all of them. If a real file broke your viewer in
            a way this can&rsquo;t reproduce yet, open an issue and describe it — or send a pull
            request. A new problem is one catalogue entry and one transform function.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={NEW_ISSUE_URL}
            target="_blank"
            rel="noreferrer"
            className={`${linkBase} border-ink bg-ink text-white hover:bg-ink-soft`}
          >
            Report a bug or idea
          </a>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className={`${linkBase} border-mint-deep bg-white text-ink hover:border-dim`}
          >
            View source
          </a>
          <GitHubStar tone="mint" className="py-2" />
        </div>
      </div>
    </section>
  );
}
