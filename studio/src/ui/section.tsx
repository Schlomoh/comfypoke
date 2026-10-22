import type { ReactNode } from "react";

import { cn } from "@/ui/cn";

/** A ruled block of a panel: a label, an optional action at its right, and what it is about. */
export function Section({
  title,
  right,
  children,
  className,
}: {
  title: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col gap-2 border-b border-line px-4 py-4", className)}>
      <div className="flex min-h-6 items-center justify-between gap-2">
        <h3 className="label">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}
