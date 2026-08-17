import { REPO_STAR_URL } from "nullisland-core";

/**
 * A star link, and deliberately nothing more.
 *
 * A live star count would mean one request to api.github.com on every page
 * load, which would disclose every visitor's IP to a third party purely to
 * decorate a button. The site otherwise makes no network requests at all once
 * it has loaded, and that is worth more than the number — it is what lets the
 * connect-src in the CSP stay closed.
 */
function StarIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden focusable="false">
      <path d="M8 .8l2.2 4.46 4.92.72-3.56 3.47.84 4.9L8 12.03l-4.4 2.32.84-4.9L.88 5.98l4.92-.72L8 .8z" />
    </svg>
  );
}

export function GitHubStar({
  className = "",
  tone = "default",
}: {
  className?: string;
  /** "mint" for the tinted panels, where the default border disappears. */
  tone?: "default" | "mint";
}) {
  return (
    <a
      href={REPO_STAR_URL}
      target="_blank"
      rel="noreferrer"
      title="Star Null Island on GitHub"
      className={[
        // The whole style set swaps rather than layering overrides, so the tone
        // never depends on which utility the stylesheet happens to emit last.
        "group inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5",
        "text-[12px] font-medium text-ink transition-colors",
        tone === "mint"
          ? "border-mint-deep bg-white hover:border-dim"
          : "border-line-strong bg-card hover:border-dim",
        className,
      ].join(" ")}
    >
      <span className="text-dim transition-colors group-hover:text-warn">
        <StarIcon />
      </span>
      Star on GitHub
    </a>
  );
}
