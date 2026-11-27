// A checkbox whose label is part of it: the whole row toggles, as a native label would.
import type { ReactNode } from "react";

import { cn } from "@/ui/cn";

export function Checkbox({
  on,
  onChange,
  label,
  title,
  className,
}: {
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
      className={cn(
        "flex min-h-11 min-w-11 shrink-0 items-center gap-2.5 text-left fine:min-h-6 fine:min-w-6",
        label ? "pr-2" : "justify-center",
        className,
      )}
    >
      <span
        className={cn(
          "grid size-4 shrink-0 place-items-center border border-control text-bg",
          on && "border-ink bg-ink",
        )}
      >
        {/* a tick, so on never reads as a filled square that might be off */}
        {on && (
          <svg viewBox="0 0 12 12" className="size-3" aria-hidden>
            <path d="M2.5 6.2l2.3 2.3 4.7-5" fill="none" stroke="currentColor" strokeWidth="1.8" />
          </svg>
        )}
      </span>
      {label}
    </button>
  );
}
