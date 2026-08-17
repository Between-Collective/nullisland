/**
 * The mark is Null Island itself: the equator crossing the prime meridian, a
 * thin scatter of real points, and a heavy pile stacked exactly on 0°, 0° —
 * where every record with missing coordinates ends up.
 */
export function LogoMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden focusable="false">
      <rect width="32" height="32" rx="9" fill="currentColor" />
      <g stroke="#fff" strokeOpacity="0.24" strokeWidth="1">
        <line x1="0" y1="16" x2="32" y2="16" />
        <line x1="16" y1="0" x2="16" y2="32" />
      </g>
      <g fill="#fff" fillOpacity="0.4">
        <circle cx="7" cy="8" r="1.4" />
        <circle cx="24.5" cy="7.5" r="1.4" />
        <circle cx="7.5" cy="24.5" r="1.4" />
        <circle cx="25" cy="24" r="1.4" />
      </g>
      <g fill="#ecf4ee">
        <circle cx="16" cy="16" r="3.1" />
        <circle cx="17.7" cy="14.6" r="3.1" fillOpacity="0.7" />
        <circle cx="14.5" cy="17.4" r="3.1" fillOpacity="0.55" />
      </g>
    </svg>
  );
}

export function Wordmark() {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark className="h-7 w-7 text-ink" />
      <span className="text-[17px] font-bold tracking-[-0.03em] text-ink">Null Island</span>
    </div>
  );
}
