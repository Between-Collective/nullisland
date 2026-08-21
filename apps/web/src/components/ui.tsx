"use client";

import { useEffect, useState, type ReactNode } from "react";

export function Field({
  label,
  value,
  children,
}: {
  label: string;
  value?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.13em] text-dim">
          {label}
        </span>
        {value !== undefined && (
          <span className="font-mono text-[11.5px] tabular-nums text-ink-soft">{value}</span>
        )}
      </div>
      {children}
    </div>
  );
}

export interface Option<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

/** Pill row. Active reads as a solid black pill, matching the primary action. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: readonly Option<T>[];
  value: T;
  onChange: (next: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            title={option.hint}
            onClick={() => onChange(option.value)}
            className={[
              "rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors",
              selected
                ? "border-ink bg-ink text-white"
                : "border-line-strong bg-white text-muted hover:border-dim hover:text-ink",
            ].join(" ")}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** A tick that draws itself, so the confirmation has a beat rather than a blink. */
function Check() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden focusable="false">
      <path
        className="confirm-check"
        d="M3.2 8.4 6.4 11.6 12.8 4.6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Button({
  children,
  onClick,
  variant = "ghost",
  disabled,
  title,
  active,
  className = "",
  confirmed = false,
  confirmLabel,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost" | "quiet";
  disabled?: boolean;
  title?: string;
  active?: boolean;
  className?: string;
  /** Show the success state — the caller decides how long it lasts. */
  confirmed?: boolean;
  /** What the button says while confirmed. Falls back to its normal label. */
  confirmLabel?: string;
}) {
  // The label is a React render and so swaps instantly, while the colour is a
  // CSS transition and takes 200ms. Left alone, that leaves the button briefly
  // green with its resting label on the way out, which reads as a glitch.
  // Holding the confirm label for the length of the fade keeps the two together.
  const [leaving, setLeaving] = useState(false);
  const [wasConfirmed, setWasConfirmed] = useState(confirmed);

  // Adjusted during render rather than in an effect: an effect runs after the
  // browser has already painted the resting state, so the frame this exists to
  // remove would flash by anyway. React re-runs the render before committing.
  if (wasConfirmed !== confirmed) {
    setWasConfirmed(confirmed);
    setLeaving(!confirmed);
  }

  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => setLeaving(false), 200);
    return () => clearTimeout(timer);
  }, [leaving]);

  const showConfirm = confirmed || leaving;

  // Swaps the whole style set rather than layering classes, so the pressed look
  // never depends on stylesheet ordering to win.
  const styles = showConfirm
    ? "border-mint-ink bg-mint-ink text-white"
    : active
      ? "border-ink bg-ink text-white"
      : {
          primary: "border-ink bg-ink text-white hover:bg-ink-soft font-semibold",
          ghost: "border-line-strong bg-white text-ink hover:border-dim",
          quiet: "border-transparent bg-transparent text-muted hover:text-ink",
        }[variant];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={active}
      className={[
        "relative inline-flex items-center justify-center gap-1.5 rounded-full border px-3.5 py-2",
        "text-[12px] transition-colors duration-200",
        "disabled:cursor-not-allowed disabled:opacity-40",
        confirmed ? "confirm-pop" : "",
        styles,
        className,
      ].join(" ")}
    >
      {showConfirm ? (
        <>
          {/* Keyed on the label so a second confirmation replays the animation
              instead of sitting there already finished. */}
          <span
            key={confirmLabel}
            className={`confirm-label inline-flex items-center gap-1.5 transition-opacity duration-200 ${
              leaving ? "opacity-0" : ""
            }`}
          >
            <Check />
            {confirmLabel ?? children}
          </span>
          {confirmed && <span className="confirm-ring" aria-hidden />}
        </>
      ) : (
        children
      )}
    </button>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-[18px] border border-line bg-card ${className}`}>{children}</section>
  );
}

export function CardTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-[10.5px] font-semibold uppercase tracking-[0.13em] text-dim">
        {children}
      </h2>
      {aside}
    </div>
  );
}


/**
 * A section that starts closed.
 *
 * The manual is worth having on the page and is read once. Left expanded it was
 * a third of the scroll height, sitting between the reader and nothing —
 * everything below it is footer. Closed it is one line, and the summary still
 * says what is inside, so it stays findable and stays indexable.
 */
export function Disclosure({
  title,
  hint,
  children,
  defaultOpen = false,
}: {
  title: string;
  /** The one-line reason to open it. */
  hint?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="group mt-2 overflow-hidden rounded-2xl border border-line bg-card" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-baseline gap-3 px-4 py-3.5 hover:bg-paper [&::-webkit-details-marker]:hidden">
        <span
          aria-hidden
          className="mt-px shrink-0 font-mono text-[11px] text-dim transition-transform group-open:rotate-90"
        >
          ▸
        </span>
        <span className="text-[13px] font-semibold tracking-tight text-ink">{title}</span>
        {hint && <span className="min-w-0 flex-1 truncate text-[11.5px] text-muted">{hint}</span>}
      </summary>
      <div className="border-t border-line px-4 pb-4 pt-4">{children}</div>
    </details>
  );
}

/**
 * The two halves of the app. A tab rather than a link because the whole
 * configuration lives in the URL hash — a real navigation would throw away the
 * fixture on screen, which is the one thing this page must never do.
 */
export function ModeTab({
  children,
  active,
  onClick,
  count,
}: {
  children: ReactNode;
  active: boolean;
  onClick: () => void;
  count: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={[
        "-mb-px flex shrink-0 items-baseline gap-2 whitespace-nowrap border-b-2 px-1 pb-3 pt-1 text-[13px] font-semibold tracking-tight transition-colors",
        active
          ? "border-ink text-ink"
          : "border-transparent text-muted hover:text-ink",
      ].join(" ")}
    >
      {children}
      {/* The catalogue sizes are worth knowing and are the first thing to go on
          a phone, where they would wrap and push the other tab off-screen. */}
      <span
        className={`hidden font-mono text-[10.5px] font-normal sm:inline ${
          active ? "text-dim" : "text-dim/70"
        }`}
      >
        {count}
      </span>
    </button>
  );
}
