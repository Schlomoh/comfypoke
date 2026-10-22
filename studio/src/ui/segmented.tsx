// One choice out of a few, side by side.
import type { ReactNode } from "react";

import { cn } from "@/ui/cn";

export type Option<T> = { value: T; label: ReactNode };

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  className,
}: {
  value: T;
  options: readonly Option<T>[];
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex border border-line", className)}>
      {options.map((o, i) => (
        <button
          type="button"
          key={String(o.value)}
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cn(
            "h-11 flex-1 bg-panel px-2 font-mono text-xs text-muted tabular-nums hover:text-ink fine:h-8",
            i > 0 && "border-l border-line",
            value === o.value && "bg-ink text-bg hover:text-bg",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Any number of a few, side by side: each one on or off. */
export function Toggles<T extends string>({
  value,
  options,
  onChange,
}: {
  value: readonly T[];
  options: readonly T[];
  onChange: (v: T[]) => void;
}) {
  return (
    <div className="flex gap-1.5">
      {options.map((o) => {
        const on = value.includes(o);
        return (
          <button
            type="button"
            key={o}
            onClick={() => onChange(on ? value.filter((x) => x !== o) : [...value, o])}
            aria-pressed={on}
            className={cn(
              "h-11 border border-edge bg-panel px-3 text-[13px] text-ink fine:h-8",
              on && "border-ink bg-ink text-bg",
            )}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}
