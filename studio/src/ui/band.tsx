// A full-width run of cells in a grid, laid on the grid's own columns (subgrid), so nothing else shares its rows.
import { cva, type VariantProps } from "class-variance-authority";
import type { ReactNode } from "react";

import { cn } from "@/ui/cn";

const band = cva("col-span-full grid grid-cols-subgrid gap-px", {
  variants: {
    // renders that belong together, such as one Generate's: set off by a rule, the thumbnails carry the color
    tone: { plain: "", batch: "border-t border-edge bg-bg" },
  },
  defaultVariants: { tone: "plain" },
});

export function Band({
  tone,
  label,
  className,
  children,
}: VariantProps<typeof band> & { label?: string; className?: string; children: ReactNode }) {
  return (
    <section aria-label={label} className={cn(band({ tone }), className)}>
      {children}
    </section>
  );
}
