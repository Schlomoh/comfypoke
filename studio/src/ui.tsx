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
  return (
    <button
      {...p}
      className={`inline-flex h-10 shrink-0 items-center justify-center gap-2 px-3 font-medium whitespace-nowrap select-none disabled:pointer-events-none disabled:opacity-35 lg:h-8 ${VARIANTS[variant]} ${className}`}
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
          className={`h-10 flex-1 px-2 font-mono text-xs tabular-nums lg:h-8 ${i ? "border-l border-line" : ""} ${
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

export function Check({ on, onChange, title }: { on: boolean; onChange: (v: boolean) => void; title: string }) {
  return (
    <button
      onClick={() => onChange(!on)}
      aria-pressed={on}
      title={title}
      className="grid size-10 shrink-0 place-items-center lg:size-6"
    >
      <span className={`block size-3.5 border ${on ? "border-ink bg-ink" : "border-edge"}`} />
    </button>
  );
}

export const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
