import type { ReactNode } from "react";

import { cn } from "@/ui/cn";
import { Tip } from "@/ui/tip";

/** A ruled block of a panel: a label with an optional explanation behind a "?", an optional action at its right,
 * and what it is about. */
export function Section({
  title,
  tip,
  right,
  children,
  className,
}: {
  title: ReactNode;
  tip?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col gap-2 border-b border-line px-4 py-4", className)}>
      <div className="flex min-h-6 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1">
          <h3 className="label">{title}</h3>
          {tip && (
            <Tip label={`About ${typeof title === "string" ? title.toLowerCase() : "this"}`}>{tip}</Tip>
          )}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}
