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
      <span className={cn("block size-3.5 shrink-0 border border-control", on && "border-ink bg-ink")} />
      {label}
    </button>
  );
}
