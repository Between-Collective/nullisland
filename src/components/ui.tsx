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

export function Button({
  children,
  onClick,
  variant = "ghost",
  disabled,
  title,
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
  // Swaps the whole style set rather than layering classes, so the pressed look
  // never depends on stylesheet ordering to win.
  const styles = active
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
        "inline-flex items-center justify-center gap-1.5 rounded-full border px-3.5 py-2 text-[12px]",
        "transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        styles,
        className,
      ].join(" ")}
    >
      {children}
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
