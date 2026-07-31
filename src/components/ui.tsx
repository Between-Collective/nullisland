"use client";

import type { ReactNode } from "react";

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
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-dim">{label}</span>
        {value !== undefined && (
          <span className="font-mono text-xs tabular-nums text-muted">{value}</span>
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
              "rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
              selected
                ? "border-accent bg-accent-soft text-ink"
                : "border-line bg-raised text-muted hover:border-dim hover:text-ink",
            ].join(" ")}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = "ghost",
  disabled,
  title,
  /** Renders the pressed state. Swaps the whole style set rather than layering
   *  extra classes on top, which would depend on stylesheet ordering to win. */
  active,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost" | "quiet";
  disabled?: boolean;
  title?: string;
  active?: boolean;
  className?: string;
}) {
  const styles = active
    ? "border-accent bg-accent-soft text-ink"
    : {
        primary: "border-accent bg-accent text-[#0a0b0d] hover:bg-[#ff8256] font-semibold",
        ghost: "border-line bg-raised text-ink hover:border-dim",
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
        "rounded-md border px-3 py-2 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        styles,
        className,
      ].join(" ")}
    >
      {children}
    </button>
  );
}

export function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-line bg-panel ${className}`}>{children}</section>
  );
}
