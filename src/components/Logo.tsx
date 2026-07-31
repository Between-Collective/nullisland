/**
 * The mark is the product in miniature: a scattered field of points with one
 * over-plotted cluster — the single most common thing wrong with a map file.
 */
export function LogoMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden focusable="false">
      <rect width="32" height="32" rx="9" fill="currentColor" />
      <circle cx="9" cy="9.5" r="1.7" fill="#fff" opacity="0.45" />
      <circle cx="23.5" cy="8" r="1.7" fill="#fff" opacity="0.45" />
      <circle cx="8" cy="23.5" r="1.7" fill="#fff" opacity="0.45" />
      <circle cx="24" cy="23" r="1.7" fill="#fff" opacity="0.45" />
      <circle cx="15.2" cy="16.4" r="2.9" fill="#ecf4ee" />
      <circle cx="17.6" cy="15.1" r="2.9" fill="#ecf4ee" opacity="0.75" />
      <circle cx="16.9" cy="18" r="2.9" fill="#ecf4ee" opacity="0.6" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark className="h-7 w-7 text-ink" />
      <span className="text-[17px] font-bold tracking-[-0.03em] text-ink">
        map<span className="text-dim">/</span>data
      </span>
    </div>
  );
}
