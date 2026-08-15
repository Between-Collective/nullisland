"use client";

import { useEffect, useState } from "react";
import { REPO_API_URL, REPO_STAR_URL } from "@/lib/site";

/**
 * A star link that shows the count when GitHub will tell us, and is a plain
 * link when it won't.
 *
 * The count is the only thing on this site that reaches the network at all, so
 * it is treated as strictly optional: one unauthenticated request, cached for
 * the session, and every failure path — offline, rate-limited, blocked by an
 * extension — falls back to the button with no count rather than an error. The
 * generator never waits on it.
 */

const CACHE_KEY = "nullisland:stars";

function readCache(): number | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (raw === null) return null;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? value : null;
  } catch {
    return null;
  }
}

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
  const [stars, setStars] = useState<number | null>(null);

  useEffect(() => {
    const cached = readCache();
    if (cached !== null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStars(cached);
      return;
    }

    // Abandoned on unmount: a count arriving after the user has moved on is of
    // no use to anyone.
    const controller = new AbortController();
    fetch(REPO_API_URL, { signal: controller.signal, headers: { Accept: "application/vnd.github+json" } })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        const count = Number(body?.stargazers_count);
        if (!Number.isFinite(count)) return;
        setStars(count);
        try {
          sessionStorage.setItem(CACHE_KEY, String(count));
        } catch {
          // Private browsing refuses the write. The count still shows.
        }
      })
      .catch(() => {
        // Offline, rate-limited, or blocked. The link works regardless.
      });

    return () => controller.abort();
  }, []);

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
      {/* A zero is worse than no number at all, so the badge waits for a
          count worth showing. */}
      {stars !== null && stars > 0 && (
        <span
          className={`ml-0.5 rounded-full px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-muted ${
            tone === "mint" ? "bg-mint" : "bg-paper"
          }`}
        >
          {stars.toLocaleString()}
        </span>
      )}
    </a>
  );
}
