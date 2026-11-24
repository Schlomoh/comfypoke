// A folded part of a panel: one line saying what is set inside, and a chevron that opens it in place. The caller
// keeps whether it is open, so it can survive a tab switch.
import type { ReactNode } from "react";

import { cn } from "@/ui/cn";
import { Pressable } from "@/ui/pressable";

export function Disclosure({
  summary,
  open,
  onToggle,
  children,
  className,
}: {
  summary: ReactNode; // what is set inside, in a few words
  open: boolean;
  onToggle: (open: boolean) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col", className)}>
      <Pressable
        onClick={() => onToggle(!open)}
        aria-expanded={open}
        className="flex min-h-11 items-center gap-2 text-left text-muted hover:text-ink fine:min-h-8"
      >
        <span className="min-w-0 flex-1 truncate">{summary}</span>
        <span aria-hidden className={cn("shrink-0 text-faint transition-transform", open && "rotate-90")}>
          ›
        </span>
      </Pressable>
      {open && <div className="flex flex-col gap-3 pt-1 pb-2">{children}</div>}
    </div>
  );
}
