// The handful of controls everything is built from. Square, hairline, monochrome: color is
// reserved for state (GPU, errors), so it means something when it appears.
import type { ButtonHTMLAttributes, ReactNode } from "react";

const VARIANTS = {
  primary: "bg-ink text-bg hover:bg-white",
  ghost: "border border-line bg-panel hover:border-edge",
  quiet: "text-muted hover:text-ink",
  danger: "border border-line bg-panel text-bad hover:border-bad",
};

export function Btn({ variant = "ghost", className = "", ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof VARIANTS }) {
  // A caller's own height replaces the default whole, touch and mouse sizes both: two
  // classes for the same media query and property would leave the winner to CSS order.
  const size = /(^|\s)h-/.test(className) ? "" : "h-11 fine:h-8";
  return (
    <button
      {...p}
      className={`inline-flex ${size} shrink-0 items-center justify-center gap-2 px-3 font-medium whitespace-nowrap select-none disabled:pointer-events-none disabled:opacity-35 ${VARIANTS[variant]} ${className}`}
    />
  );
}

export function Seg<T extends string | number>({ value, options, onChange, className = "" }: {
  value: T;
  options: readonly { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={`flex border border-line ${className}`}>
      {options.map((o, i) => (
        <button
          key={String(o.value)}
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`h-11 flex-1 px-2 font-mono text-xs tabular-nums fine:h-8 ${i ? "border-l border-line" : ""} ${
            value === o.value ? "bg-ink text-bg" : "bg-panel text-muted hover:text-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Section({ title, right, children, className = "" }: {
  title: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`flex flex-col gap-2 border-b border-line px-4 py-4 ${className}`}>
      <div className="flex min-h-6 items-center justify-between gap-2">
        <h3 className="label">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

/** A checkbox whose label is part of it: the whole row toggles, as a native label would. */
export function Check({ on, onChange, label, title, className = "" }: {
  on: boolean;
  onChange: (v: boolean) => void;
  label?: ReactNode;
  title?: string; // the accessible name when there is no visible label
  className?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      aria-label={label ? undefined : title}
      title={title}
      onClick={() => onChange(!on)}
      className={`flex h-11 min-w-11 shrink-0 items-center gap-2.5 text-left fine:h-6 fine:min-w-6 ${label ? "pr-2" : "justify-center"} ${className}`}
    >
      <span className={`block size-3.5 shrink-0 border ${on ? "border-ink bg-ink" : "border-control"}`} />
      {label}
    </button>
  );
}

export const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
